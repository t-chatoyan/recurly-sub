/**
 * Dry-Run Mode Module
 * Provides utilities for simulating rescue operations without making real changes
 *
 * NFR Compliance:
 * - Allows READ operations (queries) to execute normally
 * - Skips WRITE operations (plan creation, subscription assignment)
 * - Clear indication of dry-run status in all output
 */

// Module-level state for dry-run mode
let dryRunMode = false;

/**
 * Enable or disable dry-run mode
 * @param {boolean} enabled - True to enable dry-run mode
 */
function setDryRunMode(enabled) {
  dryRunMode = !!enabled;
}

/**
 * Check if dry-run mode is active
 * @returns {boolean} True if in dry-run mode
 */
function isDryRunMode() {
  return dryRunMode;
}

/**
 * Format message with [DRY-RUN] prefix
 * @param {string} message - Message to format
 * @returns {string} Formatted message with prefix
 */
function formatDryRunMessage(message) {
  if (typeof message !== 'string') {
    message = String(message);
  }
  return `[DRY-RUN] ${message}`;
}

/**
 * Execute function or skip with message in dry-run mode
 * @param {Function} fn - Function to execute (if not dry-run)
 * @param {string} dryRunMessage - Message to log in dry-run mode
 * @param {any} mockReturnValue - Value to return in dry-run mode
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log=console.log] - Log function to use
 * @returns {Promise<any>} Function result or mock value
 */
async function withDryRun(fn, dryRunMessage, mockReturnValue = null, options = {}) {
  const { log = console.log } = options;

  if (isDryRunMode()) {
    log(formatDryRunMessage(dryRunMessage));
    return mockReturnValue;
  }
  return await fn();
}

/**
 * Create mock plan object for dry-run mode
 * @param {string} currency - Currency code
 * @returns {Object} Mock plan object with __dryRun flag
 */
function createMockPlan(currency) {
  if (!currency || typeof currency !== 'string') {
    throw new Error('Currency must be a non-empty string');
  }
  const upperCurrency = currency.trim().toUpperCase();
  const lowerCurrency = upperCurrency.toLowerCase();
  return {
    code: `4weeks-subscription`,
    name: `4 reports every 4 weeks`,
    currency: upperCurrency,
    __dryRun: true
  };
}

// Counter for unique mock subscription IDs
let mockSubscriptionCounter = 0;

/**
 * Create mock subscription object for dry-run mode
 * @param {string} accountCode - Client account code
 * @param {string} planCode - Plan code
 * @returns {Object} Mock subscription object with __dryRun flag
 */
function createMockSubscription(accountCode, planCode) {
  const timestamp = Date.now();
  const counter = ++mockSubscriptionCounter;
  const randomSuffix = Math.random().toString(36).substring(7);

  return {
    id: `sub_dryrun_${timestamp}_${counter}`,
    uuid: `dryrun-${timestamp}-${counter}-${randomSuffix}`,
    account: { code: accountCode },
    plan: { code: planCode },
    state: 'active',
    __dryRun: true
  };
}

/**
 * Display dry-run mode banner at start of execution
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log=console.log] - Log function to use
 */
function displayDryRunBanner(options = {}) {
  const { log = console.log } = options;

  if (!isDryRunMode()) return;

  const separator = '='.repeat(60);
  log(separator);
  log('DRY-RUN MODE: No changes will be made');
  log(separator);
  log('');
}

/**
 * Display dry-run mode summary at end of execution
 * @param {Object} stats - Rescue statistics
 * @param {number} stats.total - Total clients processed
 * @param {number} stats.rescued - Clients that would be rescued
 * @param {number} stats.failed - Clients that would fail
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log=console.log] - Log function to use
 */
function displayDryRunSummary(stats, options = {}) {
  const { log = console.log } = options;

  if (!isDryRunMode()) return;

  const separator = '='.repeat(60);
  log('');
  log(separator);
  log(`DRY-RUN SUMMARY: ${stats.total} clients processed`);
  log(`  Would be rescued: ${stats.rescued}`);
  log(`  Would fail: ${stats.failed}`);
  log('No actual changes were made.');
  log(separator);
  log('');
  log('Note: Output file NOT generated in dry-run mode');
}

/**
 * Check if results should be written to file
 * In dry-run mode, no output file should be generated
 * @returns {boolean} True if output file should be generated
 */
function shouldGenerateOutputFile() {
  return !isDryRunMode();
}

/**
 * Reset dry-run state (useful for tests)
 */
function resetDryRunState() {
  dryRunMode = false;
  mockSubscriptionCounter = 0;
}

module.exports = {
  setDryRunMode,
  isDryRunMode,
  formatDryRunMessage,
  withDryRun,
  createMockPlan,
  createMockSubscription,
  displayDryRunBanner,
  displayDryRunSummary,
  shouldGenerateOutputFile,
  resetDryRunState
};
