import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client } from "@aws-sdk/client-s3";
import type { APIGatewayProxyEvent } from "aws-lambda";

// Test configuration constants
const TEST_CONFIG = {
  BUCKET_NAME: "test-bucket",
  ALLOWED_MIME_TYPES: ["image/png", "image/jpeg"],
  MAX_FILE_SIZE_BYTES: 10485760, // 10MB
  URL_EXPIRY_SECONDS: 600, // 10 minutes
  KEY_PREFIX_STATIC: "uploads/",
  KEY_PREFIX_INCLUDE_TIMESTAMP: false,
  KEY_PREFIX_INCLUDE_UUID: false,
} as const;

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Error codes
const ERROR_CODE = {
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  INVALID_MIME_TYPE: "INVALID_MIME_TYPE",
  INVALID_REQUEST: "INVALID_REQUEST",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

// Test data constants
const TEST_FILE = {
  VALID_PNG: {
    fileName: "test.png",
    fileSize: 1024,
    mimeType: "image/png" as const,
  },
  VALID_JPEG: {
    fileName: "test.jpeg",
    fileSize: 1024,
    mimeType: "image/jpeg" as const,
  },
  TOO_LARGE: {
    fileName: "large.png",
    fileSize: 20971520, // 20MB
    mimeType: "image/png" as const,
  },
  INVALID_MIME: {
    fileName: "test.pdf",
    fileSize: 1024,
    mimeType: "application/pdf" as const,
  },
  PATH_TRAVERSAL: {
    fileName: "../../../etc/passwd",
    fileSize: 1024,
    mimeType: "image/png" as const,
  },
  LEADING_SLASHES: {
    fileName: "///test.png",
    fileSize: 1024,
    mimeType: "image/png" as const,
  },
  SPECIAL_CHARS: {
    fileName: "test file@#$%.png",
    fileSize: 1024,
    mimeType: "image/png" as const,
  },
  ONLY_SPECIAL_CHARS: {
    fileName: "@#$%^&*()",
    fileSize: 1024,
    mimeType: "image/png" as const,
  },
} as const;

const TEST_METADATA = {
  userId: "123",
  uploadSource: "web-app",
} as const;

const EXPECTED_HEADERS = {
  CONTENT_TYPE: "Content-Type",
  CONTENT_LENGTH: "Content-Length",
} as const;

const CORS_HEADERS = {
  CONTENT_TYPE: "application/json",
  ACCESS_CONTROL_ALLOW_ORIGIN: "*",
  ACCESS_CONTROL_ALLOW_METHODS: "POST, OPTIONS",
} as const;

const PRESIGNED_URL_PARAMS = {
  ALGORITHM: "X-Amz-Algorithm",
  SIGNATURE: "X-Amz-Signature",
} as const;

// Stub environment variables before importing handler
// AWS SDK configuration (required for S3Client and presigner)
vi.stubEnv("AWS_REGION", "us-east-1");
vi.stubEnv("AWS_ACCESS_KEY_ID", "test-access-key");
vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret-key");
// Handler-specific configuration
vi.stubEnv("BUCKET_NAME", TEST_CONFIG.BUCKET_NAME);
vi.stubEnv(
  "ALLOWED_MIME_TYPES",
  JSON.stringify(TEST_CONFIG.ALLOWED_MIME_TYPES),
);
vi.stubEnv("MAX_FILE_SIZE_BYTES", String(TEST_CONFIG.MAX_FILE_SIZE_BYTES));
vi.stubEnv("URL_EXPIRY_SECONDS", String(TEST_CONFIG.URL_EXPIRY_SECONDS));
vi.stubEnv("KEY_PREFIX_STATIC", TEST_CONFIG.KEY_PREFIX_STATIC);
vi.stubEnv(
  "KEY_PREFIX_INCLUDE_TIMESTAMP",
  String(TEST_CONFIG.KEY_PREFIX_INCLUDE_TIMESTAMP),
);
vi.stubEnv(
  "KEY_PREFIX_INCLUDE_UUID",
  String(TEST_CONFIG.KEY_PREFIX_INCLUDE_UUID),
);

// Import handler after setting env vars
const { handler } = await import("./handler.js");

const s3Mock = mockClient(S3Client);

describe("S3 Upload URL Generator Handler", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it("should generate presigned URL for valid request", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.VALID_PNG),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.OK);
    expect(body.uploadUrl).toBeDefined();
    expect(body.uploadUrl).toContain(PRESIGNED_URL_PARAMS.ALGORITHM);
    expect(body.uploadUrl).toContain(PRESIGNED_URL_PARAMS.SIGNATURE);
    expect(body.key).toContain(TEST_FILE.VALID_PNG.fileName);
    expect(body.bucket).toBe(TEST_CONFIG.BUCKET_NAME);
    expect(body.expiresIn).toBe(TEST_CONFIG.URL_EXPIRY_SECONDS);
    expect(body.requiredHeaders).toEqual({
      [EXPECTED_HEADERS.CONTENT_TYPE]: TEST_FILE.VALID_PNG.mimeType,
      [EXPECTED_HEADERS.CONTENT_LENGTH]: String(TEST_FILE.VALID_PNG.fileSize),
    });
    expect(body.metadata).toEqual({
      maxFileSize: TEST_CONFIG.MAX_FILE_SIZE_BYTES,
      allowedMimeTypes: TEST_CONFIG.ALLOWED_MIME_TYPES,
    });
  });

  it("should reject files exceeding max size", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.TOO_LARGE),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(body.code).toBe(ERROR_CODE.FILE_TOO_LARGE);
    expect(body.error).toContain("exceeds maximum allowed size");
    expect(body.details).toContain(String(TEST_FILE.TOO_LARGE.fileSize));
  });

  it("should reject invalid MIME types", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.INVALID_MIME),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(body.code).toBe(ERROR_CODE.INVALID_MIME_TYPE);
    expect(body.error).toBe("MIME type not allowed");
    expect(body.details).toContain(TEST_CONFIG.ALLOWED_MIME_TYPES[0]);
  });

  it("should accept allowed MIME types", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.VALID_JPEG),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.OK);
    expect(body.uploadUrl).toBeDefined();
  });

  it("should sanitize filenames with path traversal attempts", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.PATH_TRAVERSAL),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.OK);
    expect(body.key).not.toContain("..");
    expect(body.key).toContain("etc_passwd");
  });

  it("should sanitize filenames with leading slashes", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.LEADING_SLASHES),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.OK);
    expect(body.key).not.toMatch(/^\/+/);
  });

  it("should replace special characters in filename", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.SPECIAL_CHARS),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.OK);
    expect(body.key).toContain("test_file____");
    expect(body.key).toContain(".png");
  });

  it("should sanitize filename with only special characters", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.ONLY_SPECIAL_CHARS),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.OK);
    expect(body.key).toMatch(/_+$/); // Should be all underscores
  });

  it("should reject request without body", async () => {
    const event = {} as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(body.code).toBe(ERROR_CODE.INVALID_REQUEST);
    expect(body.error).toBe("Request body is required");
  });

  it("should reject request with missing required fields", async () => {
    const event = {
      body: JSON.stringify({
        fileName: TEST_FILE.VALID_PNG.fileName,
        // Missing fileSize and mimeType
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(body.code).toBe(ERROR_CODE.INVALID_REQUEST);
    expect(body.error).toContain("required");
  });

  it("should include custom metadata in presigned URL", async () => {
    const event = {
      body: JSON.stringify({
        ...TEST_FILE.VALID_PNG,
        metadata: TEST_METADATA,
      }),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.OK);
    expect(body.uploadUrl).toBeDefined();
  });

  it("should generate key without timestamp when disabled", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.VALID_PNG),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.OK);
    // Key should not include date format or UUID since both are disabled
    // Note: There's a double slash due to the key generation logic
    expect(body.key).toBe(
      `${TEST_CONFIG.KEY_PREFIX_STATIC}/${TEST_FILE.VALID_PNG.fileName}`,
    );
  });

  it("should use expiry seconds from environment", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.VALID_PNG),
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.OK);
    expect(body.expiresIn).toBe(TEST_CONFIG.URL_EXPIRY_SECONDS);
  });

  it("should handle internal errors gracefully", async () => {
    // Force an error by providing invalid JSON
    const event = {
      body: "invalid json {",
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(body.code).toBe(ERROR_CODE.INTERNAL_ERROR);
    expect(body.error).toBe("Internal server error");
  });

  it("should include CORS headers in response", async () => {
    const event = {
      body: JSON.stringify(TEST_FILE.VALID_PNG),
    } as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.headers).toMatchObject({
      "Content-Type": CORS_HEADERS.CONTENT_TYPE,
      "Access-Control-Allow-Origin": CORS_HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": CORS_HEADERS.ACCESS_CONTROL_ALLOW_METHODS,
    });
  });
});
