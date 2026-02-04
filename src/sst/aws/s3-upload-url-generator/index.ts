// SST v3 type definitions for components we use
declare namespace sst {
  namespace aws {
    interface BucketArgs {
      cors?: {
        allowOrigins?: string[];
        allowMethods?: string[];
        allowHeaders?: string[];
        maxAge?: string;
      };
      enforceHttps?: boolean;
      [key: string]: any;
    }

    class Bucket {
      constructor(name: string, args?: BucketArgs);
      static get(name: string, id: string): Bucket;
      name: any; // Output<string>
      arn: any;
      [key: string]: any;
    }

    interface FunctionArgs {
      handler: string;
      runtime?: string;
      memory?: string;
      timeout?: string;
      url?:
        | boolean
        | {
            cors?: {
              allowOrigins?: string[];
              allowMethods?: string[];
              allowHeaders?: string[];
            };
          };
      environment?: Record<string, any>;
      link?: any[];
      [key: string]: any;
    }

    class Function {
      constructor(name: string, args: FunctionArgs);
      url: any; // Output<string>
      arn: any;
      [key: string]: any;
    }
  }
}

/**
 * Request body for the presigned URL generator Lambda
 */
export interface GenerateUploadUrlRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  metadata?: Record<string, string>;
}

/**
 * Response from the presigned URL generator Lambda
 */
export interface GenerateUploadUrlResponse {
  uploadUrl: string;
  key: string;
  bucket: string;
  expiresIn: number;
  requiredHeaders: {
    "Content-Type": string;
    "Content-Length": string;
  };
  metadata: {
    maxFileSize: number;
    allowedMimeTypes: string[];
  };
}

/**
 * Error response from the presigned URL generator Lambda
 */
export interface UploadUrlError {
  error: string;
  code:
    | "INVALID_MIME_TYPE"
    | "FILE_TOO_LARGE"
    | "INVALID_FILENAME"
    | "INVALID_REQUEST"
    | "INTERNAL_ERROR";
  details?: string;
}

export interface S3UploadUrlGeneratorProps {
  /**
   * S3 bucket configuration
   * - Provide bucket name to use existing bucket
   * - Provide bucket props to create new bucket
   */
  bucket:
    | string
    | {
        /**
         * CORS configuration for browser uploads
         * @default Configured for POST/PUT from any origin
         */
        cors?: {
          allowOrigins?: string[];
          allowMethods?: string[];
          allowHeaders?: string[];
          maxAge?: string;
        };

        /**
         * Override any sst.aws.Bucket props
         */
        sst?: Partial<sst.aws.BucketArgs>;
      };

  /**
   * Key prefix strategy configuration
   */
  keyPrefix?: {
    /**
     * Static prefix for all uploads (e.g., "uploads/")
     * @default "uploads/"
     */
    static?: string;

    /**
     * Whether to include timestamp in prefix
     * @default true
     */
    includeTimestamp?: boolean;

    /**
     * Whether to include UUID in prefix
     * @default true
     */
    includeUuid?: boolean;
  };

  /**
   * Allowed MIME types for uploads
   * @default ["*"] (all types allowed)
   */
  allowedMimeTypes?: string[];

  /**
   * Maximum file size in bytes
   * @default 104857600 (100MB)
   */
  maxFileSizeBytes?: number;

  /**
   * Signed URL expiration time in seconds
   * @default 300 (5 minutes)
   */
  urlExpirySeconds?: number;

  /**
   * Lambda function configuration
   */
  function?: {
    /**
     * Memory allocation for Lambda
     * @default "512 MB"
     */
    memory?: string;

    /**
     * Timeout for Lambda
     * @default "10 seconds"
     */
    timeout?: string;

    /**
     * Enable Lambda function URL for direct invocation
     * @default false
     */
    url?: boolean;

    /**
     * CORS configuration for Lambda function URL
     */
    urlCors?: {
      allowOrigins?: string[];
      allowMethods?: string[];
      allowHeaders?: string[];
    };

    /**
     * Additional environment variables
     */
    environment?: Record<string, string>;

    /**
     * Override any sst.aws.Function props
     */
    sst?: Partial<sst.aws.FunctionArgs>;
  };

  /**
   * Authentication configuration (for future implementation)
   * @experimental Not implemented yet
   */
  authentication?: {
    type: "cognito" | "api-key" | "iam";
    config: Record<string, any>;
  };
}

export interface S3UploadUrlGeneratorReturn {
  /**
   * The Lambda function that generates presigned URLs
   */
  function: sst.aws.Function;

  /**
   * The S3 bucket for uploads
   */
  bucket: sst.aws.Bucket;

  /**
   * The Lambda function URL (if enabled)
   */
  url?: string;
}

export function S3UploadUrlGenerator(
  name: string,
  props: S3UploadUrlGeneratorProps,
): S3UploadUrlGeneratorReturn {
  // Create or reference bucket
  let bucket: sst.aws.Bucket;

  if (typeof props.bucket === "string") {
    // Reference existing bucket
    bucket = sst.aws.Bucket.get(`${name}Bucket`, props.bucket);
  } else {
    // Create new bucket with CORS configuration
    const defaultCors = {
      allowOrigins: ["*"],
      allowMethods: ["POST", "PUT", "GET"],
      allowHeaders: ["*"],
      maxAge: "1 day",
    };

    bucket = new sst.aws.Bucket(`${name}Bucket`, {
      cors: props.bucket.cors ?? defaultCors,
      enforceHttps: true,
      ...props.bucket.sst,
    });
  }

  // Prepare environment variables for Lambda
  const urlExpirySeconds = props.urlExpirySeconds ?? 300; // Default 5 minutes
  const maxFileSizeBytes = props.maxFileSizeBytes ?? 104857600; // 100MB
  const allowedMimeTypes = props.allowedMimeTypes ?? ["*"];

  const keyPrefix = props.keyPrefix ?? {};

  const environment = {
    BUCKET_NAME: bucket.name,
    ALLOWED_MIME_TYPES: JSON.stringify(allowedMimeTypes),
    MAX_FILE_SIZE_BYTES: maxFileSizeBytes.toString(),
    URL_EXPIRY_SECONDS: urlExpirySeconds.toString(),
    KEY_PREFIX_STATIC: keyPrefix.static ?? "uploads/",
    KEY_PREFIX_INCLUDE_TIMESTAMP: (
      keyPrefix.includeTimestamp ?? true
    ).toString(),
    KEY_PREFIX_INCLUDE_UUID: (keyPrefix.includeUuid ?? true).toString(),
    ...props.function?.environment,
  };

  // Configure Lambda function URL CORS if enabled
  const functionUrl = props.function?.url
    ? {
        cors: props.function.urlCors ?? {
          allowOrigins: ["*"],
          allowMethods: ["POST", "OPTIONS"],
          allowHeaders: ["content-type"],
        },
      }
    : false;

  // Create Lambda function
  const fn = new sst.aws.Function(`${name}Function`, {
    handler: "src/sst/aws/s3-upload-url-generator/handler.handler",
    runtime: "nodejs20.x",
    memory: props.function?.memory ?? "512 MB",
    timeout: props.function?.timeout ?? "10 seconds",
    url: functionUrl,
    environment,
    link: [bucket], // Link bucket for automatic IAM permissions
    ...props.function?.sst,
  });

  return {
    function: fn,
    bucket,
    url: props.function?.url ? fn.url : undefined,
  };
}
