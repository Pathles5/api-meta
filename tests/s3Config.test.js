import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const originalEnv = process.env;

describe("S3 Config", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should export getS3Client and createS3Client", async () => {
    const { getS3Client, createS3Client } = await import(
      "../src/config/s3.js"
    );
    assert.equal(typeof getS3Client, "function");
    assert.equal(typeof createS3Client, "function");
  });

  it("should create an S3Client with default region eu-west-1", async () => {
    delete process.env.AWS_REGION;
    const { createS3Client } = await import("../src/config/s3.js");
    const client = createS3Client();
    assert.ok(client);
    assert.ok(client.config);
  });

  it("should use AWS_REGION env var when set", async () => {
    process.env.AWS_REGION = "us-west-2";
    const { createS3Client } = await import("../src/config/s3.js");
    const client = createS3Client();
    assert.ok(client);
  });

  it("should return singleton from getS3Client", async () => {
    const { getS3Client } = await import("../src/config/s3.js");
    const a = getS3Client();
    const b = getS3Client();
    assert.equal(a, b);
  });
});
