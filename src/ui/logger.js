/**
 * Action Logger Module
 * Provides structured logging for client operations with Unicode symbols
 *
 * Features:
 * - Success logs with ✓ checkmark
 * - Failure logs with ✗ cross
 * - Skip logs with ⊘ symbol
 * - Info logs with ℹ symbol
 * - Dry-run mode prefix
 * - Recurly URL generation
 * - Error message sanitization
 */

// Unicode symbols for visual feedback
const SYMBOLS = {
  SUCCESS: '✓',
  FAILURE: '✗',
  SKIP: '⊘',
  INFO: 'ℹ'
};

/**
 * Sanitize error message to remove sensitive data
 * @param {string} message - Error message to sanitize
 * @returns {string} Sanitized message
 */
function sanitizeErrorMessage(message) {
  if (!message) return 'Unknown error';

  let sanitized = message;

  // Remove anything that looks like an API key
  sanitized = sanitized.replace(/api[-_]?key[=:]\s*[^\s]+/gi, 'api_key=[REDACTED]');

  // Remove Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');

  // Remove Authorization headers
  sanitized = sanitized.replace(/Authorization[=:]\s*[^\s]+/gi, 'Authorization=[REDACTED]');

  // Remove passwords
  sanitized = sanitized.replace(/password[=:]\s*[^\s]+/gi, 'password=[REDACTED]');

  // Remove secrets
  sanitized = sanitized.replace(/secret[=:]\s*[^\s]+/gi, 'secret=[REDACTED]');

  // Remove generic tokens (not Bearer)
  sanitized = sanitized.replace(/token[=:]\s*[^\s]+/gi, 'token=[REDACTED]');

  // Remove credentials
  sanitized = sanitized.replace(/credential[s]?[=:]\s*[^\s]+/gi, 'credentials=[REDACTED]');

  return sanitized;
}

/**
 * Build Recurly console URL for an account
 * @param {string} project - Project identifier
 * @param {string} resourceType - Resource type (accounts, subscriptions, etc.)
 * @param {string} resourceId - Resource identifier
 * @returns {string} Full Recurly URL or empty string if can't build
 */
function buildRecurlyUrl(project, resourceType, resourceId) {
  if (!project || !resourceId) {
    return '';
  }
  // URL encode parameters to handle special characters safely
  const safeProject = encodeURIComponent(project);
  const safeResourceType = encodeURIComponent(resourceType);
  const safeResourceId = encodeURIComponent(resourceId);
  return `https://app.recurly.com/go/${safeProject}/${safeResourceType}/${safeResourceId}`;
}

/**
 * Truncate error message to max length
 * @param {string} message - Error message
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated message
 */
function truncateError(message, maxLength) {
  if (!message) return 'Unknown error';
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength - 3) + '...';
}

/**
 * Create a logger instance
 * @param {Object} options - Logger options
 * @param {boolean} [options.dryRun=false] - Whether in dry-run mode
 * @param {string} [options.project=''] - Recurly project identifier for URLs
 * @param {boolean} [options.verbose=false] - Enable verbose output
 * @returns {Object} Logger instance with log methods
 */
function createLogger(options = {}) {
  const { dryRun = false, project = '', verbose = false } = options;

  const prefix = dryRun ? '[DRY-RUN] ' : '';

  /**
   * Log successful operation
   * @param {string} clientId - Client/account identifier
   * @param {string} [subscriptionId] - New subscription ID (if available)
   */
  function logSuccess(clientId, subscriptionId = null) {
    const safeClientId = clientId || 'unknown';
    const url = buildRecurlyUrl(project, 'accounts', safeClientId);
    const subscriptionInfo = subscriptionId ? ` (sub: ${subscriptionId})` : '';
    const action = dryRun ? 'WOULD RESCUE' : 'RESCUED';
    const urlPart = url ? ` - ${url}` : '';

    console.log(`${prefix}${SYMBOLS.SUCCESS} ${safeClientId} - ${action}${subscriptionInfo}${urlPart}`);
  }

  /**
   * Log failed operation
   * @param {string} clientId - Client/account identifier
   * @param {string} errorReason - Reason for failure
   * @param {Object} [details] - Additional error details
   * @param {number} [details.retryCount] - Number of retries attempted
   * @param {number} [details.httpStatus] - HTTP status code
   */
  function logFailure(clientId, errorReason, details = {}) {
    const safeClientId = clientId || 'unknown';
    const sanitizedReason = sanitizeErrorMessage(errorReason);
    const truncatedReason = truncateError(sanitizedReason, 100);
    const action = dryRun ? 'WOULD FAIL' : 'FAILED';

    console.log(`${prefix}${SYMBOLS.FAILURE} ${safeClientId} - ${action} (${truncatedReason})`);

    // Only log specific expected properties from details (Issue #4 fix)
    if (verbose && typeof details.retryCount === 'number') {
      console.log(`   Retries attempted: ${details.retryCount}`);
    }
    if (verbose && typeof details.httpStatus === 'number') {
      console.log(`   HTTP Status: ${details.httpStatus}`);
    }
  }

  /**
   * Log skipped operation (for rollback)
   * @param {string} clientId - Client/account identifier
   * @param {string} reason - Reason for skipping
   */
  function logSkip(clientId, reason) {
    const safeClientId = clientId || 'unknown';
    const sanitizedReason = sanitizeErrorMessage(reason || 'no reason provided');
    console.log(`${prefix}${SYMBOLS.SKIP} ${safeClientId} - SKIPPED (${sanitizedReason})`);
  }

  /**
   * Log informational message
   * @param {string} message - Info message
   */
  function logInfo(message) {
    const sanitizedMessage = sanitizeErrorMessage(message || '');
    console.log(`${prefix}${SYMBOLS.INFO} ${sanitizedMessage}`);
  }

  return { logSuccess, logFailure, logSkip, logInfo, SYMBOLS };
}

module.exports = {
  createLogger,
  buildRecurlyUrl,
  truncateError,
  sanitizeErrorMessage,
  SYMBOLS
};
