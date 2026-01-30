/**
 * Seed Plan Manager Module
 * Handles finding or creating Seed Plans in Recurly for test data generation
 *
 * Creates a monthly plan at 39.90 price for seeding subscriptions
 * Supports multi-currency by creating pricing for all required currencies
 */

const { ALLOWED_CURRENCIES } = require('./random');

// Seed plan configuration
const SEED_PLAN_CODE = 'seed-plan-3990';
const SEED_PLAN_NAME = 'Seed Plan (39.90/month)';
const SEED_PLAN_PRICE = 39.90;

/**
 * Get the seed plan code
 * @returns {string} Seed plan code
 */
function getSeedPlanCode() {
  return SEED_PLAN_CODE;
}

/**
 * Build seed plan creation payload with pricing for specified currencies
 * @param {string[]} currencies - Array of currency codes to support
 * @returns {Object} Plan creation payload for Recurly API
 * @throws {Error} If currencies is empty or invalid
 */
function buildSeedPlanPayload(currencies) {
  if (!Array.isArray(currencies) || currencies.length === 0) {
    throw new Error('At least one currency is required');
  }

  // Validate currencies
  for (const currency of currencies) {
    if (typeof currency !== 'string' || currency.trim() === '') {
      throw new Error('Currency must be a non-empty string');
    }
  }

  // Build currency pricing array
  const currencyPricing = currencies.map(currency => ({
    currency: currency.toUpperCase(),
    setup_fee: 0,
    unit_amount: SEED_PLAN_PRICE
  }));

  return {
    code: SEED_PLAN_CODE,
    name: SEED_PLAN_NAME,
    interval_unit: 'months',
    interval_length: 1,
    currencies: currencyPricing
  };
}

/**
 * Check if a plan exists by plan code
 * @param {Object} client - Recurly client instance
 * @param {string} planCode - Plan code to check
 * @returns {Promise<Object|null>} Plan object if found, null if not found
 * @throws {Error} If API error (other than 404)
 */
async function getPlanByCode(client, planCode) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  // Use code-{plan_code} format for path parameter
  const planId = `code-${planCode}`;

  try {
    const response = await client.request('GET', `/plans/${encodeURIComponent(planId)}`);
    return response.data;
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a plan by plan code
 * @param {Object} client - Recurly client instance
 * @param {string} planCode - Plan code to delete
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deletePlan(client, planCode) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  const planId = `code-${planCode}`;

  try {
    await client.request('DELETE', `/plans/${encodeURIComponent(planId)}`);
    return true;
  } catch (error) {
    if (error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Create a new Seed Plan via Recurly API
 * Handles race conditions by treating 409/422 "already exists" errors gracefully
 * @param {Object} client - Recurly client instance
 * @param {string[]} currencies - Currencies to support
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log] - Logger function (default: console.log)
 * @param {boolean} [options.dryRun=false] - If true, skip actual API call
 * @returns {Promise<Object>} Created plan object
 * @throws {Error} If plan creation fails (except when plan already exists)
 */
async function createSeedPlan(client, currencies, options = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  const log = options.log || console.log;
  const dryRun = options.dryRun || false;
  const payload = buildSeedPlanPayload(currencies);

  // Dry-run mode: Skip actual creation
  if (dryRun) {
    log(`[DRY-RUN] Would create Seed Plan: ${payload.code} with currencies: ${currencies.join(', ')}`);
    return {
      code: payload.code,
      name: payload.name,
      state: 'active',
      currencies: payload.currencies,
      __dryRun: true
    };
  }

  try {
    const response = await client.request('POST', '/plans', { body: payload });
    const plan = response.data;

    log(`Created Seed Plan: ${payload.code} with currencies: ${currencies.join(', ')}`);

    return plan;
  } catch (error) {
    // Handle race condition: plan was created by concurrent request
    // Recurly returns 422 with "has already been taken" for duplicate codes
    if (error.statusCode === 422 && error.message && error.message.includes('already been taken')) {
      log(`Seed Plan already exists: ${payload.code}`);
      // Try to fetch the existing plan
      try {
        const existingPlan = await getPlanByCode(client, payload.code);
        if (existingPlan) {
          return existingPlan;
        }
      } catch (fetchError) {
        // Ignore fetch error - we know the plan exists
      }
      // Return minimal plan object
      return { code: payload.code, name: payload.name, state: 'active' };
    }

    // Add context to error
    error.message = `Failed to create Seed Plan ${payload.code}: ${error.message}`;
    throw error;
  }
}

/**
 * Add a currency pricing to an existing plan
 * @param {Object} client - Recurly client instance
 * @param {string} planCode - Plan code
 * @param {string} currency - Currency to add
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log] - Logger function
 * @param {boolean} [options.dryRun=false] - If true, skip actual API call
 * @returns {Promise<Object>} Created pricing object
 */
async function addPlanCurrency(client, planCode, currency, options = {}) {
  const log = options.log || console.log;
  const dryRun = options.dryRun || false;

  const payload = {
    currency: currency.toUpperCase(),
    unit_amount: SEED_PLAN_PRICE,
    setup_fee: 0
  };

  if (dryRun) {
    log(`[DRY-RUN] Would add ${currency} pricing to plan ${planCode}`);
    return { ...payload, __dryRun: true };
  }

  // Use code-{plan_code} format for path parameter (same as accounts)
  const planId = `code-${planCode}`;

  try {
    const response = await client.request('POST', `/plans/${encodeURIComponent(planId)}/currencies`, {
      body: payload
    });
    log(`Added ${currency} pricing to plan ${planCode}`);
    return response.data;
  } catch (error) {
    // Handle already exists case
    if (error.statusCode === 422 && error.message && error.message.includes('already been taken')) {
      log(`Currency ${currency} already exists on plan ${planCode}`);
      return payload;
    }
    throw error;
  }
}

/**
 * Ensure all required currencies exist on a plan
 * @param {Object} client - Recurly client instance
 * @param {string} planCode - Plan code
 * @param {string[]} requiredCurrencies - Currencies that must exist
 * @param {Object} [options={}] - Options
 * @returns {Promise<void>}
 */
async function ensurePlanCurrencies(client, planCode, requiredCurrencies, options = {}) {
  const log = options.log || console.log;
  const dryRun = options.dryRun || false;

  // Always try to add each currency - the API will return 422 if it already exists
  for (const currency of requiredCurrencies) {
    try {
      await addPlanCurrency(client, planCode, currency, { log, dryRun });
    } catch (error) {
      // Log but don't fail - currency might already exist
      log(`Note: Could not add ${currency} to plan: ${error.message}`);
    }
  }
}

/**
 * Find or create a Seed Plan for the given currencies
 * If plan exists but is missing currencies, delete and recreate with all currencies
 * @param {Object} client - Recurly client instance
 * @param {string[]} currencies - Currencies to support (e.g., ['EUR', 'CHF', 'USD', 'GBP', 'CAD'])
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log] - Logger function (default: console.log)
 * @param {boolean} [options.dryRun=false] - If true, skip actual API calls for creation
 * @returns {Promise<Object>} Plan object from Recurly API
 * @throws {Error} If plan cannot be found or created
 */
async function findOrCreateSeedPlan(client, currencies, options = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!Array.isArray(currencies) || currencies.length === 0) {
    throw new Error('At least one currency is required');
  }

  const log = options.log || console.log;
  const dryRun = options.dryRun || false;
  const planCode = getSeedPlanCode();

  // Try to find existing plan
  let plan = await getPlanByCode(client, planCode);

  if (plan) {
    // Check if plan has all required currencies
    const existingCurrencies = (plan.currencies || []).map(c => c.currency.toUpperCase());
    const missingCurrencies = currencies.filter(c => !existingCurrencies.includes(c.toUpperCase()));

    if (missingCurrencies.length > 0) {
      log(`Plan ${planCode} is missing currencies: ${missingCurrencies.join(', ')}`);
      log(`Deleting and recreating plan with all currencies...`);

      if (!dryRun) {
        await deletePlan(client, planCode);
      } else {
        log(`[DRY-RUN] Would delete plan ${planCode}`);
      }

      // Create new plan with all currencies
      plan = await createSeedPlan(client, currencies, { log, dryRun });
    } else {
      log(`Found existing Seed Plan: ${planCode} (has all required currencies)`);
    }
  } else {
    // Plan doesn't exist, create it
    log(`Seed Plan not found, creating: ${planCode}`);
    plan = await createSeedPlan(client, currencies, { log, dryRun });
  }

  return plan;
}

/**
 * Get all allowed currencies for multi-currency mode
 * @returns {string[]} Array of allowed currency codes
 */
function getAllowedCurrencies() {
  return [...ALLOWED_CURRENCIES];
}

module.exports = {
  getSeedPlanCode,
  buildSeedPlanPayload,
  getPlanByCode,
  deletePlan,
  createSeedPlan,
  addPlanCurrency,
  ensurePlanCurrencies,
  findOrCreateSeedPlan,
  getAllowedCurrencies,
  SEED_PLAN_CODE,
  SEED_PLAN_NAME,
  SEED_PLAN_PRICE
};
