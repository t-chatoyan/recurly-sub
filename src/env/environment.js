/**
 * Environment Configuration Module
 * Provides environment-specific configuration for Recurly API access
 *
 * Note: Recurly uses the same API endpoint for both sandbox and production.
 * The API key (loaded separately by config/env.js) determines the environment.
 */

// Environment name constants
const ENVIRONMENT_NAMES = {
  SANDBOX: 'sandbox',
  PRODUCTION: 'production'
};

// Recurly API v3 base URL (same for sandbox and production)
const API_BASE_URL = 'https://v3.recurly.com';

/**
 * Initialize environment configuration based on environment type
 * @param {string} envType - 'sandbox' or 'production'
 * @param {string} [apiBaseUrl=API_BASE_URL] - Optional API base URL override
 * @returns {Object} Environment configuration object
 * @throws {Error} If envType is not 'sandbox' or 'production'
 */
function initEnvironment(envType, apiBaseUrl = API_BASE_URL) {
  // [H1 FIX] Validate envType parameter for consistency with args.js and env.js
  if (envType !== ENVIRONMENT_NAMES.SANDBOX && envType !== ENVIRONMENT_NAMES.PRODUCTION) {
    throw new Error(`Invalid environment type: '${envType}'. Must be 'sandbox' or 'production'`);
  }

  return {
    name: envType,
    isProduction: envType === ENVIRONMENT_NAMES.PRODUCTION,
    apiBaseUrl
    // Note: API key is NOT stored here - loaded separately via loadConfig()
  };
}

module.exports = {
  initEnvironment,
  ENVIRONMENT_NAMES,
  API_BASE_URL
};
