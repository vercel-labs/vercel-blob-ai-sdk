import { generateText, stepCountIs } from "ai";
import { MockLanguageModelV3, mockValues } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyAsset,
  createBlobTools,
  deleteAsset,
  deleteAssets,
  downloadAsset,
  getAssetInfo,
  listAssets,
  uploadAsset,
} from "../src/index.ts";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  list: vi.fn(),
  del: vi.fn(),
  head: vi.fn(),
  copy: vi.fn(),
}));

const { put, list, del, head, copy } = await import("@vercel/blob");

const mockPut = vi.mocked(put);
const mockList = vi.mocked(list);
const mockDel = vi.mocked(del);
const mockHead = vi.mocked(head);
const mockCopy = vi.mocked(copy);

const baseUrl = "https://example.blob.vercel-storage.com";

const defaultUsage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

const stopFinish = { unified: "stop" as const, raw: undefined };
const toolCallFinish = { unified: "tool-calls" as const, raw: undefined };

const makeToolCall = (id: string, name: string, input: object) => ({
  type: "tool-call" as const,
  toolCallId: id,
  toolName: name,
  input: JSON.stringify(input),
});

const makeText = (t: string) => ({
  type: "text" as const,
  text: t,
});

type MockContent =
  | ReturnType<typeof makeToolCall>
  | ReturnType<typeof makeText>;

interface MockResult {
  content: MockContent[];
  finishReason: typeof stopFinish | typeof toolCallFinish;
  usage: typeof defaultUsage;
  warnings: never[];
}

const toolStep = (...calls: ReturnType<typeof makeToolCall>[]): MockResult => ({
  content: calls,
  finishReason: toolCallFinish,
  usage: defaultUsage,
  warnings: [],
});

const textStep = (t: string): MockResult => ({
  content: [makeText(t)],
  finishReason: stopFinish,
  usage: defaultUsage,
  warnings: [],
});

const doGenerateFrom = (...values: MockResult[]) => {
  const next = mockValues(...values);
  return async () => next();
};

describe("AI SDK generateText integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("uploadAsset", () => {
    it("model calls uploadAsset tool and receives result", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/notes/meeting.txt`,
        downloadUrl: `${baseUrl}/notes/meeting.txt?download=1`,
        pathname: "notes/meeting.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "uploadAsset", {
                pathname: "notes/meeting.txt",
                content: "Meeting notes for Q1 planning",
              })
            ),
            textStep("File uploaded successfully!")
          ),
        }),
        tools: { uploadAsset },
        stopWhen: stepCountIs(2),
        prompt: "Upload meeting notes",
      });

      expect(result.text).toBe("File uploaded successfully!");
      expect(result.steps).toHaveLength(2);

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        success: true,
        url: `${baseUrl}/notes/meeting.txt`,
        pathname: "notes/meeting.txt",
        contentType: "text/plain",
      });

      expect(mockPut).toHaveBeenCalledWith(
        "notes/meeting.txt",
        "Meeting notes for Q1 planning",
        {
          access: "public",
          contentType: undefined,
          addRandomSuffix: undefined,
          allowOverwrite: undefined,
        }
      );
    });

    it("model receives error result when upload fails", async () => {
      mockPut.mockRejectedValue(new Error("Storage quota exceeded"));

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "uploadAsset", {
                pathname: "large-file.bin",
                content: "data",
              })
            ),
            textStep("Upload failed.")
          ),
        }),
        tools: { uploadAsset },
        stopWhen: stepCountIs(2),
        prompt: "Upload a large file",
      });

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        success: false,
        error: "Storage quota exceeded",
      });
    });
  });

  describe("listAssets", () => {
    it("model calls listAssets and gets asset list", async () => {
      const uploadedAt = new Date("2024-06-15T10:00:00Z");
      mockList.mockResolvedValue({
        blobs: [
          {
            url: `${baseUrl}/report.pdf`,
            downloadUrl: `${baseUrl}/report.pdf?download=1`,
            pathname: "report.pdf",
            size: 5000,
            uploadedAt,
            etag: "etag-1",
          },
        ],
        hasMore: false,
        cursor: undefined,
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "listAssets", { prefix: "report" })
            ),
            textStep("Found 1 asset.")
          ),
        }),
        tools: { listAssets },
        stopWhen: stepCountIs(2),
        prompt: "List reports",
      });

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        count: 1,
        hasMore: false,
      });
      expect((toolResult.output as { assets: unknown[] }).assets).toHaveLength(
        1
      );
    });
  });

  describe("deleteAsset", () => {
    it("model generates deleteAsset tool call (needs approval)", async () => {
      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "deleteAsset", {
                url: `${baseUrl}/old-file.txt`,
              })
            )
          ),
        }),
        tools: { deleteAsset },
        prompt: "Delete old-file.txt",
      });

      expect(result.steps[0].toolCalls).toHaveLength(1);
      expect(result.steps[0].toolCalls[0].toolName).toBe("deleteAsset");
      expect(result.steps[0].toolResults).toHaveLength(0);
      expect(mockDel).not.toHaveBeenCalled();
    });
  });

  describe("deleteAssets", () => {
    it("model generates deleteAssets tool call (needs approval)", async () => {
      const urls = [`${baseUrl}/a.txt`, `${baseUrl}/b.txt`];

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(makeToolCall("call-1", "deleteAssets", { urls }))
          ),
        }),
        tools: { deleteAssets },
        prompt: "Delete a.txt and b.txt",
      });

      expect(result.steps[0].toolCalls).toHaveLength(1);
      expect(result.steps[0].toolCalls[0].toolName).toBe("deleteAssets");
      expect(result.steps[0].toolResults).toHaveLength(0);
      expect(mockDel).not.toHaveBeenCalled();
    });
  });

  describe("getAssetInfo", () => {
    it("model calls getAssetInfo and gets metadata", async () => {
      const uploadedAt = new Date("2024-03-01T12:00:00Z");
      mockHead.mockResolvedValue({
        url: `${baseUrl}/doc.pdf`,
        downloadUrl: `${baseUrl}/doc.pdf?download=1`,
        pathname: "doc.pdf",
        size: 12_345,
        contentType: "application/pdf",
        uploadedAt,
        contentDisposition: "inline",
        cacheControl: "public",
        etag: "etag-1",
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "getAssetInfo", {
                url: `${baseUrl}/doc.pdf`,
              })
            ),
            textStep("It's a PDF, 12KB.")
          ),
        }),
        tools: { getAssetInfo },
        stopWhen: stepCountIs(2),
        prompt: "What is doc.pdf?",
      });

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        exists: true,
        size: 12_345,
        contentType: "application/pdf",
        uploadedAt: "2024-03-01T12:00:00.000Z",
      });
    });

    it("model receives exists: false for missing asset", async () => {
      mockHead.mockRejectedValue(new Error("Not found"));

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "getAssetInfo", {
                url: `${baseUrl}/missing.txt`,
              })
            ),
            textStep("Not found.")
          ),
        }),
        tools: { getAssetInfo },
        stopWhen: stepCountIs(2),
        prompt: "Check missing.txt",
      });

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        exists: false,
        error: "Asset not found",
      });
    });
  });

  describe("copyAsset", () => {
    it("model calls copyAsset and gets new URL", async () => {
      mockCopy.mockResolvedValue({
        url: `${baseUrl}/backup/photo.png`,
        downloadUrl: `${baseUrl}/backup/photo.png?download=1`,
        pathname: "backup/photo.png",
        contentType: "image/png",
        contentDisposition: "inline",
        etag: "etag-1",
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "copyAsset", {
                sourceUrl: `${baseUrl}/photo.png`,
                destinationPathname: "backup/photo.png",
              })
            ),
            textStep("Copied.")
          ),
        }),
        tools: { copyAsset },
        stopWhen: stepCountIs(2),
        prompt: "Back up photo.png",
      });

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        success: true,
        newUrl: `${baseUrl}/backup/photo.png`,
        pathname: "backup/photo.png",
      });
    });
  });

  describe("downloadAsset", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    it("model calls downloadAsset for text content", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/plain" }),
        text: () => Promise.resolve("Hello, world!"),
      } as Response);

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "downloadAsset", {
                url: `${baseUrl}/hello.txt`,
              })
            ),
            textStep("Contents: Hello, world!")
          ),
        }),
        tools: { downloadAsset },
        stopWhen: stepCountIs(2),
        prompt: "Download hello.txt",
      });

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        success: true,
        content: "Hello, world!",
        isBase64: false,
        contentType: "text/plain",
      });
    });

    it("model calls downloadAsset for binary content", async () => {
      const mockFetch = vi.mocked(fetch);
      const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: () => Promise.resolve(binaryData.buffer),
      } as Response);

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "downloadAsset", {
                url: `${baseUrl}/image.png`,
              })
            ),
            textStep("Downloaded the image.")
          ),
        }),
        tools: { downloadAsset },
        stopWhen: stepCountIs(2),
        prompt: "Download image.png",
      });

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        success: true,
        isBase64: true,
        contentType: "image/png",
      });
    });
  });

  describe("multi-tool usage", () => {
    it("model calls multiple tools in sequence across steps", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/doc.txt`,
        downloadUrl: `${baseUrl}/doc.txt?download=1`,
        pathname: "doc.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "etag-1",
      });

      mockHead.mockResolvedValue({
        url: `${baseUrl}/doc.txt`,
        downloadUrl: `${baseUrl}/doc.txt?download=1`,
        pathname: "doc.txt",
        size: 42,
        contentType: "text/plain",
        uploadedAt: new Date("2024-01-01T00:00:00Z"),
        contentDisposition: "inline",
        cacheControl: "public",
        etag: "etag-1",
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "uploadAsset", {
                pathname: "doc.txt",
                content: "Some document content",
              })
            ),
            toolStep(
              makeToolCall("call-2", "getAssetInfo", {
                url: `${baseUrl}/doc.txt`,
              })
            ),
            textStep("Uploaded and verified: 42 bytes.")
          ),
        }),
        tools: { uploadAsset, getAssetInfo },
        stopWhen: stepCountIs(3),
        prompt: "Upload doc.txt then verify it",
      });

      expect(result.steps).toHaveLength(3);
      expect(result.text).toBe("Uploaded and verified: 42 bytes.");

      const uploadResult = result.steps[0].toolResults[0];
      expect(uploadResult.output).toMatchObject({
        success: true,
        pathname: "doc.txt",
      });

      const infoResult = result.steps[1].toolResults[0];
      expect(infoResult.output).toMatchObject({
        exists: true,
        size: 42,
      });
    });

    it("model calls parallel tools in one step", async () => {
      mockList.mockResolvedValue({
        blobs: [
          {
            url: `${baseUrl}/a.txt`,
            downloadUrl: `${baseUrl}/a.txt?download=1`,
            pathname: "a.txt",
            size: 10,
            uploadedAt: new Date("2024-01-01T00:00:00Z"),
            etag: "etag-1",
          },
        ],
        hasMore: false,
        cursor: undefined,
      });

      mockHead.mockResolvedValue({
        url: `${baseUrl}/b.txt`,
        downloadUrl: `${baseUrl}/b.txt?download=1`,
        pathname: "b.txt",
        size: 200,
        contentType: "text/plain",
        uploadedAt: new Date("2024-02-01T00:00:00Z"),
        contentDisposition: "inline",
        cacheControl: "public",
        etag: "etag-2",
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "listAssets", {}),
              makeToolCall("call-2", "getAssetInfo", {
                url: `${baseUrl}/b.txt`,
              })
            ),
            textStep("Done.")
          ),
        }),
        tools: { listAssets, getAssetInfo },
        stopWhen: stepCountIs(2),
        prompt: "List all and check b.txt",
      });

      expect(result.steps[0].toolResults).toHaveLength(2);

      const listResult = result.steps[0].toolResults.find(
        (r) => r.toolName === "listAssets"
      );
      expect(listResult?.output).toMatchObject({ count: 1 });

      const infoResult = result.steps[0].toolResults.find(
        (r) => r.toolName === "getAssetInfo"
      );
      expect(infoResult?.output).toMatchObject({
        exists: true,
        size: 200,
      });
    });
  });

  describe("createBlobTools overrides with generateText", () => {
    it("needsApproval override enables execution on deleteAsset", async () => {
      mockDel.mockResolvedValue(undefined);

      const blobTools = createBlobTools({
        overrides: {
          deleteAsset: { needsApproval: false },
        },
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "deleteAsset", {
                url: `${baseUrl}/old-file.txt`,
              })
            ),
            textStep("Deleted.")
          ),
        }),
        tools: { deleteAsset: blobTools.deleteAsset },
        stopWhen: stepCountIs(2),
        prompt: "Delete old-file.txt",
      });

      expect(result.steps[0].toolResults).toHaveLength(1);
      expect(result.steps[0].toolResults[0].output).toMatchObject({
        success: true,
        deleted: true,
      });
      expect(mockDel).toHaveBeenCalledWith(`${baseUrl}/old-file.txt`);
    });

    it("needsApproval override blocks execution on uploadAsset", async () => {
      const blobTools = createBlobTools({
        overrides: {
          uploadAsset: { needsApproval: true },
        },
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "uploadAsset", {
                pathname: "test.txt",
                content: "Hello",
              })
            )
          ),
        }),
        tools: { uploadAsset: blobTools.uploadAsset },
        prompt: "Upload a file",
      });

      expect(result.steps[0].toolCalls).toHaveLength(1);
      expect(result.steps[0].toolResults).toHaveLength(0);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it("needsApproval override enables execution on deleteAssets", async () => {
      mockDel.mockResolvedValue(undefined);
      const urls = [`${baseUrl}/a.txt`, `${baseUrl}/b.txt`];

      const blobTools = createBlobTools({
        overrides: {
          deleteAssets: { needsApproval: false },
        },
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(makeToolCall("call-1", "deleteAssets", { urls })),
            textStep("Deleted both.")
          ),
        }),
        tools: { deleteAssets: blobTools.deleteAssets },
        stopWhen: stepCountIs(2),
        prompt: "Delete a.txt and b.txt",
      });

      expect(result.steps[0].toolResults).toHaveLength(1);
      expect(result.steps[0].toolResults[0].output).toMatchObject({
        success: true,
        deletedCount: 2,
      });
      expect(mockDel).toHaveBeenCalledWith(urls);
    });

    it("description override does not affect tool execution", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const blobTools = createBlobTools({
        overrides: {
          uploadAsset: { description: "Custom upload tool" },
        },
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "uploadAsset", {
                pathname: "test.txt",
                content: "Hello",
              })
            ),
            textStep("Done.")
          ),
        }),
        tools: { uploadAsset: blobTools.uploadAsset },
        stopWhen: stepCountIs(2),
        prompt: "Upload a file",
      });

      expect(result.steps[0].toolResults[0].output).toMatchObject({
        success: true,
        url: `${baseUrl}/test.txt`,
      });
    });

    it("overrides work with pathPrefix combined", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/tenant/doc.txt`,
        downloadUrl: `${baseUrl}/tenant/doc.txt?download=1`,
        pathname: "tenant/doc.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const blobTools = createBlobTools({
        pathPrefix: "tenant",
        overrides: {
          uploadAsset: { strict: false },
        },
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "uploadAsset", {
                pathname: "doc.txt",
                content: "data",
              })
            ),
            textStep("Uploaded.")
          ),
        }),
        tools: { uploadAsset: blobTools.uploadAsset },
        stopWhen: stepCountIs(2),
        prompt: "Upload doc.txt",
      });

      expect(result.steps[0].toolResults[0].output).toMatchObject({
        success: true,
        pathname: "tenant/doc.txt",
      });
      expect(mockPut).toHaveBeenCalledWith(
        "tenant/doc.txt",
        "data",
        expect.objectContaining({ access: "public" })
      );
    });

    it("multiple tool overrides in a multi-step flow", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/file.txt`,
        downloadUrl: `${baseUrl}/file.txt?download=1`,
        pathname: "file.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "etag-1",
      });
      mockDel.mockResolvedValue(undefined);

      const blobTools = createBlobTools({
        overrides: {
          uploadAsset: { description: "Custom upload" },
          deleteAsset: { needsApproval: false },
        },
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "uploadAsset", {
                pathname: "file.txt",
                content: "data",
              })
            ),
            toolStep(
              makeToolCall("call-2", "deleteAsset", {
                url: `${baseUrl}/old.txt`,
              })
            ),
            textStep("Uploaded new, deleted old.")
          ),
        }),
        tools: {
          uploadAsset: blobTools.uploadAsset,
          deleteAsset: blobTools.deleteAsset,
        },
        stopWhen: stepCountIs(3),
        prompt: "Replace old file with new one",
      });

      expect(result.steps).toHaveLength(3);

      expect(result.steps[0].toolResults[0].output).toMatchObject({
        success: true,
        pathname: "file.txt",
      });

      expect(result.steps[1].toolResults[0].output).toMatchObject({
        success: true,
        deleted: true,
      });
      expect(mockDel).toHaveBeenCalledWith(`${baseUrl}/old.txt`);
    });

    it("non-overridden tools retain default behavior alongside overridden tools", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/file.txt`,
        downloadUrl: `${baseUrl}/file.txt?download=1`,
        pathname: "file.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "etag-1",
      });

      const blobTools = createBlobTools({
        overrides: {
          uploadAsset: { description: "Custom" },
        },
      });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "uploadAsset", {
                pathname: "file.txt",
                content: "data",
              }),
              makeToolCall("call-2", "deleteAsset", {
                url: `${baseUrl}/old.txt`,
              })
            )
          ),
        }),
        tools: {
          uploadAsset: blobTools.uploadAsset,
          deleteAsset: blobTools.deleteAsset,
        },
        prompt: "Upload and delete",
      });

      expect(result.steps[0].toolResults).toHaveLength(1);
      expect(result.steps[0].toolResults[0].toolName).toBe("uploadAsset");

      expect(mockDel).not.toHaveBeenCalled();
    });
  });

  describe("createBlobTools with generateText", () => {
    it("factory tools work with pathPrefix through generateText", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/tenant-1/file.txt`,
        downloadUrl: `${baseUrl}/tenant-1/file.txt?download=1`,
        pathname: "tenant-1/file.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "etag-1",
      });

      const blobTools = createBlobTools({ pathPrefix: "tenant-1" });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(
              makeToolCall("call-1", "uploadAsset", {
                pathname: "file.txt",
                content: "tenant data",
              })
            ),
            textStep("Stored in tenant-1.")
          ),
        }),
        tools: { uploadAsset: blobTools.uploadAsset },
        stopWhen: stepCountIs(2),
        prompt: "Upload file for tenant-1",
      });

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        success: true,
        pathname: "tenant-1/file.txt",
      });

      expect(mockPut).toHaveBeenCalledWith("tenant-1/file.txt", "tenant data", {
        access: "public",
        contentType: undefined,
      });
    });

    it("all factory tools register correctly with generateText", async () => {
      mockList.mockResolvedValue({
        blobs: [],
        hasMore: false,
        cursor: undefined,
      });

      const blobTools = createBlobTools({ access: "private" });

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: doGenerateFrom(
            toolStep(makeToolCall("call-1", "listAssets", {})),
            textStep("No assets.")
          ),
        }),
        tools: { ...blobTools },
        stopWhen: stepCountIs(2),
        prompt: "List all assets",
      });

      const toolResult = result.steps[0].toolResults[0];
      expect(toolResult.output).toMatchObject({
        count: 0,
        hasMore: false,
      });
    });
  });
});
