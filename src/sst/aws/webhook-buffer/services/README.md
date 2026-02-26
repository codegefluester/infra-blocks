# Webhook Services

This directory contains service-specific webhook handlers that enable custom validation and transformation logic without bloating the main handler.

## Architecture

Each service can implement:
- **Validation handling**: Respond to subscription verification requests (like Strava's challenge)
- **Envelope transformation**: Modify or enrich webhook data before storage

## Adding a New Service

### 1. Create a service file

Create `services/myservice.ts`:

```typescript
import type { WebhookService, NormalizedRequest, WebhookResponse } from "./base.js";

export const myService: WebhookService = {
  name: "myservice",

  async handleValidation(req: NormalizedRequest): Promise<WebhookResponse | null> {
    // Handle validation requests (GET with special parameters)
    // Return a response or null to continue normal processing
    if (req.method === "GET" && req.query.verify_token) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "verified" }),
      };
    }
    return null;
  },

  async transformEnvelope(envelope): Promise<WebhookEnvelope> {
    // Optional: Extract metadata, normalize formats, etc.
    return {
      ...envelope,
      metadata: {
        processedAt: new Date().toISOString(),
      },
    };
  },
};
```

### 2. Register the service

Add to `services/index.ts`:

```typescript
import { myService } from "./myservice.js";

const services: WebhookService[] = [
  stravaService,
  myService, // Add here
];
```

### 3. Use it

Send webhooks to: `POST {url}/webhook/myservice`

## Examples

### Strava

Strava requires GET request validation with a challenge parameter:

```bash
# Strava sends this during subscription creation:
GET /webhook/strava?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=secret

# Our handler responds:
HTTP/1.1 200 OK
{"hub.challenge": "abc123"}
```

### GitHub (Example)

GitHub validates webhooks via HMAC signatures in headers:

```typescript
export const githubService: WebhookService = {
  name: "github",

  async handleValidation(req): Promise<WebhookResponse | null> {
    const signature = req.headers["x-hub-signature-256"];
    if (!signature) return null;

    // Verify HMAC signature
    const isValid = verifySignature(req.body, signature);
    if (!isValid) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid signature" }) };
    }

    return null; // Continue normal processing
  },
};
```

## API Endpoints

- **Receive/Validate**: `POST|GET {url}/webhook/{service}`
  - POST: Store webhook payload
  - GET: Handle validation (service-specific)
- **List**: `GET {url}/webhooks/{service}?after={cursor}&limit=50`
  - Returns presigned URLs for webhook payloads
