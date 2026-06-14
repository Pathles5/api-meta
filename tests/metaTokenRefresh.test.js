import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getCurrentToken,
  saveToken,
  refreshToken,
  performTokenRefresh,
  getParameterName,
  _setSsmClient,
} from "../src/services/metaTokenRefresh.js";

const originalEnv = process.env;
const originalFetch = globalThis.fetch;

describe("MetaTokenRefresh Service", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.IG_ENV = "test";
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
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

  describe("getCurrentToken", () => {
    it("should retrieve token from SSM", async () => {
      const mockClient = {
        send: async () => ({
          Parameter: { Value: "current-ssm-token" },
        }),
      };
      _setSsmClient(mockClient);

      const token = await getCurrentToken();
      assert.equal(token, "current-ssm-token");
    });

    it("should throw when parameter value is empty", async () => {
      const mockClient = {
        send: async () => ({
          Parameter: { Value: null },
        }),
      };
      _setSsmClient(mockClient);

      await assert.rejects(
        () => getCurrentToken(),
        (error) => {
          assert.ok(error.message.includes("not found in SSM"));
          return true;
        }
      );
    });

    it("should throw when Parameter is undefined", async () => {
      const mockClient = {
        send: async () => ({}),
      };
      _setSsmClient(mockClient);

      await assert.rejects(
        () => getCurrentToken(),
        (error) => {
          assert.ok(error.message.includes("not found in SSM"));
          return true;
        }
      );
    });
  });

  describe("saveToken", () => {
    it("should save token to SSM with correct parameters", async () => {
      let capturedCommand = null;
      const mockClient = {
        send: async (command) => {
          capturedCommand = command;
          return {};
        },
      };
      _setSsmClient(mockClient);

      await saveToken("new-token-value");

      assert.ok(capturedCommand);
      assert.equal(capturedCommand.input.Name, "/ig-api/test/meta-access-token");
      assert.equal(capturedCommand.input.Value, "new-token-value");
      assert.equal(capturedCommand.input.Type, "SecureString");
      assert.equal(capturedCommand.input.Overwrite, true);
    });
  });

  describe("refreshToken", () => {
    it("should call Meta API with correct endpoint and return new token", async () => {
      let capturedUrl = null;

      globalThis.fetch = async (url) => {
        capturedUrl = url;
        return {
          json: async () => ({
            access_token: "new-refreshed-token",
            token_type: "bearer",
            expires_in: 5184000,
          }),
        };
      };

      const newToken = await refreshToken("current-token-123");

      assert.equal(newToken, "new-refreshed-token");
      assert.ok(capturedUrl.includes("current-token-123"));
      assert.ok(capturedUrl.includes("grant_type=ig_refresh_token"));
      assert.ok(capturedUrl.includes("graph.facebook.com/v24.0"));
      assert.ok(capturedUrl.includes("/oauth/access_token"));
      assert.ok(capturedUrl.includes("access_token=current-token-123"));
    });

    it("should throw on Meta API error response", async () => {
      globalThis.fetch = async () => ({
        json: async () => ({
          error: {
            code: 190,
            message: "Invalid OAuth access token",
          },
        }),
      });

      await assert.rejects(
        () => refreshToken("expired-token"),
        (error) => {
          assert.ok(error.message.includes("Meta API refresh failed"));
          assert.ok(error.message.includes("Invalid OAuth"));
          return true;
        }
      );
    });

    it("should throw when response missing access_token", async () => {
      globalThis.fetch = async () => ({
        json: async () => ({
          token_type: "bearer",
          expires_in: 5184000,
        }),
      });

      await assert.rejects(
        () => refreshToken("some-token"),
        (error) => {
          assert.ok(error.message.includes("missing access_token"));
          return true;
        }
      );
    });
  });

  describe("performTokenRefresh", () => {
    it("should complete full flow: read, refresh, save", async () => {
      const ssmCalls = [];
      const mockClient = {
        send: async (command) => {
          ssmCalls.push(command.constructor.name);
          if (command.constructor.name === "GetParameterCommand") {
            return { Parameter: { Value: "old-token" } };
          }
          return {};
        },
      };
      _setSsmClient(mockClient);

      globalThis.fetch = async () => ({
        json: async () => ({
          access_token: "refreshed-token",
          expires_in: 5184000,
        }),
      });

      const result = await performTokenRefresh();

      assert.equal(result.success, true);
      assert.ok(result.message.includes("successfully"));
      assert.equal(ssmCalls.length, 2);
      assert.equal(ssmCalls[0], "GetParameterCommand");
      assert.equal(ssmCalls[1], "PutParameterCommand");
    });

    it("should return failure when SSM read fails", async () => {
      const mockClient = {
        send: async () => {
          throw new Error("SSM connection failed");
        },
      };
      _setSsmClient(mockClient);

      const result = await performTokenRefresh();

      assert.equal(result.success, false);
      assert.ok(result.message.includes("SSM connection failed"));
    });

    it("should return failure when Meta API refresh fails", async () => {
      const mockClient = {
        send: async () => ({
          Parameter: { Value: "old-token" },
        }),
      };
      _setSsmClient(mockClient);

      globalThis.fetch = async () => ({
        json: async () => ({
          error: { code: 190, message: "Token expired" },
        }),
      });

      const result = await performTokenRefresh();

      assert.equal(result.success, false);
      assert.ok(result.message.includes("Meta API refresh failed"));
    });

    it("should return failure when SSM write fails", async () => {
      let callCount = 0;
      const mockClient = {
        send: async () => {
          callCount++;
          if (callCount === 1) {
            return { Parameter: { Value: "old-token" } };
          }
          throw new Error("SSM write denied");
        },
      };
      _setSsmClient(mockClient);

      globalThis.fetch = async () => ({
        json: async () => ({
          access_token: "new-token",
          expires_in: 5184000,
        }),
      });

      const result = await performTokenRefresh();

      assert.equal(result.success, false);
      assert.ok(result.message.includes("SSM write denied"));
    });
  });
});
