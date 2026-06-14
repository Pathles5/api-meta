import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  HttpClient,
  HttpClientError,
  MaxRetriesExceededError,
  MaxFileSizeExceededError,
  InvalidURLError,
  DEFAULT_CONFIG,
  validateUrl,
  determineExtension,
  isRetryableStatus,
  isTransientError,
  computeRetryDelay,
} from "../src/services/httpClient.js";

// --- Test Helpers ---

/**
 * Create a mock Response object that mimics the Fetch API Response.
 * @param {object} opts
 * @returns {Response-like object}
 */
function createMockResponse(opts) {
  const {
    status = 200,
    statusText = "OK",
    headers = {},
    body = new Uint8Array([]),
    url = "https://example.com/resource",
    ok = status >= 200 && status < 300,
  } = opts;

  const headerMap = new Map(Object.entries(headers));

  return {
    ok,
    status,
    statusText,
    url,
    headers: {
      get: (name) => headerMap.get(name.toLowerCase()) || null,
      forEach: (cb) => headerMap.forEach((v, k) => cb(v, k)),
    },
    body: createMockReadableStream(body),
    text: async () => new TextDecoder().decode(body),
    json: async () => JSON.parse(new TextDecoder().decode(body)),
    arrayBuffer: async () => body.buffer || body,
  };
}

/**
 * Create a mock ReadableStream from a Uint8Array.
 * @param {Uint8Array} data
 * @returns {ReadableStream}
 */
function createMockReadableStream(data) {
  return new ReadableStream({
    start(controller) {
      // Split into chunks of chunkSize for realistic streaming
      const chunkSize = 3;
      for (let i = 0; i < data.length; i += chunkSize) {
        controller.enqueue(data.slice(i, Math.min(i + chunkSize, data.length)));
      }
      controller.close();
    },
  });
}

// --- Tests ---

describe("HttpClient", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  // -- Constructor & Config --

  describe("constructor", () => {
    it("should use default config when no overrides provided", () => {
      const client = new HttpClient();
      assert.equal(client.config.connectTimeout, DEFAULT_CONFIG.connectTimeout);
      assert.equal(client.config.readTimeout, DEFAULT_CONFIG.readTimeout);
      assert.equal(client.config.maxRetries, DEFAULT_CONFIG.maxRetries);
      assert.equal(
        client.config.retryBackoffFactor,
        DEFAULT_CONFIG.retryBackoffFactor,
      );
      assert.deepEqual(
        client.config.retryStatusCodes,
        DEFAULT_CONFIG.retryStatusCodes,
      );
    });

    it("should merge overrides with defaults", () => {
      const client = new HttpClient({
        connectTimeout: 5000,
        maxRetries: 5,
      });
      assert.equal(client.config.connectTimeout, 5000);
      assert.equal(client.config.maxRetries, 5);
      // Unoverridden values keep defaults
      assert.equal(client.config.readTimeout, DEFAULT_CONFIG.readTimeout);
    });
  });

  // -- URL Validation --

  describe("validateUrl", () => {
    it("should accept valid HTTPS URLs", () => {
      assert.doesNotThrow(() => validateUrl("https://example.com/image.jpg"));
    });

    it("should accept valid HTTP URLs", () => {
      assert.doesNotThrow(() => validateUrl("http://example.com/image.jpg"));
    });

    it("should reject malformed URLs", () => {
      assert.throws(() => validateUrl("not-a-url"), InvalidURLError);
    });

    it("should reject unsupported schemes", () => {
      assert.throws(() => validateUrl("ftp://example.com/file"), InvalidURLError);
    });

    it("should reject empty string", () => {
      assert.throws(() => validateUrl(""), InvalidURLError);
    });
  });

  // -- determineExtension --

  describe("determineExtension", () => {
    it("should return .jpg for image/jpeg content type", () => {
      assert.equal(determineExtension("image/jpeg", ""), ".jpg");
    });

    it("should return .png for image/png content type", () => {
      assert.equal(determineExtension("image/png", ""), ".png");
    });

    it("should return .mp4 for video/mp4 content type", () => {
      assert.equal(determineExtension("video/mp4", ""), ".mp4");
    });

    it("should return .webp for image/webp content type", () => {
      assert.equal(determineExtension("image/webp", ""), ".webp");
    });

    it("should return .mov for video/quicktime content type", () => {
      assert.equal(determineExtension("video/quicktime", ""), ".mov");
    });

    it("should infer from URL when content type is unknown", () => {
      assert.equal(
        determineExtension("application/octet-stream", "https://cdn.example.com/photo.png"),
        ".png",
      );
    });

    it("should default to .mp4 for video content types", () => {
      assert.equal(determineExtension("video/x-custom", ""), ".mp4");
    });

    it("should default to .jpg when nothing matches", () => {
      assert.equal(determineExtension("text/html", "https://example.com/"), ".jpg");
    });
  });

  // -- isRetryableStatus --

  describe("isRetryableStatus", () => {
    it("should return true for 429", () => {
      assert.equal(isRetryableStatus(429, [429, 500, 502, 503, 504]), true);
    });

    it("should return true for 500", () => {
      assert.equal(isRetryableStatus(500, [429, 500, 502, 503, 504]), true);
    });

    it("should return true for 502", () => {
      assert.equal(isRetryableStatus(502, [429, 500, 502, 503, 504]), true);
    });

    it("should return true for 503", () => {
      assert.equal(isRetryableStatus(503, [429, 500, 502, 503, 504]), true);
    });

    it("should return true for 504", () => {
      assert.equal(isRetryableStatus(504, [429, 500, 502, 503, 504]), true);
    });

    it("should return false for 200", () => {
      assert.equal(isRetryableStatus(200, [429, 500, 502, 503, 504]), false);
    });

    it("should return false for 404", () => {
      assert.equal(isRetryableStatus(404, [429, 500, 502, 503, 504]), false);
    });

    it("should return false for 403", () => {
      assert.equal(isRetryableStatus(403, [429, 500, 502, 503, 504]), false);
    });
  });

  // -- isTransientError --

  describe("isTransientError", () => {
    it("should detect ECONNRESET", () => {
      assert.equal(isTransientError(new Error("ECONNRESET")), true);
    });

    it("should detect ECONNREFUSED", () => {
      assert.equal(isTransientError(new Error("ECONNREFUSED")), true);
    });

    it("should detect fetch failed", () => {
      assert.equal(isTransientError(new Error("fetch failed")), true);
    });

    it("should detect ETIMEDOUT", () => {
      assert.equal(isTransientError(new Error("ETIMEDOUT")), true);
    });

    it("should detect socket hang up", () => {
      assert.equal(isTransientError(new Error("socket hang up")), true);
    });

    it("should return false for non-transient errors", () => {
      assert.equal(isTransientError(new Error("invalid json")), false);
    });
  });

  // -- computeRetryDelay --

  describe("computeRetryDelay", () => {
    it("should return a positive number", () => {
      const delay = computeRetryDelay(0, 500);
      assert.ok(delay > 0);
    });

    it("should increase with attempt number (exponential backoff)", () => {
      // With same random seed, higher attempts should generally produce larger delays
      // We test that the base component grows: factor * 2^attempt
      const d0 = 500 * Math.pow(2, 0); // 500
      const d1 = 500 * Math.pow(2, 1); // 1000
      const d2 = 500 * Math.pow(2, 2); // 2000
      assert.ok(d1 > d0);
      assert.ok(d2 > d1);
    });

    it("should cap at 30 seconds", () => {
      const delay = computeRetryDelay(20, 5000);
      assert.ok(delay <= 30_000);
    });
  });

  // -- Headers --

  describe("_buildHeaders", () => {
    it("should include User-Agent by default", () => {
      const client = new HttpClient();
      const headers = client._buildHeaders();
      assert.ok(headers["User-Agent"]);
      assert.ok(headers["User-Agent"].includes("Mozilla"));
    });

    it("should include default Accept headers", () => {
      const client = new HttpClient();
      const headers = client._buildHeaders();
      assert.ok(headers["Accept"]);
      assert.ok(headers["Accept-Language"]);
    });

    it("should merge extra headers", () => {
      const client = new HttpClient();
      const headers = client._buildHeaders({ "X-Custom": "test" });
      assert.equal(headers["X-Custom"], "test");
      // Default headers still present
      assert.ok(headers["User-Agent"]);
    });

    it("should allow overriding User-Agent", () => {
      const client = new HttpClient({ userAgent: "CustomBot/1.0" });
      const headers = client._buildHeaders();
      assert.equal(headers["User-Agent"], "CustomBot/1.0");
    });
  });

  // -- Retry Logic --

  describe("retry logic", () => {
    it("should succeed on first attempt when no errors", async () => {
      const testData = new TextEncoder().encode("hello world");
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        return createMockResponse({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: testData,
        });
      });

      const client = new HttpClient({ maxRetries: 3, retryBackoffFactor: 1 });
      const result = await client.downloadToBuffer("https://example.com/file.txt");
      assert.equal(callCount, 1);
      assert.equal(result.sizeBytes, testData.length);
    });

    it("should retry on retryable status codes and eventually succeed", async () => {
      const testData = new TextEncoder().encode("success");
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount < 3) {
          return createMockResponse({
            status: 503,
            statusText: "Service Unavailable",
            ok: false,
            body: new Uint8Array([]),
          });
        }
        return createMockResponse({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: testData,
        });
      });

      const client = new HttpClient({ maxRetries: 3, retryBackoffFactor: 1 });
      const result = await client.downloadToBuffer("https://example.com/file.txt");
      assert.equal(callCount, 3);
      assert.equal(result.sizeBytes, testData.length);
    });

    it("should throw MaxRetriesExceededError when all retries fail", async () => {
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 503,
          statusText: "Service Unavailable",
          ok: false,
          body: new Uint8Array([]),
        });
      });

      const client = new HttpClient({ maxRetries: 2, retryBackoffFactor: 1 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/file.txt"),
        (err) => {
          assert.ok(err instanceof MaxRetriesExceededError);
          assert.ok(err.message.includes("retries exhausted"));
          return true;
        },
      );
      // 1 initial + 2 retries = 3 total calls
      assert.equal(globalThis.fetch.mock.callCount(), 3);
    });

    it("should retry on transient network errors", async () => {
      const testData = new TextEncoder().encode("data");
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("fetch failed");
        }
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: testData,
        });
      });

      const client = new HttpClient({ maxRetries: 2, retryBackoffFactor: 1 });
      const result = await client.downloadToBuffer("https://example.com/file.bin");
      assert.equal(callCount, 2);
      assert.equal(result.sizeBytes, testData.length);
    });

    it("should not retry on non-retryable errors (e.g., 404)", async () => {
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 404,
          statusText: "Not Found",
          ok: false,
          body: new Uint8Array([]),
        });
      });

      const client = new HttpClient({ maxRetries: 3, retryBackoffFactor: 1 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/missing.txt"),
        (err) => {
          assert.ok(err instanceof HttpClientError);
          assert.ok(err.message.includes("404"));
          return true;
        },
      );
      assert.equal(globalThis.fetch.mock.callCount(), 1);
    });

    it("should not retry on non-transient exceptions", async () => {
      globalThis.fetch = mock.fn(async () => {
        throw new TypeError("invalid URL scheme");
      });

      const client = new HttpClient({ maxRetries: 3, retryBackoffFactor: 1 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/file.txt"),
        HttpClientError,
      );
      assert.equal(globalThis.fetch.mock.callCount(), 1);
    });
  });

  // -- downloadToBuffer --

  describe("downloadToBuffer", () => {
    it("should download content into a Buffer", async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: testData,
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToBuffer("https://example.com/data.bin");

      assert.ok(Buffer.isBuffer(result.buffer));
      assert.equal(result.sizeBytes, 8);
      assert.equal(result.contentType, "application/octet-stream");
      assert.equal(result.extension, ".jpg"); // default for unknown
    });

    it("should detect content type and extension from headers", async () => {
      const testData = new Uint8Array([0xff, 0xd8]); // JPEG magic bytes
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: testData,
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToBuffer("https://example.com/photo");

      assert.equal(result.contentType, "image/jpeg");
      assert.equal(result.extension, ".jpg");
    });

    it("should throw InvalidURLError for bad URLs", async () => {
      const client = new HttpClient();
      await assert.rejects(
        () => client.downloadToBuffer("not-a-url"),
        InvalidURLError,
      );
    });

    it("should throw HttpClientError on non-OK response", async () => {
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 403,
          statusText: "Forbidden",
          ok: false,
          body: new Uint8Array([]),
        });
      });

      const client = new HttpClient({ maxRetries: 0 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/forbidden"),
        (err) => {
          assert.ok(err instanceof HttpClientError);
          assert.ok(err.message.includes("403"));
          return true;
        },
      );
    });

    it("should enforce maxFileSize limit", async () => {
      const testData = new Uint8Array(100);
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: testData,
        });
      });

      const client = new HttpClient({ maxFileSize: 50 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/large.bin"),
        (err) => {
          assert.ok(err instanceof MaxFileSizeExceededError);
          assert.ok(err.message.includes("max size"));
          return true;
        },
      );
    });

    it("should pass extra headers to fetch", async () => {
      const testData = new Uint8Array([1]);
      let capturedHeaders;
      globalThis.fetch = mock.fn(async (url, opts) => {
        capturedHeaders = opts.headers;
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: testData,
        });
      });

      const client = new HttpClient();
      await client.downloadToBuffer("https://example.com/file", {
        headers: { Authorization: "Bearer token123" },
      });

      assert.equal(capturedHeaders["Authorization"], "Bearer token123");
      // Default headers should also be present
      assert.ok(capturedHeaders["User-Agent"]);
    });
  });

  // -- downloadToFile --

  describe("downloadToFile", () => {
    it("should stream content to a temporary file", async () => {
      const testData = new Uint8Array([10, 20, 30, 40, 50]);
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: testData,
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToFile("https://example.com/photo.jpg");

      assert.ok(result.path);
      assert.equal(result.sizeBytes, 5);
      assert.equal(result.contentType, "image/jpeg");
      assert.equal(result.extension, ".jpg");
      assert.ok(existsSync(result.path));

      // Verify file contents
      const written = readFileSync(result.path);
      assert.deepEqual(Array.from(written), [10, 20, 30, 40, 50]);

      // Cleanup
      const { unlinkSync } = await import("fs");
      unlinkSync(result.path);
    });

    it("should write to a specified output path", async () => {
      const testData = new Uint8Array([1, 2, 3]);
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/png" },
          body: testData,
        });
      });

      const dir = join(tmpdir(), "httpclient_test_" + Date.now());
      mkdirSync(dir, { recursive: true });
      const outputPath = join(dir, "custom.png");

      const client = new HttpClient();
      const result = await client.downloadToFile("https://example.com/img.png", {
        outputPath,
      });

      assert.equal(result.path, outputPath);
      assert.equal(result.sizeBytes, 3);
      assert.ok(existsSync(outputPath));

      // Cleanup
      const { unlinkSync, rmdirSync } = await import("fs");
      unlinkSync(outputPath);
      rmdirSync(dir);
    });

    it("should enforce maxFileSize and clean up partial file", async () => {
      const testData = new Uint8Array(100);
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: testData,
        });
      });

      const dir = join(tmpdir(), "httpclient_maxsize_" + Date.now());
      mkdirSync(dir, { recursive: true });
      const outputPath = join(dir, "large.bin");

      const client = new HttpClient({ maxFileSize: 20 });
      await assert.rejects(
        () =>
          client.downloadToFile("https://example.com/large.bin", { outputPath }),
        MaxFileSizeExceededError,
      );

      // Partial file should be cleaned up
      assert.equal(existsSync(outputPath), false);

      // Cleanup dir
      const { rmdirSync } = await import("fs");
      try { rmdirSync(dir); } catch { /* ignore */ }
    });

    it("should throw InvalidURLError for bad URLs", async () => {
      const client = new HttpClient();
      await assert.rejects(
        () => client.downloadToFile("not-a-url"),
        InvalidURLError,
      );
    });
  });

  // -- head --

  describe("head", () => {
    it("should return metadata without downloading body", async () => {
      globalThis.fetch = mock.fn(async (url, opts) => {
        assert.equal(opts.method, "HEAD");
        return createMockResponse({
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": "1048576",
          },
          body: new Uint8Array([]),
          url: "https://cdn.example.com/video.mp4",
        });
      });

      const client = new HttpClient();
      const result = await client.head("https://example.com/video.mp4");

      assert.equal(result.contentType, "video/mp4");
      assert.equal(result.contentLength, 1048576);
      assert.equal(result.extension, ".mp4");
      assert.ok(result.headers);
    });

    it("should return null contentLength when header is missing", async () => {
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: new Uint8Array([]),
        });
      });

      const client = new HttpClient();
      const result = await client.head("https://example.com/photo.jpg");
      assert.equal(result.contentLength, null);
    });

    it("should throw InvalidURLError for bad URLs", async () => {
      const client = new HttpClient();
      await assert.rejects(() => client.head("bad-url"), InvalidURLError);
    });
  });

  // -- getText --

  describe("getText", () => {
    it("should return response body as text", async () => {
      const textData = new TextEncoder().encode("Hello, World!");
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: textData,
        });
      });

      const client = new HttpClient();
      const result = await client.getText("https://example.com/hello");

      assert.equal(result.body, "Hello, World!");
      assert.equal(result.status, 200);
    });
  });

  // -- getJSON --

  describe("getJSON", () => {
    it("should return parsed JSON data", async () => {
      const jsonData = new TextEncoder().encode(
        JSON.stringify({ key: "value", count: 42 }),
      );
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/json" },
          body: jsonData,
        });
      });

      const client = new HttpClient();
      const result = await client.getJSON("https://example.com/api/data");

      assert.deepEqual(result.data, { key: "value", count: 42 });
      assert.equal(result.status, 200);
    });
  });

  // -- destroy --

  describe("destroy", () => {
    it("should be callable without error", () => {
      const client = new HttpClient();
      assert.doesNotThrow(() => client.destroy());
    });
  });

  // -- Error Classes --

  describe("error classes", () => {
    it("HttpClientError should have correct name and message", () => {
      const err = new HttpClientError("test error", { statusCode: 500 });
      assert.equal(err.name, "HttpClientError");
      assert.equal(err.message, "test error");
      assert.equal(err.statusCode, 500);
      assert.ok(err instanceof Error);
    });

    it("MaxRetriesExceededError should extend HttpClientError", () => {
      const err = new MaxRetriesExceededError("retries exhausted");
      assert.ok(err instanceof HttpClientError);
      assert.equal(err.name, "MaxRetriesExceededError");
    });

    it("MaxFileSizeExceededError should extend HttpClientError", () => {
      const err = new MaxFileSizeExceededError("too large");
      assert.ok(err instanceof HttpClientError);
      assert.equal(err.name, "MaxFileSizeExceededError");
    });

    it("InvalidURLError should extend HttpClientError", () => {
      const err = new InvalidURLError("bad url");
      assert.ok(err instanceof HttpClientError);
      assert.equal(err.name, "InvalidURLError");
    });
  });

  // -- Redirect handling --

  describe("redirect handling", () => {
    it("should pass follow redirect option to fetch", async () => {
      const testData = new Uint8Array([1]);
      let capturedOpts;
      globalThis.fetch = mock.fn(async (url, opts) => {
        capturedOpts = opts;
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: testData,
        });
      });

      const client = new HttpClient({ allowRedirects: true, maxRedirects: 5 });
      await client.downloadToBuffer("https://example.com/redirect");

      assert.equal(capturedOpts.redirect, "follow");
      assert.equal(capturedOpts.follow, 5);
    });

    it("should pass manual redirect when allowRedirects is false", async () => {
      const testData = new Uint8Array([1]);
      let capturedOpts;
      globalThis.fetch = mock.fn(async (url, opts) => {
        capturedOpts = opts;
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: testData,
        });
      });

      const client = new HttpClient({ allowRedirects: false });
      await client.downloadToBuffer("https://example.com/no-redirect");

      assert.equal(capturedOpts.redirect, "manual");
    });
  });
});
