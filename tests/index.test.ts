import type { ToolExecutionOptions } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolOverrides } from "../src/index.ts";
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

const toolOptions: ToolExecutionOptions = {
  toolCallId: "test",
  messages: [],
};

// Helper to safely call tool execute
async function execute<TInput, TOutput>(
  tool: { execute?: (input: TInput, options: ToolExecutionOptions) => TOutput },
  input: TInput
): Promise<Awaited<TOutput>> {
  if (!tool.execute) {
    throw new Error("Tool execute function is undefined");
  }
  return await tool.execute(input, toolOptions);
}

describe("uploadAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads text content successfully", async () => {
    mockPut.mockResolvedValue({
      url: `${baseUrl}/test.txt`,
      downloadUrl: `${baseUrl}/test.txt?download=1`,
      pathname: "test.txt",
      contentType: "text/plain",
      contentDisposition: "inline",
      etag: "test-etag",
    });

    const result = await execute(uploadAsset, {
      pathname: "test.txt",
      content: "Hello, world!",
    });

    expect(result).toMatchObject({
      success: true,
      url: `${baseUrl}/test.txt`,
      pathname: "test.txt",
    });
    expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello, world!", {
      access: "public",
      contentType: undefined,
      addRandomSuffix: undefined,
      allowOverwrite: undefined,
    });
  });

  it("uploads base64 content successfully", async () => {
    const base64Content = Buffer.from("binary data").toString("base64");
    mockPut.mockResolvedValue({
      url: `${baseUrl}/image.png`,
      downloadUrl: `${baseUrl}/image.png?download=1`,
      pathname: "image.png",
      contentType: "image/png",
      contentDisposition: "inline",
      etag: "test-etag",
    });

    const result = await execute(uploadAsset, {
      pathname: "image.png",
      content: base64Content,
      contentType: "image/png",
      isBase64: true,
    });

    expect(result).toMatchObject({
      success: true,
      contentType: "image/png",
    });
    expect(mockPut).toHaveBeenCalledWith(
      "image.png",
      Buffer.from(base64Content, "base64"),
      {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: undefined,
        allowOverwrite: undefined,
      }
    );
  });

  it("handles upload errors gracefully", async () => {
    mockPut.mockRejectedValue(new Error("Upload failed"));

    const result = await execute(uploadAsset, {
      pathname: "test.txt",
      content: "Hello",
    });

    expect(result).toMatchObject({
      success: false,
      error: "Upload failed",
    });
  });

  it("returns provided contentType on error", async () => {
    mockPut.mockRejectedValue(new Error("Upload failed"));

    const result = await execute(uploadAsset, {
      pathname: "image.png",
      content: "data",
      contentType: "image/png",
    });

    expect(result).toMatchObject({
      success: false,
      contentType: "image/png",
    });
  });

  it("handles non-Error throw", async () => {
    mockPut.mockRejectedValue("string error");

    const result = await execute(uploadAsset, {
      pathname: "test.txt",
      content: "Hello",
    });

    expect(result).toMatchObject({
      success: false,
      error: "Upload failed",
    });
  });
});

describe("listAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists assets successfully", async () => {
    const uploadedAt = new Date("2024-01-01T00:00:00Z");
    mockList.mockResolvedValue({
      blobs: [
        {
          url: `${baseUrl}/file1.txt`,
          downloadUrl: `${baseUrl}/file1.txt?download=1`,
          pathname: "file1.txt",
          size: 100,
          uploadedAt,
          etag: "etag-1",
        },
        {
          url: `${baseUrl}/file2.txt`,
          downloadUrl: `${baseUrl}/file2.txt?download=1`,
          pathname: "file2.txt",
          size: 200,
          uploadedAt,
          etag: "etag-2",
        },
      ],
      hasMore: false,
      cursor: undefined,
    });

    const result = await execute(listAssets, {});

    expect(result).toMatchObject({
      count: 2,
      hasMore: false,
    });
    expect(result).toHaveProperty("assets");
    const assets = (result as { assets: unknown[] }).assets;
    expect(assets[0]).toMatchObject({
      pathname: "file1.txt",
      uploadedAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("lists assets with prefix filter", async () => {
    mockList.mockResolvedValue({
      blobs: [],
      hasMore: false,
      cursor: undefined,
    });

    await execute(listAssets, { prefix: "images/", limit: 10 });

    expect(mockList).toHaveBeenCalledWith({ prefix: "images/", limit: 10 });
  });

  it("returns cursor when available", async () => {
    mockList.mockResolvedValue({
      blobs: [],
      hasMore: true,
      cursor: "next-page-cursor",
    });

    const result = await execute(listAssets, {});

    expect(result).toMatchObject({
      hasMore: true,
      cursor: "next-page-cursor",
    });
  });

  it("handles list errors gracefully", async () => {
    mockList.mockRejectedValue(new Error("List failed"));

    const result = await execute(listAssets, {});

    expect(result).toMatchObject({
      count: 0,
      assets: [],
      error: "List failed",
    });
  });

  it("handles non-Error throw", async () => {
    mockList.mockRejectedValue("string error");

    const result = await execute(listAssets, {});

    expect(result).toMatchObject({
      count: 0,
      error: "Failed to list assets",
    });
  });
});

describe("deleteAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes an asset successfully", async () => {
    mockDel.mockResolvedValue(undefined);

    const result = await execute(deleteAsset, {
      url: `${baseUrl}/test.txt`,
    });

    expect(result).toMatchObject({
      success: true,
      deleted: true,
    });
    expect(mockDel).toHaveBeenCalledWith(`${baseUrl}/test.txt`);
  });

  it("handles delete errors gracefully", async () => {
    mockDel.mockRejectedValue(new Error("Delete failed"));

    const result = await execute(deleteAsset, {
      url: `${baseUrl}/test.txt`,
    });

    expect(result).toMatchObject({
      success: false,
      deleted: false,
      error: "Delete failed",
    });
  });

  it("handles non-Error throw", async () => {
    mockDel.mockRejectedValue("string error");

    const result = await execute(deleteAsset, {
      url: `${baseUrl}/test.txt`,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Delete failed",
    });
  });
});

describe("deleteAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes multiple assets successfully", async () => {
    mockDel.mockResolvedValue(undefined);
    const urls = [`${baseUrl}/file1.txt`, `${baseUrl}/file2.txt`];

    const result = await execute(deleteAssets, { urls });

    expect(result).toMatchObject({
      success: true,
      deletedCount: 2,
    });
    expect(mockDel).toHaveBeenCalledWith(urls);
  });

  it("handles bulk delete errors gracefully", async () => {
    mockDel.mockRejectedValue(new Error("Bulk delete failed"));

    const result = await execute(deleteAssets, {
      urls: [`${baseUrl}/file1.txt`],
    });

    expect(result).toMatchObject({
      success: false,
      deletedCount: 0,
      error: "Bulk delete failed",
    });
  });

  it("handles non-Error throw", async () => {
    mockDel.mockRejectedValue("string error");

    const result = await execute(deleteAssets, {
      urls: [`${baseUrl}/file1.txt`],
    });

    expect(result).toMatchObject({
      success: false,
      error: "Bulk delete failed",
    });
  });
});

describe("getAssetInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets asset info successfully", async () => {
    const uploadedAt = new Date("2024-01-01T00:00:00Z");
    mockHead.mockResolvedValue({
      url: `${baseUrl}/test.txt`,
      downloadUrl: `${baseUrl}/test.txt?download=1`,
      pathname: "test.txt",
      size: 100,
      contentType: "text/plain",
      uploadedAt,
      contentDisposition: "inline",
      cacheControl: "public",
      etag: "test-etag",
    });

    const result = await execute(getAssetInfo, {
      url: `${baseUrl}/test.txt`,
    });

    expect(result).toMatchObject({
      exists: true,
      size: 100,
      contentType: "text/plain",
      uploadedAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("returns exists: false for non-existent assets", async () => {
    mockHead.mockRejectedValue(new Error("Not found"));

    const result = await execute(getAssetInfo, {
      url: `${baseUrl}/nonexistent.txt`,
    });

    expect(result).toMatchObject({
      exists: false,
      error: "Asset not found",
    });
  });

  it("handles non-Error throw", async () => {
    mockHead.mockRejectedValue("string error");

    const result = await execute(getAssetInfo, {
      url: `${baseUrl}/nonexistent.txt`,
    });

    expect(result).toMatchObject({
      exists: false,
      error: "Asset not found",
    });
  });
});

describe("copyAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies an asset successfully", async () => {
    mockCopy.mockResolvedValue({
      url: `${baseUrl}/backup/test.txt`,
      downloadUrl: `${baseUrl}/backup/test.txt?download=1`,
      pathname: "backup/test.txt",
      contentType: "text/plain",
      contentDisposition: "inline",
      etag: "test-etag",
    });

    const result = await execute(copyAsset, {
      sourceUrl: `${baseUrl}/test.txt`,
      destinationPathname: "backup/test.txt",
    });

    expect(result).toMatchObject({
      success: true,
      newUrl: `${baseUrl}/backup/test.txt`,
      pathname: "backup/test.txt",
    });
    expect(mockCopy).toHaveBeenCalledWith(
      `${baseUrl}/test.txt`,
      "backup/test.txt",
      { access: "public" }
    );
  });

  it("handles copy errors gracefully", async () => {
    mockCopy.mockRejectedValue(new Error("Copy failed"));

    const result = await execute(copyAsset, {
      sourceUrl: `${baseUrl}/test.txt`,
      destinationPathname: "backup/test.txt",
    });

    expect(result).toMatchObject({
      success: false,
      error: "Copy failed",
    });
  });

  it("handles non-Error throw", async () => {
    mockCopy.mockRejectedValue("string error");

    const result = await execute(copyAsset, {
      sourceUrl: `${baseUrl}/test.txt`,
      destinationPathname: "backup/test.txt",
    });

    expect(result).toMatchObject({
      success: false,
      error: "Copy failed",
    });
  });
});

describe("downloadAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("downloads text content successfully", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("Hello, world!"),
    } as Response);

    const result = await execute(downloadAsset, {
      url: `${baseUrl}/test.txt`,
    });

    expect(result).toMatchObject({
      success: true,
      content: "Hello, world!",
      isBase64: false,
      contentType: "text/plain",
    });
  });

  it("downloads binary content as base64", async () => {
    const mockFetch = vi.mocked(fetch);
    const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: () => Promise.resolve(binaryData.buffer),
    } as Response);

    const result = await execute(downloadAsset, {
      url: `${baseUrl}/image.png`,
    });

    expect(result).toMatchObject({
      success: true,
      isBase64: true,
      contentType: "image/png",
    });
  });

  it("handles download errors gracefully", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    const result = await execute(downloadAsset, {
      url: `${baseUrl}/nonexistent.txt`,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Failed to download: 404 Not Found",
    });
  });

  it("downloads JSON content as text", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve('{"key":"value"}'),
    } as Response);

    const result = await execute(downloadAsset, {
      url: `${baseUrl}/data.json`,
    });

    expect(result).toMatchObject({
      success: true,
      content: '{"key":"value"}',
      isBase64: false,
      contentType: "application/json",
    });
  });

  it("falls back to application/octet-stream when no content-type header", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    } as Response);

    const result = await execute(downloadAsset, {
      url: `${baseUrl}/unknown-file`,
    });

    expect(result).toMatchObject({
      success: true,
      contentType: "application/octet-stream",
      isBase64: true,
    });
  });

  it("handles network errors gracefully", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await execute(downloadAsset, {
      url: `${baseUrl}/test.txt`,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Network error",
    });
  });

  it("handles non-Error throw", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValue("string error");

    const result = await execute(downloadAsset, {
      url: `${baseUrl}/test.txt`,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Unknown error",
    });
  });
});

describe("tool configurations", () => {
  it("uploadAsset has correct configuration", () => {
    expect(uploadAsset.description).toContain("Upload");
    expect(uploadAsset.inputSchema).toBeDefined();
  });

  it("deleteAsset requires approval", () => {
    expect(deleteAsset.needsApproval).toBe(true);
  });

  it("deleteAssets requires approval", () => {
    expect(deleteAssets.needsApproval).toBe(true);
  });

  it("non-destructive tools do not require approval", () => {
    expect(uploadAsset.needsApproval).toBeUndefined();
    expect(listAssets.needsApproval).toBeUndefined();
    expect(getAssetInfo.needsApproval).toBeUndefined();
    expect(copyAsset.needsApproval).toBeUndefined();
    expect(downloadAsset.needsApproval).toBeUndefined();
  });
});

describe("createBlobTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all 7 tools", () => {
    const tools = createBlobTools();
    expect(tools.uploadAsset).toBeDefined();
    expect(tools.listAssets).toBeDefined();
    expect(tools.deleteAsset).toBeDefined();
    expect(tools.deleteAssets).toBeDefined();
    expect(tools.getAssetInfo).toBeDefined();
    expect(tools.copyAsset).toBeDefined();
    expect(tools.downloadAsset).toBeDefined();
  });

  it("without options behaves same as direct exports", async () => {
    mockPut.mockResolvedValue({
      url: `${baseUrl}/test.txt`,
      downloadUrl: `${baseUrl}/test.txt?download=1`,
      pathname: "test.txt",
      contentType: "text/plain",
      contentDisposition: "inline",
      etag: "test-etag",
    });

    const tools = createBlobTools();
    await execute(tools.uploadAsset, {
      pathname: "test.txt",
      content: "Hello",
    });

    expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
      access: "public",
      contentType: undefined,
      addRandomSuffix: undefined,
      allowOverwrite: undefined,
    });
  });

  it("with empty pathPrefix behaves same as direct exports", async () => {
    mockPut.mockResolvedValue({
      url: `${baseUrl}/test.txt`,
      downloadUrl: `${baseUrl}/test.txt?download=1`,
      pathname: "test.txt",
      contentType: "text/plain",
      contentDisposition: "inline",
      etag: "test-etag",
    });

    const tools = createBlobTools({ pathPrefix: "" });
    await execute(tools.uploadAsset, {
      pathname: "test.txt",
      content: "Hello",
    });

    expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
      access: "public",
      contentType: undefined,
      addRandomSuffix: undefined,
      allowOverwrite: undefined,
    });
  });

  it("URL-based tools are same instances regardless of prefix", () => {
    const tools = createBlobTools({ pathPrefix: "tenant-abc" });
    expect(tools.deleteAsset).toBe(deleteAsset);
    expect(tools.deleteAssets).toBe(deleteAssets);
    expect(tools.getAssetInfo).toBe(getAssetInfo);
    expect(tools.downloadAsset).toBe(downloadAsset);
  });

  describe("uploadAsset with pathPrefix", () => {
    it("prepends prefix to pathname", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/tenant-abc/photo.png`,
        downloadUrl: `${baseUrl}/tenant-abc/photo.png?download=1`,
        pathname: "tenant-abc/photo.png",
        contentType: "image/png",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ pathPrefix: "tenant-abc" });
      await execute(tools.uploadAsset, {
        pathname: "photo.png",
        content: "data",
      });

      expect(mockPut).toHaveBeenCalledWith("tenant-abc/photo.png", "data", {
        access: "public",
        contentType: undefined,
      });
    });

    it("normalizes prefix with slashes", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/tenant-abc/photo.png`,
        downloadUrl: `${baseUrl}/tenant-abc/photo.png?download=1`,
        pathname: "tenant-abc/photo.png",
        contentType: "image/png",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ pathPrefix: "/tenant-abc/" });
      await execute(tools.uploadAsset, {
        pathname: "photo.png",
        content: "data",
      });

      expect(mockPut).toHaveBeenCalledWith("tenant-abc/photo.png", "data", {
        access: "public",
        contentType: undefined,
      });
    });
  });

  describe("listAssets with pathPrefix", () => {
    it("scopes to prefix when user provides no prefix", async () => {
      mockList.mockResolvedValue({
        blobs: [],
        hasMore: false,
        cursor: undefined,
      });

      const tools = createBlobTools({ pathPrefix: "tenant-abc" });
      await execute(tools.listAssets, {});

      expect(mockList).toHaveBeenCalledWith({
        prefix: "tenant-abc/",
        limit: undefined,
      });
    });

    it("combines factory prefix with user prefix", async () => {
      mockList.mockResolvedValue({
        blobs: [],
        hasMore: false,
        cursor: undefined,
      });

      const tools = createBlobTools({ pathPrefix: "tenant-abc" });
      await execute(tools.listAssets, { prefix: "images/" });

      expect(mockList).toHaveBeenCalledWith({
        prefix: "tenant-abc/images/",
        limit: undefined,
      });
    });
  });

  describe("copyAsset with pathPrefix", () => {
    it("prepends prefix to destinationPathname", async () => {
      mockCopy.mockResolvedValue({
        url: `${baseUrl}/tenant-abc/backup.png`,
        downloadUrl: `${baseUrl}/tenant-abc/backup.png?download=1`,
        pathname: "tenant-abc/backup.png",
        contentType: "image/png",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ pathPrefix: "tenant-abc" });
      await execute(tools.copyAsset, {
        sourceUrl: `${baseUrl}/photo.png`,
        destinationPathname: "backup.png",
      });

      expect(mockCopy).toHaveBeenCalledWith(
        `${baseUrl}/photo.png`,
        "tenant-abc/backup.png",
        { access: "public" }
      );
    });
  });

  describe("access option", () => {
    it("factory-level access defaults to public", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools();
      await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
      });

      expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
        access: "public",
        contentType: undefined,
      });
    });

    it("factory-level access applies to uploadAsset", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ access: "private" });
      await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
      });

      expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
        access: "private",
        contentType: undefined,
        addRandomSuffix: undefined,
        allowOverwrite: undefined,
      });
    });

    it("factory-level access applies to copyAsset", async () => {
      mockCopy.mockResolvedValue({
        url: `${baseUrl}/backup.txt`,
        downloadUrl: `${baseUrl}/backup.txt?download=1`,
        pathname: "backup.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ access: "private" });
      await execute(tools.copyAsset, {
        sourceUrl: `${baseUrl}/test.txt`,
        destinationPathname: "backup.txt",
      });

      expect(mockCopy).toHaveBeenCalledWith(
        `${baseUrl}/test.txt`,
        "backup.txt",
        { access: "private" }
      );
    });

    it("per-call access overrides factory default", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ access: "private" });
      await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
        access: "public",
      });

      expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
        access: "public",
        contentType: undefined,
      });
    });

    it("per-call access overrides factory default on copyAsset", async () => {
      mockCopy.mockResolvedValue({
        url: `${baseUrl}/backup.txt`,
        downloadUrl: `${baseUrl}/backup.txt?download=1`,
        pathname: "backup.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ access: "private" });
      await execute(tools.copyAsset, {
        sourceUrl: `${baseUrl}/test.txt`,
        destinationPathname: "backup.txt",
        access: "public",
      });

      expect(mockCopy).toHaveBeenCalledWith(
        `${baseUrl}/test.txt`,
        "backup.txt",
        { access: "public" }
      );
    });

    it("direct export uploadAsset defaults to public", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      await execute(uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
      });

      expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
        access: "public",
        contentType: undefined,
      });
    });

    it("direct export uploadAsset allows per-call private", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      await execute(uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
        access: "private",
      });

      expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
        access: "private",
        contentType: undefined,
        addRandomSuffix: undefined,
        allowOverwrite: undefined,
      });
    });
  });

  describe("allowOverwrite and addRandomSuffix", () => {
    it("factory-level allowOverwrite applies to uploadAsset", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ allowOverwrite: true });
      await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
      });

      expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
        access: "public",
        contentType: undefined,
        addRandomSuffix: undefined,
        allowOverwrite: true,
      });
    });

    it("factory-level addRandomSuffix applies to uploadAsset", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test-abc123.txt`,
        downloadUrl: `${baseUrl}/test-abc123.txt?download=1`,
        pathname: "test-abc123.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ addRandomSuffix: true });
      await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
      });

      expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
        access: "public",
        contentType: undefined,
        addRandomSuffix: true,
        allowOverwrite: undefined,
      });
    });

    it("per-call allowOverwrite overrides factory default", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ allowOverwrite: false });
      await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
        allowOverwrite: true,
      });

      expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
        access: "public",
        contentType: undefined,
        addRandomSuffix: undefined,
        allowOverwrite: true,
      });
    });

    it("per-call addRandomSuffix overrides factory default", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test-abc123.txt`,
        downloadUrl: `${baseUrl}/test-abc123.txt?download=1`,
        pathname: "test-abc123.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({ addRandomSuffix: false });
      await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
        addRandomSuffix: true,
      });

      expect(mockPut).toHaveBeenCalledWith("test.txt", "Hello", {
        access: "public",
        contentType: undefined,
        addRandomSuffix: true,
        allowOverwrite: undefined,
      });
    });
  });
});

describe("createBlobTools overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("description", () => {
    it("overrides description on a factory-created tool", () => {
      const tools = createBlobTools({
        overrides: {
          uploadAsset: { description: "Custom upload description" },
        },
      });

      expect(tools.uploadAsset.description).toBe("Custom upload description");
    });

    it("overrides description on a singleton tool", () => {
      const tools = createBlobTools({
        overrides: {
          deleteAsset: { description: "Custom delete description" },
        },
      });

      expect(tools.deleteAsset.description).toBe("Custom delete description");
    });

    it("does not affect tools without overrides", () => {
      const tools = createBlobTools({
        overrides: {
          uploadAsset: { description: "Custom" },
        },
      });

      expect(tools.listAssets.description).toContain("List all stored assets");
      expect(tools.deleteAsset.description).toContain("Permanently delete");
    });
  });

  describe("title", () => {
    it("sets title on a factory-created tool", () => {
      const tools = createBlobTools({
        overrides: {
          listAssets: { title: "Browse Files" },
        },
      });

      expect(tools.listAssets.title).toBe("Browse Files");
    });

    it("sets title on a singleton tool", () => {
      const tools = createBlobTools({
        overrides: {
          getAssetInfo: { title: "File Info" },
        },
      });

      expect(tools.getAssetInfo.title).toBe("File Info");
    });
  });

  describe("strict", () => {
    it("overrides strict on a factory-created tool", () => {
      const tools = createBlobTools({
        overrides: {
          uploadAsset: { strict: false },
        },
      });

      expect(tools.uploadAsset.strict).toBe(false);
    });

    it("overrides strict on a singleton tool", () => {
      const tools = createBlobTools({
        overrides: {
          downloadAsset: { strict: false },
        },
      });

      expect(tools.downloadAsset.strict).toBe(false);
    });

    it("preserves default strict when not overridden", () => {
      const tools = createBlobTools({
        overrides: {
          uploadAsset: { description: "Custom" },
        },
      });

      expect(tools.uploadAsset.strict).toBe(true);
    });
  });

  describe("needsApproval", () => {
    it("sets needsApproval on a tool that does not have it", () => {
      const tools = createBlobTools({
        overrides: {
          uploadAsset: { needsApproval: true },
        },
      });

      expect(tools.uploadAsset.needsApproval).toBe(true);
    });

    it("disables needsApproval on a tool that has it", () => {
      const tools = createBlobTools({
        overrides: {
          deleteAsset: { needsApproval: false },
        },
      });

      expect(tools.deleteAsset.needsApproval).toBe(false);
    });

    it("supports function form of needsApproval", () => {
      const approvalFn = () => true;
      const tools = createBlobTools({
        overrides: {
          copyAsset: { needsApproval: approvalFn },
        },
      });

      expect(tools.copyAsset.needsApproval).toBe(approvalFn);
    });
  });

  describe("providerOptions", () => {
    it("sets providerOptions on a factory-created tool", () => {
      const tools = createBlobTools({
        overrides: {
          uploadAsset: {
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
        },
      });

      expect(tools.uploadAsset.providerOptions).toEqual({
        anthropic: { cacheControl: { type: "ephemeral" } },
      });
    });

    it("sets providerOptions on a singleton tool", () => {
      const tools = createBlobTools({
        overrides: {
          deleteAssets: {
            providerOptions: {
              openai: { parallel_tool_calls: false },
            },
          },
        },
      });

      expect(tools.deleteAssets.providerOptions).toEqual({
        openai: { parallel_tool_calls: false },
      });
    });
  });

  describe("callback overrides", () => {
    it("sets onInputStart on a tool", () => {
      const onInputStart = vi.fn();
      const tools = createBlobTools({
        overrides: {
          uploadAsset: { onInputStart },
        },
      });

      expect(tools.uploadAsset.onInputStart).toBe(onInputStart);
    });

    it("sets onInputDelta on a tool", () => {
      const onInputDelta = vi.fn();
      const tools = createBlobTools({
        overrides: {
          listAssets: { onInputDelta },
        },
      });

      expect(tools.listAssets.onInputDelta).toBe(onInputDelta);
    });

    it("sets onInputAvailable on a tool", () => {
      const onInputAvailable = vi.fn();
      const tools = createBlobTools({
        overrides: {
          getAssetInfo: { onInputAvailable },
        },
      });

      expect(tools.getAssetInfo.onInputAvailable).toBe(onInputAvailable);
    });

    it("sets toModelOutput on a tool", () => {
      const toModelOutput = vi.fn().mockReturnValue({
        type: "text" as const,
        value: "custom",
      });
      const tools = createBlobTools({
        overrides: {
          downloadAsset: { toModelOutput },
        },
      });

      expect(tools.downloadAsset.toModelOutput).toBe(toModelOutput);
    });
  });

  describe("override behavior", () => {
    it("applies overrides to multiple tools simultaneously", () => {
      const tools = createBlobTools({
        overrides: {
          uploadAsset: { needsApproval: true },
          deleteAsset: { needsApproval: false },
          listAssets: { description: "Custom list" },
        },
      });

      expect(tools.uploadAsset.needsApproval).toBe(true);
      expect(tools.deleteAsset.needsApproval).toBe(false);
      expect(tools.listAssets.description).toBe("Custom list");
    });

    it("applies multiple overrides to the same tool", () => {
      const tools = createBlobTools({
        overrides: {
          uploadAsset: {
            description: "Custom upload",
            title: "Upload",
            strict: false,
            needsApproval: true,
          },
        },
      });

      expect(tools.uploadAsset.description).toBe("Custom upload");
      expect(tools.uploadAsset.title).toBe("Upload");
      expect(tools.uploadAsset.strict).toBe(false);
      expect(tools.uploadAsset.needsApproval).toBe(true);
    });

    it("singleton tools with overrides are new instances", () => {
      const tools = createBlobTools({
        overrides: {
          deleteAsset: { description: "Custom" },
        },
      });

      expect(tools.deleteAsset).not.toBe(deleteAsset);
    });

    it("singleton tools without overrides remain same instances", () => {
      const tools = createBlobTools({
        overrides: {
          uploadAsset: { description: "Custom" },
        },
      });

      expect(tools.deleteAsset).toBe(deleteAsset);
      expect(tools.deleteAssets).toBe(deleteAssets);
      expect(tools.getAssetInfo).toBe(getAssetInfo);
      expect(tools.downloadAsset).toBe(downloadAsset);
    });

    it("factory-created tools still execute correctly with overrides", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({
        overrides: {
          uploadAsset: {
            description: "Custom",
            needsApproval: true,
            strict: false,
          },
        },
      });

      const result = await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
      });

      expect(result).toMatchObject({
        success: true,
        url: `${baseUrl}/test.txt`,
      });
      expect(mockPut).toHaveBeenCalled();
    });

    it("singleton tools still execute correctly with overrides", async () => {
      mockDel.mockResolvedValue(undefined);

      const tools = createBlobTools({
        overrides: {
          deleteAsset: { description: "Custom delete" },
        },
      });

      const result = await execute(tools.deleteAsset, {
        url: `${baseUrl}/test.txt`,
      });

      expect(result).toMatchObject({
        success: true,
        deleted: true,
      });
      expect(mockDel).toHaveBeenCalledWith(`${baseUrl}/test.txt`);
    });

    it("overrides combine with pathPrefix", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/tenant/test.txt`,
        downloadUrl: `${baseUrl}/tenant/test.txt?download=1`,
        pathname: "tenant/test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({
        pathPrefix: "tenant",
        overrides: {
          uploadAsset: { needsApproval: true },
        },
      });

      expect(tools.uploadAsset.needsApproval).toBe(true);

      const result = await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
      });

      expect(result).toMatchObject({ success: true });
      expect(mockPut).toHaveBeenCalledWith(
        "tenant/test.txt",
        "Hello",
        expect.objectContaining({ access: "public" })
      );
    });

    it("overrides combine with access option", async () => {
      mockPut.mockResolvedValue({
        url: `${baseUrl}/test.txt`,
        downloadUrl: `${baseUrl}/test.txt?download=1`,
        pathname: "test.txt",
        contentType: "text/plain",
        contentDisposition: "inline",
        etag: "test-etag",
      });

      const tools = createBlobTools({
        access: "private",
        overrides: {
          uploadAsset: { strict: false },
        },
      });

      expect(tools.uploadAsset.strict).toBe(false);

      await execute(tools.uploadAsset, {
        pathname: "test.txt",
        content: "Hello",
      });

      expect(mockPut).toHaveBeenCalledWith(
        "test.txt",
        "Hello",
        expect.objectContaining({ access: "private" })
      );
    });

    it("no overrides returns tools unchanged", () => {
      const tools = createBlobTools();

      expect(tools.deleteAsset).toBe(deleteAsset);
      expect(tools.deleteAssets).toBe(deleteAssets);
      expect(tools.getAssetInfo).toBe(getAssetInfo);
      expect(tools.downloadAsset).toBe(downloadAsset);
      expect(tools.uploadAsset.description).toContain("Upload");
      expect(tools.uploadAsset.strict).toBe(true);
    });

    it("empty overrides object returns tools unchanged", () => {
      const tools = createBlobTools({ overrides: {} });

      expect(tools.deleteAsset).toBe(deleteAsset);
      expect(tools.deleteAssets).toBe(deleteAssets);
      expect(tools.getAssetInfo).toBe(getAssetInfo);
      expect(tools.downloadAsset).toBe(downloadAsset);
    });

    it("ToolOverrides type is importable", () => {
      const overrides: ToolOverrides = {
        description: "test",
        strict: false,
        needsApproval: true,
      };

      expect(overrides.description).toBe("test");
    });
  });
});
