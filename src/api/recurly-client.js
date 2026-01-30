/**
 * Recurly API v3 Client Module
 * Handles authentication, rate limiting, and retries
 *
 * Features:
 * - Basic authentication with API key
 * - Rate limit monitoring (X-RateLimit-Remaining, X-RateLimit-Reset)
 * - Exponential backoff retry logic
 * - 429 handling with X-RateLimit-Reset wait
 *
 * NFR Compliance:
 * - NFR-I1: Uses Recurly API v3
 * - NFR-P1/P2: Respects rate limits
 * - NFR-P3: Handles 429 gracefully
 * - NFR-R1/R2/R3: Retry with exponential backoff
 * - NFR-S4: Never logs API keys
 */

const https = require('https');

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create Recurly API client
 * @param {Object} config - Configuration object
 * @param {string} config.apiKey - Recurly API key
 * @param {Object} [config.projectConfig] - Project configuration from getProjectConfig()
 * @param {string} [config.apiBaseUrl] - Recurly API base URL
 * @param {string} [config.projectConfig.siteId] - Recurly site ID for the project
 * @param {number} [config.maxRetries=3] - Max retry attempts
 * @param {number} [config.retryBackoffBase=2] - Retry backoff base in seconds
 * @param {number} [config.retryBackoffMax=30] - Max retry backoff in seconds
 * @param {number} [config.rateLimitThreshold=10] - Remaining calls threshold to start delaying
 * @param {number} [config.requestTimeout=30000] - Request timeout in milliseconds
 * @returns {Object} Client instance with request method
 * @throws {Error} If API key is not provided
 */
function createClient(config) {
  const {
    apiKey,
    projectConfig = null,
    apiBaseUrl = 'https://v3.recurly.com',
    maxRetries = 3,
    retryBackoffBase = 2,
    retryBackoffMax = 30,
    rateLimitThreshold = 10,
    requestTimeout = 30000
  } = config;

  if (!apiKey) {
    throw new Error('API key is required');
  }

  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('API key must be a non-empty string');
  }

  const baseURL = apiBaseUrl;
  const auth = Buffer.from(`${apiKey}:`).toString('base64');

  // Extract siteId from projectConfig if provided (Story 2.2)
  const siteId = projectConfig?.siteId || null;

  // Track rate limit state
  let rateLimitRemaining = null;
  let rateLimitReset = null;

  // Constants for rate limit retry protection
  const MAX_RATE_LIMIT_RETRIES = 5;

  /**
   * Parse rate limit headers from response
   * @param {Object} headers - Response headers
   */
  function parseRateLimitHeaders(headers) {
    if (headers['x-ratelimit-remaining']) {
      rateLimitRemaining = parseInt(headers['x-ratelimit-remaining'], 10);
    }
    if (headers['x-ratelimit-reset']) {
      rateLimitReset = parseInt(headers['x-ratelimit-reset'], 10);
    }
  }

  /**
   * Calculate delay for rate limit protection
   * @returns {number} Delay in milliseconds (0 if no delay needed)
   */
  function calculateRateLimitDelay() {
    if (rateLimitRemaining !== null && rateLimitRemaining < rateLimitThreshold) {
      // If we're close to the limit, add a small delay
      return 1000; // 1 second delay
    }
    return 0;
  }

  /**
   * Calculate wait time for 429 response
   * @returns {number} Wait time in milliseconds
   */
  function calculateRateLimitWait() {
    if (rateLimitReset !== null) {
      const waitMs = (rateLimitReset * 1000) - Date.now();
      return Math.max(waitMs, 1000); // At least 1 second
    }
    return 5000; // Default 5 seconds if no reset header
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  function calculateBackoffDelay(attempt) {
    const delay = Math.pow(retryBackoffBase, attempt) * 1000;
    return Math.min(delay, retryBackoffMax * 1000);
  }

  /**
   * Make HTTP request to Recurly API
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} path - API path (e.g., /accounts)
   * @param {Object} [options={}] - Additional options
   * @param {Object} [options.body] - Request body for POST/PUT
   * @returns {Promise<Object>} Response with data and headers
   * @throws {Error} If request fails after retries
   */
  async function request(method, path, options = {}) {
    const url = new URL(path, baseURL);

    const headers = {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/vnd.recurly.v2021-02-25+json',
      'Content-Type': 'application/json'
    };

    // Add site targeting header if projectConfig is provided (Story 2.2)
    if (siteId) {
      headers['X-Recurly-Site'] = siteId;
    }

    const requestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers
    };

    let lastError = null;
    let rateLimitRetryCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check rate limit before making request
        const rateLimitDelay = calculateRateLimitDelay();
        if (rateLimitDelay > 0) {
          await sleep(rateLimitDelay);
        }

        const response = await makeHttpRequest(requestOptions, options.body);

        // Parse rate limit headers
        parseRateLimitHeaders(response.headers);

        // Handle 429 rate limit exceeded
        if (response.statusCode === 429) {
          rateLimitRetryCount++;

          // Prevent infinite loop - limit rate limit retries
          if (rateLimitRetryCount > MAX_RATE_LIMIT_RETRIES) {
            throw new Error(`Rate limit exceeded: max retries (${MAX_RATE_LIMIT_RETRIES}) reached after waiting for reset`);
          }

          const waitTime = calculateRateLimitWait();
          console.log(`Rate limit exceeded. Waiting before retry... (${rateLimitRetryCount}/${MAX_RATE_LIMIT_RETRIES})`);
          await sleep(waitTime);

          // Don't count this as a regular retry attempt
          attempt--;
          continue;
        }

        // Handle successful response
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return {
            data: response.body,
            headers: response.headers,
            statusCode: response.statusCode
          };
        }

        // Handle client errors (4xx) - don't retry except 429
        if (response.statusCode >= 400 && response.statusCode < 500) {
          const error = new Error(getErrorMessage(response.statusCode, response.body));
          error.statusCode = response.statusCode;
          error.body = response.body;
          throw error;
        }

        // Handle server errors (5xx) - retry with backoff
        if (response.statusCode >= 500) {
          lastError = new Error(`Server error ${response.statusCode}: ${JSON.stringify(response.body)}`);
          lastError.statusCode = response.statusCode;

          if (attempt < maxRetries) {
            const backoffDelay = calculateBackoffDelay(attempt);
            console.log(`Server error ${response.statusCode}. Retry ${attempt + 1}/${maxRetries}...`);
            await sleep(backoffDelay);
            continue;
          }
        }
      } catch (error) {
        lastError = error;

        // Network errors - retry with backoff
        if (isNetworkError(error) && attempt < maxRetries) {
          const backoffDelay = calculateBackoffDelay(attempt);
          console.log(`Network error. Retry ${attempt + 1}/${maxRetries}...`);
          await sleep(backoffDelay);
          continue;
        }

        // Non-retryable errors (4xx) - throw immediately
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        // Max retries exceeded for retryable errors
        if (attempt >= maxRetries) {
          throw error;
        }
      }
    }

    // Max retries exceeded
    throw lastError || new Error('Request failed after max retries');
  }

  /**
   * Make the actual HTTP request
   * @param {Object} options - HTTP request options
   * @param {Object} [body] - Request body
   * @returns {Promise<Object>} Response object
   */
  function makeHttpRequest(options, body) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          let parsedBody = null;
          if (data) {
            try {
              parsedBody = JSON.parse(data);
            } catch {
              parsedBody = data;
            }
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      // Set timeout (configurable, default 30s)
      req.setTimeout(requestTimeout);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Check if error is a network error
   * @param {Error} error - Error to check
   * @returns {boolean}
   */
  function isNetworkError(error) {
    const networkErrorCodes = ['ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE'];
    return networkErrorCodes.includes(error.code) || error.message === 'Request timeout';
  }

  /**
   * Get user-friendly error message for HTTP status codes
   * @param {number} statusCode - HTTP status code
   * @param {Object} body - Response body
   * @returns {string} Error message
   */
  function getErrorMessage(statusCode, body) {
    switch (statusCode) {
      case 401:
        return 'Invalid API key. Check your .env file.';
      case 403:
        return 'API key lacks required permissions.';
      case 404:
        return body?.error?.message || 'Resource not found.';
      default:
        return `Recurly API error ${statusCode}: ${JSON.stringify(body)}`;
    }
  }

  /**
   * Get current rate limit status
   * @returns {Object} Rate limit info
   */
  function getRateLimitStatus() {
    return {
      remaining: rateLimitRemaining,
      reset: rateLimitReset,
      resetDate: rateLimitReset ? new Date(rateLimitReset * 1000) : null
    };
  }

  /**
   * Get the configured site ID
   * @returns {string|null} Site ID or null if not configured
   */
  function getSiteId() {
    return siteId;
  }

  return {
    request,
    getRateLimitStatus,
    getSiteId
  };
}

module.exports = { createClient, sleep };
