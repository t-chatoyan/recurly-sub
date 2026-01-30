/**
 * Rescue Plan Manager Module
 * Handles finding or creating Rescue Plans in Recurly
 *
 * NFR Compliance:
 * - NFR-I1: Uses Recurly API v3
 * - NFR-I5: Handles response codes (200/201, 404, 429, 5xx)
 * - NFR-R1: Retry failed API calls (max 3 retries via client)
 * - NFR-R2: Exponential backoff (handled by client)
 * - NFR-R3: Log each retry attempt
 * - NFR-P1-P3: Rate limit monitoring (handled by client)
 *
 * Dry-Run Support:
 * - READ operations (getPlanByCode) execute normally
 * - WRITE operations (createRescuePlan) are skipped in dry-run mode
 */

const { isDryRunMode, formatDryRunMessage, createMockPlan } = require('./dry-run');

// Supported currencies for multi-currency rescue plan
// Note: Must match currencies enabled on the Recurly site
const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD'];

// Single rescue plan code (multi-currency)
const RESCUE_PLAN_CODE = process.env.RESCUE_PLAN_CODE || '4weeks-subscription';
const RESCUE_PLAN_NAME = process.env.RESCUE_PLAN_NAME || '4 reports every 4 weeks';

/**
 * Validate and normalize currency parameter
 * @param {string} currency - Currency to validate
 * @returns {string} Trimmed currency string
 * @throws {Error} If currency is invalid
 */
function validateCurrency(currency) {
  if (!currency || typeof currency !== 'string') {
    throw new Error('Currency must be a non-empty string');
  }

  const trimmed = currency.trim();
  if (trimmed === '') {
    throw new Error('Currency must be a non-empty string');
  }

  return trimmed;
}

/**
 * Generate rescue plan code for currency
 * @param {string} currency - ISO currency code (e.g., 'EUR', 'USD')
 * @returns {string} Plan code (e.g., '4weeks-subscription-eur')
 * @throws {Error} If currency is invalid
 */
function getRescuePlanCode(currency) {
  const trimmed = validateCurrency(currency);
  return `${RESCUE_PLAN_CODE}`;
}

/**
 * Generate rescue plan name for currency
 * @param {string} currency - ISO currency code
 * @returns {string} Plan name (e.g., 'Rescue Plan (EUR)')
 * @throws {Error} If currency is invalid
 */
function getRescuePlanName(currency) {
  const trimmed = validateCurrency(currency);
  return `Rescue Plan (${trimmed.toUpperCase()})`;
}

// Currency-specific unit amounts for rescue plan
// Prices per 28-day interval
const CURRENCY_UNIT_AMOUNTS = {
  EUR: 24.95,
  USD: 29.99,
  GBP: 24.95,
  CAD: 29.99,
  CHF: 24.95
};

// Default price for rescue plan (fallback for unsupported currencies)
const DEFAULT_UNIT_AMOUNT = 29.90;

/**
 * Get unit amount for a specific currency
 * @param {string} currency - ISO currency code
 * @param {number} [overrideAmount] - Optional override amount
 * @returns {number} Unit amount for the currency
 */
function getUnitAmountForCurrency(currency, overrideAmount) {
  if (overrideAmount !== undefined && overrideAmount !== null) {
    return overrideAmount;
  }
  
  const normalizedCurrency = currency.toUpperCase();
  return CURRENCY_UNIT_AMOUNTS[normalizedCurrency] ?? DEFAULT_UNIT_AMOUNT;
}

/**
 * Build plan creation payload
 * @param {string} currency - ISO currency code
 * @param {Object} [options={}] - Options
 * @param {number} [options.unitAmount] - Price for the plan (overrides currency default)
 * @returns {Object} Plan creation payload for Recurly API
 * @throws {Error} If currency is invalid
 */
function buildPlanPayload(currency, options = {}) {
  const { unitAmount } = options;
  const trimmed = validateCurrency(currency);
  const planCode = getRescuePlanCode(trimmed);
  const planName = getRescuePlanName(trimmed);
  const normalizedCurrency = trimmed.toUpperCase();
  const amount = getUnitAmountForCurrency(normalizedCurrency, unitAmount);
console.log('amount::::::::::::', amount);
  return {
    code: planCode,
    name: planName,
    interval_length: 28,
    interval_unit: 'days',
    currencies: [
      {
        currency: normalizedCurrency,
        setup_fee: 0,
        unit_amount: amount
      }
    ]
  };
}

/**
 * Build multi-currency plan creation payload
 * Creates a single plan that supports all currencies
 * Each currency uses its currency-specific unit amount
 * @param {string[]} [currencies=SUPPORTED_CURRENCIES] - Array of currency codes
 * @param {Object} [options={}] - Options
 * @param {Object<string, number>} [options.unitAmounts] - Currency-specific amounts (e.g., { EUR: 25.00, USD: 30.00 })
 * @param {number} [options.unitAmount] - Override amount for all currencies (if provided, overrides currency-specific amounts)
 * @returns {Object} Plan creation payload for Recurly API
 */
function buildMultiCurrencyPlanPayload(currencies = SUPPORTED_CURRENCIES, options = {}) {
  const { unitAmount, unitAmounts = {} } = options;
  
  return {
    code: RESCUE_PLAN_CODE,
    name: RESCUE_PLAN_NAME,
    interval_length: 28,
    interval_unit: 'days',
    currencies: currencies.map(currency => {
      const normalizedCurrency = currency.toUpperCase();
      // If global unitAmount is provided, use it for all currencies
      // Otherwise, check for currency-specific override, then use currency default
      const amount = unitAmount !== undefined && unitAmount !== null
        ? unitAmount
        : getUnitAmountForCurrency(normalizedCurrency, unitAmounts[normalizedCurrency]);
      return {
        currency: normalizedCurrency,
        setup_fee: 0,
        unit_amount: amount
      };
    })
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

  try {
    const response = await client.request('GET', `/plans/code-${encodeURIComponent(planCode)}`);
    return response.data;
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Create a new Rescue Plan via Recurly API
 * Handles race conditions by treating 409/422 "already exists" errors gracefully
 * In dry-run mode, skips actual API call and returns mock plan
 * @param {Object} client - Recurly client instance
 * @param {string} currency - ISO currency code
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log] - Logger function (default: console.log)
 * @param {number} [options.unitAmount] - Price for the plan (overrides currency default)
 * @returns {Promise<Object>} Created plan object (or mock in dry-run mode)
 * @throws {Error} If plan creation fails (except when plan already exists)
 */
async function createRescuePlan(client, currency, options = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  const { log = console.log, unitAmount } = options;
  const payload = buildPlanPayload(currency, { unitAmount });

  // Dry-run mode: Skip actual creation, return mock plan
  if (isDryRunMode()) {
    log(formatDryRunMessage(`Would create Rescue Plan: ${payload.code}`));
    return createMockPlan(currency);
  }

  try {
    const response = await client.request('POST', '/plans', { body: payload });
    const plan = response.data;

    log(`Created Rescue Plan: ${payload.code}`);

    return plan;
  } catch (error) {
    // Handle race condition: plan was created by concurrent request
    // Recurly returns 422 with "has already been taken" for duplicate codes
    if (error.statusCode === 422 && error.message && error.message.includes('already been taken')) {
      log(`Rescue Plan already exists: ${payload.code}`);
      // Try to fetch the existing plan, but if that fails too, return a minimal plan object
      // (the plan exists per the API, we just can't fetch it - eventual consistency)
      try {
        const existingPlan = await getPlanByCode(client, payload.code);
        if (existingPlan) {
          return existingPlan;
        }
      } catch (fetchError) {
        // Ignore fetch error - we know the plan exists
      }
      // Return minimal plan object - we know it exists because API said "already taken"
      return { code: payload.code, name: payload.name, state: 'active' };
    }

    // Add context to error
    error.message = `Failed to create Rescue Plan ${payload.code}: ${error.message}`;
    throw error;
  }
}

/**
 * Find or create a Rescue Plan for the given currency
 * Thread-safe: handles race conditions when multiple calls attempt creation
 * @param {Object} client - Recurly client instance
 * @param {string} currency - ISO currency code (e.g., 'EUR', 'USD')
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log] - Logger function (default: console.log)
 * @param {number} [options.unitAmount] - Price for the plan (overrides currency default)
 * @returns {Promise<Object>} Plan object from Recurly API
 * @throws {Error} If plan cannot be found or created
 */
async function findOrCreateRescuePlan(client, currency, options = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  const trimmed = validateCurrency(currency);
  const { log = console.log, unitAmount } = options;
  const planCode = getRescuePlanCode(trimmed);

  // Try to find existing plan
  const existingPlan = await getPlanByCode(client, planCode);

  if (existingPlan) {
    log(`Found existing Rescue Plan: ${planCode}`);
    return existingPlan;
  }

  // Plan doesn't exist, create it
  log(`Rescue Plan not found, creating: ${planCode}`);
  return await createRescuePlan(client, trimmed, { log, unitAmount });
}

/**
 * Find or create a single multi-currency Rescue Plan
 * Creates one plan that supports all currencies (EUR, USD, GBP, CAD, CHF)
 * Thread-safe: handles race conditions when multiple calls attempt creation
 * @param {Object} client - Recurly client instance
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log] - Logger function (default: console.log)
 * @param {number} [options.unitAmount=39.90] - Price for the plan
 * @returns {Promise<Object>} Plan object from Recurly API
 * @throws {Error} If plan cannot be found or created
 */
async function findOrCreateMultiCurrencyRescuePlan(client, options = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  const { log = console.log, unitAmount } = options;

  // Try to find existing plan
  const existingPlan = await getPlanByCode(client, RESCUE_PLAN_CODE);

  if (existingPlan) {
    log(`Found existing Rescue Plan: ${RESCUE_PLAN_CODE}`);
    return existingPlan;
  }

  // Plan doesn't exist, create it with all supported currencies
  log(`Rescue Plan not found, creating: ${RESCUE_PLAN_CODE} (currencies: ${SUPPORTED_CURRENCIES.join(', ')})`);

  const payload = buildMultiCurrencyPlanPayload(SUPPORTED_CURRENCIES, { unitAmount });

  // Dry-run mode: Skip actual creation, return mock plan
  if (isDryRunMode()) {
    log(formatDryRunMessage(`Would create Rescue Plan: ${payload.code}`));
    return { code: RESCUE_PLAN_CODE, name: RESCUE_PLAN_NAME, state: 'active' };
  }

  try {
    const response = await client.request('POST', '/plans', { body: payload });
    const plan = response.data;
    log(`Created Rescue Plan: ${payload.code}`);
    return plan;
  } catch (error) {
    // Handle race condition: plan was created by concurrent request
    if (error.statusCode === 422 && error.message && error.message.includes('already been taken')) {
      log(`Rescue Plan already exists: ${payload.code}`);
      try {
        const fetchedPlan = await getPlanByCode(client, RESCUE_PLAN_CODE);
        if (fetchedPlan) {
          return fetchedPlan;
        }
      } catch (fetchError) {
        // Ignore fetch error - we know the plan exists
      }
      return { code: RESCUE_PLAN_CODE, name: RESCUE_PLAN_NAME, state: 'active' };
    }

    error.message = `Failed to create Rescue Plan ${payload.code}: ${error.message}`;
    throw error;
  }
}

module.exports = {
  validateCurrency,
  getRescuePlanCode,
  getRescuePlanName,
  getUnitAmountForCurrency,
  buildPlanPayload,
  buildMultiCurrencyPlanPayload,
  getPlanByCode,
  createRescuePlan,
  findOrCreateRescuePlan,
  findOrCreateMultiCurrencyRescuePlan,
  RESCUE_PLAN_CODE,
  SUPPORTED_CURRENCIES,
  CURRENCY_UNIT_AMOUNTS,
  DEFAULT_UNIT_AMOUNT
};
