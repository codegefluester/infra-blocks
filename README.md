# @codegefluester/infra-blocks

Opinionated building blocks for SST v3 projects. Reduces boilerplate with sensible defaults.

## Installation

```bash
pnpm add @codegefluester/infra-blocks
```

## Usage

### StaticSite

Deploys a static site to S3 + CloudFront with automatic SSL and DNS.

```typescript
/// <reference path="./.sst/platform/config.d.ts" />

import { StaticSite } from "@codegefluester/infra-blocks";

export default $config({
  app(input) {
    return {
      name: "my-app",
      home: "aws",
    };
  },
  async run() {
    const site = StaticSite("MySite", {
      domain: {
        name: "myapp.example.com",
        zone: "example.com", // Your Route53 hosted zone
      },
    });

    return {
      url: site.url,
    };
  },
});
```

**Opinionated defaults:**
- Build command: `pnpm build`
- Build output: `dist`
- Error page: `index.html` (for SPA routing)
- Path: `.` (current directory)

**Override defaults:**

```typescript
StaticSite("MySite", {
  domain: { name: "app.example.com", zone: "example.com" },
  buildCommand: "npm run build",
  buildOutput: "build",
  path: "./packages/web",
  environment: {
    VITE_API_URL: api.url,
  },
  sst: {
    // Override any sst.aws.StaticSite property
    errorPage: "404.html",
  },
});
```

## Philosophy

This package is opinionated by design. It favors convention over configuration for common use cases. If you need full control, use `sst.aws.StaticSite` directly.

PRs welcome for additional building blocks or improved defaults.

## License

MIT
