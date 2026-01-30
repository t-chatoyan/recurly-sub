/**
 * Rollback File Loader Module
 * Loads and validates rescue-results JSON files for rollback operations
 *
 * Features:
 * - File existence validation
 * - JSON parsing and error handling
 * - Schema validation for rescue-results format
 * - Environment match validation
 * - Rollback summary calculation
 * - Path traversal protection
 */

const fs = require('fs');
const path = require('path');

/**
 * Valid client status values for rollback files
 * - RESCUED: Client was successfully rescued, eligible for rollback
 * - FAILED: Client rescue failed, will be skipped in rollback
 * - SKIPPED: Client was skipped in original run, will be skipped in rollback
 * - REQUIRES_3DS: Client required 3DS authentication, will be skipped in rollback
 */
const VALID_CLIENT_STATUSES = ['RESCUED', 'FAILED', 'SKIPPED', 'REQUIRES_3DS'];

/**
 * Sanitize file path from error messages to prevent information leakage
 * @param {string} filePath - File path to sanitize
 * @returns {string} Sanitized path (basename only)
 */
function sanitizePathForError(filePath) {
  if (!filePath) return 'unknown';
  return path.basename(filePath);
}

/**
 * Validate file path for security (prevent path traversal)
 * @param {string} filePath - File path to validate
 * @throws {Error} If path is potentially dangerous
 */
function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Rollback file path is required');
  }

  // Resolve to absolute path
  const resolved = path.resolve(filePath);
  const cwd = process.cwd();

  // Check for path traversal attempts
  if (!resolved.startsWith(cwd)) {
    throw new Error('Rollback file must be within current working directory');
  }
}

/**
 * Load and validate rollback file
 * @param {string} filePath - Path to rescue-results JSON file
 * @returns {Object} Parsed rollback data
 * @throws {Error} If file is missing, invalid, or corrupted
 */
function loadRollbackFile(filePath) {
  // Security: Validate path to prevent traversal attacks
  validateFilePath(filePath);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Rollback file not found or invalid: ${sanitizePathForError(filePath)}`);
  }

  // Read file content
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read rollback file: ${sanitizePathForError(filePath)}`);
  }

  // Parse JSON
  let data;
  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(`Rollback file is corrupted (invalid JSON): ${sanitizePathForError(filePath)}`);
  }

  // Validate schema
  validateRollbackSchema(data);

  return data;
}

/**
 * Validate rollback file schema
 * @param {Object} data - Parsed JSON data
 * @throws {Error} If schema is invalid
 */
function validateRollbackSchema(data) {
  // Validate version field (optional warning for older files)
  if (!data.version) {
    console.warn('Warning: Rollback file missing version field (older format)');
  }

  // Validate execution metadata
  if (!data.execution) {
    throw new Error('Rollback file missing execution metadata');
  }
  if (!data.execution.timestamp) {
    throw new Error('Rollback file missing execution timestamp');
  }
  if (!data.execution.environment) {
    throw new Error('Rollback file missing execution environment');
  }
  if (!data.execution.project) {
    throw new Error('Rollback file missing execution project');
  }

  // Validate summary
  if (!data.summary) {
    throw new Error('Rollback file missing summary');
  }
  if (typeof data.summary.total !== 'number') {
    throw new Error('Rollback file has invalid summary.total');
  }

  // Validate clients array
  if (!Array.isArray(data.clients)) {
    throw new Error('Rollback file missing clients array');
  }

  // Validate each client entry
  for (let i = 0; i < data.clients.length; i++) {
    const client = data.clients[i];
    if (!client.id) {
      throw new Error(`Rollback file client at index ${i} missing id`);
    }
    if (!client.status) {
      throw new Error(`Rollback file client at index ${i} missing status`);
    }
    if (!VALID_CLIENT_STATUSES.includes(client.status)) {
      throw new Error(`Rollback file client at index ${i} has invalid status: ${client.status}`);
    }
  }
}

/**
 * Calculate rollback summary from loaded data
 * @param {Object} data - Loaded rollback data
 * @returns {Object} Rollback summary
 */
function calculateRollbackSummary(data) {
  const toRollback = data.clients.filter(c => c.status === 'RESCUED');
  const toSkip = data.clients.filter(c => c.status !== 'RESCUED');

  return {
    originalTimestamp: data.execution.timestamp,
    environment: data.execution.environment,
    project: data.execution.project,
    originalMode: data.execution.mode || 'rescue',
    totalClients: data.clients.length,
    toRollback: toRollback.length,
    toSkip: toSkip.length,
    clients: {
      rollback: toRollback,
      skip: toSkip
    }
  };
}

/**
 * Validate environment matches between rollback file and CLI argument
 * @param {Object} data - Loaded rollback data
 * @param {string} cliEnv - Environment from CLI argument
 * @throws {Error} If environments don't match
 */
function validateEnvironmentMatch(data, cliEnv) {
  if (data.execution.environment !== cliEnv) {
    throw new Error(
      `Environment mismatch: file is for '${data.execution.environment}' ` +
      `but you specified --env=${cliEnv}`
    );
  }
}

/**
 * Validate project matches between rollback file and CLI argument
 * @param {Object} data - Loaded rollback data
 * @param {string} cliProject - Project from CLI argument
 * @throws {Error} If projects don't match
 */
function validateProjectMatch(data, cliProject) {
  if (data.execution.project !== cliProject) {
    throw new Error(
      `Project mismatch: file is for '${data.execution.project}' ` +
      `but you specified --project=${cliProject}`
    );
  }
}

module.exports = {
  loadRollbackFile,
  validateRollbackSchema,
  calculateRollbackSummary,
  validateEnvironmentMatch,
  validateProjectMatch,
  validateFilePath,
  sanitizePathForError,
  VALID_CLIENT_STATUSES
};
