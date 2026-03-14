# Vercel Blob - AI SDK Tools

![MIT License](https://img.shields.io/badge/License-MIT-000000?style=for-the-badge&labelColor=333333)
![Vercel AI SDK](https://img.shields.io/badge/Vercel-AI%20SDK-000000?style=for-the-badge&logo=vercel&logoColor=white)

A collection of [AI SDK](https://ai-sdk.dev) tools that give your AI agents the ability to store and manage files using [Vercel Blob](https://vercel.com/docs/vercel-blob).

## Installation

```bash
npm install vercel-blob-ai-sdk
```

## Setup

Set the `BLOB_READ_WRITE_TOKEN` environment variable with your Vercel Blob token.

## Usage

```ts
import { generateText, stepCountIs } from "ai";
import { uploadAsset, listAssets, downloadAsset } from "vercel-blob-ai-sdk";

const { text } = await generateText({
  model: 'openai/gpt-5.2',
  tools: { uploadAsset, listAssets, downloadAsset },
  prompt: "Save a file called hello.txt with the content 'Hello, world!'",
  stopWhen: stepCountIs(3),
});
```

### Peer dependencies

This package requires [`ai`](https://ai-sdk.dev) (^6.0.67) and [`zod`](https://zod.dev) (^4.3.6) as peer dependencies.

## Available Tools

| Tool | Description | Needs approval |
|------|-------------|:-:|
| `uploadAsset` | Upload files, images, or text content to blob storage | No |
| `listAssets` | List stored assets with optional prefix filtering and pagination | No |
| `getAssetInfo` | Get metadata (size, content type, upload date) without downloading | No |
| `downloadAsset` | Download and retrieve file contents (text or base64) | No |
| `copyAsset` | Copy an asset to a new path without re-uploading | No |
| `deleteAsset` | Permanently delete a single asset | Yes |
| `deleteAssets` | Permanently delete multiple assets at once | Yes |

## Configuring tools

Use `createBlobTools` to scope operations under a path prefix, configure access control, and customize individual tool behavior.

```ts
import { createBlobTools } from "vercel-blob-ai-sdk";

const tools = createBlobTools({
  pathPrefix: "tenant-abc",
  access: "private",
  allowOverwrite: true,
  overrides: {
    deleteAsset: { needsApproval: false },
    uploadAsset: { description: "Store tenant files" },
  },
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pathPrefix` | `string` | `""` | Prefix prepended to all asset paths |
| `access` | `"public" \| "private"` | `"public"` | Default access level for uploaded/copied assets |
| `addRandomSuffix` | `boolean` | `false` | Add a random suffix to filenames to avoid conflicts |
| `allowOverwrite` | `boolean` | `false` | Allow overwriting existing assets at the same path |
| `overrides` | `Record<string, ToolOverrides>` | — | Per-tool overrides (see below) |

The path prefix applies to `uploadAsset`, `listAssets`, and `copyAsset`. URL-based tools (`deleteAsset`, `deleteAssets`, `getAssetInfo`, `downloadAsset`) are unaffected by the prefix.

### Tool overrides

The `overrides` option lets you customize any AI SDK [`tool()`](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) property on a per-tool basis, keyed by tool name.

```ts
import type { ToolOverrides } from "vercel-blob-ai-sdk";
```

Supported override properties:

| Property | Type | Description |
|----------|------|-------------|
| `description` | `string` | Custom tool description for the model |
| `title` | `string` | Human-readable title |
| `strict` | `boolean` | Strict mode for input generation |
| `needsApproval` | `boolean \| function` | Gate execution behind approval |
| `providerOptions` | `ProviderOptions` | Provider-specific metadata |
| `onInputStart` | `function` | Callback when argument streaming starts |
| `onInputDelta` | `function` | Callback on each streaming delta |
| `onInputAvailable` | `function` | Callback when full input is available |
| `toModelOutput` | `function` | Custom mapping of tool result to model output |

Core properties (`execute`, `inputSchema`, `outputSchema`) cannot be overridden.

## Resources

- [Vercel AI SDK documentation](https://ai-sdk.dev/docs/introduction)
- [Vercel Blob SDK documentation](https://vercel.com/docs/vercel-blob/using-blob-sdk)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](.github/CONTRIBUTING.md) for more information.

## License

[MIT License](LICENSE.md)

## Author

[Ben Sabic](https://bensabic.dev) | [Vercel Labs](https://github.com/vercel-labs)
