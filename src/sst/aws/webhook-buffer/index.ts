declare namespace sst {
  namespace aws {
    interface FunctionArgs {
      handler?: string;
      url?: boolean;
      environment?: Record<string, string>;
      link?: any[];
      nodejs?: {
        esbuild?: {
          external?: string[];
        };
      };
      [key: string]: any;
    }

    interface BucketArgs {
      transform?: {
        bucket?: {
          lifecycleRules?: Array<{
            enabled: boolean;
            transitions: Array<{
              days: number;
              storageClass: string;
            }>;
          }>;
        };
      };
      [key: string]: any;
    }

    class Function {
      url: any;
      name: any;
      constructor(name: string, args: FunctionArgs);
    }

    class Bucket {
      name: any;
      constructor(name: string, args?: BucketArgs);
    }

    interface Secret {}
  }
}

export interface WebhookBufferProps {
  /**
   * Transition objects to Glacier Instant Retrieval after N days.
   * Useful for webhooks that are never retrieved, keeping storage costs near zero.
   * @default undefined — store forever in standard tier
   */
  glacierAfterDays?: number;

  /**
   * Override any sst.aws.Function props on the Lambda.
   */
  fn?: Partial<sst.aws.FunctionArgs>;

  /**
   * Override any sst.aws.Bucket props.
   */
  bucket?: Partial<sst.aws.BucketArgs>;
}

export interface WebhookBufferResult {
  /**
   * Lambda function handling the webhook buffer API. Useful for adding permissions or other customizations.
   */
  lambda: sst.aws.Function;

  /**
   * S3 bucket. Useful for debugging or manual inspection.
   */
  bucket: sst.aws.Bucket;
}

export function WebhookBuffer(
  name: string,
  props: WebhookBufferProps,
): WebhookBufferResult {
  const bucket = new sst.aws.Bucket(`${name}Bucket`, {
    ...(props.glacierAfterDays !== undefined && {
      transform: {
        bucket: {
          lifecycleRules: [
            {
              enabled: true,
              transitions: [
                {
                  days: props.glacierAfterDays,
                  storageClass: "GLACIER_IR",
                },
              ],
            },
          ],
        },
      },
    }),
    ...props.bucket,
  });

  const environment = {
    WEBHOOK_BUFFER_BUCKET: bucket.name,
  };

  const functionDefaults: sst.aws.FunctionArgs = {
    handler:
      "node_modules/@codegefluester/infra-blocks/src/sst/aws/webhook-buffer/handler.handler",
    environment,
    link: [bucket],
    nodejs: {
      esbuild: {
        external: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
      },
    },
    ...props.fn,
  };

  const fn = new sst.aws.Function(`${name}Function`, {
    ...functionDefaults,
    url: true,
  });

  return {
    lambda: fn,
    bucket,
  };
}
