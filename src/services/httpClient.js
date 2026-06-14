import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";

// --- Default Configuration ---

const DEFAULT_CONFIG = Object.freeze({
  /** Timeout for establishing a connection (ms) */
  connectTimeout: 10_000,
  /** Idle timeout while reading response body (ms) */
  readTimeout: 60_000,
  /** Maximum number of retry attempts for transient failures */
  maxRetries: 3,
  /** Base delay for exponential backoff (ms). Actual delay = factor * 2^attempt */
  retryBackoffFactor: 500,
  /** HTTP status codes that trigger a retry */
  retryStatusCodes: [429, 500, 502, 503, 504],
  /** Chunk size for streaming (bytes) */
  chunkSize: 8192,
  /** Maximum allowed download size in bytes (null = unlimited) */
  maxFileSize: null,
  /** Default User-Agent header */
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/120.0.0.0 Safari/537.36",
  /** Maximum number of redirects to follow */
  maxRedirects: 10,
  /** Whether to follow redirects automatically */
  allowRedirects: true,
  /** Directory for temporary files (null = system default) */
  tempDir: null,
});

const DEFAULT_HEADERS = Object.freeze({
  Accept:
    "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
  "Cache-Control": "max-age=0",
});

// --- Error Classes ---

/**
 * Base error for HTTP client operations.
 */
export class HttpClientError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   */
  constructor(message, details) {
    super(message);
    this.name = "HttpClientError";
    if (details) Object.assign(this, details);
  }
}

/**
 * Raised when all retry attempts are exhausted.
 */
export class MaxRetriesExceededError extends HttpClientError {
  /**
   * @param {string} message
   * @param {object} [details]
   */
  constructor(message, details) {
    super(message, details);
    this.name = "MaxRetriesExceededError";
  }
}

/**
 * Raised when downloaded content exceeds maxFileSize.
 */
export class MaxFileSizeExceededError extends HttpClientError {
  /**
   * @param {string} message
   * @param {object} [details]
   */
  constructor(message, details) {
    super(message, details);
    this.name = "MaxFileSizeExceededError";
  }
}

/**
 * Raised when the URL is invalid or uses an unsupported scheme.
 */
export class InvalidURLError extends HttpClientError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "InvalidURLError";
  }
}

// --- Helpers ---

/**
 * Determines whether an HTTP status code is retryable.
 * @param {number} status
 * @param {number[]} retryStatusCodes
 * @returns {boolean}
 */
function isRetryableStatus(status, retryStatusCodes) {
  return retryStatusCodes.includes(status);
}

/**
 * Determines whether an error is a transient network error worth retrying.
 * @param {Error} err
 * @returns {boolean}
 */
function isTransientError(err) {
  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("aborted") ||
    msg.includes("socket hang up") ||
    msg.includes("undici")
  );
}

/**
 * Sleep for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute retry delay with exponential backoff and jitter.
 * @param {number} attempt - Zero-based attempt index.
 * @param {number} factor - Base backoff factor in ms.
 * @param {number} [status] - HTTP status code (used for Retry-After hint).
 * @returns {number} Delay in ms.
 */
function computeRetryDelay(attempt, factor, _status) {
  const base = factor * Math.pow(2, attempt);
  const jitter = Math.random() * factor;
  return Math.min(base + jitter, 30_000);
}

/**
 * Validate that a URL is well-formed and uses http/https.
 * @param {string} url
 * @throws {InvalidURLError}
 */
function validateUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidURLError(`Invalid URL format: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidURLError(`Unsupported scheme: ${parsed.protocol}`);
  }
}

/**
 * Map a Content-Type header or URL to a file extension.
 * @param {string} contentType
 * @param {string} url
 * @returns {string}
 */
function determineExtension(contentType, url) {
  const typeMap = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
  };

  const ct = (contentType || "").toLowerCase();
  for (const [mime, ext] of Object.entries(typeMap)) {
    if (ct.includes(mime)) return ext;
  }

  // Fallback: infer from URL path
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (const ext of [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".avif",
      ".mp4",
      ".webm",
      ".mov",
    ]) {
      if (pathname.endsWith(ext)) return ext;
    }
  } catch {
    // ignore
  }

  if (ct.includes("video")) return ".mp4";
  return ".jpg";
}

// --- HttpClient ---

/**
 * A robust HTTP client with retries, timeouts, and streaming support.
 *
 * @example
 * const client = new HttpClient();
 * const result = await client.downloadToFile("https://example.com/image.jpg");
 * console.log(result.path, result.sizeBytes);
 * client.destroy();
 */
export class HttpClient {
  /**
   * @param {object} [overrides] - Partial config overrides.
   */
  constructor(overrides) {
    /** @type {typeof DEFAULT_CONFIG} */
    this.config = { ...DEFAULT_CONFIG, ...(overrides || {}) };
  }

  /**
   * Build the default headers merged with any per-request headers.
   * @param {Record<string, string>} [extra]
   * @returns {Record<string, string>}
   */
  _buildHeaders(extra) {
    return {
      "User-Agent": this.config.userAgent,
      ...DEFAULT_HEADERS,
      ...(extra || {}),
    };
  }

  /**
   * Create an AbortController with a connect timeout.
   * @returns {{ controller: AbortController, clearTimeout: Function }}
   */
  _createConnectTimer() {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error("Connect timeout exceeded"));
    }, this.config.connectTimeout);
    return {
      controller,
      clearTimer: () => clearTimeout(timer),
    };
  }

  /**
   * Execute a fetch with retry logic.
   * @param {string} url
   * @param {object} [options]
   * @param {string} [options.method] - HTTP method (default: GET).
   * @param {Record<string, string>} [options.headers] - Extra headers.
   * @returns {Promise<Response>} The final successful response.
   * @throws {MaxRetriesExceededError|HttpClientError}
   */
  async _fetchWithRetry(url, options) {
    const opts = options || {};
    const method = opts.method || "GET";
    const headers = this._buildHeaders(opts.headers);
    const maxAttempts = this.config.maxRetries + 1;
    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = computeRetryDelay(
          attempt - 1,
          this.config.retryBackoffFactor,
        );
        await sleep(delay);
      }

      const { controller, clearTimer } = this._createConnectTimer();

      try {
        const response = await fetch(url, {
          method,
          headers,
          redirect: this.config.allowRedirects ? "follow" : "manual",
          follow: this.config.maxRedirects,
          signal: controller.signal,
        });

        clearTimer();

        // If the status is retryable, retry (or fall through on last attempt)
        if (
          isRetryableStatus(response.status, this.config.retryStatusCodes)
        ) {
          // Consume the body to free the socket
          try {
            await response.text();
          } catch {
            // ignore
          }
          lastError = new HttpClientError(
            `HTTP ${response.status} ${response.statusText}`,
            { statusCode: response.status, url },
          );
          if (attempt < maxAttempts - 1) continue;
          // Last attempt still failed — fall through to MaxRetriesExceededError
          break;
        }

        return response;
      } catch (err) {
        clearTimer();

        if (err.name === "AbortError" || isTransientError(err)) {
          lastError = err;
          if (attempt < maxAttempts - 1) continue;
        }

        // Non-transient error — throw immediately
        throw new HttpClientError(`Request failed: ${err.message}`, {
          cause: err,
          url,
        });
      }
    }

    throw new MaxRetriesExceededError(
      `All ${this.config.maxRetries} retries exhausted for ${url}`,
      { url, lastError },
    );
  }

  /**
   * Check that the response status indicates success.
   * @param {Response} response
   * @throws {HttpClientError}
   */
  _checkResponse(response) {
    if (!response.ok) {
      throw new HttpClientError(
        `HTTP ${response.status} ${response.statusText} (${response.url})`,
        { statusCode: response.status, url: response.url },
      );
    }
  }

  /**
   * Create a read-timeout wrapper around a ReadableStream.
   * If no data arrives within readTimeout ms, the stream errors out.
   * @param {ReadableStream} stream
   * @returns {ReadableStream}
   */
  _wrapWithReadTimeout(stream) {
    const timeout = this.config.readTimeout;
    let timer;
    let controller;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (controller) controller.error(new Error("Read timeout exceeded"));
      }, timeout);
    };

    const wrapped = new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        resetTimer();
      },
      async pull(ctrl) {
        resetTimer();
        const reader = stream.getReader();
        try {
          const { done, value } = await reader.read();
          if (done) {
            clearTimeout(timer);
            ctrl.close();
          } else {
            ctrl.enqueue(value);
          }
        } catch (err) {
          clearTimeout(timer);
          ctrl.error(err);
        } finally {
          reader.releaseLock();
        }
      },
      cancel(reason) {
        clearTimeout(timer);
        return stream.cancel(reason);
      },
    });

    return wrapped;
  }

  /**
   * Download a URL and stream the response body to a temporary file.
   *
   * @param {string} url - The URL to download.
   * @param {object} [options]
   * @param {string} [options.outputPath] - Explicit output path. If omitted, a temp file is created.
   * @param {Record<string, string>} [options.headers] - Extra request headers.
   * @returns {Promise<{path: string, sizeBytes: number, contentType: string, url: string, extension: string}>}
   */
  async downloadToFile(url, options) {
    validateUrl(url);
    const opts = options || {};

    const response = await this._fetchWithRetry(url, { headers: opts.headers });
    this._checkResponse(response);

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const extension = determineExtension(contentType, response.url);

    let outputPath = opts.outputPath;
    if (!outputPath) {
      const dir = this.config.tempDir || tmpdir();
      const fd = join(
        dir,
        `http_download_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${extension}`,
      );
      outputPath = fd;
    }

    const bodyStream = this._wrapWithReadTimeout(response.body);
    const nodeStream = Readable.fromWeb(bodyStream);
    const fileStream = createWriteStream(outputPath);

    let bytesWritten = 0;
    const maxBytes = this.config.maxFileSize;

    try {
      const reader = nodeStream;
      for await (const chunk of reader) {
        bytesWritten += chunk.length;
        if (maxBytes !== null && bytesWritten > maxBytes) {
          fileStream.close();
          try {
            await unlink(outputPath);
          } catch {
            // ignore cleanup failure
          }
          throw new MaxFileSizeExceededError(
            `Download exceeded max size of ${maxBytes} bytes (got ${bytesWritten} bytes)`,
            { bytesWritten, maxBytes },
          );
        }
        fileStream.write(chunk);
      }
      fileStream.end();
      // Wait for the file stream to finish
      await new Promise((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });
    } catch (err) {
      // Clean up partial file on error
      try {
        await unlink(outputPath);
      } catch {
        // ignore
      }
      throw err;
    }

    return {
      path: outputPath,
      sizeBytes: bytesWritten,
      contentType,
      url: response.url,
      extension,
    };
  }

  /**
   * Download a URL and stream the response body into an in-memory Buffer.
   *
   * WARNING: For large files, prefer downloadToFile() to avoid excessive memory usage.
   *
   * @param {string} url - The URL to download.
   * @param {object} [options]
   * @param {Record<string, string>} [options.headers] - Extra request headers.
   * @returns {Promise<{buffer: Buffer, sizeBytes: number, contentType: string, url: string, extension: string}>}
   */
  async downloadToBuffer(url, options) {
    validateUrl(url);
    const opts = options || {};

    const response = await this._fetchWithRetry(url, { headers: opts.headers });
    this._checkResponse(response);

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const extension = determineExtension(contentType, response.url);

    const bodyStream = this._wrapWithReadTimeout(response.body);
    const nodeStream = Readable.fromWeb(bodyStream);

    const chunks = [];
    let bytesWritten = 0;
    const maxBytes = this.config.maxFileSize;

    try {
      for await (const chunk of nodeStream) {
        bytesWritten += chunk.length;
        if (maxBytes !== null && bytesWritten > maxBytes) {
          throw new MaxFileSizeExceededError(
            `Download exceeded max size of ${maxBytes} bytes (got ${bytesWritten} bytes)`,
            { bytesWritten, maxBytes },
          );
        }
        chunks.push(chunk);
      }
    } catch (err) {
      try {
        response.body.cancel();
      } catch {
        // ignore
      }
      throw err;
    }

    const buffer = Buffer.concat(chunks);

    return {
      buffer,
      sizeBytes: bytesWritten,
      contentType,
      url: response.url,
      extension,
    };
  }

  /**
   * Perform a HEAD request to retrieve metadata without downloading the body.
   *
   * @param {string} url - The URL to inspect.
   * @param {object} [options]
   * @param {Record<string, string>} [options.headers] - Extra request headers.
   * @returns {Promise<{contentType: string, contentLength: number|null, url: string, extension: string, headers: Record<string, string>}>}
   */
  async head(url, options) {
    validateUrl(url);
    const opts = options || {};

    const response = await this._fetchWithRetry(url, {
      method: "HEAD",
      headers: opts.headers,
    });
    this._checkResponse(response);

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");
    const extension = determineExtension(contentType, response.url);

    // Collect response headers into a plain object
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      contentType,
      contentLength: contentLength ? parseInt(contentLength, 10) : null,
      url: response.url,
      extension,
      headers,
    };
  }

  /**
   * Perform a GET request and return the response as text.
   *
   * @param {string} url
   * @param {object} [options]
   * @param {Record<string, string>} [options.headers]
   * @returns {Promise<{body: string, status: number, headers: Record<string, string>, url: string}>}
   */
  async getText(url, options) {
    validateUrl(url);
    const opts = options || {};

    const response = await this._fetchWithRetry(url, { headers: opts.headers });
    this._checkResponse(response);

    const body = await response.text();
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return { body, status: response.status, headers, url: response.url };
  }

  /**
   * Perform a GET request and return the response parsed as JSON.
   *
   * @param {string} url
   * @param {object} [options]
   * @param {Record<string, string>} [options.headers]
   * @returns {Promise<{data: any, status: number, headers: Record<string, string>, url: string}>}
   */
  async getJSON(url, options) {
    validateUrl(url);
    const opts = options || {};

    const response = await this._fetchWithRetry(url, { headers: opts.headers });
    this._checkResponse(response);

    const data = await response.json();
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return { data, status: response.status, headers, url: response.url };
  }

  /**
   * No-op for API compatibility. Node fetch doesn't maintain a persistent session.
   */
  destroy() {
    // No persistent connections to clean up with native fetch
  }
}

export {
  DEFAULT_CONFIG,
  DEFAULT_HEADERS,
  validateUrl,
  determineExtension,
  isRetryableStatus,
  isTransientError,
  computeRetryDelay,
};
