# @codegefluester/infra-blocks

Opinionated building blocks for SST v4 projects. Reduces boilerplate with sensible defaults.

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

### Webhook buffer

For apps that you want to run locally but still need to receive webhooks from external services, a common pattern is to use a webhook buffer. This is a simple service that receives webhooks and stores them in S3. You can then poll the buffer for new webhooks and process them locally. This is to avoid having to run a tunnel service like ngrok in front of your local server. This isn't meant for local development but rather for running a production app locally on a machine that isn't online 24/7.

It supports S3 lifecycle rules to automatically move older webhooks to cheaper storage tiers.

```typescript
const {
  WebhookBuffer,
  WebhookBufferResult,
} = require("@codegefluester/infra-blocks");

const webhookBuffer: typeof WebhookBufferResult = WebhookBuffer(
  "RunscoutStravaWebhookBuffer",
  {
    glacierAfterDays: 30,
  },
);
```

#### Webhook validation

A webhook buffer supports **service-specific webhook validation functions** to confirm webhook subscriptions during provider handshake flows (for example, challenge/verify-token exchanges).

Instead of using one generic validator, each service (e.g. Strava, GitHub, Shopify) implements its own validation logic and plugs into a shared dispatch flow.

##### How it works

1. Incoming webhook request is identified by service (for example: `strava`, `github`, `shopify`).
2. A validator function is resolved for that service.
3. The validator checks the request against provider-specific rules.
4. If valid, the validator returns the expected subscription confirmation response.
5. If invalid or unsupported, the request is rejected.

This keeps provider behavior isolated and makes new integrations safe to add without changing existing ones.

##### Service-specific validator contract

Each service validator should:

- Accept the raw webhook request context (query params, headers, and/or body as needed).
- Perform provider-specific validation checks.
- Return:
  - whether the request is a subscription confirmation request
  - whether validation passed
  - the response payload/status required by that provider

##### Example: Strava

The Strava implementation is the reference pattern already in the codebase.

In Strava’s subscription confirmation flow, the validator:

- Detects Strava’s subscription challenge request shape.
- Verifies required fields/token according to Strava rules.
- Returns the challenge response in the format Strava expects.

Use this implementation as the template for new providers.

##### Adding a new provider

1. Create a new validator function for the provider.
2. Implement provider-specific checks and confirmation response mapping.
3. Register the validator in the service-to-validator lookup/dispatcher.
4. Add tests for:
   - valid confirmation request
   - invalid token/signature/challenge
   - non-confirmation webhook events (should skip confirmation path)

##### Why this design

- **Extensible:** New providers are added without modifying core validation logic.
- **Maintainable:** Provider logic remains isolated and easier to debug.
- **Testable:** Each validator can be unit-tested independently.
- **Safe:** Reduces risk of cross-provider validation mistakes.

## Philosophy

This package is opinionated by design. It favors convention over configuration for common use cases. If you need full control, use `sst.aws.StaticSite` directly.

PRs welcome for additional building blocks or improved defaults.

## License

MIT
