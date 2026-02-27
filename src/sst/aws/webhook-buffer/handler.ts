import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { getService } from "./services/index.js";
import type { NormalizedRequest } from "./services/index.js";

const s3 = new S3Client({});
const BUCKET = process.env.WEBHOOK_BUFFER_BUCKET!;
const PRESIGN_TTL_SECONDS = 900;

function normalizeEvent(event: any): NormalizedRequest {
  // Lambda Function URL + ApiGatewayV2 (payload format 2.0)
  if (event.requestContext?.http) {
    return {
      method: event.requestContext.http.method,
      path: event.rawPath,
      headers: event.headers ?? {},
      body: event.body ?? "",
      isBase64Encoded: event.isBase64Encoded ?? false,
      query: event.queryStringParameters ?? {},
    };
  }

  throw new Error("Unsupported event format");
}

function response(statusCode: number, body?: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  };
}

async function receive(req: NormalizedRequest) {
  const service = req.path.split("/")[2];
  if (!service) return response(400, { error: "Missing service" });

  // Check if this service has custom validation logic (e.g., Strava's challenge)
  const serviceHandler = getService(service);
  if (serviceHandler?.handleValidation) {
    const validationResponse = await serviceHandler.handleValidation(req);
    if (validationResponse) {
      return validationResponse; // Return validation response immediately
    }
  }

  // Only allow POST for actual webhook payloads
  if (req.method !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  let envelope = {
    receivedAt: new Date().toISOString(),
    service,
    headers: req.headers,
    body: req.body,
    isBase64Encoded: req.isBase64Encoded,
  };

  // Allow service to transform the envelope before storage
  if (serviceHandler?.transformEnvelope) {
    envelope = await serviceHandler.transformEnvelope(envelope);
  }

  const key = `${service}/${Date.now()}-${randomUUID()}.json`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(envelope),
      ContentType: "application/json",
    }),
  );

  return { statusCode: 204 };
}

async function list(req: NormalizedRequest) {
  const service = req.path.split("/")[2];
  if (!service) return response(400, { error: "Missing service" });

  const limit = Math.min(parseInt(req.query.limit ?? "50"), 200);
  const after = req.query.after;

  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `${service}/`,
      MaxKeys: limit,
      ...(after && { StartAfter: after }),
    }),
  );

  const objects = result.Contents ?? [];

  const urls = await Promise.all(
    objects.map(async (obj) => ({
      key: obj.Key!,
      url: await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key! }),
        { expiresIn: PRESIGN_TTL_SECONDS },
      ),
    })),
  );

  const nextCursor =
    result.IsTruncated && objects.length > 0
      ? (objects[objects.length - 1]?.Key ?? null)
      : null;

  return response(200, { urls, nextCursor });
}

async function deletePayload(req: NormalizedRequest) {
  const key = req.path.split("/").slice(2).join("/");
  if (!key) return response(400, { error: "Missing payload key" });

  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  return response(204);
}

export const handler = async (event: any) => {
  let req: NormalizedRequest;

  try {
    req = normalizeEvent(event);
  } catch {
    return response(400, { error: "Unsupported event format" });
  }

  // Handle webhook receive (POST) and validation (GET, e.g., Strava challenge)
  if (req.path.startsWith("/webhook/")) {
    return receive(req);
  }

  // Handle listing webhooks
  if (req.method === "GET" && req.path.startsWith("/webhooks/")) {
    return list(req);
  }

  // Handle deleting a payload
  if (req.method === "DELETE" && req.path.startsWith("/payloads/")) {
    return deletePayload(req);
  }

  return response(404, { error: "Not found" });
};
