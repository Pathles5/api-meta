import { extractStructuredData } from "./grokService.js";
import { logger as defaultLogger } from "../utils/logger.js";

const PRICE_EXTRACTION_PROMPT = `Eres un extractor de precios de publicaciones de Instagram.
Analiza el texto proporcionado y extrae el precio mencionado.

Debes responder con un objeto JSON con exactamente estos campos:
- "price": el precio numerico (number) o null si no hay precio
- "currency": codigo ISO de 3 letras de la moneda (ej: "EUR", "USD", "GBP") o null si no se puede determinar
- "confidence": un numero entre 0.0 y 1.0 indicando tu confianza en la extraccion

Reglas:
- Si no hay precio mencionado, retorna price: null, currency: null, confidence: 0
- Si el precio es ambiguo, usa confidence baja (< 0.5)
- Si el precio es claro y explicito, usa confidence alta (> 0.8)
- Normaliza el precio a number (sin simbolos de moneda, sin separadores de miles)
- Detecta la moneda del contexto (palabras como "euros", "dolares", "$", "€", etc.)`;

/**
 * Crea un extractor de precios que usa Grok AI para analizar texto
 * de captions de Instagram y extraer informacion de precios.
 *
 * @param {object} [options]
 * @param {object} [options.logger] - Custom logger.
 * @param {Function} [options.grokExtractor] - Function to call for structured extraction
 *   (defaults to grokService.extractStructuredData).
 * @returns {{ extractPrice: (caption: string) => Promise<{price: number|null, currency: string|null, confidence: number}> }}
 */
function createPriceExtractor(options = {}) {
  const log = options.logger || defaultLogger;
  const grokExtract = options.grokExtractor || extractStructuredData;

  /**
   * Extrae el precio de un texto (caption de Instagram).
   *
   * @param {string} caption - Texto del caption a analizar.
   * @returns {Promise<{price: number|null, currency: string|null, confidence: number}>}
   */
  async function extractPrice(caption) {
    if (!caption || typeof caption !== "string" || caption.trim().length === 0) {
      log.debug("No caption provided, skipping price extraction");
      return { price: null, currency: null, confidence: 0 };
    }

    log.debug({ captionLength: caption.length }, "Extracting price from caption");

    let result;
    try {
      result = await grokExtract(caption, PRICE_EXTRACTION_PROMPT, { temperature: 0 });
    } catch (err) {
      log.error({ err }, "Grok API call failed during price extraction");
      throw err;
    }

    const priceData = normalizePriceResult(result);

    log.debug(
      { price: priceData.price, currency: priceData.currency, confidence: priceData.confidence },
      "Price extraction complete",
    );

    return priceData;
  }

  return { extractPrice };
}

/**
 * Normaliza el resultado de Grok al formato esperado.
 *
 * @param {object} raw - Resultado crudo de Grok.
 * @returns {{ price: number|null, currency: string|null, confidence: number }}
 */
function normalizePriceResult(raw) {
  if (!raw || typeof raw !== "object") {
    return { price: null, currency: null, confidence: 0 };
  }

  const price = typeof raw.price === "number" ? raw.price : null;

  const currency =
    typeof raw.currency === "string" && /^[A-Z]{3}$/.test(raw.currency)
      ? raw.currency
      : null;

  const confidence =
    typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
      ? raw.confidence
      : 0;

  return { price, currency, confidence };
}

export { createPriceExtractor, normalizePriceResult };
