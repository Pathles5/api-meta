import { createError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const GROK_API_BASE = "https://api.x.ai/v1/chat/completions";

/** @type {typeof fetch} */
let fetchFn = globalThis.fetch;

/**
 * Obtiene la API key de Grok desde variables de entorno
 * @returns {string} API key
 * @throws {Error} Si GROK_API_KEY no está configurada
 */
function getApiKey() {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw createError(500, "GROK_API_KEY not configured");
  }
  return apiKey;
}

/**
 * Obtiene el modelo de Grok desde variables de entorno
 * @returns {string} Nombre del modelo
 */
function getModel() {
  return process.env.GROK_MODEL || "grok-2-latest";
}

/**
 * Envía texto a Grok AI para extraer información estructurada
 * @param {string} text - Texto a analizar
 * @param {string} extractionPrompt - Instrucción que describe qué extraer
 * @param {object} [options] - Opciones adicionales
 * @param {number} [options.temperature=0] - Temperatura para generación (0 = determinista)
 * @param {number} [options.maxTokens] - Máximo de tokens en la respuesta
 * @returns {Promise<object>} Objeto JSON con la información extraída
 */
async function extractStructuredData(text, extractionPrompt, options = {}) {
  const apiKey = getApiKey();
  const model = getModel();
  const { temperature = 0, maxTokens } = options;

  const systemPrompt = `${extractionPrompt} Responde únicamente con JSON válido, sin texto adicional ni explicaciones.`;

  const requestBody = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature,
  };

  if (maxTokens) {
    requestBody.max_tokens = maxTokens;
  }

  logger.debug({ model, textLength: text.length }, "Calling Grok API for structured extraction");

  let response;
  try {
    response = await fetchFn(GROK_API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    logger.error({ error: error.message }, "Network error calling Grok API");
    throw createError(502, `Grok API network error: ${error.message}`);
  }

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { message: response.statusText };
    }

    const errorMessage = errorBody.error?.message || `HTTP ${response.status}`;
    logger.error({ status: response.status, error: errorMessage }, "Grok API error");

    if (response.status === 401) {
      throw createError(401, "Invalid Grok API key");
    }
    if (response.status === 429) {
      throw createError(429, "Grok API rate limit exceeded");
    }
    if (response.status >= 500) {
      throw createError(502, `Grok API server error: ${errorMessage}`);
    }

    throw createError(502, `Grok API error: ${errorMessage}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    logger.error({ error: error.message }, "Failed to parse Grok API response");
    throw createError(502, "Invalid JSON response from Grok API");
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    logger.error({ data }, "Grok API response missing content");
    throw createError(502, "Grok API response missing content");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    logger.error({ content, error: error.message }, "Failed to parse Grok response as JSON");
    throw createError(502, "Grok API returned invalid JSON");
  }

  logger.debug({ keys: Object.keys(parsed) }, "Successfully extracted structured data from Grok");

  return parsed;
}

/**
 * Envía un mensaje simple a Grok AI y retorna la respuesta de texto
 * @param {string} prompt - Prompt para Grok
 * @param {object} [options] - Opciones adicionales
 * @param {string} [options.systemPrompt] - System prompt opcional
 * @param {number} [options.temperature=0.7] - Temperatura para generación
 * @param {number} [options.maxTokens] - Máximo de tokens en la respuesta
 * @returns {Promise<string>} Respuesta de texto de Grok
 */
async function chat(prompt, options = {}) {
  const apiKey = getApiKey();
  const model = getModel();
  const { systemPrompt, temperature = 0.7, maxTokens } = options;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const requestBody = {
    model,
    messages,
    temperature,
  };

  if (maxTokens) {
    requestBody.max_tokens = maxTokens;
  }

  logger.debug({ model }, "Calling Grok API for chat");

  let response;
  try {
    response = await fetchFn(GROK_API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    logger.error({ error: error.message }, "Network error calling Grok API");
    throw createError(502, `Grok API network error: ${error.message}`);
  }

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { message: response.statusText };
    }

    const errorMessage = errorBody.error?.message || `HTTP ${response.status}`;
    logger.error({ status: response.status, error: errorMessage }, "Grok API error");

    if (response.status === 401) {
      throw createError(401, "Invalid Grok API key");
    }
    if (response.status === 429) {
      throw createError(429, "Grok API rate limit exceeded");
    }
    if (response.status >= 500) {
      throw createError(502, `Grok API server error: ${errorMessage}`);
    }

    throw createError(502, `Grok API error: ${errorMessage}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    logger.error({ error: error.message }, "Failed to parse Grok API response");
    throw createError(502, "Invalid JSON response from Grok API");
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    logger.error({ data }, "Grok API response missing content");
    throw createError(502, "Grok API response missing content");
  }

  return content;
}

/**
 * Reemplaza la función fetch (solo para testing)
 * @param {typeof fetch} fn - Función fetch mockeada
 */
function _setFetch(fn) {
  fetchFn = fn;
}

/**
 * Restaura el fetch original (solo para testing)
 */
function _resetFetch() {
  fetchFn = globalThis.fetch;
}

export { extractStructuredData, chat, getApiKey, getModel, _setFetch, _resetFetch };
