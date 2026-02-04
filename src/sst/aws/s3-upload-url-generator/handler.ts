// Lambda handler for generating S3 presigned upload URLs
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// Environment variables injected by the component
const BUCKET_NAME = process.env.BUCKET_NAME!;
const ALLOWED_MIME_TYPES = JSON.parse(
  process.env.ALLOWED_MIME_TYPES || '["*"]',
);
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES || "104857600");
const URL_EXPIRY_SECONDS = parseInt(process.env.URL_EXPIRY_SECONDS || "300");
const KEY_PREFIX_STATIC = process.env.KEY_PREFIX_STATIC || "uploads/";
const KEY_PREFIX_INCLUDE_TIMESTAMP =
  process.env.KEY_PREFIX_INCLUDE_TIMESTAMP === "true";
const KEY_PREFIX_INCLUDE_UUID = process.env.KEY_PREFIX_INCLUDE_UUID === "true";

const s3Client = new S3Client({});

interface RequestBody {
  fileName: string;
  fileSize: number;
  mimeType: string;
  metadata?: Record<string, string>;
}

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*", // Configured via Lambda URL CORS
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Request body is required",
          code: "INVALID_REQUEST",
        }),
      };
    }

    const body: RequestBody = JSON.parse(event.body);

    // Validate required fields
    if (!body.fileName || !body.fileSize || !body.mimeType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "fileName, fileSize, and mimeType are required",
          code: "INVALID_REQUEST",
        }),
      };
    }

    // Validate file size
    if (body.fileSize > MAX_FILE_SIZE) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
          code: "FILE_TOO_LARGE",
          details: `Requested: ${body.fileSize}, Maximum: ${MAX_FILE_SIZE}`,
        }),
      };
    }

    // Validate MIME type (["*"] means all types allowed)
    if (
      !ALLOWED_MIME_TYPES.includes("*") &&
      !ALLOWED_MIME_TYPES.includes(body.mimeType)
    ) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "MIME type not allowed",
          code: "INVALID_MIME_TYPE",
          details: `Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
        }),
      };
    }

    // Sanitize filename to prevent path traversal
    const sanitizedFileName = body.fileName
      .replace(/\.\./g, "") // Remove parent directory references
      .replace(/^\/+/, "") // Remove leading slashes
      .replace(/[^a-zA-Z0-9._-]/g, "_"); // Replace special chars

    if (!sanitizedFileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Invalid filename after sanitization",
          code: "INVALID_FILENAME",
        }),
      };
    }

    // Generate S3 key with prefix strategy
    const keyParts = [KEY_PREFIX_STATIC];

    if (KEY_PREFIX_INCLUDE_TIMESTAMP) {
      const datePart = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      if (datePart) keyParts.push(datePart);
    }

    if (KEY_PREFIX_INCLUDE_UUID) {
      keyParts.push(randomUUID());
    }

    keyParts.push(sanitizedFileName);

    const key = keyParts.filter(Boolean).join("/");

    // Prepare S3 PutObject command
    const putObjectParams: any = {
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: body.mimeType,
      ContentLength: body.fileSize,
    };

    // Add custom metadata
    if (body.metadata) {
      putObjectParams.Metadata = body.metadata;
    }

    const command = new PutObjectCommand(putObjectParams);

    // Generate presigned URL
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: URL_EXPIRY_SECONDS,
    });

    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploadUrl,
        key,
        bucket: BUCKET_NAME,
        expiresIn: URL_EXPIRY_SECONDS,
        requiredHeaders: {
          "Content-Type": body.mimeType,
          "Content-Length": body.fileSize.toString(),
        },
        metadata: {
          maxFileSize: MAX_FILE_SIZE,
          allowedMimeTypes: ALLOWED_MIME_TYPES,
        },
      }),
    };
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        details: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
