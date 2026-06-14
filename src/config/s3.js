import { S3Client } from "@aws-sdk/client-s3";

/**
 * Creates a new S3Client instance.
 * Uses AWS_REGION env var (defaults to eu-west-1 per architecture.md).
 * @returns {S3Client}
 */
function createS3Client() {
  const region = process.env.AWS_REGION || "eu-west-1";

  return new S3Client({ region });
}

/** @type {S3Client | undefined} */
let client;

/**
 * Returns a singleton S3Client instance.
 * @returns {S3Client}
 */
function getS3Client() {
  if (!client) {
    client = createS3Client();
  }
  return client;
}

export { getS3Client, createS3Client };
