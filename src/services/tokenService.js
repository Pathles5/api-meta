import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

let ssmClient = new SSMClient({ region: process.env.AWS_REGION || "eu-west-1" });

/** Cache en memoria para evitar llamadas SSM en cada request */
let cachedToken = null;
let cacheExpiresAt = 0;

/** TTL del cache en milisegundos (5 minutos) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Obtiene el nombre del parámetro SSM para el token de Meta
 * @returns {string} Path del parámetro SSM
 */
function getParameterName() {
  const env = process.env.IG_ENV || process.env.NODE_ENV || "pre";
  return `/ig-api/${env}/meta-access-token`;
}

/**
 * Lee el token de acceso de Meta desde SSM Parameter Store
 * Usa cache en memoria con TTL de 5 minutos
 * @returns {Promise<string>} Token de acceso
 */
async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && now < cacheExpiresAt) {
    return cachedToken;
  }

  const parameterName = getParameterName();

  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true,
    });

    const response = await ssmClient.send(command);
    const token = response.Parameter.Value;

    if (!token) {
      throw createError(500, "Token value is empty in SSM Parameter Store");
    }

    cachedToken = token;
    cacheExpiresAt = now + CACHE_TTL_MS;

    logger.debug({ parameterName }, "Token retrieved from SSM");

    return token;
  } catch (error) {
    if (error.name === "ParameterNotFound") {
      logger.error({ parameterName }, "SSM parameter not found");
      throw createError(500, "META_ACCESS_TOKEN not configured in SSM");
    }

    if (error.statusCode) {
      throw error;
    }

    logger.error({ error: error.message, parameterName }, "Failed to retrieve token from SSM");
    throw createError(500, "Failed to retrieve access token from SSM");
  }
}

/**
 * Invalida el cache del token (útil para forzar re-lectura tras refresh)
 */
function invalidateCache() {
  cachedToken = null;
  cacheExpiresAt = 0;
  logger.debug("Token cache invalidated");
}

/**
 * Reemplaza el cliente SSM (solo para testing)
 * @param {object} client - Cliente SSM mockeado
 */
function _setSsmClient(client) {
  ssmClient = client;
}

/**
 * Fija un token directamente en el cache (solo para testing)
 * @param {string|null} token - Token a cachear, o null para limpiar
 */
function _setCachedToken(token) {
  cachedToken = token;
  cacheExpiresAt = token ? Date.now() + CACHE_TTL_MS : 0;
}

export { getAccessToken, invalidateCache, getParameterName, _setSsmClient, _setCachedToken };
