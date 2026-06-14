import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  extractStructuredData,
  chat,
  getApiKey,
  getModel,
  _setFetch,
  _resetFetch,
} from "../src/services/grokService.js";

const originalEnv = process.env;

/**
 * Crea un mock de fetch que retorna una respuesta exitosa de Grok API
 * @param {string|object} content - Contenido de la respuesta (string u objeto)
 * @returns {Function} Mock de fetch
 */
function createMockFetch(content) {
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);
  return async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: contentStr } }],
    }),
  });
}

/**
 * Crea un mock de fetch que retorna un error HTTP
 * @param {number} status - Código de estado HTTP
 * @param {object} [errorBody] - Body del error
 * @returns {Function} Mock de fetch
 */
function createErrorFetch(status, errorBody = { error: { message: "Mock error" } }) {
  return async () => ({
    ok: false,
    status,
    statusText: `HTTP ${status}`,
    json: async () => errorBody,
  });
}

describe("GrokService", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GROK_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.env = originalEnv;
    _resetFetch();
  });

  describe("getApiKey", () => {
    it("should return API key from environment", () => {
      process.env.GROK_API_KEY = "my-secret-key";
      assert.equal(getApiKey(), "my-secret-key");
    });

    it("should throw when GROK_API_KEY is not set", () => {
      delete process.env.GROK_API_KEY;
      assert.throws(
        () => getApiKey(),
        (error) => {
          assert.equal(error.statusCode, 500);
          assert.ok(error.message.includes("GROK_API_KEY"));
          return true;
        }
      );
    });
  });

  describe("getModel", () => {
    it("should return default model when GROK_MODEL is not set", () => {
      delete process.env.GROK_MODEL;
      assert.equal(getModel(), "grok-2-latest");
    });

    it("should return custom model from GROK_MODEL", () => {
      process.env.GROK_MODEL = "grok-beta";
      assert.equal(getModel(), "grok-beta");
    });
  });

  describe("extractStructuredData", () => {
    it("should send text and return parsed JSON from Grok", async () => {
      const extractedData = { price: 29.99, currency: "USD", product: "Widget" };
      _setFetch(createMockFetch(extractedData));

      const result = await extractStructuredData(
        "This widget costs $29.99",
        "Extract the price, currency, and product name"
      );

      assert.deepEqual(result, extractedData);
    });

    it("should send correct request body to Grok API", async () => {
      let capturedUrl = null;
      let capturedOptions = null;

      _setFetch(async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"result": "ok"}' } }],
          }),
        };
      });

      await extractStructuredData("test text", "extract info");

      assert.equal(capturedUrl, "https://api.x.ai/v1/chat/completions");
      assert.equal(capturedOptions.method, "POST");
      assert.equal(capturedOptions.headers["Content-Type"], "application/json");
      assert.equal(capturedOptions.headers["Authorization"], "Bearer test-api-key");

      const body = JSON.parse(capturedOptions.body);
      assert.equal(body.model, "grok-2-latest");
      assert.equal(body.messages.length, 2);
      assert.equal(body.messages[0].role, "system");
      assert.equal(body.messages[1].role, "user");
      assert.equal(body.messages[1].content, "test text");
      assert.ok(body.messages[0].content.includes("extract info"));
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.equal(body.temperature, 0);
    });

    it("should use custom model from GROK_MODEL env var", async () => {
      process.env.GROK_MODEL = "grok-beta";
      let capturedBody = null;

      _setFetch(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"ok": true}' } }],
          }),
        };
      });

      await extractStructuredData("text", "prompt");
      assert.equal(capturedBody.model, "grok-beta");
    });

    it("should pass temperature and maxTokens options", async () => {
      let capturedBody = null;

      _setFetch(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"ok": true}' } }],
          }),
        };
      });

      await extractStructuredData("text", "prompt", {
        temperature: 0.5,
        maxTokens: 100,
      });

      assert.equal(capturedBody.temperature, 0.5);
      assert.equal(capturedBody.max_tokens, 100);
    });

    it("should throw 500 when GROK_API_KEY is not configured", async () => {
      delete process.env.GROK_API_KEY;

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 500);
          assert.ok(error.message.includes("GROK_API_KEY"));
          return true;
        }
      );
    });

    it("should throw 502 on network error", async () => {
      _setFetch(async () => {
        throw new Error("ECONNREFUSED");
      });

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("network error"));
          assert.ok(error.message.includes("ECONNREFUSED"));
          return true;
        }
      );
    });

    it("should throw 401 on invalid API key (HTTP 401)", async () => {
      _setFetch(createErrorFetch(401, { error: { message: "Invalid API key" } }));

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 401);
          assert.ok(error.message.includes("Invalid Grok API key"));
          return true;
        }
      );
    });

    it("should throw 429 on rate limit (HTTP 429)", async () => {
      _setFetch(createErrorFetch(429, { error: { message: "Rate limit exceeded" } }));

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 429);
          assert.ok(error.message.includes("rate limit"));
          return true;
        }
      );
    });

    it("should throw 502 on server error (HTTP 500)", async () => {
      _setFetch(createErrorFetch(500, { error: { message: "Internal server error" } }));

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("server error"));
          return true;
        }
      );
    });

    it("should throw 502 on other HTTP errors", async () => {
      _setFetch(createErrorFetch(400, { error: { message: "Bad request" } }));

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("Bad request"));
          return true;
        }
      );
    });

    it("should throw 502 when response is not valid JSON", async () => {
      _setFetch(async () => ({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      }));

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("Invalid JSON response"));
          return true;
        }
      );
    });

    it("should throw 502 when response has no choices", async () => {
      _setFetch(async () => ({
        ok: true,
        json: async () => ({ choices: [] }),
      }));

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("missing content"));
          return true;
        }
      );
    });

    it("should throw 502 when Grok returns invalid JSON content", async () => {
      _setFetch(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "not valid json {" } }],
        }),
      }));

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("invalid JSON"));
          return true;
        }
      );
    });

    it("should handle error response with non-JSON body", async () => {
      _setFetch(async () => ({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => {
          throw new Error("parse error");
        },
      }));

      await assert.rejects(
        () => extractStructuredData("text", "prompt"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("server error"));
          return true;
        }
      );
    });
  });

  describe("chat", () => {
    it("should send prompt and return text response", async () => {
      _setFetch(createMockFetch("Hello! How can I help you?"));

      const result = await chat("Hi there");
      assert.equal(result, "Hello! How can I help you?");
    });

    it("should include system prompt when provided", async () => {
      let capturedBody = null;

      _setFetch(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "response" } }],
          }),
        };
      });

      await chat("user message", { systemPrompt: "You are a helpful assistant" });

      assert.equal(capturedBody.messages.length, 2);
      assert.equal(capturedBody.messages[0].role, "system");
      assert.equal(capturedBody.messages[0].content, "You are a helpful assistant");
      assert.equal(capturedBody.messages[1].role, "user");
      assert.equal(capturedBody.messages[1].content, "user message");
    });

    it("should not include system message when systemPrompt is not provided", async () => {
      let capturedBody = null;

      _setFetch(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "response" } }],
          }),
        };
      });

      await chat("user message");

      assert.equal(capturedBody.messages.length, 1);
      assert.equal(capturedBody.messages[0].role, "user");
    });

    it("should use default temperature of 0.7 for chat", async () => {
      let capturedBody = null;

      _setFetch(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "response" } }],
          }),
        };
      });

      await chat("test");
      assert.equal(capturedBody.temperature, 0.7);
    });

    it("should allow custom temperature", async () => {
      let capturedBody = null;

      _setFetch(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "response" } }],
          }),
        };
      });

      await chat("test", { temperature: 0.9 });
      assert.equal(capturedBody.temperature, 0.9);
    });

    it("should pass maxTokens when provided", async () => {
      let capturedBody = null;

      _setFetch(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "response" } }],
          }),
        };
      });

      await chat("test", { maxTokens: 500 });
      assert.equal(capturedBody.max_tokens, 500);
    });

    it("should throw 500 when GROK_API_KEY is not configured", async () => {
      delete process.env.GROK_API_KEY;

      await assert.rejects(
        () => chat("test"),
        (error) => {
          assert.equal(error.statusCode, 500);
          assert.ok(error.message.includes("GROK_API_KEY"));
          return true;
        }
      );
    });

    it("should throw 502 on network error", async () => {
      _setFetch(async () => {
        throw new Error("DNS resolution failed");
      });

      await assert.rejects(
        () => chat("test"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("network error"));
          return true;
        }
      );
    });

    it("should throw 401 on invalid API key", async () => {
      _setFetch(createErrorFetch(401, { error: { message: "Unauthorized" } }));

      await assert.rejects(
        () => chat("test"),
        (error) => {
          assert.equal(error.statusCode, 401);
          return true;
        }
      );
    });

    it("should throw 429 on rate limit", async () => {
      _setFetch(createErrorFetch(429, { error: { message: "Too many requests" } }));

      await assert.rejects(
        () => chat("test"),
        (error) => {
          assert.equal(error.statusCode, 429);
          return true;
        }
      );
    });

    it("should throw 502 when response has no content", async () => {
      _setFetch(async () => ({
        ok: true,
        json: async () => ({ choices: [] }),
      }));

      await assert.rejects(
        () => chat("test"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("missing content"));
          return true;
        }
      );
    });

    it("should throw 502 when response is not valid JSON", async () => {
      _setFetch(async () => ({
        ok: true,
        json: async () => {
          throw new Error("parse error");
        },
      }));

      await assert.rejects(
        () => chat("test"),
        (error) => {
          assert.equal(error.statusCode, 502);
          assert.ok(error.message.includes("Invalid JSON response"));
          return true;
        }
      );
    });
  });
});
