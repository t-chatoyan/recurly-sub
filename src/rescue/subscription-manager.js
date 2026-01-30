/**
 * Subscription Manager Module
 * Handles assigning Rescue Plans to clients via Recurly API
 *
 * NFR Compliance:
 * - NFR-I1: Uses Recurly API v3
 * - NFR-I5: Handles response codes (201, 4xx, 5xx, 429)
 * - NFR-R1: Retry failed API calls (max 3 retries via client)
 * - NFR-R2: Exponential backoff (handled by client)
 * - NFR-R3: Retry logging handled by recurly-client.js
 * - NFR-R4: Mark client as FAILED after max retries
 * - NFR-R5: Continue to next client without crashing
 * - NFR-P1-P3: Rate limit monitoring (handled by client)
 *
 * Dry-Run Support:
 * - Skips actual subscription creation in dry-run mode
 * - Returns mock subscription object with __dryRun flag
 */

const { createLogger } = require('../ui/logger');
const { isDryRunMode, formatDryRunMessage, createMockSubscription } = require('./dry-run');

/**
 * Calculate trial end date
 * @param {number} trialDays - Number of trial days (0 = no trial, charge immediately)
 * @returns {string|null} ISO date string for trial end, or null if no trial
 * @throws {Error} If trialDays is not a valid non-negative number
 */
function calculateTrialEndDate(trialDays) {
  if (typeof trialDays !== 'number' || isNaN(trialDays) || trialDays < 0) {
    throw new Error('Trial days must be a non-negative number');
  }

  // trialDays = 0 means no trial, charge immediately
  if (trialDays === 0) {
    // Return current time to disable trial (Recurly starts billing immediately)
    return new Date().toISOString();
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
  return trialEndsAt.toISOString();
}

/**
 * Build subscription creation payload
 * @param {string} accountCode - Client account code
 * @param {string} planCode - Plan code (e.g., '4weeks-subscription')
 * @param {string} currency - ISO currency code
 * @param {number} [trialDays=1] - Trial duration in days
 * @returns {Object} Subscription payload for Recurly API
 * @throws {Error} If parameters are invalid
 */
function getSubscriptionPayload(accountCode, planCode, currency, trialDays = 1) {
  if (!accountCode || typeof accountCode !== 'string' || accountCode.trim() === '') {
    throw new Error('Account code must be a non-empty string');
  }

  if (!planCode || typeof planCode !== 'string' || planCode.trim() === '') {
    throw new Error('Plan code must be a non-empty string');
  }

  if (!currency || typeof currency !== 'string' || currency.trim() === '') {
    throw new Error('Currency must be a non-empty string');
  }

  const trimmedAccountCode = accountCode.trim();
  const trimmedPlanCode = planCode.trim();
  const trimmedCurrency = currency.trim().toUpperCase();

  return {
    plan_code: trimmedPlanCode,
    currency: trimmedCurrency,
    collection_method: 'automatic', // Real card charge for real refund capability
    trial_ends_at: calculateTrialEndDate(trialDays),
    tax_inclusive: true,
    account: {
      code: trimmedAccountCode
    }
  };
}

/**
 * Extract subscription ID from API response
 * Handles different response formats (uuid, id, or full object)
 * @param {Object} subscriptionData - Subscription data from API
 * @returns {string|null} Subscription ID or null if not found
 */
function extractSubscriptionId(subscriptionData) {
  if (!subscriptionData) return null;

  // Try uuid first (preferred for URLs)
  if (subscriptionData.uuid) return subscriptionData.uuid;

  // Try id
  if (subscriptionData.id) return subscriptionData.id;

  return null;
}

/**
 * Build Recurly subscription URL
 * @param {string} project - Project identifier
 * @param {string} subscriptionId - Subscription ID or uuid
 * @returns {string} Recurly subscription URL
 */
function buildSubscriptionUrl(project, subscriptionId) {
  if (!project || !subscriptionId) {
    return '';
  }
  return `https://app.recurly.com/go/${project}/subscriptions/${subscriptionId}`;
}

/**
 * Assign Rescue Plan to a client with trial period
 * In dry-run mode, skips actual API call and returns mock subscription
 * @param {Object} client - Recurly client instance
 * @param {string} accountCode - Client account code
 * @param {string} planCode - Rescue plan code (e.g., '4weeks-subscription')
 * @param {string} currency - ISO currency code
 * @param {Object} [options={}] - Options
 * @param {number} [options.trialDays=1] - Trial duration in days
 * @param {Object} [options.logger] - Logger instance (from createLogger)
 * @param {string} [options.project] - Project identifier for Recurly URLs
 * @returns {Promise<Object>} Created subscription object (or mock in dry-run mode)
 * @throws {Error} If assignment fails
 */
async function assignRescuePlan(client, accountCode, planCode, currency, options = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  const {
    trialDays = 1,
    logger = null,
    project = ''
  } = options;

  // Trim account code once at entry point
  const trimmedAccountCode = accountCode.trim();

  // Use provided logger or create a default one
  const log = logger || createLogger({ project });

  const payload = getSubscriptionPayload(trimmedAccountCode, planCode, currency, trialDays);

  // Dry-run mode: Skip actual assignment, return mock subscription
  if (isDryRunMode()) {
    const message = `✓ ${trimmedAccountCode} - Would be RESCUED with plan ${planCode}`;
    console.log(formatDryRunMessage(message));
    return createMockSubscription(trimmedAccountCode, planCode);
  }

  try {
    // Use POST /subscriptions endpoint (Recurly API v3)
    // The account is specified in the payload body via account.code
    const response = await client.request(
      'POST',
      '/subscriptions',
      { body: payload }
    );

    const subscription = response.data;
    const subscriptionId = extractSubscriptionId(subscription);

    // Log success with subscription URL (not account URL)
    const subscriptionUrl = buildSubscriptionUrl(project, subscriptionId);
    if (subscriptionUrl) {
      console.log(`✓ ${trimmedAccountCode} - RESCUED - ${subscriptionUrl}`);
    } else {
      log.logSuccess(trimmedAccountCode, subscriptionId);
    }

    return subscription;
  } catch (error) {
    // Log failure
    log.logFailure(trimmedAccountCode, error.message, {
      httpStatus: error.statusCode
    });

    // Create wrapped error to avoid mutating the original
    const wrappedError = new Error(`Failed to assign rescue plan to ${trimmedAccountCode}: ${error.message}`);
    wrappedError.cause = error;
    wrappedError.statusCode = error.statusCode;
    throw wrappedError;
  }
}

/**
 * Rescue a single client by assigning the Rescue Plan
 * This is a convenience wrapper that handles the full rescue flow for one client
 * @param {Object} client - Recurly client instance
 * @param {string} accountCode - Client account code
 * @param {string} planCode - Rescue plan code
 * @param {string} currency - ISO currency code
 * @param {Object} [options={}] - Options
 * @returns {Promise<Object>} Result object { status, accountCode, subscription?, error? }
 */
async function rescueClient(client, accountCode, planCode, currency, options = {}) {
  try {
    const subscription = await assignRescuePlan(client, accountCode, planCode, currency, options);
    return {
      status: 'RESCUED',
      accountCode,
      subscription
    };
  } catch (error) {
    // Try to extract transaction error details for better logging
    let declineReason = null;
    let declineCode = null;
    let requires3DS = false;
    try {
      // Parse error message to extract transaction_error
      const jsonMatch = error.message.match(/\{.*\}/s);
      if (jsonMatch) {
        const errorData = JSON.parse(jsonMatch[0]);
        if (errorData.error?.transaction_error) {
          const txError = errorData.error.transaction_error;
          declineCode = txError.code || txError.decline_code;
          declineReason = txError.merchant_advice || txError.message;
          requires3DS = declineCode === 'three_d_secure_action_required';

          if (requires3DS) {
            console.log(`⚠ ${accountCode} - REQUIRES 3DS - Manual intervention needed (customer must authenticate)`);
          } else {
            console.log(`✗ ${accountCode} - DECLINED: ${declineCode} - ${declineReason}`);
          }
        }
      }
    } catch (parseError) {
      // Ignore parsing errors
    }

    // NFR-R5: Return failure result instead of throwing
    return {
      status: requires3DS ? 'REQUIRES_3DS' : 'FAILED',
      accountCode,
      error: error.message,
      declineCode,
      declineReason,
      requires3DS
    };
  }
}

/**
 * Check if an error is retriable
 * Utility function for external consumers who need to implement custom retry logic.
 * Note: The recurly-client already handles retries internally.
 * @param {Error} error - Error to check
 * @returns {boolean} True if error should be retried
 */
function isRetriableError(error) {
  // Network errors
  const networkErrorCodes = ['ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE'];
  if (networkErrorCodes.includes(error.code)) {
    return true;
  }

  // 5xx server errors
  if (error.statusCode >= 500 && error.statusCode < 600) {
    return true;
  }

  // 429 rate limit
  if (error.statusCode === 429) {
    return true;
  }

  // All other errors (4xx client errors) are not retriable
  return false;
}

/**
 * Get invoices for a subscription
 * @param {Object} client - Recurly client instance
 * @param {string} subscriptionId - Subscription ID (uuid format)
 * @returns {Promise<Array>} List of invoices with their details
 */
async function getSubscriptionInvoices(client, subscriptionId) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!subscriptionId) {
    return [];
  }

  // Format subscription ID for API (add uuid- prefix if needed)
  let formattedId = subscriptionId;
  if (/^[a-f0-9]{32}$/i.test(subscriptionId)) {
    formattedId = `uuid-${subscriptionId}`;
  }

  try {
    const response = await client.request(
      'GET',
      `/subscriptions/${encodeURIComponent(formattedId)}/invoices?limit=10`
    );

    const invoices = response.data?.data || [];

    // Extract relevant info from each invoice
    return invoices.map(invoice => ({
      invoice_id: invoice.uuid || invoice.id,
      invoice_number: invoice.number,
      type: invoice.type,
      state: invoice.state,
      total: invoice.total,
      paid: invoice.paid,
      balance: invoice.balance,
      created_at: invoice.created_at,
      // Include line items summary
      line_items_count: invoice.line_items?.length || 0,
      // Include transactions if available
      transactions: (invoice.transactions || []).map(tx => ({
        transaction_id: tx.uuid || tx.id,
        type: tx.type,
        status: tx.status,
        amount: tx.amount,
        created_at: tx.created_at
      }))
    }));
  } catch (error) {
    // If we can't get invoices, return empty array (non-fatal)
    console.warn(`Warning: Could not fetch invoices for subscription ${subscriptionId}: ${error.message}`);
    return [];
  }
}

/**
 * Get account line items (charges/credits)
 * @param {Object} client - Recurly client instance
 * @param {string} accountCode - Account code
 * @param {string} [sinceTime] - Only get items created after this time
 * @returns {Promise<Array>} List of line items
 */
async function getAccountLineItems(client, accountCode, sinceTime) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!accountCode) {
    return [];
  }

  try {
    let url = `/accounts/code-${encodeURIComponent(accountCode)}/line_items?limit=50`;
    if (sinceTime) {
      url += `&begin_time=${encodeURIComponent(sinceTime)}`;
    }

    const response = await client.request('GET', url);
    const lineItems = response.data?.data || [];

    return lineItems.map(item => ({
      line_item_id: item.uuid || item.id,
      type: item.type,
      state: item.state,
      description: item.description,
      amount: item.amount,
      quantity: item.quantity,
      created_at: item.created_at,
      invoice_id: item.invoice?.id
    }));
  } catch (error) {
    console.warn(`Warning: Could not fetch line items for account ${accountCode}: ${error.message}`);
    return [];
  }
}

/**
 * Get invoices for an account
 * @param {Object} client - Recurly client instance
 * @param {string} accountCode - Account code
 * @returns {Promise<Array>} List of invoices with their details
 */
async function getAccountInvoices(client, accountCode) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!accountCode) {
    return [];
  }

  try {
    const response = await client.request(
      'GET',
      `/accounts/code-${encodeURIComponent(accountCode)}/invoices?limit=50`
    );

    const invoices = response.data?.data || [];

    // Extract relevant info from each invoice
    return invoices.map(invoice => ({
      invoice_id: invoice.uuid || invoice.id,
      invoice_number: invoice.number,
      type: invoice.type,
      state: invoice.state,
      total: invoice.total,
      paid: invoice.paid,
      balance: invoice.balance,
      created_at: invoice.created_at
    }));
  } catch (error) {
    // If we can't get invoices, return empty array (non-fatal)
    console.warn(`Warning: Could not fetch invoices for account ${accountCode}: ${error.message}`);
    return [];
  }
}

module.exports = {
  calculateTrialEndDate,
  getSubscriptionPayload,
  extractSubscriptionId,
  buildSubscriptionUrl,
  assignRescuePlan,
  rescueClient,
  isRetriableError,
  getSubscriptionInvoices,
  getAccountInvoices,
  getAccountLineItems
};
