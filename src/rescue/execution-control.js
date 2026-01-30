/**
 * Execution Control Module
 * Handles confirmation intervals and graceful stop during batch rescue operations
 *
 * Features:
 * - Confirmation prompts at configurable intervals
 * - Graceful stop with state preservation
 * - No-confirm mode for continuous execution
 * - Default interval of 100 clients
 */

const readline = require('readline');

/**
 * Get confirmation interval based on CLI options
 * @param {Object} options - Parsed CLI options
 * @param {boolean} [options.noConfirm] - True if --no-confirm flag set
 * @param {number} [options.confirmEvery] - Confirmation interval from --confirm-every
 * @returns {number|null} Interval (null means no confirmations)
 */
function getConfirmationInterval(options = {}) {
  // --no-confirm takes precedence
  if (options.noConfirm) {
    return null;
  }

  // --confirm-every if provided
  if (options.confirmEvery && typeof options.confirmEvery === 'number' && options.confirmEvery > 0) {
    return options.confirmEvery;
  }

  // Default: confirm every 100 clients
  return 100;
}

/**
 * Check if should pause for confirmation
 * @param {number} currentIndex - Current position (0-based)
 * @param {number|null} interval - Confirmation interval (null = never pause)
 * @param {number} [totalCount] - Total number of items (optional, to avoid prompting at end)
 * @returns {boolean} True if should pause
 */
function shouldPauseForConfirmation(currentIndex, interval, totalCount = null) {
  // Never pause if interval is null (--no-confirm)
  if (interval === null) {
    return false;
  }

  // Calculate processed count (1-based for user)
  const processedCount = currentIndex + 1;

  // Don't pause if this is the last item
  if (totalCount !== null && processedCount >= totalCount) {
    return false;
  }

  // Pause after every 'interval' clients
  return processedCount % interval === 0;
}

/**
 * Prompt user to continue or stop
 * @param {number} processedCount - Number of clients processed so far
 * @param {number} totalCount - Total number of clients to process
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log=console.log] - Log function for messages
 * @returns {Promise<boolean>} True to continue, false to stop
 */
async function promptContinue(processedCount, totalCount, options = {}) {
  const { log = console.log } = options;

  // Validate inputs
  const safeProcessed = typeof processedCount === 'number' && processedCount >= 0 ? processedCount : 0;
  const safeTotal = typeof totalCount === 'number' && totalCount >= 0 ? totalCount : 0;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let answered = false;

  return new Promise((resolve) => {
    rl.question(
      `Processed ${safeProcessed}/${safeTotal}. Continue? (y/n) `,
      (answer) => {
        answered = true;
        rl.close();

        const normalizedAnswer = (answer || '').trim().toLowerCase();

        if (normalizedAnswer === 'y' || normalizedAnswer === 'yes') {
          log('Continuing...');
          resolve(true);
        } else if (normalizedAnswer === 'n' || normalizedAnswer === 'no') {
          resolve(false);
        } else {
          // Invalid input - default to continue for safety
          log(`Invalid input '${answer}'. Defaulting to 'y' (continue).`);
          resolve(true);
        }
      }
    );

    // Handle Ctrl+C or unexpected close (resolve false to stop gracefully)
    rl.on('close', () => {
      if (!answered) {
        resolve(false);
      }
    });
  });
}

/**
 * Display graceful stop message
 * @param {Object} stats - Execution statistics
 * @param {number} stats.processedCount - Clients processed so far
 * @param {number} stats.successCount - Clients successfully rescued
 * @param {number} stats.failedCount - Clients that failed
 * @param {number} stats.totalCount - Total clients in batch
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log=console.log] - Log function
 */
function displayStopMessage(stats, options = {}) {
  const { log = console.log } = options;
  const { processedCount, successCount, failedCount, totalCount } = stats;
  const remainingCount = totalCount - processedCount;

  const separator = '='.repeat(60);
  log('');
  log(separator);
  log('EXECUTION STOPPED BY USER');
  log(separator);
  log(`Processed: ${processedCount}/${totalCount} clients`);
  log(`  Success: ${successCount}`);
  log(`  Failed: ${failedCount}`);
  log(`  Remaining: ${remainingCount}`);
  log('');
  log('State has been saved. Use --resume to continue later.');
  log(separator);
}

/**
 * Display confirmation info at start of batch
 * @param {number|null} interval - Confirmation interval
 * @param {number} totalCount - Total clients to process
 * @param {Object} [options={}] - Options
 * @param {Function} [options.log=console.log] - Log function
 */
function displayConfirmationInfo(interval, totalCount, options = {}) {
  const { log = console.log } = options;

  // Handle edge cases
  if (totalCount <= 0) {
    log('Mode: No clients to process');
    return;
  }

  if (interval === null) {
    log('Mode: Continuous (--no-confirm)');
  } else {
    // Subtract 1 because we don't pause at the last item
    const confirmationCount = Math.floor((totalCount - 1) / interval);
    if (confirmationCount > 0) {
      log(`Mode: Confirmation every ${interval} clients (${confirmationCount} pause(s) expected)`);
    } else {
      log(`Mode: No confirmations needed (${totalCount} clients < interval ${interval})`);
    }
  }
}

/**
 * Create an execution controller for batch processing
 * @param {Object} options - Options
 * @param {number|null} options.interval - Confirmation interval
 * @param {number} options.totalCount - Total items to process
 * @param {Function} [options.log=console.log] - Log function
 * @returns {Object} Controller with checkPause and stop methods
 */
function createExecutionController(options = {}) {
  const { interval, totalCount, log = console.log } = options;
  let stopped = false;
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;

  return {
    /**
     * Update counts after processing an item
     * @param {boolean} success - Whether the item was processed successfully
     */
    recordResult(success) {
      processedCount++;
      if (success) {
        successCount++;
      } else {
        failedCount++;
      }
    },

    /**
     * Check if should pause and prompt user
     * @param {number} currentIndex - Current 0-based index
     * @returns {Promise<boolean>} True to continue, false to stop
     */
    async checkPause(currentIndex) {
      if (stopped) {
        return false;
      }

      if (shouldPauseForConfirmation(currentIndex, interval, totalCount)) {
        const shouldContinue = await promptContinue(processedCount, totalCount, { log });
        if (!shouldContinue) {
          stopped = true;
          displayStopMessage(
            { processedCount, successCount, failedCount, totalCount },
            { log }
          );
          return false;
        }
      }
      return true;
    },

    /**
     * Get current statistics
     * @returns {Object} Current stats
     */
    getStats() {
      return { processedCount, successCount, failedCount, totalCount, stopped };
    },

    /**
     * Check if execution was stopped by user
     * @returns {boolean} True if stopped
     */
    isStopped() {
      return stopped;
    }
  };
}

module.exports = {
  getConfirmationInterval,
  shouldPauseForConfirmation,
  promptContinue,
  displayStopMessage,
  displayConfirmationInfo,
  createExecutionController
};
