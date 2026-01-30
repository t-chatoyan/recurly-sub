/**
 * Progress Display Module
 * Provides real-time visual feedback for batch operations
 *
 * Features:
 * - Visual progress bar with filled/empty blocks
 * - Percentage and counter display
 * - Current client ID display
 * - In-place updates (no scrolling)
 * - Completion summary with statistics
 */

/**
 * Get terminal width, with fallback for non-TTY environments
 * @returns {number} Terminal width in columns
 */
function getTerminalWidth() {
  return process.stdout.columns || 80;
}

/**
 * Format seconds into human-readable duration
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1m 30s" or "1h 2m 5s")
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}h ${mins}m ${secs}s`;
}

/**
 * Maximum length for client ID display to prevent line overflow
 * @constant {number}
 */
const MAX_CLIENT_ID_LENGTH = 20;

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
function truncateClientId(str, maxLength = MAX_CLIENT_ID_LENGTH) {
  if (!str || str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Check if stdout is a TTY (interactive terminal)
 * @returns {boolean} True if running in interactive terminal
 */
function isTTY() {
  return process.stdout.isTTY === true;
}

/**
 * Create a progress bar instance
 * @param {number} total - Total items to process
 * @param {Object} [options={}] - Progress bar options
 * @param {boolean} [options.dryRun=false] - Whether running in dry-run mode
 * @returns {Object} Progress bar instance with update() and complete() methods
 * @throws {Error} If total is not a non-negative number
 */
function createProgressBar(total, options = {}) {
  if (typeof total !== 'number' || total < 0 || isNaN(total)) {
    throw new Error('Total must be a non-negative number');
  }

  const barWidth = 30; // Characters for the bar itself
  const startTime = Date.now();
  const dryRun = options.dryRun === true;
  const prefix = dryRun ? '[DRY-RUN] ' : '';

  /**
   * Update progress display
   * @param {number} current - Current item number (1-indexed, from 1 to total)
   * @param {string} [clientId] - Optional current client ID
   */
  function update(current, clientId = '') {
    if (total === 0) {
      if (isTTY()) {
        process.stdout.write(`\r${prefix}[No items to process]`);
      }
      return;
    }

    // Clamp current to valid range [0, total] for defensive programming
    const safeCurrent = Math.max(0, Math.min(current, total));

    const percent = Math.round((safeCurrent / total) * 100);
    const filled = Math.round((safeCurrent / total) * barWidth);
    const empty = barWidth - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const counter = `${safeCurrent}/${total}`;
    // Truncate long client IDs to prevent line overflow
    const truncatedId = truncateClientId(clientId);
    const clientInfo = truncatedId ? ` → ${truncatedId}` : '';

    // Clear line and write progress (only in TTY mode)
    if (isTTY()) {
      process.stdout.write(`\r${prefix}[${bar}] ${percent}% ${counter} clients${clientInfo}`);
    }
  }

  /**
   * Complete progress and display final stats
   * @param {Object} stats - Final statistics
   * @param {number} stats.successful - Count of successful operations
   * @param {number} stats.failed - Count of failed operations
   * @throws {Error} If stats is not a valid object with required properties
   */
  function complete(stats) {
    // Validate stats parameter
    if (!stats || typeof stats !== 'object') {
      throw new Error('Stats must be an object with successful and failed properties');
    }
    if (typeof stats.successful !== 'number' || typeof stats.failed !== 'number') {
      throw new Error('Stats must contain numeric successful and failed properties');
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    // Clear the progress line using terminal width (only in TTY mode)
    if (isTTY()) {
      const termWidth = getTerminalWidth();
      process.stdout.write('\r' + ' '.repeat(termWidth) + '\r');
    }

    // Display final summary
    const modeLabel = dryRun ? ' (DRY-RUN)' : '';
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`           EXECUTION COMPLETE${modeLabel}`);
    console.log('═══════════════════════════════════════════');
    console.log(`Total processed: ${total}`);
    console.log(`Successful:      ${stats.successful}`);
    console.log(`Failed:          ${stats.failed}`);
    console.log(`Duration:        ${formatDuration(duration)}`);
    console.log('═══════════════════════════════════════════');
  }

  return { update, complete };
}

module.exports = { createProgressBar, formatDuration, getTerminalWidth, truncateClientId, isTTY };
