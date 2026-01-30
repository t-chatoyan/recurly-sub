/**
 * Environment configuration module
 * Loads and validates API credentials from .env file
 *
 * Security: NFR-S1 to NFR-S4 compliance
 * - Credentials only from .env file
 * - Never log or display API keys
 * - Validate key presence before use
 */

const dotenv = require('dotenv');
const { API_BASE_URL } = require('../env/environment');

/**
 * Parse integer from environment variable with validation
 * @param {string} value - The string value to parse
 * @param {number} defaultValue - Default if not set
 * @param {string} varName - Variable name for error messages
 * @returns {number} Parsed integer value
 * @throws {Error} If value is not a valid integer
 */
function parseIntEnv(value, defaultValue, varName) {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${varName}: '${value}' is not a valid integer`);
  }
  return parsed;
}

/**
 * Parse URL from environment variable with validation
 * @param {string} value - The string value to parse
 * @param {string} defaultValue - Default if not set
 * @param {string} varName - Variable name for error messages
 * @returns {string} URL string
 * @throws {Error} If value is not a valid URL
 */
function parseUrlEnv(value, defaultValue, varName) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error(`Invalid ${varName}: value is empty`);
  }
  try {
    new URL(trimmed);
  } catch {
    throw new Error(`Invalid ${varName}: '${value}' is not a valid URL`);
  }
  return trimmed;
}

/**
 * Load and validate configuration based on environment type
 * @param {string} envType - 'sandbox' or 'production'
 * @returns {Object} Configuration object with apiKey and settings
 * @throws {Error} If .env file missing, required key not found, or invalid envType
 */
function loadConfig(envType) {
  // Validate envType parameter
  if (envType !== 'sandbox' && envType !== 'production') {
    throw new Error(`Invalid envType: '${envType}'. Must be 'sandbox' or 'production'`);
  }

  // Load .env file (quiet mode to suppress dotenv tips)
  const result = dotenv.config({ quiet: true });

  // Handle .env file errors
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error('.env file not found. Copy .env.example to .env and fill with your credentials.');
    }
    throw new Error(`Failed to load .env file: ${result.error.message}`);
  }

  // Determine which API key to use based on environment
  const keyName = envType === 'production'
    ? 'RECURLY_PRODUCTION_API_KEY'
    : 'RECURLY_SANDBOX_API_KEY';

  const apiKey = process.env[keyName];

  // Validate API key exists and is not empty (NFR-S3)
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(`Missing required environment variable: ${keyName}`);
  }

  // Parse and validate retry configuration
  const retryCount = parseIntEnv(process.env.RETRY_COUNT, 3, 'RETRY_COUNT');
  const retryBackoffBase = parseIntEnv(process.env.RETRY_BACKOFF_BASE, 2, 'RETRY_BACKOFF_BASE');
  const retryBackoffMax = parseIntEnv(process.env.RETRY_BACKOFF_MAX, 30, 'RETRY_BACKOFF_MAX');

  // Parse and validate optional API base URL (default is Recurly US endpoint)
  const apiBaseUrl = parseUrlEnv(process.env.RECURLY_API_BASE_URL, API_BASE_URL, 'RECURLY_API_BASE_URL');
  const baseUrl = parseUrlEnv(process.env.BASE_URL, 'https://carinfos.eu.recurly.com', 'BASE_URL');

  // Return config object (NFR-S4: apiKey stored only in memory)
  return {
    apiKey,
    envType,
    apiBaseUrl,
    baseUrl,
    retryCount,
    retryBackoffBase,
    retryBackoffMax
  };
}

module.exports = { loadConfig };
