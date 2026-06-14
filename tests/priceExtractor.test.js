import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPriceExtractor, normalizePriceResult } from "../src/services/priceExtractor.js";

function createTestLogger() {
  const calls = { info: [], warn: [], error: [], debug: [] };
  return {
    calls,
    info: (...args) => calls.info.push(args),
    warn: (...args) => calls.warn.push(args),
    error: (...args) => calls.error.push(args),
    debug: (...args) => calls.debug.push(args),
  };
}

function createMockGrokExtractor(options = {}) {
  return async (_caption, _prompt, _opts) => {
    if (options.throws) {
      const err = new Error(options.errorMessage || "Grok API error");
      throw err;
    }
    return options.result || { price: 500, currency: "EUR", confidence: 0.95 };
  };
}

describe("normalizePriceResult", () => {
  it("should return valid price data as-is", () => {
    const result = normalizePriceResult({ price: 100, currency: "USD", confidence: 0.9 });
    assert.deepEqual(result, { price: 100, currency: "USD", confidence: 0.9 });
  });

  it("should return null price when price is not a number", () => {
    const result = normalizePriceResult({ price: "500", currency: "EUR", confidence: 0.8 });
    assert.equal(result.price, null);
    assert.equal(result.currency, "EUR");
    assert.equal(result.confidence, 0.8);
  });

  it("should return null currency when not a valid ISO code", () => {
    const result = normalizePriceResult({ price: 100, currency: "euros", confidence: 0.8 });
    assert.equal(result.price, 100);
    assert.equal(result.currency, null);
    assert.equal(result.confidence, 0.8);
  });

  it("should accept 3-letter uppercase currency codes", () => {
    const result = normalizePriceResult({ price: 100, currency: "GBP", confidence: 0.8 });
    assert.equal(result.currency, "GBP");
  });

  it("should reject lowercase currency codes", () => {
    const result = normalizePriceResult({ price: 100, currency: "eur", confidence: 0.8 });
    assert.equal(result.currency, null);
  });

  it("should clamp confidence to 0 when out of range (negative)", () => {
    const result = normalizePriceResult({ price: 100, currency: "EUR", confidence: -0.5 });
    assert.equal(result.confidence, 0);
  });

  it("should clamp confidence to 0 when out of range (> 1)", () => {
    const result = normalizePriceResult({ price: 100, currency: "EUR", confidence: 1.5 });
    assert.equal(result.confidence, 0);
  });

  it("should handle null input", () => {
    const result = normalizePriceResult(null);
    assert.deepEqual(result, { price: null, currency: null, confidence: 0 });
  });

  it("should handle non-object input", () => {
    const result = normalizePriceResult("not an object");
    assert.deepEqual(result, { price: null, currency: null, confidence: 0 });
  });

  it("should handle missing fields", () => {
    const result = normalizePriceResult({});
    assert.deepEqual(result, { price: null, currency: null, confidence: 0 });
  });

  it("should handle zero price", () => {
    const result = normalizePriceResult({ price: 0, currency: "EUR", confidence: 0.9 });
    assert.equal(result.price, 0);
  });

  it("should handle decimal prices", () => {
    const result = normalizePriceResult({ price: 99.99, currency: "USD", confidence: 0.95 });
    assert.equal(result.price, 99.99);
  });
});

describe("createPriceExtractor", () => {
  describe("extractPrice", () => {
    it("should extract price from caption using Grok", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor({
        result: { price: 500, currency: "EUR", confidence: 0.95 },
      });
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      const result = await extractor.extractPrice("Vendo iPhone por 500 euros");

      assert.deepEqual(result, { price: 500, currency: "EUR", confidence: 0.95 });
    });

    it("should return null price when no price found", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor({
        result: { price: null, currency: null, confidence: 0 },
      });
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      const result = await extractor.extractPrice("Miren lo que encontre hoy");

      assert.deepEqual(result, { price: null, currency: null, confidence: 0 });
    });

    it("should return null for empty caption", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor();
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      const result = await extractor.extractPrice("");

      assert.deepEqual(result, { price: null, currency: null, confidence: 0 });
    });

    it("should return null for null caption", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor();
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      const result = await extractor.extractPrice(null);

      assert.deepEqual(result, { price: null, currency: null, confidence: 0 });
    });

    it("should return null for non-string caption", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor();
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      const result = await extractor.extractPrice(12345);

      assert.deepEqual(result, { price: null, currency: null, confidence: 0 });
    });

    it("should return null for whitespace-only caption", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor();
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      const result = await extractor.extractPrice("   \n  \t  ");

      assert.deepEqual(result, { price: null, currency: null, confidence: 0 });
    });

    it("should propagate Grok API errors", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor({ throws: true, errorMessage: "Rate limit" });
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      await assert.rejects(
        () => extractor.extractPrice("Vendo algo por 100 euros"),
        { message: "Rate limit" },
      );

      assert.equal(log.calls.error.length, 1);
    });

    it("should normalize invalid Grok response", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor({
        result: { price: "not-a-number", currency: "euros", confidence: 2 },
      });
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      const result = await extractor.extractPrice("Vendo algo por 100 euros");

      assert.equal(result.price, null);
      assert.equal(result.currency, null);
      assert.equal(result.confidence, 0);
    });

    it("should pass temperature=0 to Grok for deterministic extraction", async () => {
      const log = createTestLogger();
      let receivedOptions;
      const mockGrok = async (_caption, _prompt, opts) => {
        receivedOptions = opts;
        return { price: 100, currency: "EUR", confidence: 0.9 };
      };
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      await extractor.extractPrice("Vendo por 100 euros");

      assert.deepEqual(receivedOptions, { temperature: 0 });
    });

    it("should log debug messages during extraction", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor({
        result: { price: 250, currency: "USD", confidence: 0.85 },
      });
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      await extractor.extractPrice("Selling for $250");

      assert.ok(log.calls.debug.length >= 1);
    });

    it("should handle various currency formats", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor({
        result: { price: 1000, currency: "GBP", confidence: 0.92 },
      });
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      const result = await extractor.extractPrice("For sale £1000");

      assert.equal(result.price, 1000);
      assert.equal(result.currency, "GBP");
    });

    it("should handle decimal prices correctly", async () => {
      const log = createTestLogger();
      const mockGrok = createMockGrokExtractor({
        result: { price: 49.99, currency: "EUR", confidence: 0.98 },
      });
      const extractor = createPriceExtractor({ logger: log, grokExtractor: mockGrok });

      const result = await extractor.extractPrice("Solo 49.99€");

      assert.equal(result.price, 49.99);
    });
  });
});
