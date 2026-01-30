/**
 * Seed Subscription Manager Module
 * Handles creating subscriptions for seeded accounts
 *
 * Uses collection_method=manual to avoid billing info requirements
 */

/**
 * Build subscription creation payload for seeded account
 * @param {string} accountCode - Account code
 * @param {string} planCode - Plan code (e.g., 'seed-plan-3990')
 * @param {string} currency - ISO currency code
 * @returns {Object} Subscription payload for Recurly API
 * @throws {Error} If parameters are invalid
 */
function buildSubscriptionPayload(accountCode, planCode, currency) {
  if (!accountCode || typeof accountCode !== 'string' || accountCode.trim() === '') {
    throw new Error('Account code must be a non-empty string');
  }

  if (!planCode || typeof planCode !== 'string' || planCode.trim() === '') {
    throw new Error('Plan code must be a non-empty string');
  }

  if (!currency || typeof currency !== 'string' || currency.trim() === '') {
    throw new Error('Currency must be a non-empty string');
  }

  return {
    plan_code: planCode.trim(),
    currency: currency.trim().toUpperCase(),
    collection_method: 'manual', // Avoid billing info requirements
    account: {
      code: accountCode.trim()
    }
  };
}

/**
 * Create a subscription for a seeded account
 * @param {Object} client - Recurly client instance
 * @param {Object} params - Subscription parameters
 * @param {string} params.accountCode - Account code
 * @param {string} params.planCode - Plan code
 * @param {string} params.currency - Currency code
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log] - Logger function (default: console.log)
 * @param {boolean} [options.dryRun=false] - If true, skip actual API call
 * @returns {Promise<Object>} Created subscription object
 * @throws {Error} If subscription creation fails
 */
async function createSubscription(client, params, options = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  const { accountCode, planCode, currency } = params;
  const log = options.log || console.log;
  const dryRun = options.dryRun || false;

  const payload = buildSubscriptionPayload(accountCode, planCode, currency);

  // Dry-run mode: Skip actual creation
  if (dryRun) {
    return {
      id: `dry-run-sub-${Date.now()}`,
      uuid: `dry-run-uuid-${Date.now()}`,
      plan: { code: planCode },
      account: { code: accountCode },
      currency: currency.toUpperCase(),
      state: 'active',
      collection_method: 'manual',
      __dryRun: true
    };
  }

  try {
    const response = await client.request('POST', '/subscriptions', { body: payload });
    return response.data;
  } catch (error) {
    // Add context to error
    error.message = `Failed to create subscription for account ${accountCode}: ${error.message}`;
    throw error;
  }
}

/**
 * Extract subscription ID from API response
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

module.exports = {
  buildSubscriptionPayload,
  createSubscription,
  extractSubscriptionId
};
