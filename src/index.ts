import { copy, del, head, list, put } from "@vercel/blob";
import type { Tool } from "ai";
import { tool } from "ai";
import { z } from "zod";

const UploadResultSchema = z.object({
  success: z.boolean().describe("Whether the upload succeeded"),
  url: z.url().describe("Public URL of the uploaded asset"),
  downloadUrl: z.url().describe("Direct download URL for the asset"),
  pathname: z.string().describe("Storage path of the asset"),
  contentType: z.string().describe("MIME type of the uploaded content"),
  error: z.string().optional().describe("Error message if failed"),
});

const AssetMetadataSchema = z.object({
  url: z.url().describe("Public URL of the asset"),
  downloadUrl: z.url().describe("Direct download URL for the asset"),
  pathname: z.string().describe("Storage path of the asset"),
  size: z.number().describe("Size in bytes"),
  uploadedAt: z.iso.datetime().describe("ISO timestamp when uploaded"),
});

const ListResultSchema = z.object({
  assets: z.array(AssetMetadataSchema).describe("Array of asset metadata"),
  count: z.number().describe("Number of assets returned"),
  hasMore: z.boolean().describe("Whether more assets exist"),
  cursor: z.string().optional().describe("Cursor for pagination"),
  error: z.string().optional().describe("Error message if failed"),
});

const DeleteResultSchema = z.object({
  success: z.boolean().describe("Whether the deletion succeeded"),
  deleted: z.boolean().describe("Confirms the asset was deleted"),
  url: z.url().describe("URL of the deleted asset"),
  error: z.string().optional().describe("Error message if failed"),
});

const BulkDeleteResultSchema = z.object({
  success: z.boolean().describe("Whether all deletions succeeded"),
  deletedCount: z.number().describe("Number of assets deleted"),
  urls: z.array(z.url()).describe("URLs of deleted assets"),
  error: z.string().optional().describe("Error message if failed"),
});

const AssetInfoResultSchema = z.object({
  exists: z.boolean().describe("Whether the asset exists"),
  url: z.url().describe("URL that was checked"),
  downloadUrl: z.url().optional().describe("Direct download URL if exists"),
  pathname: z.string().optional().describe("Storage path if exists"),
  size: z.number().optional().describe("Size in bytes if exists"),
  contentType: z.string().optional().describe("MIME type if exists"),
  uploadedAt: z.iso
    .datetime()
    .optional()
    .describe("Upload timestamp if exists"),
  error: z.string().optional().describe("Error message if not found"),
});

const CopyResultSchema = z.object({
  success: z.boolean().describe("Whether the copy succeeded"),
  sourceUrl: z.url().describe("Original asset URL"),
  newUrl: z.url().describe("URL of the copied asset"),
  downloadUrl: z.url().describe("Direct download URL of the copied asset"),
  pathname: z.string().describe("New storage path"),
  error: z.string().optional().describe("Error message if failed"),
});

const DownloadResultSchema = z.object({
  success: z.boolean().describe("Whether the download succeeded"),
  url: z.url().describe("URL of the downloaded asset"),
  contentType: z.string().optional().describe("MIME type of the content"),
  isBase64: z
    .boolean()
    .optional()
    .describe("Whether content is base64 encoded"),
  content: z.string().optional().describe("The asset content"),
  error: z.string().optional().describe("Error message if failed"),
});

export type ToolOverrides = Partial<
  Pick<
    Tool,
    | "description"
    | "needsApproval"
    | "onInputAvailable"
    | "onInputDelta"
    | "onInputStart"
    | "providerOptions"
    | "strict"
    | "title"
    | "toModelOutput"
  >
>;

export interface CreateBlobToolsOptions {
  access?: "private" | "public";
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
  overrides?: {
    [K in keyof BlobTools]?: ToolOverrides;
  };
  pathPrefix?: string;
}

interface UploadDefaults {
  access: "private" | "public";
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
}

const normalizePrefix = (prefix?: string): string => {
  if (!prefix) {
    return "";
  }
  return prefix.replace(/^\/+|\/+$/g, "");
};

const joinPath = (prefix: string, path: string): string => {
  if (!prefix) {
    return path;
  }
  return `${prefix}/${path}`;
};

// --- Path-based tool creators ---

const createUploadAsset = (
  prefix: string,
  defaults: UploadDefaults,
  overrides?: ToolOverrides
) =>
  tool({
    description:
      "Upload a file, image, document, or text content to permanent cloud storage. " +
      "Use this tool when the user wants to save, store, or persist any content that should be accessible via URL. " +
      "Returns a URL for the uploaded asset.",
    inputSchema: z.object({
      pathname: z
        .string()
        .describe(
          'The path and filename for the asset, including extension (e.g., "documents/report.pdf", "images/photo.png", "data/config.json")'
        ),
      content: z
        .string()
        .describe(
          "The content to upload. For text/JSON, provide the raw content. For binary files like images, provide base64-encoded data and set isBase64 to true."
        ),
      contentType: z
        .string()
        .optional()
        .describe(
          'MIME type of the content (e.g., "text/plain", "application/json", "image/png"). If omitted, it will be inferred from the pathname extension.'
        ),
      isBase64: z
        .boolean()
        .optional()
        .describe(
          "Set to true if the content is base64-encoded binary data (e.g., for images, PDFs). Defaults to false."
        ),
      access: z
        .enum(["public", "private"])
        .optional()
        .describe(
          'Access level for the asset. "public" makes it accessible via URL, "private" requires authentication. Defaults to the configured access level.'
        ),
      addRandomSuffix: z
        .boolean()
        .optional()
        .describe(
          "Whether to add a random suffix to the filename to avoid conflicts. Defaults to false."
        ),
      allowOverwrite: z
        .boolean()
        .optional()
        .describe(
          "Whether to allow overwriting an existing blob at the same pathname. Defaults to false."
        ),
    }),
    inputExamples: [
      {
        input: {
          pathname: "notes/meeting.txt",
          content: "Meeting notes...",
        },
      },
      {
        input: {
          pathname: "images/logo.png",
          content: "base64data...",
          contentType: "image/png",
          isBase64: true,
        },
      },
    ],
    outputSchema: UploadResultSchema,
    strict: true,
    execute: async ({
      pathname,
      content,
      contentType,
      isBase64,
      access,
      addRandomSuffix,
      allowOverwrite,
    }) => {
      try {
        const body = isBase64 ? Buffer.from(content, "base64") : content;
        const prefixedPathname = joinPath(prefix, pathname);

        const blob = await put(prefixedPathname, body, {
          access: access ?? defaults.access,
          contentType,
          addRandomSuffix: addRandomSuffix ?? defaults.addRandomSuffix,
          allowOverwrite: allowOverwrite ?? defaults.allowOverwrite,
        });

        return {
          success: true,
          url: blob.url,
          downloadUrl: blob.downloadUrl,
          pathname: blob.pathname,
          contentType: blob.contentType,
        };
      } catch (error) {
        return {
          success: false,
          url: "",
          downloadUrl: "",
          pathname,
          contentType: contentType || "unknown",
          error: error instanceof Error ? error.message : "Upload failed",
        };
      }
    },
    ...overrides,
  });

const createListAssets = (prefix: string, overrides?: ToolOverrides) =>
  tool({
    description:
      "List all stored assets in cloud storage with optional filtering by folder/prefix. " +
      "Use this tool to browse available files, find assets by folder path, search for specific content, or get an inventory of stored content. " +
      "Returns URLs, sizes, and upload dates for each asset.",
    inputSchema: z.object({
      prefix: z
        .string()
        .optional()
        .describe(
          'Filter assets by path prefix/folder (e.g., "images/" to list only images, "documents/2024/" for a specific folder). Leave empty to list all assets.'
        ),
      limit: z
        .number()
        .min(1)
        .max(1000)
        .optional()
        .describe(
          "Maximum number of assets to return. Default is 1000. Use smaller values for faster responses."
        ),
    }),
    inputExamples: [
      { input: {} },
      { input: { prefix: "images/" } },
      { input: { prefix: "documents/", limit: 10 } },
    ],
    outputSchema: ListResultSchema,
    strict: true,
    execute: async ({ prefix: userPrefix, limit }) => {
      try {
        let effectivePrefix = userPrefix;
        if (prefix) {
          effectivePrefix = userPrefix
            ? `${prefix}/${userPrefix}`
            : `${prefix}/`;
        }

        const { blobs, hasMore, cursor } = await list({
          prefix: effectivePrefix,
          limit,
        });

        return {
          assets: blobs.map((blob) => ({
            url: blob.url,
            downloadUrl: blob.downloadUrl,
            pathname: blob.pathname,
            size: blob.size,
            uploadedAt: blob.uploadedAt.toISOString(),
          })),
          count: blobs.length,
          hasMore,
          cursor,
        };
      } catch (error) {
        console.error("Error listing assets:", error);
        return {
          assets: [],
          count: 0,
          hasMore: false,
          error:
            error instanceof Error ? error.message : "Failed to list assets",
        };
      }
    },
    ...overrides,
  });

const createCopyAsset = (
  prefix: string,
  defaults: UploadDefaults,
  overrides?: ToolOverrides
) =>
  tool({
    description:
      "Copy an existing asset to a new location/pathname without re-uploading. " +
      "Use to duplicate files, create backups, rename assets, or reorganize storage structure. " +
      "The original asset remains unchanged; a new copy is created at the destination. " +
      "NOTE: If a file already exists at the destination pathname, it will be overwritten.",
    inputSchema: z.object({
      sourceUrl: z.url().describe("The full public URL of the asset to copy"),
      destinationPathname: z
        .string()
        .describe(
          'The new path and filename for the copy (e.g., "backups/photo-backup.png", "archive/2024/report.pdf")'
        ),
      access: z
        .enum(["public", "private"])
        .optional()
        .describe(
          'Access level for the copied asset. "public" makes it accessible via URL, "private" requires authentication. Defaults to the configured access level.'
        ),
    }),
    inputExamples: [
      {
        input: {
          sourceUrl: "https://example.blob.vercel-storage.com/photo.png",
          destinationPathname: "backups/photo-backup.png",
        },
      },
    ],
    outputSchema: CopyResultSchema,
    strict: true,
    execute: async ({ sourceUrl, destinationPathname, access }) => {
      try {
        const prefixedDest = joinPath(prefix, destinationPathname);

        const blob = await copy(sourceUrl, prefixedDest, {
          access: access ?? defaults.access,
        });

        return {
          success: true,
          sourceUrl,
          newUrl: blob.url,
          downloadUrl: blob.downloadUrl,
          pathname: blob.pathname,
        };
      } catch (error) {
        console.error("Error copying asset:", error);
        return {
          success: false,
          sourceUrl,
          newUrl: "",
          downloadUrl: "",
          pathname: destinationPathname,
          error: error instanceof Error ? error.message : "Copy failed",
        };
      }
    },
    ...overrides,
  });

export const deleteAsset = tool({
  description:
    "Permanently delete an asset from cloud storage by its URL. " +
    "Use when the user explicitly wants to remove, delete, or clean up a specific stored file. " +
    "WARNING: This action is irreversible and the asset cannot be recovered.",
  inputSchema: z.object({
    url: z
      .url()
      .describe(
        'The full public URL of the asset to delete (e.g., "https://example.blob.vercel-storage.com/images/photo.png")'
      ),
  }),
  inputExamples: [
    {
      input: {
        url: "https://example.blob.vercel-storage.com/old-file.txt",
      },
    },
  ],
  outputSchema: DeleteResultSchema,
  strict: true,
  needsApproval: true,
  execute: async ({ url }) => {
    try {
      await del(url);

      return {
        success: true,
        deleted: true,
        url,
      };
    } catch (error) {
      console.error("Error deleting asset:", error);
      return {
        success: false,
        deleted: false,
        url,
        error: error instanceof Error ? error.message : "Delete failed",
      };
    }
  },
});

export const deleteAssets = tool({
  description:
    "Permanently delete multiple assets from cloud storage at once. " +
    "Use for bulk cleanup, removing several files, or clearing a batch of content. " +
    "WARNING: This action is irreversible. All specified assets will be permanently removed.",
  inputSchema: z.object({
    urls: z
      .array(z.url())
      .min(1)
      .max(100)
      .describe(
        "Array of full public URLs to delete. Maximum 100 assets per call."
      ),
  }),
  inputExamples: [
    {
      input: {
        urls: [
          "https://example.blob.vercel-storage.com/file1.txt",
          "https://example.blob.vercel-storage.com/file2.txt",
        ],
      },
    },
  ],
  outputSchema: BulkDeleteResultSchema,
  strict: true,
  needsApproval: true,
  execute: async ({ urls }) => {
    try {
      await del(urls);

      return {
        success: true,
        deletedCount: urls.length,
        urls,
      };
    } catch (error) {
      console.error("Error deleting assets:", error);
      return {
        success: false,
        deletedCount: 0,
        urls,
        error: error instanceof Error ? error.message : "Bulk delete failed",
      };
    }
  },
});

export const getAssetInfo = tool({
  description:
    "Get metadata and information about an asset without downloading its content. " +
    "Use to check if an asset exists, verify its size before downloading, confirm content type, or get upload date. " +
    "Returns exists: false if the asset is not found.",
  inputSchema: z.object({
    url: z.url().describe("The full public URL of the asset to inspect"),
  }),
  inputExamples: [
    {
      input: {
        url: "https://example.blob.vercel-storage.com/document.pdf",
      },
    },
  ],
  outputSchema: AssetInfoResultSchema,
  strict: true,
  execute: async ({ url }) => {
    try {
      const metadata = await head(url);

      return {
        exists: true,
        url: metadata.url,
        downloadUrl: metadata.downloadUrl,
        pathname: metadata.pathname,
        size: metadata.size,
        contentType: metadata.contentType,
        uploadedAt: metadata.uploadedAt.toISOString(),
      };
    } catch (error) {
      console.error("Error fetching asset info:", error);
      return {
        exists: false,
        url,
        error: "Asset not found",
      };
    }
  },
});

export const downloadAsset = tool({
  description:
    "Download and retrieve the full contents of an asset. " +
    "Use when the user wants to read, view, display, or process the content of a stored file. " +
    "Text files return raw content; binary files (images, PDFs) return base64-encoded content.",
  inputSchema: z.object({
    url: z.url().describe("The full public URL of the asset to download"),
  }),
  inputExamples: [
    {
      input: {
        url: "https://example.blob.vercel-storage.com/notes.txt",
      },
    },
  ],
  outputSchema: DownloadResultSchema,
  strict: true,
  execute: async ({ url }) => {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          url,
          error: `Failed to download: ${response.status} ${response.statusText}`,
        };
      }

      const contentType =
        response.headers.get("content-type") || "application/octet-stream";
      const isText =
        contentType.startsWith("text/") || contentType.includes("json");

      let content: string;
      if (isText) {
        content = await response.text();
      } else {
        const buffer = await response.arrayBuffer();
        content = Buffer.from(buffer).toString("base64");
      }

      return {
        success: true,
        url,
        contentType,
        isBase64: !isText,
        content,
      };
    } catch (error) {
      console.error("Error downloading asset:", error);
      return {
        success: false,
        url,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

const defaultUploadDefaults: UploadDefaults = { access: "public" };

export const uploadAsset = createUploadAsset("", defaultUploadDefaults);
export const listAssets = createListAssets("");
export const copyAsset = createCopyAsset("", defaultUploadDefaults);

export interface BlobTools {
  copyAsset: typeof copyAsset;
  deleteAsset: typeof deleteAsset;
  deleteAssets: typeof deleteAssets;
  downloadAsset: typeof downloadAsset;
  getAssetInfo: typeof getAssetInfo;
  listAssets: typeof listAssets;
  uploadAsset: typeof uploadAsset;
}

export const createBlobTools = (
  options?: CreateBlobToolsOptions
): BlobTools => {
  const prefix = normalizePrefix(options?.pathPrefix);
  const uploadDefaults: UploadDefaults = {
    access: options?.access ?? "public",
    addRandomSuffix: options?.addRandomSuffix,
    allowOverwrite: options?.allowOverwrite,
  };

  return {
    uploadAsset: createUploadAsset(
      prefix,
      uploadDefaults,
      options?.overrides?.uploadAsset
    ),
    listAssets: createListAssets(prefix, options?.overrides?.listAssets),
    deleteAsset: options?.overrides?.deleteAsset
      ? { ...deleteAsset, ...options.overrides.deleteAsset }
      : deleteAsset,
    deleteAssets: options?.overrides?.deleteAssets
      ? { ...deleteAssets, ...options.overrides.deleteAssets }
      : deleteAssets,
    getAssetInfo: options?.overrides?.getAssetInfo
      ? { ...getAssetInfo, ...options.overrides.getAssetInfo }
      : getAssetInfo,
    copyAsset: createCopyAsset(
      prefix,
      uploadDefaults,
      options?.overrides?.copyAsset
    ),
    downloadAsset: options?.overrides?.downloadAsset
      ? { ...downloadAsset, ...options.overrides.downloadAsset }
      : downloadAsset,
  };
};
