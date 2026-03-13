import { config } from "dotenv";

config({ path: ".env.local" });

import { del, list } from "@vercel/blob";
import type { ToolExecutionOptions } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const describeIntegration = describe.skipIf(!hasToken);

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

const testPrefix = `integration-test-${Date.now()}`;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const toolOptions: ToolExecutionOptions = {
  toolCallId: "integration-test",
  messages: [],
};

async function execute<TInput, TOutput>(
  tool: {
    execute?: (input: TInput, options: ToolExecutionOptions) => TOutput;
  },
  input: TInput
): Promise<Awaited<TOutput>> {
  if (!tool.execute) {
    throw new Error("Tool execute function is undefined");
  }
  return await tool.execute(input, toolOptions);
}

// Track URLs for cleanup
const uploadedUrls: string[] = [];

afterAll(async () => {
  // Clean up all test blobs
  const { blobs } = await list({ prefix: testPrefix });
  if (blobs.length > 0) {
    await del(blobs.map((b) => b.url));
  }
});

describeIntegration("integration: uploadAsset", () => {
  it("uploads plain text", async () => {
    const result = await execute(uploadAsset, {
      pathname: `${testPrefix}/hello.txt`,
      content: "Hello, world!",
      allowOverwrite: true,
    });

    expect(result.success).toBe(true);
    expect(result.url).toContain(testPrefix);
    expect(result.pathname).toContain("hello.txt");
    expect(result.contentType).toBe("text/plain");
    uploadedUrls.push(result.url);
  });

  it("uploads JSON content", async () => {
    const json = JSON.stringify({ key: "value", num: 42 });
    const result = await execute(uploadAsset, {
      pathname: `${testPrefix}/data.json`,
      content: json,
      contentType: "application/json",
      allowOverwrite: true,
    });

    expect(result.success).toBe(true);
    expect(result.contentType).toBe("application/json");
    uploadedUrls.push(result.url);
  });

  it("uploads with explicit content type", async () => {
    const result = await execute(uploadAsset, {
      pathname: `${testPrefix}/doc.html`,
      content: "<h1>Hello</h1>",
      contentType: "text/html",
      allowOverwrite: true,
    });

    expect(result.success).toBe(true);
    expect(result.contentType).toBe("text/html");
    uploadedUrls.push(result.url);
  });

  it("uploads base64 binary content", async () => {
    // 1x1 red PNG pixel
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const result = await execute(uploadAsset, {
      pathname: `${testPrefix}/pixel.png`,
      content: pngBase64,
      contentType: "image/png",
      isBase64: true,
      allowOverwrite: true,
    });

    expect(result.success).toBe(true);
    expect(result.contentType).toBe("image/png");
    uploadedUrls.push(result.url);
  });

  it("uploads with addRandomSuffix", async () => {
    const result = await execute(uploadAsset, {
      pathname: `${testPrefix}/random.txt`,
      content: "random suffix test",
      addRandomSuffix: true,
    });

    expect(result.success).toBe(true);
    // pathname should differ from input due to random suffix
    expect(result.pathname).not.toBe(`${testPrefix}/random.txt`);
    expect(result.pathname).toContain("random");
    uploadedUrls.push(result.url);
  });

  it("uploads with allowOverwrite", async () => {
    const pathname = `${testPrefix}/overwrite-me.txt`;

    const first = await execute(uploadAsset, {
      pathname,
      content: "version 1",
      allowOverwrite: true,
    });
    expect(first.success).toBe(true);
    uploadedUrls.push(first.url);

    const second = await execute(uploadAsset, {
      pathname,
      content: "version 2",
      allowOverwrite: true,
    });
    expect(second.success).toBe(true);
    uploadedUrls.push(second.url);
  });

  it("fails to overwrite without allowOverwrite", async () => {
    const pathname = `${testPrefix}/no-overwrite.txt`;

    const first = await execute(uploadAsset, {
      pathname,
      content: "original",
      allowOverwrite: true,
    });
    expect(first.success).toBe(true);
    uploadedUrls.push(first.url);

    const second = await execute(uploadAsset, {
      pathname,
      content: "should fail",
    });
    expect(second.success).toBe(false);
    expect(second.error).toBeDefined();
  });

  it("rejects empty string content", async () => {
    const result = await execute(uploadAsset, {
      pathname: `${testPrefix}/empty.txt`,
      content: "",
      allowOverwrite: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("uploads large text content", async () => {
    const largeContent = "x".repeat(10_000);
    const result = await execute(uploadAsset, {
      pathname: `${testPrefix}/large.txt`,
      content: largeContent,
      allowOverwrite: true,
    });

    expect(result.success).toBe(true);
    uploadedUrls.push(result.url);
  });
});

describeIntegration("integration: listAssets", () => {
  it("lists all test assets", async () => {
    const result = await execute(listAssets, {
      prefix: `${testPrefix}/`,
    });

    expect(result.count).toBeGreaterThan(0);
    expect(result.assets.length).toBe(result.count);
    for (const asset of result.assets) {
      expect(asset.url).toBeDefined();
      expect(asset.pathname).toContain(testPrefix);
      expect(asset.size).toBeGreaterThanOrEqual(0);
      expect(asset.uploadedAt).toMatch(isoDatePattern);
    }
  });

  it("lists with limit", async () => {
    const result = await execute(listAssets, {
      prefix: `${testPrefix}/`,
      limit: 2,
    });

    expect(result.count).toBeLessThanOrEqual(2);
  });

  it("returns empty for non-existent prefix", async () => {
    const result = await execute(listAssets, {
      prefix: "non-existent-prefix-xyz-999/",
    });

    expect(result.count).toBe(0);
    expect(result.assets).toEqual([]);
  });
});

describeIntegration("integration: getAssetInfo", () => {
  it("gets metadata for existing asset", async () => {
    const result = await execute(getAssetInfo, {
      url: uploadedUrls[0],
    });

    expect(result.exists).toBe(true);
    expect(result.url).toBe(uploadedUrls[0]);
    expect(result.size).toBeGreaterThan(0);
    expect(result.contentType).toBeDefined();
    expect(result.uploadedAt).toBeDefined();
    expect(result.pathname).toBeDefined();
    expect(result.downloadUrl).toBeDefined();
  });

  it("returns exists: false for non-existent asset", async () => {
    const result = await execute(getAssetInfo, {
      url: "https://example.blob.vercel-storage.com/does-not-exist.txt",
    });

    expect(result.exists).toBe(false);
    expect(result.error).toBe("Asset not found");
  });
});

describeIntegration("integration: downloadAsset", () => {
  it("downloads text content", async () => {
    const result = await execute(downloadAsset, {
      url: uploadedUrls[0], // hello.txt
    });

    expect(result.success).toBe(true);
    expect(result.content).toBe("Hello, world!");
    expect(result.isBase64).toBe(false);
    expect(result.contentType).toContain("text/plain");
  });

  it("downloads JSON content as text", async () => {
    const result = await execute(downloadAsset, {
      url: uploadedUrls[1], // data.json
    });

    expect(result.success).toBe(true);
    expect(result.isBase64).toBe(false);
    const parsed = JSON.parse(result.content ?? "");
    expect(parsed.key).toBe("value");
    expect(parsed.num).toBe(42);
  });

  it("downloads binary content as base64", async () => {
    const result = await execute(downloadAsset, {
      url: uploadedUrls[3], // pixel.png
    });

    expect(result.success).toBe(true);
    expect(result.isBase64).toBe(true);
    expect(result.contentType).toContain("image/png");
    // Verify it's valid base64
    expect(() => Buffer.from(result.content ?? "", "base64")).not.toThrow();
  });

  it("fails for non-existent URL", async () => {
    const result = await execute(downloadAsset, {
      url: "https://example.blob.vercel-storage.com/does-not-exist.txt",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describeIntegration("integration: copyAsset", () => {
  let copiedUrl: string;

  it("copies an asset to a new location", async () => {
    const result = await execute(copyAsset, {
      sourceUrl: uploadedUrls[0], // hello.txt
      destinationPathname: `${testPrefix}/copied-hello.txt`,
    });

    expect(result.success).toBe(true);
    expect(result.pathname).toContain("copied-hello.txt");
    expect(result.newUrl).toBeDefined();
    expect(result.downloadUrl).toBeDefined();
    copiedUrl = result.newUrl;
    uploadedUrls.push(result.newUrl);
  });

  it("verifies copied content matches original", async () => {
    const original = await execute(downloadAsset, {
      url: uploadedUrls[0],
    });
    const copied = await execute(downloadAsset, {
      url: copiedUrl,
    });

    expect(original.content).toBe(copied.content);
  });
});

describeIntegration("integration: deleteAsset", () => {
  let deleteTargetUrl: string;

  beforeAll(async () => {
    const result = await execute(uploadAsset, {
      pathname: `${testPrefix}/to-delete.txt`,
      content: "delete me",
      allowOverwrite: true,
    });
    deleteTargetUrl = result.url;
  });

  it("deletes a single asset", async () => {
    const result = await execute(deleteAsset, {
      url: deleteTargetUrl,
    });

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(true);
    expect(result.url).toBe(deleteTargetUrl);
  });

  it("confirms asset is gone after delete", async () => {
    const info = await execute(getAssetInfo, {
      url: deleteTargetUrl,
    });

    expect(info.exists).toBe(false);
  });
});

describeIntegration("integration: deleteAssets", () => {
  const bulkUrls: string[] = [];

  beforeAll(async () => {
    for (const name of ["bulk-1.txt", "bulk-2.txt", "bulk-3.txt"]) {
      const result = await execute(uploadAsset, {
        pathname: `${testPrefix}/${name}`,
        content: `content of ${name}`,
        allowOverwrite: true,
      });
      bulkUrls.push(result.url);
    }
  });

  it("deletes multiple assets at once", async () => {
    const result = await execute(deleteAssets, {
      urls: bulkUrls,
    });

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(3);
  });

  it("confirms all assets are gone after bulk delete", async () => {
    for (const url of bulkUrls) {
      const info = await execute(getAssetInfo, { url });
      expect(info.exists).toBe(false);
    }
  });
});

describeIntegration("integration: createBlobTools with pathPrefix", () => {
  const prefixedTools = createBlobTools({
    pathPrefix: `${testPrefix}/prefixed`,
    allowOverwrite: true,
  });
  let scopedUrl: string;

  it("upload scopes to prefix", async () => {
    const result = await execute(prefixedTools.uploadAsset, {
      pathname: "scoped.txt",
      content: "scoped content",
    });

    expect(result.success).toBe(true);
    expect(result.pathname).toContain("prefixed/scoped.txt");
    scopedUrl = result.url;
    uploadedUrls.push(result.url);
  });

  it("list scopes to prefix", async () => {
    const result = await execute(prefixedTools.listAssets, {});

    expect(result.count).toBeGreaterThan(0);
    for (const asset of result.assets) {
      expect(asset.pathname).toContain("prefixed/");
    }
  });

  it("copy scopes destination to prefix", async () => {
    const result = await execute(prefixedTools.copyAsset, {
      sourceUrl: scopedUrl,
      destinationPathname: "scoped-copy.txt",
    });

    expect(result.success).toBe(true);
    expect(result.pathname).toContain("prefixed/scoped-copy.txt");
    uploadedUrls.push(result.newUrl);
  });
});
