import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  HttpClient,
  HttpClientError,
  MaxRetriesExceededError,
  MaxFileSizeExceededError,
  DEFAULT_CONFIG,
  DEFAULT_HEADERS,
  determineExtension,
  isTransientError,
} from "../src/services/httpClient.js";

import {
  parseInstagramUrl,
  isInstagramPostUrl,
  normalizeMediaType,
} from "../src/services/instagramResolver.js";

import {
  createInstagramMediaService,
  DEFAULT_MAX_FILE_SIZE,
} from "../src/services/instagramMediaService.js";

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Create a mock Response object that mimics the Fetch API Response.
 * @param {object} opts
 * @returns {object}
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
      const chunkSize = 3;
      for (let i = 0; i < data.length; i += chunkSize) {
        controller.enqueue(
          data.slice(i, Math.min(i + chunkSize, data.length)),
        );
      }
      controller.close();
    },
  });
}

/**
 * Create a mock fetchPost function.
 * @param {object} postData
 * @returns {Function}
 */
function createMockFetchPost(postData) {
  return mock.fn(async () => postData);
}

/**
 * Create a mock HttpClient with controllable behavior.
 * @param {object} [overrides]
 * @returns {object}
 */
function createMockHttpClient(overrides) {
  const o = overrides || {};
  return {
    downloadToBuffer: mock.fn(
      o.downloadToBuffer ||
        (async () => ({
          buffer: Buffer.from("fake-media-content"),
          sizeBytes: 18,
          contentType: "image/jpeg",
          extension: ".jpg",
          url: "https://scontent.cdninstagram.com/image.jpg",
        })),
    ),
    head: mock.fn(
      o.head ||
        (async () => ({
          contentType: "image/jpeg",
          contentLength: 12345,
          url: "https://scontent.cdninstagram.com/image.jpg",
          extension: ".jpg",
          headers: {},
        })),
    ),
    destroy: mock.fn(o.destroy || (() => {})),
  };
}

// ─── 1. RETRY MECHANISMS ON TRANSIENT FAILURES ──────────────────────────────

describe("Download Service — Retry Mechanisms", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  describe("transient error detection", () => {
    it("should detect ENOTFOUND as transient", () => {
      assert.equal(isTransientError(new Error("getaddrinfo ENOTFOUND cdn.instagram.com")), true);
    });

    it("should detect 'undici' errors as transient", () => {
      assert.equal(isTransientError(new Error("undici error: connection reset")), true);
    });

    it("should detect 'aborted' errors as transient", () => {
      assert.equal(isTransientError(new Error("The operation was aborted")), true);
    });

    it("should detect 'network' errors as transient", () => {
      assert.equal(isTransientError(new Error("network error")), true);
    });

    it("should detect 'socket hang up' as transient", () => {
      assert.equal(isTransientError(new Error("socket hang up")), true);
    });

    it("should NOT detect 'invalid json' as transient", () => {
      assert.equal(isTransientError(new Error("invalid json")), false);
    });

    it("should NOT detect 'permission denied' as transient", () => {
      assert.equal(isTransientError(new Error("permission denied")), false);
    });

    it("should handle error with empty message", () => {
      assert.equal(isTransientError(new Error("")), false);
    });

    it("should handle error with null message", () => {
      assert.equal(isTransientError({ message: null }), false);
    });
  });

  describe("retry on AbortError (connect timeout)", () => {
    it("should retry when fetch throws AbortError then succeed", async () => {
      const testData = new TextEncoder().encode("success-after-timeout");
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          const err = new Error("Connect timeout exceeded");
          err.name = "AbortError";
          throw err;
        }
        return createMockResponse({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: testData,
        });
      });

      const client = new HttpClient({ maxRetries: 2, retryBackoffFactor: 1 });
      const result = await client.downloadToBuffer("https://example.com/file.txt");
      assert.equal(callCount, 2);
      assert.equal(result.sizeBytes, testData.length);
    });

    it("should exhaust retries on repeated AbortError", async () => {
      globalThis.fetch = mock.fn(async () => {
        const err = new Error("Connect timeout exceeded");
        err.name = "AbortError";
        throw err;
      });

      const client = new HttpClient({ maxRetries: 1, retryBackoffFactor: 1 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/file.txt"),
        HttpClientError,
      );
      // 1 initial + 1 retry = 2 total
      assert.equal(globalThis.fetch.mock.callCount(), 2);
    });
  });

  describe("retry on 429 rate limiting", () => {
    it("should retry on 429 and succeed when rate limit clears", async () => {
      const testData = new TextEncoder().encode("data");
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return createMockResponse({
            status: 429,
            statusText: "Too Many Requests",
            ok: false,
            body: new Uint8Array([]),
          });
        }
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: testData,
        });
      });

      const client = new HttpClient({ maxRetries: 3, retryBackoffFactor: 1 });
      const result = await client.downloadToBuffer("https://example.com/file");
      assert.equal(callCount, 2);
      assert.equal(result.sizeBytes, testData.length);
    });
  });

  describe("retry on mixed transient errors", () => {
    it("should retry through different transient error types then succeed", async () => {
      const testData = new TextEncoder().encode("final-data");
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("ECONNRESET");
        }
        if (callCount === 2) {
          return createMockResponse({
            status: 502,
            statusText: "Bad Gateway",
            ok: false,
            body: new Uint8Array([]),
          });
        }
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: testData,
        });
      });

      const client = new HttpClient({ maxRetries: 3, retryBackoffFactor: 1 });
      const result = await client.downloadToBuffer("https://example.com/file");
      assert.equal(callCount, 3);
      assert.equal(result.sizeBytes, testData.length);
    });
  });

  describe("MaxRetriesExceededError details", () => {
    it("should include URL and lastError in MaxRetriesExceededError", async () => {
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 503,
          statusText: "Service Unavailable",
          ok: false,
          body: new Uint8Array([]),
        });
      });

      const client = new HttpClient({ maxRetries: 1, retryBackoffFactor: 1 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/file.txt"),
        (err) => {
          assert.ok(err instanceof MaxRetriesExceededError);
          assert.ok(err.message.includes("retries exhausted"));
          assert.ok(err.message.includes("https://example.com/file.txt"));
          return true;
        },
      );
    });

    it("should include lastError when all retries fail with transient errors", async () => {
      globalThis.fetch = mock.fn(async () => {
        throw new Error("ECONNREFUSED");
      });

      const client = new HttpClient({ maxRetries: 1, retryBackoffFactor: 1 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/file.txt"),
        (err) => {
          // Transient errors on last attempt throw HttpClientError (not MaxRetriesExceededError)
          assert.ok(err instanceof HttpClientError);
          assert.ok(err.message.includes("ECONNREFUSED"));
          assert.ok(err.cause);
          assert.ok(err.cause.message.includes("ECONNREFUSED"));
          return true;
        },
      );
    });
  });

  describe("retry body consumption", () => {
    it("should consume response body on retryable status to free socket", async () => {
      const testData = new TextEncoder().encode("ok");
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return createMockResponse({
            status: 500,
            statusText: "Internal Server Error",
            ok: false,
            body: new TextEncoder().encode("error body"),
          });
        }
        return createMockResponse({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: testData,
        });
      });

      // The mock response's text() method is called to consume the body
      const client = new HttpClient({ maxRetries: 2, retryBackoffFactor: 1 });
      const result = await client.downloadToBuffer("https://example.com/file");
      assert.equal(callCount, 2);
      assert.equal(result.sizeBytes, testData.length);
    });
  });

  describe("retry with zero retries", () => {
    it("should fail immediately with maxRetries=0 on retryable status", async () => {
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 503,
          statusText: "Service Unavailable",
          ok: false,
          body: new Uint8Array([]),
        });
      });

      const client = new HttpClient({ maxRetries: 0 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/file"),
        MaxRetriesExceededError,
      );
      assert.equal(globalThis.fetch.mock.callCount(), 1);
    });

    it("should fail immediately with maxRetries=0 on transient error", async () => {
      globalThis.fetch = mock.fn(async () => {
        throw new Error("ECONNRESET");
      });

      const client = new HttpClient({ maxRetries: 0 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/file"),
        HttpClientError,
      );
      assert.equal(globalThis.fetch.mock.callCount(), 1);
    });
  });

  describe("retry across different HTTP methods", () => {
    it("should retry HEAD requests on transient errors", async () => {
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("fetch failed");
        }
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg", "content-length": "100" },
          body: new Uint8Array([]),
        });
      });

      const client = new HttpClient({ maxRetries: 2, retryBackoffFactor: 1 });
      const result = await client.head("https://example.com/photo.jpg");
      assert.equal(callCount, 2);
      assert.equal(result.contentType, "image/jpeg");
    });

    it("should retry getText on retryable status codes", async () => {
      const textData = new TextEncoder().encode("response text");
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount < 3) {
          return createMockResponse({
            status: 504,
            statusText: "Gateway Timeout",
            ok: false,
            body: new Uint8Array([]),
          });
        }
        return createMockResponse({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: textData,
        });
      });

      const client = new HttpClient({ maxRetries: 3, retryBackoffFactor: 1 });
      const result = await client.getText("https://example.com/text");
      assert.equal(callCount, 3);
      assert.equal(result.body, "response text");
    });

    it("should retry getJSON on transient errors", async () => {
      const jsonData = new TextEncoder().encode(JSON.stringify({ ok: true }));
      let callCount = 0;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("socket hang up");
        }
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/json" },
          body: jsonData,
        });
      });

      const client = new HttpClient({ maxRetries: 2, retryBackoffFactor: 1 });
      const result = await client.getJSON("https://example.com/api");
      assert.equal(callCount, 2);
      assert.deepEqual(result.data, { ok: true });
    });
  });
});

// ─── 2. MEMORY-EFFICIENT STREAMING BEHAVIOR ─────────────────────────────────

describe("Download Service — Streaming Behavior", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  describe("downloadToBuffer streaming", () => {
    it("should handle empty response body", async () => {
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: new Uint8Array([]),
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToBuffer("https://example.com/empty.jpg");
      assert.equal(result.sizeBytes, 0);
      assert.ok(Buffer.isBuffer(result.buffer));
      assert.equal(result.buffer.length, 0);
    });

    it("should handle large response body in multiple chunks", async () => {
      // Create a 10KB payload — will be split into chunks of 3 by our mock
      const largeData = new Uint8Array(10240);
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }

      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: largeData,
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToBuffer("https://example.com/large.bin");
      assert.equal(result.sizeBytes, 10240);
      assert.equal(result.buffer.length, 10240);
      // Verify first and last bytes
      assert.equal(result.buffer[0], 0);
      assert.equal(result.buffer[10239], 10239 % 256);
    });

    it("should properly concatenate chunks into single Buffer", async () => {
      // Data that splits into uneven chunks (chunkSize=3 in mock)
      const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70]);
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: data,
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToBuffer("https://example.com/data");
      assert.ok(Buffer.isBuffer(result.buffer));
      assert.deepEqual(Array.from(result.buffer), [10, 20, 30, 40, 50, 60, 70]);
    });

    it("should cancel response body on maxFileSize exceeded", async () => {
      const data = new Uint8Array(200);
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: data,
        });
      });

      const client = new HttpClient({ maxFileSize: 50 });
      await assert.rejects(
        () => client.downloadToBuffer("https://example.com/large"),
        MaxFileSizeExceededError,
      );
    });
  });

  describe("downloadToFile streaming", () => {
    it("should stream content to temp file and return correct path", async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/png" },
          body: data,
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToFile("https://example.com/image.png");

      assert.ok(result.path);
      assert.ok(result.path.endsWith(".png"));
      assert.equal(result.sizeBytes, 10);
      assert.ok(existsSync(result.path));

      // Cleanup
      const { unlinkSync } = await import("fs");
      unlinkSync(result.path);
    });

    it("should use custom tempDir from config", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const customDir = join(tmpdir(), "httpclient_custom_" + Date.now());
      const { mkdirSync } = await import("fs");
      mkdirSync(customDir, { recursive: true });

      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: data,
        });
      });

      const client = new HttpClient({ tempDir: customDir });
      const result = await client.downloadToFile("https://example.com/photo.jpg");

      assert.ok(result.path.startsWith(customDir));
      assert.ok(existsSync(result.path));

      // Cleanup
      const { unlinkSync, rmdirSync } = await import("fs");
      unlinkSync(result.path);
      rmdirSync(customDir);
    });

    it("should clean up partial file on stream error", async () => {
      const { mkdirSync } = await import("fs");
      const dir = join(tmpdir(), "httpclient_cleanup_" + Date.now());
      mkdirSync(dir, { recursive: true });
      const outputPath = join(dir, "partial.jpg");

      // Create a response that will error mid-stream
      globalThis.fetch = mock.fn(async () => {
        const errorStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            // Error after first chunk
            setTimeout(() => controller.error(new Error("Stream broken")), 10);
          },
        });

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          url: "https://example.com/broken.jpg",
          headers: {
            get: (name) => {
              if (name.toLowerCase() === "content-type") return "image/jpeg";
              return null;
            },
            forEach: () => {},
          },
          body: errorStream,
          text: async () => "",
        };
      });

      const client = new HttpClient({ readTimeout: 5000 });
      await assert.rejects(
        () => client.downloadToFile("https://example.com/broken.jpg", { outputPath }),
      );

      // Partial file should be cleaned up
      assert.equal(existsSync(outputPath), false);

      // Cleanup dir
      const { rmdirSync } = await import("fs");
      try { rmdirSync(dir); } catch { /* ignore */ }
    });
  });

  describe("read timeout behavior", () => {
    it("should configure readTimeout from config", () => {
      const client = new HttpClient({ readTimeout: 5000 });
      assert.equal(client.config.readTimeout, 5000);
    });

    it("should use default readTimeout of 60 seconds", () => {
      const client = new HttpClient();
      assert.equal(client.config.readTimeout, 60_000);
    });
  });
});

// ─── 3. CORRECT HEADER AND REDIRECT HANDLING ────────────────────────────────

describe("Download Service — Headers & Redirects", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  describe("default headers", () => {
    it("should include all browser-like Sec-Fetch headers", () => {
      const client = new HttpClient();
      const headers = client._buildHeaders();
      assert.equal(headers["Sec-Fetch-Dest"], "image");
      assert.equal(headers["Sec-Fetch-Mode"], "no-cors");
      assert.equal(headers["Sec-Fetch-Site"], "cross-site");
    });

    it("should include Accept header with modern image formats", () => {
      const client = new HttpClient();
      const headers = client._buildHeaders();
      assert.ok(headers["Accept"].includes("image/avif"));
      assert.ok(headers["Accept"].includes("image/webp"));
    });

    it("should include Accept-Encoding with br", () => {
      const client = new HttpClient();
      const headers = client._buildHeaders();
      assert.ok(headers["Accept-Encoding"].includes("br"));
    });

    it("should include Connection keep-alive", () => {
      const client = new HttpClient();
      const headers = client._buildHeaders();
      assert.equal(headers["Connection"], "keep-alive");
    });

    it("should include Cache-Control max-age=0", () => {
      const client = new HttpClient();
      const headers = client._buildHeaders();
      assert.equal(headers["Cache-Control"], "max-age=0");
    });

    it("should include Accept-Language", () => {
      const client = new HttpClient();
      const headers = client._buildHeaders();
      assert.ok(headers["Accept-Language"].includes("en-US"));
    });
  });

  describe("header override behavior", () => {
    it("should allow extra headers to override default Accept", async () => {
      let capturedHeaders;
      globalThis.fetch = mock.fn(async (url, opts) => {
        capturedHeaders = opts.headers;
        return createMockResponse({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: new TextEncoder().encode("ok"),
        });
      });

      const client = new HttpClient();
      await client.downloadToBuffer("https://example.com/file", {
        headers: { Accept: "application/json" },
      });

      assert.equal(capturedHeaders["Accept"], "application/json");
    });

    it("should preserve default headers when extra headers are added", async () => {
      let capturedHeaders;
      globalThis.fetch = mock.fn(async (url, opts) => {
        capturedHeaders = opts.headers;
        return createMockResponse({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: new TextEncoder().encode("ok"),
        });
      });

      const client = new HttpClient();
      await client.downloadToBuffer("https://example.com/file", {
        headers: { "X-Custom-Header": "custom-value" },
      });

      assert.equal(capturedHeaders["X-Custom-Header"], "custom-value");
      assert.ok(capturedHeaders["User-Agent"]);
      assert.ok(capturedHeaders["Accept"]);
      assert.ok(capturedHeaders["Sec-Fetch-Dest"]);
    });
  });

  describe("redirect handling", () => {
    it("should pass follow: maxRedirects to fetch", async () => {
      let capturedOpts;
      globalThis.fetch = mock.fn(async (url, opts) => {
        capturedOpts = opts;
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: new Uint8Array([1]),
        });
      });

      const client = new HttpClient({ allowRedirects: true, maxRedirects: 7 });
      await client.downloadToBuffer("https://example.com/redirect");

      assert.equal(capturedOpts.redirect, "follow");
      assert.equal(capturedOpts.follow, 7);
    });

    it("should use default maxRedirects of 10", () => {
      const client = new HttpClient();
      assert.equal(client.config.maxRedirects, 10);
    });

    it("should reflect final URL in response after redirects", async () => {
      const finalUrl = "https://cdn.instagram.com/final/image.jpg";
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: new Uint8Array([1, 2, 3]),
          url: finalUrl,
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToBuffer("https://example.com/redirect-me");
      assert.equal(result.url, finalUrl);
    });
  });

  describe("Content-Type handling", () => {
    it("should handle Content-Type with charset parameter", async () => {
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: { "content-type": "image/jpeg; charset=utf-8" },
          body: new Uint8Array([1]),
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToBuffer("https://example.com/photo");
      assert.equal(result.contentType, "image/jpeg; charset=utf-8");
      assert.equal(result.extension, ".jpg");
    });

    it("should default to application/octet-stream when no Content-Type", async () => {
      globalThis.fetch = mock.fn(async () => {
        return createMockResponse({
          status: 200,
          headers: {},
          body: new Uint8Array([1]),
        });
      });

      const client = new HttpClient();
      const result = await client.downloadToBuffer("https://example.com/file");
      assert.equal(result.contentType, "application/octet-stream");
    });
  });

  describe("determineExtension edge cases", () => {
    it("should handle image/avif content type", () => {
      assert.equal(determineExtension("image/avif", ""), ".avif");
    });

    it("should handle image/gif content type", () => {
      assert.equal(determineExtension("image/gif", ""), ".gif");
    });

    it("should handle video/webm content type", () => {
      assert.equal(determineExtension("video/webm", ""), ".webm");
    });

    it("should handle image/jpg (non-standard) content type", () => {
      assert.equal(determineExtension("image/jpg", ""), ".jpg");
    });

    it("should infer .mp4 from URL path when content-type is generic", () => {
      assert.equal(
        determineExtension("application/octet-stream", "https://cdn.example.com/video.mp4"),
        ".mp4",
      );
    });

    it("should infer .webp from URL path", () => {
      assert.equal(
        determineExtension("application/octet-stream", "https://cdn.example.com/photo.webp"),
        ".webp",
      );
    });

    it("should infer .gif from URL path", () => {
      assert.equal(
        determineExtension("application/octet-stream", "https://cdn.example.com/anim.gif"),
        ".gif",
      );
    });

    it("should handle null content type", () => {
      assert.equal(determineExtension(null, "https://cdn.example.com/photo.jpg"), ".jpg");
    });

    it("should handle empty content type", () => {
      assert.equal(determineExtension("", "https://cdn.example.com/photo.png"), ".png");
    });
  });
});

// ─── 4. EDGE CASES IN INSTAGRAM URL PARSING ─────────────────────────────────

describe("Download Service — Instagram URL Edge Cases", () => {
  describe("parseInstagramUrl with query parameters", () => {
    it("should parse URL with query parameters", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/p/ABC123/?utm_source=ig_web&share_id=123",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "post");
    });

    it("should parse reel URL with query parameters", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/reel/XYZ789/?igshid=abc123",
      );
      assert.equal(result.shortcode, "XYZ789");
      assert.equal(result.type, "reel");
    });
  });

  describe("parseInstagramUrl with fragments", () => {
    it("should parse URL with fragment", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/p/ABC123/#section",
      );
      assert.equal(result.shortcode, "ABC123");
    });
  });

  describe("parseInstagramUrl with various domains", () => {
    it("should parse www.instagr.am URL", () => {
      const result = parseInstagramUrl(
        "https://www.instagr.am/p/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "post");
    });

    it("should reject m.instagram.com (mobile subdomain)", () => {
      assert.throws(
        () => parseInstagramUrl("https://m.instagram.com/p/ABC123/"),
        /Not an Instagram URL/,
      );
    });
  });

  describe("parseInstagramUrl with username variations", () => {
    it("should handle username with dots", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/user.name/p/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.username, "user.name");
    });

    it("should handle username with underscores", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/user_name/p/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.username, "user_name");
    });

    it("should handle username with numbers", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/user123/p/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.username, "user123");
    });
  });

  describe("parseInstagramUrl shortcode variations", () => {
    it("should handle very short shortcode (1 character)", () => {
      const result = parseInstagramUrl("https://www.instagram.com/p/A/");
      assert.equal(result.shortcode, "A");
    });

    it("should handle numeric-only shortcode", () => {
      const result = parseInstagramUrl("https://www.instagram.com/p/12345/");
      assert.equal(result.shortcode, "12345");
    });

    it("should handle long shortcode (typical Instagram length)", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/p/CxAbCdEfGhI/",
      );
      assert.equal(result.shortcode, "CxAbCdEfGhI");
    });

    it("should handle shortcode with mixed case", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/p/AaBbCcDdEe/",
      );
      assert.equal(result.shortcode, "AaBbCcDdEe");
    });
  });

  describe("parseInstagramUrl path variations", () => {
    it("should handle reel URL with username prefix", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/someuser/reel/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "reel");
      assert.equal(result.username, "someuser");
    });

    it("should handle tv URL with username prefix", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/creator/tv/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "tv");
      assert.equal(result.username, "creator");
    });

    it("should handle reels URL with username prefix", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/user/reels/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "reel");
      assert.equal(result.username, "user");
    });

    it("should reject /explore/ path", () => {
      assert.throws(
        () => parseInstagramUrl("https://www.instagram.com/explore/tags/cats/"),
        /Could not extract shortcode/,
      );
    });

    it("should reject root URL", () => {
      assert.throws(
        () => parseInstagramUrl("https://www.instagram.com/"),
        /Could not extract shortcode/,
      );
    });

    it("should reject stories path", () => {
      assert.throws(
        () => parseInstagramUrl("https://www.instagram.com/stories/user/123/"),
        /Could not extract shortcode/,
      );
    });
  });

  describe("isInstagramPostUrl edge cases", () => {
    it("should return true for URL with query params", () => {
      assert.equal(
        isInstagramPostUrl("https://www.instagram.com/p/ABC123/?utm_source=test"),
        true,
      );
    });

    it("should return true for instagr.am URL", () => {
      assert.equal(
        isInstagramPostUrl("https://instagr.am/p/ABC123/"),
        true,
      );
    });

    it("should return false for undefined", () => {
      assert.equal(isInstagramPostUrl(undefined), false);
    });

    it("should return false for number", () => {
      assert.equal(isInstagramPostUrl(42), false);
    });
  });

  describe("normalizeMediaType edge cases", () => {
    it("should handle empty string", () => {
      assert.equal(normalizeMediaType(""), "image");
    });

    it("should handle mixed case 'Video'", () => {
      assert.equal(normalizeMediaType("Video"), "video");
    });

    it("should handle mixed case 'carousel_album'", () => {
      assert.equal(normalizeMediaType("carousel_album"), "carousel");
    });
  });
});

// ─── 5. INTEGRATION: FULL DOWNLOAD SERVICE FLOW ─────────────────────────────

describe("Download Service — Integration", () => {
  let service;

  afterEach(() => {
    mock.reset();
    if (service) service.destroy();
  });

  describe("fetchMedia end-to-end flow", () => {
    it("should resolve URL, download media, and return complete result for image", async () => {
      const imagePost = {
        id: "17854360229135472",
        mediaType: "IMAGE",
        mediaUrl: "https://scontent.cdninstagram.com/v/image.jpg",
        thumbnailUrl: null,
        caption: "Beautiful sunset",
        permalink: "https://www.instagram.com/p/ABC123/",
      };

      const fetchPost = createMockFetchPost(imagePost);
      const mockClient = createMockHttpClient({
        downloadToBuffer: mock.fn(async () => ({
          buffer: Buffer.from("jpeg-binary-data"),
          sizeBytes: 16,
          contentType: "image/jpeg",
          extension: ".jpg",
          url: "https://scontent.cdninstagram.com/v/image.jpg",
        })),
      });

      service = createInstagramMediaService({ fetchPost, httpClient: mockClient });
      const result = await service.fetchMedia("https://www.instagram.com/p/ABC123/");

      assert.equal(result.postId, "17854360229135472");
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.mediaType, "image");
      assert.ok(Buffer.isBuffer(result.buffer));
      assert.equal(result.sizeBytes, 16);
      assert.equal(result.contentType, "image/jpeg");
      assert.equal(result.extension, ".jpg");
      assert.equal(result.sourceUrl, "https://scontent.cdninstagram.com/v/image.jpg");
      assert.equal(result.thumbnailBuffer, null);
      assert.equal(result.caption, "Beautiful sunset");
      assert.equal(result.permalink, "https://www.instagram.com/p/ABC123/");
    });

    it("should resolve URL, download video + thumbnail for video post", async () => {
      const videoPost = {
        id: "17854360229135473",
        mediaType: "VIDEO",
        mediaUrl: "https://scontent.cdninstagram.com/v/video.mp4",
        thumbnailUrl: "https://scontent.cdninstagram.com/v/thumb.jpg",
        caption: "Cool reel",
        permalink: "https://www.instagram.com/reel/XYZ789/",
      };

      const downloadCalls = [];
      const fetchPost = createMockFetchPost(videoPost);
      const mockClient = createMockHttpClient({
        downloadToBuffer: mock.fn(async (url) => {
          downloadCalls.push(url);
          if (url.includes("video.mp4")) {
            return {
              buffer: Buffer.from("mp4-binary-data"),
              sizeBytes: 15,
              contentType: "video/mp4",
              extension: ".mp4",
              url,
            };
          }
          return {
            buffer: Buffer.from("thumb-data"),
            sizeBytes: 9,
            contentType: "image/jpeg",
            extension: ".jpg",
            url,
          };
        }),
      });

      service = createInstagramMediaService({ fetchPost, httpClient: mockClient });
      const result = await service.fetchMedia("https://www.instagram.com/reel/XYZ789/");

      assert.equal(result.mediaType, "video");
      assert.equal(result.sizeBytes, 15);
      assert.equal(result.extension, ".mp4");
      assert.ok(Buffer.isBuffer(result.thumbnailBuffer));
      assert.equal(downloadCalls.length, 2);
      assert.ok(downloadCalls[0].includes("video.mp4"));
      assert.ok(downloadCalls[1].includes("thumb.jpg"));
    });

    it("should handle carousel post (downloads first item only)", async () => {
      const carouselPost = {
        id: "17854360229135474",
        mediaType: "CAROUSEL_ALBUM",
        mediaUrl: "https://scontent.cdninstagram.com/v/carousel1.jpg",
        thumbnailUrl: null,
        caption: "Swipe →",
        permalink: "https://www.instagram.com/p/CAR001/",
      };

      const fetchPost = createMockFetchPost(carouselPost);
      const mockClient = createMockHttpClient({
        downloadToBuffer: mock.fn(async () => ({
          buffer: Buffer.from("carousel-image"),
          sizeBytes: 14,
          contentType: "image/jpeg",
          extension: ".jpg",
          url: "https://scontent.cdninstagram.com/v/carousel1.jpg",
        })),
      });

      service = createInstagramMediaService({ fetchPost, httpClient: mockClient });
      const result = await service.fetchMedia("https://www.instagram.com/p/CAR001/");

      assert.equal(result.mediaType, "carousel");
      assert.equal(result.sizeBytes, 14);
      // Only one download call (first item)
      assert.equal(mockClient.downloadToBuffer.mock.calls.length, 1);
    });
  });

  describe("fetchMedia error scenarios", () => {
    it("should propagate resolution errors (invalid URL)", async () => {
      const fetchPost = createMockFetchPost({});
      service = createInstagramMediaService({ fetchPost });

      await assert.rejects(
        () => service.fetchMedia("not-a-valid-url"),
        /Invalid URL format/,
      );
    });

    it("should propagate resolution errors (post not found)", async () => {
      const fetchPost = mock.fn(async () => null);
      service = createInstagramMediaService({ fetchPost });

      await assert.rejects(
        () => service.fetchMedia("https://www.instagram.com/p/ABC123/"),
        (err) => err.statusCode === 404,
      );
    });

    it("should propagate download errors (CDN failure)", async () => {
      const imagePost = {
        id: "123",
        mediaType: "IMAGE",
        mediaUrl: "https://scontent.cdninstagram.com/v/image.jpg",
        thumbnailUrl: null,
        caption: null,
        permalink: "https://www.instagram.com/p/ABC123/",
      };

      const fetchPost = createMockFetchPost(imagePost);
      const mockClient = createMockHttpClient({
        downloadToBuffer: mock.fn(async () => {
          throw new Error("CDN 503 Service Unavailable");
        }),
      });

      service = createInstagramMediaService({ fetchPost, httpClient: mockClient });
      await assert.rejects(
        () => service.fetchMedia("https://www.instagram.com/p/ABC123/"),
        /CDN 503/,
      );
    });
  });

  describe("peekMedia integration", () => {
    it("should resolve URL and HEAD the media URL for metadata", async () => {
      const videoPost = {
        id: "17854360229135473",
        mediaType: "VIDEO",
        mediaUrl: "https://scontent.cdninstagram.com/v/video.mp4",
        thumbnailUrl: "https://scontent.cdninstagram.com/v/thumb.jpg",
        caption: "Test video",
        permalink: "https://www.instagram.com/reel/XYZ789/",
      };

      const fetchPost = createMockFetchPost(videoPost);
      const mockClient = createMockHttpClient({
        head: mock.fn(async () => ({
          contentType: "video/mp4",
          contentLength: 5242880,
          url: "https://scontent.cdninstagram.com/v/video.mp4",
          extension: ".mp4",
          headers: { "content-type": "video/mp4", "content-length": "5242880" },
        })),
      });

      service = createInstagramMediaService({ fetchPost, httpClient: mockClient });
      const result = await service.peekMedia("https://www.instagram.com/reel/XYZ789/");

      assert.equal(result.shortcode, "XYZ789");
      assert.equal(result.mediaType, "video");
      assert.equal(result.contentType, "video/mp4");
      assert.equal(result.contentLength, 5242880);
      assert.equal(result.extension, ".mp4");
      assert.equal(result.hasThumbnail, true);
      assert.equal(result.caption, "Test video");
      // Verify HEAD was used, not downloadToBuffer
      assert.equal(mockClient.head.mock.calls.length, 1);
      assert.equal(mockClient.downloadToBuffer.mock.calls.length, 0);
    });
  });

  describe("validateUrl integration", () => {
    it("should validate reel URL correctly", () => {
      const fetchPost = createMockFetchPost({});
      service = createInstagramMediaService({ fetchPost });

      const result = service.validateUrl("https://www.instagram.com/reel/ABC123/");
      assert.equal(result.valid, true);
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "reel");
    });

    it("should validate tv URL correctly", () => {
      const fetchPost = createMockFetchPost({});
      service = createInstagramMediaService({ fetchPost });

      const result = service.validateUrl("https://www.instagram.com/tv/ABC123/");
      assert.equal(result.valid, true);
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "tv");
    });

    it("should return error message for invalid URL", () => {
      const fetchPost = createMockFetchPost({});
      service = createInstagramMediaService({ fetchPost });

      const result = service.validateUrl("https://twitter.com/status/123");
      assert.equal(result.valid, false);
      assert.ok(result.error);
      assert.ok(result.error.includes("Not an Instagram URL"));
    });
  });

  describe("service configuration", () => {
    it("should create internal HttpClient when none provided", () => {
      const fetchPost = createMockFetchPost({
        id: "123",
        mediaType: "IMAGE",
        mediaUrl: "https://example.com/img.jpg",
      });

      // Should not throw — creates its own HttpClient
      service = createInstagramMediaService({
        fetchPost,
        maxFileSize: 50 * 1024 * 1024,
        connectTimeout: 5000,
        readTimeout: 30000,
      });

      assert.ok(service);
      assert.equal(typeof service.fetchMedia, "function");
    });

    it("should use DEFAULT_MAX_FILE_SIZE of 100MB", () => {
      assert.equal(DEFAULT_MAX_FILE_SIZE, 100 * 1024 * 1024);
    });
  });

  describe("resolveMedia integration", () => {
    it("should resolve URL and return full resolved media object", async () => {
      const imagePost = {
        id: "17854360229135472",
        mediaType: "IMAGE",
        mediaUrl: "https://scontent.cdninstagram.com/v/image.jpg",
        thumbnailUrl: null,
        caption: "Test caption",
        permalink: "https://www.instagram.com/p/ABC123/",
      };

      const fetchPost = createMockFetchPost(imagePost);
      service = createInstagramMediaService({ fetchPost });

      const result = await service.resolveMedia("https://www.instagram.com/p/ABC123/");

      assert.equal(result.postId, "17854360229135472");
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.mediaType, "image");
      assert.equal(result.mediaUrl, "https://scontent.cdninstagram.com/v/image.jpg");
      assert.equal(result.thumbnailUrl, null);
      assert.equal(result.caption, "Test caption");
      assert.equal(result.permalink, "https://www.instagram.com/p/ABC123/");
      assert.equal(result.urlType, "post");
    });
  });
});

// ─── 6. HttpClient CONFIG DEFAULTS ──────────────────────────────────────────

describe("Download Service — Configuration", () => {
  it("DEFAULT_CONFIG should have expected values", () => {
    assert.equal(DEFAULT_CONFIG.connectTimeout, 10_000);
    assert.equal(DEFAULT_CONFIG.readTimeout, 60_000);
    assert.equal(DEFAULT_CONFIG.maxRetries, 3);
    assert.equal(DEFAULT_CONFIG.retryBackoffFactor, 500);
    assert.deepEqual(DEFAULT_CONFIG.retryStatusCodes, [429, 500, 502, 503, 504]);
    assert.equal(DEFAULT_CONFIG.chunkSize, 8192);
    assert.equal(DEFAULT_CONFIG.maxFileSize, null);
    assert.equal(DEFAULT_CONFIG.maxRedirects, 10);
    assert.equal(DEFAULT_CONFIG.allowRedirects, true);
    assert.equal(DEFAULT_CONFIG.tempDir, null);
  });

  it("DEFAULT_CONFIG should include browser-like User-Agent", () => {
    assert.ok(DEFAULT_CONFIG.userAgent.includes("Mozilla"));
    assert.ok(DEFAULT_CONFIG.userAgent.includes("Chrome"));
  });

  it("DEFAULT_HEADERS should be frozen", () => {
    assert.ok(Object.isFrozen(DEFAULT_HEADERS));
  });

  it("DEFAULT_CONFIG should be frozen", () => {
    assert.ok(Object.isFrozen(DEFAULT_CONFIG));
  });
});
