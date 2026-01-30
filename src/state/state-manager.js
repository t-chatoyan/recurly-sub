/**
 * State Management Module
 * Persists execution state for crash recovery
 *
 * Features:
 * - State file creation and updates during execution
 * - Resume from state file with --resume flag
 * - Corrupted state file detection
 * - Atomic file writes to prevent corruption
 */

const fs = require('fs');
const path = require('path');

const STATE_VERSION = '1.0.0';

/**
 * Sanitize error message before persisting to state file
 * Removes sensitive data like API keys, tokens, passwords to prevent accidental exposure
 * @param {string} message - Error message to sanitize
 * @returns {string} Sanitized message
 */
function sanitizeErrorForState(message) {
  if (!message) return 'Unknown error';

  let sanitized = message;

  // Remove anything that looks like an API key
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
 * Create state manager instance
 * @param {Object} options - Configuration options
 * @param {string} options.project - Project identifier
 * @param {string} options.environment - Environment (sandbox/production)
 * @param {string} [options.mode='rescue'] - Execution mode (rescue/rollback)
 * @param {string} [options.stateDir='.'] - Directory for state files
 * @returns {Object} State manager instance
 * @throws {Error} If project or environment is missing
 */
function createStateManager(options) {
  const { project, environment, mode = 'rescue', stateDir = '.' } = options;

  if (!project) {
    throw new Error('Project is required for state management');
  }
  if (!environment) {
    throw new Error('Environment is required for state management');
  }

  let state = null;
  let stateFilePath = null;

  /**
   * Initialize state for new execution
   * @param {Array} accounts - List of account objects to process
   * @returns {Object} Initial state
   */
  function initialize(accounts) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    stateFilePath = path.join(stateDir, `rescue-state-${project}-${timestamp}.json`);

    state = {
      version: STATE_VERSION,
      metadata: {
        project,
        environment,
        startedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        mode
      },
      progress: {
        total: accounts.length,
        processed: 0,
        currentIndex: 0
      },
      accounts: {
        processed: [],
        pending: accounts.map(a => a.id)
      }
    };

    save();
    return state;
  }

  /**
   * Mark client as processed
   * @param {string} clientId - Client/account ID
   * @param {Object} result - Processing result
   * @param {string} result.status - 'rescued' or 'failed'
   * @param {string} [result.subscriptionId] - New subscription ID
   * @param {string} [result.error] - Error message if failed
   */
  function markProcessed(clientId, result) {
    if (!state) {
      throw new Error('State not initialized. Call initialize() first.');
    }

    // Sanitize error before storing
    const sanitizedError = result.error ? sanitizeErrorForState(result.error) : null;

    // Add to processed list
    state.accounts.processed.push({
      id: clientId,
      status: result.status,
      subscriptionId: result.subscriptionId || null,
      error: sanitizedError,
      processedAt: new Date().toISOString()
    });

    // Remove from pending list
    state.accounts.pending = state.accounts.pending.filter(id => id !== clientId);

    // Update progress
    state.progress.processed++;
    state.progress.currentIndex++;
    state.metadata.lastUpdated = new Date().toISOString();

    // Persist to disk
    save();
  }

  /**
   * Save state to disk using atomic write
   * Uses unique temp file with PID and timestamp to prevent race conditions
   */
  function save() {
    if (!state || !stateFilePath) return;

    try {
      // Write to temp file first, then rename (atomic operation)
      // Use PID and timestamp to ensure unique temp file per process
      const tempPath = `${stateFilePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
      fs.renameSync(tempPath, stateFilePath);
    } catch (error) {
      console.error(`Warning: Failed to save state file: ${error.message}`);
    }
  }

  /**
   * Get current state
   * @returns {Object|null} Current state
   */
  function getState() {
    return state;
  }

  /**
   * Get state file path
   * @returns {string|null} State file path
   */
  function getStateFilePath() {
    return stateFilePath;
  }

  /**
   * Clean up state file (on successful completion)
   * Also removes any orphaned temp files matching this state file pattern
   */
  function cleanup() {
    if (stateFilePath && fs.existsSync(stateFilePath)) {
      try {
        fs.unlinkSync(stateFilePath);
      } catch (error) {
        console.error(`Warning: Failed to clean up state file: ${error.message}`);
      }
    }
    // Also clean up any orphaned temp files
    if (stateFilePath) {
      const stateDir = path.dirname(stateFilePath);
      const stateBasename = path.basename(stateFilePath);
      try {
        const files = fs.readdirSync(stateDir);
        for (const file of files) {
          // Match temp files: basename.tmp.* pattern
          if (file.startsWith(stateBasename + '.tmp.')) {
            try {
              fs.unlinkSync(path.join(stateDir, file));
            } catch (e) {
              // Ignore cleanup errors for temp files
            }
          }
        }
      } catch (e) {
        // Ignore errors reading directory
      }
    }
  }

  /**
   * Resume from loaded state
   * @param {Object} loadedState - Loaded state object
   * @param {string} loadedFilePath - Path to the loaded state file
   */
  function resumeFrom(loadedState, loadedFilePath) {
    state = loadedState;
    stateFilePath = loadedFilePath;
  }

  /**
   * Get pending accounts for resume
   * @returns {Array} Array of pending account IDs
   */
  function getPendingAccounts() {
    if (!state) return [];
    return state.accounts.pending;
  }

  /**
   * Get processed count for resume
   * @returns {number} Number of processed accounts
   */
  function getProcessedCount() {
    if (!state) return 0;
    return state.progress.processed;
  }

  /**
   * Get total count
   * @returns {number} Total number of accounts
   */
  function getTotalCount() {
    if (!state) return 0;
    return state.progress.total;
  }

  return {
    initialize,
    markProcessed,
    save,
    getState,
    getStateFilePath,
    cleanup,
    resumeFrom,
    getPendingAccounts,
    getProcessedCount,
    getTotalCount
  };
}

/**
 * Find the most recent state file for a project
 * @param {string} project - Project identifier
 * @param {string} [stateDir='.'] - Directory to search
 * @returns {string|null} Path to latest state file, or null if none found
 */
function findLatestStateFile(project, stateDir = '.') {
  try {
    if (!fs.existsSync(stateDir)) {
      return null;
    }

    const files = fs.readdirSync(stateDir)
      .filter(f => f.startsWith(`rescue-state-${project}-`) && f.endsWith('.json') && !f.endsWith('.tmp'))
      .map(f => ({
        name: f,
        path: path.join(stateDir, f),
        mtime: fs.statSync(path.join(stateDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0].path : null;
  } catch (error) {
    return null;
  }
}

/**
 * Load and validate state file
 * @param {string} filePath - Path to state file
 * @returns {Object} Loaded state
 * @throws {Error} If file is invalid or corrupted
 */
function loadStateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`State file not found: ${filePath}`);
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read state file: ${error.message}`);
  }

  let state;
  try {
    state = JSON.parse(content);
  } catch (error) {
    throw new Error(`State file is corrupted (invalid JSON): ${error.message}`);
  }

  // Validate schema
  validateStateSchema(state);

  return state;
}

/**
 * Validate state file schema
 * @param {Object} state - State object to validate
 * @throws {Error} If schema is invalid
 */
function validateStateSchema(state) {
  if (!state.version) {
    throw new Error('State file missing version field');
  }
  if (!state.metadata) {
    throw new Error('State file missing metadata section');
  }
  if (!state.metadata.project) {
    throw new Error('State file missing project in metadata');
  }
  if (!state.metadata.environment) {
    throw new Error('State file missing environment in metadata');
  }
  if (!state.progress) {
    throw new Error('State file missing progress section');
  }
  if (typeof state.progress.total !== 'number') {
    throw new Error('State file has invalid progress.total');
  }
  if (typeof state.progress.processed !== 'number') {
    throw new Error('State file has invalid progress.processed');
  }
  if (typeof state.progress.currentIndex !== 'number') {
    throw new Error('State file has invalid progress.currentIndex');
  }
  if (!state.accounts) {
    throw new Error('State file missing accounts section');
  }
  if (!Array.isArray(state.accounts.processed)) {
    throw new Error('State file has invalid accounts.processed');
  }
  if (!Array.isArray(state.accounts.pending)) {
    throw new Error('State file has invalid accounts.pending');
  }
  // Consistency check: processed count should match processed array length
  if (state.progress.processed !== state.accounts.processed.length) {
    throw new Error('State file inconsistency: progress.processed does not match accounts.processed count');
  }
}

module.exports = {
  createStateManager,
  findLatestStateFile,
  loadStateFile,
  validateStateSchema,
  sanitizeErrorForState,
  STATE_VERSION
};
