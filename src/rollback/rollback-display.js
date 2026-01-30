/**
 * Rollback Display Module
 * Provides terminal output functions for rollback operations
 *
 * Features:
 * - Rollback summary display
 * - Formatted box output
 * - Execution metadata display
 * - Testable with injected log function
 */

/**
 * Display rollback summary in terminal
 * @param {Object} summary - Rollback summary from calculateRollbackSummary
 * @param {string} summary.originalTimestamp - Original execution timestamp
 * @param {string} summary.environment - Target environment
 * @param {string} summary.project - Project identifier
 * @param {string} summary.originalMode - Original execution mode
 * @param {number} summary.totalClients - Total clients in file
 * @param {number} summary.toRollback - Clients to rollback count
 * @param {number} summary.toSkip - Clients to skip count
 * @param {Object} [options={}] - Display options
 * @param {Function} [options.log=console.log] - Log function for testability
 */
function displayRollbackSummary(summary, options = {}) {
  const { log = console.log } = options;

  log('');
  log('═══════════════════════════════════════════════════════════');
  log('ROLLBACK SUMMARY');
  log('═══════════════════════════════════════════════════════════');
  log(`Source file: rescue-results from ${summary.originalTimestamp || 'unknown'}`);
  log(`Environment: ${summary.environment || 'unknown'}`);
  log(`Project: ${summary.project || 'unknown'}`);
  log(`Original mode: ${summary.originalMode || 'rescue'}`);
  log('───────────────────────────────────────────────────────────');
  log(`Total clients in file: ${summary.totalClients || 0}`);
  log(`Clients to rollback:   ${summary.toRollback || 0}`);
  log(`Clients to skip:       ${summary.toSkip || 0} (were not rescued)`);
  log('═══════════════════════════════════════════════════════════');
  log('');
}

module.exports = { displayRollbackSummary };
