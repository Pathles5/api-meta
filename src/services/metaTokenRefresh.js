import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import { logger } from "../utils/logger.js";

const META_API_BASE = "https://graph.facebook.com/v24.0";

let ssmClient = new SSMClient({ region: process.env.AWS_REGION || "eu-west-1" });

/**
 * Obtiene el nombre del parámetro SSM para el token de Meta
 * @returns {string} Path del parámetro SSM
 */
function getParameterName() {
  const env = process.env.IG_ENV || process.env.NODE_ENV || "pre";
  return `/ig-api/${env}/meta-access-token`;
}

/**
 * Lee el token actual desde SSM Parameter Store
 * @returns {Promise<string>} Token actual
 */
async function getCurrentToken() {
  const parameterName = getParameterName();

  const command = new GetParameterCommand({
    Name: parameterName,
    WithDecryption: true,
  });

  const response = await ssmClient.send(command);

  if (!response.Parameter?.Value) {
    throw new Error(`Token not found in SSM parameter: ${parameterName}`);
  }

  return response.Parameter.Value;
}

/**
 * Guarda un nuevo token en SSM Parameter Store
 * @param {string} token - Nuevo token a almacenar
 */
async function saveToken(token) {
  const parameterName = getParameterName();

  const command = new PutParameterCommand({
    Name: parameterName,
    Value: token,
    Type: "SecureString",
    Overwrite: true,
  });

  await ssmClient.send(command);
  logger.info({ parameterName }, "Token updated in SSM");
}

/**
 * Refresca el token de Meta usando la Graph API
 * Los tokens long-lived se pueden refresh cada 24h y duran 60 días
 * @param {string} currentToken - Token actual a refresh
 * @returns {Promise<string>} Nuevo token refreshado
 */
async function refreshToken(currentToken) {
  const url = `${META_API_BASE}/oauth/access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(currentToken)}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    throw new Error(`Meta API refresh failed: ${data.error.message} (code: ${data.error.code})`);
  }

  if (!data.access_token) {
    throw new Error("Meta API refresh response missing access_token");
  }

  logger.info(
    { expiresIn: data.expires_in },
    "Token refreshed successfully via Meta API"
  );

  return data.access_token;
}

/**
 * Proceso completo de refresh: leer token actual, refresh, guardar nuevo
 * @returns {Promise<{success: boolean, message: string}>} Resultado del refresh
 */
async function performTokenRefresh() {
  try {
    const currentToken = await getCurrentToken();
    const newToken = await refreshToken(currentToken);
    await saveToken(newToken);

    return {
      success: true,
      message: "Token refreshed and saved to SSM successfully",
    };
  } catch (error) {
    logger.error({ error: error.message }, "Token refresh failed");
    return {
      success: false,
      message: `Token refresh failed: ${error.message}`,
    };
  }
}

/**
 * Reemplaza el cliente SSM (solo para testing)
 * @param {object} client - Cliente SSM mockeado
 */
function _setSsmClient(client) {
  ssmClient = client;
}

export { getCurrentToken, saveToken, refreshToken, performTokenRefresh, getParameterName, _setSsmClient };
