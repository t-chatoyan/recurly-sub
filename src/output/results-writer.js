/**
 * Results Writer Module
 * Generates JSON output file with execution results
 *
 * Features:
 * - JSON output file with complete before/after state
 * - Summary statistics calculation
 * - Terminal statistics display
 * - Dry-run mode support (no file generation)
 */

const fs = require('fs');
const path = require('path');

/**
 * Results file format version
 * Increment when making breaking schema changes
 */
const RESULTS_VERSION = '1.0.0';

/**
 * Sanitize error message before storing in results file
 * Removes sensitive data like API keys, tokens, passwords
 * @param {string} error - Error message to sanitize
 * @returns {string|null} Sanitized error or null
 */
function sanitizeError(error) {
  if (!error) return null;

  let sanitized = error;

  // Remove API keys
  sanitized = sanitized.replace(/api[-_]?key[=:]\s*[^\s]+/gi, 'api_key=[REDACTED]');

  // Remove Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');

  // Remove Authorization headers
  sanitized = sanitized.replace(/Authorization[=:]\s*[^\s]+/gi, 'Authorization=[REDACTED]');

  // Remove password patterns
  sanitized = sanitized.replace(/password[=:]\s*[^\s]+/gi, 'password=[REDACTED]');

  // Remove generic token patterns
  sanitized = sanitized.replace(/\btoken[=:]\s*[^\s]+/gi, 'token=[REDACTED]');

  // Remove URL credentials (://user:pass@)
  sanitized = sanitized.replace(/:\/\/[^:]+:[^@]+@/gi, '://[REDACTED]@');

  // Remove secret patterns
  sanitized = sanitized.replace(/secret[=:]\s*[^\s]+/gi, 'secret=[REDACTED]');

  return sanitized;
}

/**
 * Create results writer instance
 * @param {Object} options - Configuration options
 * @param {string} options.project - Project identifier
 * @param {string} options.environment - Environment (sandbox/production)
 * @param {string} [options.mode='rescue'] - Execution mode (rescue/rollback)
 * @param {string} [options.sourceFile] - Source file for rollback mode (for traceability)
 * @param {boolean} [options.dryRun=false] - Whether in dry-run mode
 * @param {string} [options.outputDir='.'] - Directory for output files
 * @returns {Object} Results writer instance
 * @throws {Error} If project or environment is missing
 */
function createResultsWriter(options) {
  const {
    project,
    environment,
    mode = 'rescue',
    sourceFile = null,
    dryRun = false,
    outputDir = '.'
  } = options;

  if (!project) {
    throw new Error('Project is required for results writer');
  }
  if (!environment) {
    throw new Error('Environment is required for results writer');
  }

  const isRollback = mode === 'rollback';
  const startTimestamp = new Date().toISOString();

  const results = {
    version: RESULTS_VERSION,
    execution: {
      timestamp: startTimestamp,
      environment,
      project,
      mode
    },
    // Different summary structure for rollback vs rescue
    summary: isRollback
      ? { total: 0, rolled_back: 0, skipped: 0, failed: 0 }
      : { total: 0, rescued: 0, skipped: 0, failed: 0 },
    clients: []
  };

  // Add source_file for rollback mode (traceability)
  if (isRollback && sourceFile) {
    results.execution.source_file = path.basename(sourceFile);
  }

  /**
   * Add client result to output
   * @param {Object} clientData - Client processing data
   * @param {string} clientData.id - Client/account ID
   * @param {string} clientData.status - 'RESCUED', 'FAILED', 'ROLLED_BACK', or 'SKIPPED'
   * @param {Object} [clientData.before] - State before processing
   * @param {Object} [clientData.after] - State after processing (null if failed)
   * @param {string} [clientData.error] - Error message if failed
   * @param {string} [clientData.reason] - Reason for skipping (for SKIPPED status)
   */
  function addClientResult(clientData) {
    const { id, status, before, after, error, reason } = clientData;

    // Validate required id parameter
    if (id === undefined || id === null || id === '') {
      throw new Error('Client ID is required for addClientResult');
    }

    const clientEntry = {
      id,
      status,
      before: before === undefined ? { state: 'unknown', subscriptions: [] } : before,
      after: after === undefined ? null : after,
      error: sanitizeError(error)
    };

    // Include reason for SKIPPED clients (rollback mode)
    if (status === 'SKIPPED' && reason) {
      clientEntry.reason = reason;
    }

    results.clients.push(clientEntry);

    // Update summary based on mode
    results.summary.total++;

    if (isRollback) {
      // Rollback mode counters
      if (status === 'ROLLED_BACK') {
        results.summary.rolled_back++;
      } else if (status === 'SKIPPED') {
        results.summary.skipped++;
      } else if (status === 'FAILED') {
        results.summary.failed++;
      }
    } else {
      // Rescue mode counters
      if (status === 'RESCUED') {
        results.summary.rescued++;
      } else if (status === 'SKIPPED' || status === 'REQUIRES_3DS') {
        results.summary.skipped++;
      } else if (status === 'FAILED') {
        results.summary.failed++;
      }
    }
  }

  /**
   * Finalize and write output file
   * @returns {Object} Result with filePath and summary
   * @throws {Error} If file write fails or directory does not exist
   */
  function finalize() {
    // Skip file generation in dry-run mode
    if (dryRun) {
      return {
        filePath: null,
        summary: results.summary,
        skipped: true,
        reason: 'dry-run mode'
      };
    }

    // Validate output directory exists
    if (!fs.existsSync(outputDir)) {
      throw new Error(`Output directory does not exist: ${outputDir}`);
    }

    // Generate filename with timestamp
    const timestamp = startTimestamp.replace(/[:.]/g, '-').slice(0, 19);
    const prefix = isRollback ? 'rollback-results' : 'rescue-results';
    const filename = `${prefix}-${project}-${timestamp}.json`;
    const filePath = path.join(outputDir, filename);

    // Write file
    try {
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
    } catch (error) {
      throw new Error(`Failed to write results file: ${error.message}`);
    }

    return {
      filePath,
      summary: results.summary,
      skipped: false
    };
  }

  /**
   * Get current results (for testing/inspection)
   * @returns {Object} Current results object
   */
  function getResults() {
    return results;
  }

  /**
   * Get summary statistics
   * @returns {Object} Summary with total, rescued, failed counts
   */
  function getSummary() {
    return { ...results.summary };
  }

  return {
    addClientResult,
    finalize,
    getResults,
    getSummary
  };
}

/**
 * Display final statistics in terminal
 * @param {Object} summary - Summary statistics
 * @param {number} summary.total - Total clients processed
 * @param {number} summary.rescued - Successfully rescued count
 * @param {number} summary.failed - Failed count
 * @param {string} [filePath] - Path to output file
 * @param {boolean} [isDryRun=false] - Whether this was a dry-run
 * @param {Object} [options={}] - Display options
 * @param {Function} [options.log=console.log] - Log function
 */
function displayStatistics(summary, filePath = null, isDryRun = false, options = {}) {
  const { log = console.log } = options;
  const prefix = isDryRun ? '[DRY-RUN] ' : '';

  log('');
  log('═'.repeat(60));
  log(`${prefix}EXECUTION SUMMARY`);
  log('═'.repeat(60));
  log(`Total clients processed: ${summary.total}`);

  if (isDryRun) {
    log(`Would rescue:            ${summary.rescued}`);
    if (summary.skipped > 0) {
      log(`Would skip:              ${summary.skipped}`);
    }
    log(`Would fail:              ${summary.failed}`);
  } else {
    log(`Successful rescues:      ${summary.rescued}`);
    if (summary.skipped > 0) {
      log(`Skipped:                 ${summary.skipped}`);
    }
    log(`Failed rescues:          ${summary.failed}`);
  }

  if (summary.total > 0) {
    const eligible = summary.total - (summary.skipped || 0);
    const successRate = eligible > 0 ? ((summary.rescued / eligible) * 100).toFixed(1) : '0.0';
    log(`Success rate:            ${successRate}%`);
  }

  log('─'.repeat(60));

  if (filePath) {
    log(`Results file: ${filePath}`);
  } else if (isDryRun) {
    log('Results file: Not generated (dry-run mode)');
  }

  log('═'.repeat(60));
}

/**
 * Display final rollback statistics in terminal
 * @param {Object} summary - Rollback summary statistics
 * @param {number} summary.total - Total clients processed
 * @param {number} summary.rolled_back - Successfully rolled back count
 * @param {number} summary.skipped - Skipped count (not rescued)
 * @param {number} summary.failed - Failed count
 * @param {string} [filePath] - Path to output file
 * @param {Object} [options={}] - Display options
 * @param {Function} [options.log=console.log] - Log function
 */
function displayRollbackStatistics(summary, filePath = null, options = {}) {
  const { log = console.log } = options;

  log('');
  log('═'.repeat(60));
  log('ROLLBACK SUMMARY');
  log('═'.repeat(60));
  log(`Total clients processed:   ${summary.total || 0}`);
  log(`Successfully rolled back:  ${summary.rolled_back || 0}`);
  log(`Skipped (not rescued):     ${summary.skipped || 0}`);
  log(`Failed:                    ${summary.failed || 0}`);

  // Calculate success rate (rolled_back / eligible)
  const eligible = (summary.total || 0) - (summary.skipped || 0);
  if (eligible > 0) {
    const successRate = (((summary.rolled_back || 0) / eligible) * 100).toFixed(1);
    log(`Success rate:              ${successRate}%`);
  }

  log('─'.repeat(60));

  if (filePath) {
    log(`Results file: ${filePath}`);
  }

  log('═'.repeat(60));
}

/**
 * Validate results file exists and is valid JSON
 * @param {string} filePath - Path to results file
 * @returns {Object} Parsed results
 * @throws {Error} If file is invalid
 */
function loadResultsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Results file not found: ${filePath}`);
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read results file: ${error.message}`);
  }

  let results;
  try {
    results = JSON.parse(content);
  } catch (error) {
    throw new Error(`Results file is corrupted (invalid JSON): ${error.message}`);
  }

  // Validate basic structure
  if (!results.version) {
    throw new Error('Results file missing version field');
  }
  // Check version compatibility (allow loading older versions with warning)
  if (results.version !== RESULTS_VERSION) {
    console.warn(`Warning: Results file version ${results.version} differs from current ${RESULTS_VERSION}`);
  }
  if (!results.execution) {
    throw new Error('Results file missing execution section');
  }
  if (!results.summary) {
    throw new Error('Results file missing summary section');
  }
  if (!Array.isArray(results.clients)) {
    throw new Error('Results file missing or invalid clients array');
  }

  return results;
}

module.exports = {
  createResultsWriter,
  displayStatistics,
  displayRollbackStatistics,
  loadResultsFile,
  sanitizeError,
  RESULTS_VERSION
};
