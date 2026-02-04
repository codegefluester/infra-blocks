// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/sst/aws/s3-upload-url-generator/handler.ts", // Lambda handler
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "sst", // Don't bundle SST
    "@aws-sdk/client-s3", // AWS SDK provided by Lambda runtime
    "@aws-sdk/s3-request-presigner",
    "aws-lambda", // AWS Lambda types
  ],
});
