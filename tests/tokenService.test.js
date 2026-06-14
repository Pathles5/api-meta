import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getAccessToken, invalidateCache, getParameterName, _setSsmClient, _setCachedToken } from "../src/services/tokenService.js";

describe("TokenService", () => {
  beforeEach(() => {
    invalidateCache();
    process.env.IG_ENV = "test";
  });

  describe("getParameterName", () => {
    it("should return correct parameter name based on IG_ENV", () => {
      process.env.IG_ENV = "pre";
      assert.equal(getParameterName(), "/ig-api/pre/meta-access-token");
    });

    it("should fallback to NODE_ENV if IG_ENV not set", () => {
      delete process.env.IG_ENV;
      process.env.NODE_ENV = "production";
      assert.equal(getParameterName(), "/ig-api/production/meta-access-token");
    });

    it("should default to 'pre' if no env vars set", () => {
      delete process.env.IG_ENV;
      delete process.env.NODE_ENV;
      assert.equal(getParameterName(), "/ig-api/pre/meta-access-token");
    });
  });

  describe("getAccessToken", () => {
    it("should retrieve token from SSM", async () => {
      const mockClient = {
        send: async () => ({
          Parameter: { Value: "test-ssm-token" },
        }),
      };
      _setSsmClient(mockClient);

      const token = await getAccessToken();
      assert.equal(token, "test-ssm-token");
    });

    it("should use cached token on subsequent calls", async () => {
      let callCount = 0;
      const mockClient = {
        send: async () => {
          callCount++;
          return { Parameter: { Value: "cached-token" } };
        },
      };
      _setSsmClient(mockClient);

      await getAccessToken();
      await getAccessToken();
      await getAccessToken();

      assert.equal(callCount, 1);
    });

    it("should re-fetch after cache expires", async () => {
      let callCount = 0;
      const mockClient = {
        send: async () => {
          callCount++;
          return { Parameter: { Value: `token-${callCount}` } };
        },
      };
      _setSsmClient(mockClient);

      await getAccessToken();
      invalidateCache();
      const token = await getAccessToken();

      assert.equal(callCount, 2);
      assert.equal(token, "token-2");
    });

    it("should throw 500 when parameter not found", async () => {
      const error = new Error("Parameter not found");
      error.name = "ParameterNotFound";

      const mockClient = {
        send: async () => { throw error; },
      };
      _setSsmClient(mockClient);

      await assert.rejects(
        () => getAccessToken(),
        (err) => {
          assert.equal(err.statusCode, 500);
          assert.ok(err.message.includes("not configured in SSM"));
          return true;
        }
      );
    });

    it("should throw 500 when token value is empty", async () => {
      const mockClient = {
        send: async () => ({
          Parameter: { Value: "" },
        }),
      };
      _setSsmClient(mockClient);

      await assert.rejects(
        () => getAccessToken(),
        (err) => {
          assert.equal(err.statusCode, 500);
          assert.ok(err.message.includes("empty"));
          return true;
        }
      );
    });

    it("should throw 500 on unexpected SSM errors", async () => {
      const mockClient = {
        send: async () => { throw new Error("Network error"); },
      };
      _setSsmClient(mockClient);

      await assert.rejects(
        () => getAccessToken(),
        (err) => {
          assert.equal(err.statusCode, 500);
          assert.ok(err.message.includes("Failed to retrieve"));
          return true;
        }
      );
    });

    it("should propagate HTTP errors from SSM", async () => {
      const error = new Error("Access denied");
      error.statusCode = 403;

      const mockClient = {
        send: async () => { throw error; },
      };
      _setSsmClient(mockClient);

      await assert.rejects(
        () => getAccessToken(),
        (err) => {
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  describe("invalidateCache", () => {
    it("should force re-fetch on next call", async () => {
      let callCount = 0;
      const mockClient = {
        send: async () => {
          callCount++;
          return { Parameter: { Value: `token-${callCount}` } };
        },
      };
      _setSsmClient(mockClient);

      await getAccessToken();
      invalidateCache();
      const token = await getAccessToken();

      assert.equal(callCount, 2);
      assert.equal(token, "token-2");
    });
  });

  describe("_setCachedToken (testing helper)", () => {
    it("should set token in cache directly", async () => {
      _setCachedToken("direct-token");
      const token = await getAccessToken();
      assert.equal(token, "direct-token");
    });

    it("should clear cache when null is passed", async () => {
      _setCachedToken("some-token");
      _setCachedToken(null);

      const mockClient = {
        send: async () => ({
          Parameter: { Value: "fresh-token" },
        }),
      };
      _setSsmClient(mockClient);

      const token = await getAccessToken();
      assert.equal(token, "fresh-token");
    });
  });
});
