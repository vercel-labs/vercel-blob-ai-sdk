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

## Available Tools

| Tool | Description |
|------|-------------|
| `uploadAsset` | Upload files, images, or text content to cloud storage |
| `listAssets` | List stored assets with optional filtering by prefix |
| `getAssetInfo` | Get metadata about an asset without downloading |
| `downloadAsset` | Download and retrieve the contents of an asset |
| `copyAsset` | Copy an asset to a new location |
| `deleteAsset` | Delete a single asset (requires approval) |
| `deleteAssets` | Delete multiple assets at once (requires approval) |

## Path Prefix

Use `createBlobTools` to scope all path-based operations under a prefix — useful for multi-tenant apps or organized storage:

```ts
import { createBlobTools } from "vercel-blob-ai-sdk";

const { uploadAsset, listAssets, copyAsset } = createBlobTools({
  pathPrefix: "tenant-abc",
});

// uploadAsset pathname "doc.txt" → stored as "tenant-abc/doc.txt"
// listAssets with no prefix → lists only "tenant-abc/" assets
// copyAsset destination "backup.txt" → copies to "tenant-abc/backup.txt"
```

The prefix applies to `uploadAsset`, `listAssets`, and `copyAsset`. URL-based tools (`deleteAsset`, `deleteAssets`, `getAssetInfo`, `downloadAsset`) are unaffected.

## Resources

- [Vercel AI SDK documentation](https://ai-sdk.dev/docs/introduction)
- [Vercel Blob SDK documentation](https://vercel.com/docs/vercel-blob/using-blob-sdk)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](.github/CONTRIBUTING.md) for more information.

## License

[MIT License](LICENSE.md)

## Author

[Ben Sabic](https://bensabic.dev) | [Vercel Labs](https://github.com/vercel-labs)
