/**
 * Unit tests for rollback-loader.js module
 * Tests file loading, JSON parsing, schema validation, and summary calculation
 */

const { test, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  loadRollbackFile,
  validateRollbackSchema,
  calculateRollbackSummary,
  validateEnvironmentMatch,
  validateProjectMatch,
  validateFilePath,
  sanitizePathForError
} = require('../src/rollback/rollback-loader');

const TEST_DIR = './test-rollback-files';

// Setup and teardown
beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.readdirSync(TEST_DIR).forEach(f => fs.unlinkSync(path.join(TEST_DIR, f)));
    fs.rmdirSync(TEST_DIR);
  }
});

/**
 * Helper to create valid rollback file
 * @param {string} filename - File name
 * @param {Object} options - Override options
 * @returns {string} File path
 */
function createValidRollbackFile(filename, options = {}) {
  const data = {
    version: options.version || '1.0.0',
    execution: {
      timestamp: options.timestamp || '2026-01-20T10:30:00.000Z',
      environment: options.environment || 'sandbox',
      project: options.project || 'eur',
      mode: options.mode || 'rescue'
    },
    summary: {
      total: options.total || 3,
      rescued: options.rescued || 2,
      failed: options.failed || 1
    },
    clients: options.clients || [
      { id: 'acc1', status: 'RESCUED', before: { state: 'closed' }, after: { state: 'active', subscription_id: 'sub_1' } },
      { id: 'acc2', status: 'RESCUED', before: { state: 'closed' }, after: { state: 'active', subscription_id: 'sub_2' } },
      { id: 'acc3', status: 'FAILED', before: { state: 'closed' }, after: null, error: 'timeout' }
    ]
  };
  const filePath = path.join(TEST_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

// ============================================================================
// loadRollbackFile() tests
// ============================================================================

describe('loadRollbackFile()', () => {
  test('loads valid file successfully', () => {
    const filePath = createValidRollbackFile('valid.json');
    const data = loadRollbackFile(filePath);

    assert.ok(data.execution);
    assert.ok(data.summary);
    assert.ok(data.clients);
    assert.strictEqual(data.execution.environment, 'sandbox');
    assert.strictEqual(data.execution.project, 'eur');
  });

  test('throws on missing file', () => {
    // Use a file in current directory that doesn't exist
    assert.throws(
      () => loadRollbackFile('./nonexistent-file.json'),
      /Rollback file not found or invalid/
    );
  });

  test('throws on path traversal attempt', () => {
    // This should fail the security check before even trying to read
    assert.throws(
      () => loadRollbackFile('/etc/passwd'),
      /must be within current working directory/
    );
  });

  test('throws on corrupted JSON', () => {
    const filePath = path.join(TEST_DIR, 'corrupted.json');
    fs.writeFileSync(filePath, '{ invalid json }');

    assert.throws(
      () => loadRollbackFile(filePath),
      /corrupted.*invalid JSON/i
    );
  });

  test('throws on empty file', () => {
    const filePath = path.join(TEST_DIR, 'empty.json');
    fs.writeFileSync(filePath, '');

    assert.throws(
      () => loadRollbackFile(filePath),
      /corrupted.*invalid JSON/i
    );
  });
});

// ============================================================================
// validateRollbackSchema() tests
// ============================================================================

describe('validateRollbackSchema()', () => {
  test('passes for valid schema', () => {
    const validData = {
      execution: {
        timestamp: '2026-01-20T10:30:00.000Z',
        environment: 'sandbox',
        project: 'eur',
        mode: 'rescue'
      },
      summary: { total: 1, rescued: 1, failed: 0 },
      clients: [{ id: 'acc1', status: 'RESCUED' }]
    };

    // Should not throw
    validateRollbackSchema(validData);
  });

  test('throws on missing execution', () => {
    assert.throws(
      () => validateRollbackSchema({}),
      /missing execution metadata/
    );
  });

  test('throws on missing execution.timestamp', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { environment: 'sandbox', project: 'eur' },
        summary: { total: 0 },
        clients: []
      }),
      /missing execution timestamp/
    );
  });

  test('throws on missing execution.environment', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { timestamp: 'x', project: 'eur' },
        summary: { total: 0 },
        clients: []
      }),
      /missing execution environment/
    );
  });

  test('throws on missing execution.project', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { timestamp: 'x', environment: 'sandbox' },
        summary: { total: 0 },
        clients: []
      }),
      /missing execution project/
    );
  });

  test('throws on missing summary', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
        clients: []
      }),
      /missing summary/
    );
  });

  test('throws on invalid summary.total', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
        summary: { total: 'invalid' },
        clients: []
      }),
      /invalid summary.total/
    );
  });

  test('throws on missing clients array', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
        summary: { total: 0 }
      }),
      /missing clients array/
    );
  });

  test('throws on clients not being an array', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
        summary: { total: 0 },
        clients: 'not an array'
      }),
      /missing clients array/
    );
  });

  test('throws on client missing id', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
        summary: { total: 1 },
        clients: [{ status: 'RESCUED' }]
      }),
      /client at index 0 missing id/
    );
  });

  test('throws on client missing status', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
        summary: { total: 1 },
        clients: [{ id: 'acc1' }]
      }),
      /client at index 0 missing status/
    );
  });

  test('throws on invalid client status', () => {
    assert.throws(
      () => validateRollbackSchema({
        execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
        summary: { total: 1 },
        clients: [{ id: 'acc1', status: 'INVALID' }]
      }),
      /invalid status: INVALID/
    );
  });

  test('accepts all valid status values', () => {
    const data = {
      execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
      summary: { total: 4 },
      clients: [
        { id: 'acc1', status: 'RESCUED' },
        { id: 'acc2', status: 'FAILED' },
        { id: 'acc3', status: 'SKIPPED' },
        { id: 'acc4', status: 'REQUIRES_3DS' }
      ]
    };

    // Should not throw
    validateRollbackSchema(data);
  });

  test('accepts REQUIRES_3DS status', () => {
    const data = {
      execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
      summary: { total: 1 },
      clients: [
        { id: 'acc1', status: 'REQUIRES_3DS' }
      ]
    };

    // Should not throw
    validateRollbackSchema(data);
  });
});

// ============================================================================
// calculateRollbackSummary() tests
// ============================================================================

describe('calculateRollbackSummary()', () => {
  test('calculates correctly with mixed statuses', () => {
    const filePath = createValidRollbackFile('summary-test.json');
    const data = loadRollbackFile(filePath);
    const summary = calculateRollbackSummary(data);

    assert.strictEqual(summary.totalClients, 3);
    assert.strictEqual(summary.toRollback, 2);
    assert.strictEqual(summary.toSkip, 1);
    assert.strictEqual(summary.environment, 'sandbox');
    assert.strictEqual(summary.project, 'eur');
    assert.strictEqual(summary.originalMode, 'rescue');
  });

  test('handles all RESCUED clients', () => {
    const filePath = createValidRollbackFile('all-rescued.json', {
      clients: [
        { id: 'acc1', status: 'RESCUED', before: {}, after: {} },
        { id: 'acc2', status: 'RESCUED', before: {}, after: {} }
      ]
    });
    const data = loadRollbackFile(filePath);
    const summary = calculateRollbackSummary(data);

    assert.strictEqual(summary.toRollback, 2);
    assert.strictEqual(summary.toSkip, 0);
  });

  test('handles all FAILED clients', () => {
    const filePath = createValidRollbackFile('all-failed.json', {
      clients: [
        { id: 'acc1', status: 'FAILED', before: {}, after: null, error: 'err1' },
        { id: 'acc2', status: 'FAILED', before: {}, after: null, error: 'err2' }
      ]
    });
    const data = loadRollbackFile(filePath);
    const summary = calculateRollbackSummary(data);

    assert.strictEqual(summary.toRollback, 0);
    assert.strictEqual(summary.toSkip, 2);
  });

  test('handles empty clients array', () => {
    const filePath = createValidRollbackFile('empty-clients.json', {
      total: 0,
      rescued: 0,
      failed: 0,
      clients: []
    });
    const data = loadRollbackFile(filePath);
    const summary = calculateRollbackSummary(data);

    assert.strictEqual(summary.totalClients, 0);
    assert.strictEqual(summary.toRollback, 0);
    assert.strictEqual(summary.toSkip, 0);
  });

  test('includes clients arrays for processing', () => {
    const filePath = createValidRollbackFile('clients-arrays.json');
    const data = loadRollbackFile(filePath);
    const summary = calculateRollbackSummary(data);

    assert.ok(Array.isArray(summary.clients.rollback));
    assert.ok(Array.isArray(summary.clients.skip));
    assert.strictEqual(summary.clients.rollback.length, 2);
    assert.strictEqual(summary.clients.skip.length, 1);

    // Verify rollback clients are RESCUED
    summary.clients.rollback.forEach(c => {
      assert.strictEqual(c.status, 'RESCUED');
    });
  });

  test('handles missing mode gracefully', () => {
    const data = {
      execution: {
        timestamp: '2026-01-20T10:30:00.000Z',
        environment: 'sandbox',
        project: 'eur'
        // mode is missing
      },
      summary: { total: 0 },
      clients: []
    };

    const summary = calculateRollbackSummary(data);
    assert.strictEqual(summary.originalMode, 'rescue'); // Default
  });
});

// ============================================================================
// validateEnvironmentMatch() tests
// ============================================================================

describe('validateEnvironmentMatch()', () => {
  test('passes on matching environment (sandbox)', () => {
    const filePath = createValidRollbackFile('env-match-sandbox.json', { environment: 'sandbox' });
    const data = loadRollbackFile(filePath);

    // Should not throw
    validateEnvironmentMatch(data, 'sandbox');
  });

  test('passes on matching environment (production)', () => {
    const filePath = createValidRollbackFile('env-match-prod.json', { environment: 'production' });
    const data = loadRollbackFile(filePath);

    // Should not throw
    validateEnvironmentMatch(data, 'production');
  });

  test('throws on sandbox file with production CLI', () => {
    const filePath = createValidRollbackFile('env-mismatch-1.json', { environment: 'sandbox' });
    const data = loadRollbackFile(filePath);

    assert.throws(
      () => validateEnvironmentMatch(data, 'production'),
      /Environment mismatch.*sandbox.*production/
    );
  });

  test('throws on production file with sandbox CLI', () => {
    const filePath = createValidRollbackFile('env-mismatch-2.json', { environment: 'production' });
    const data = loadRollbackFile(filePath);

    assert.throws(
      () => validateEnvironmentMatch(data, 'sandbox'),
      /Environment mismatch.*production.*sandbox/
    );
  });
});

// ============================================================================
// validateProjectMatch() tests
// ============================================================================

describe('validateProjectMatch()', () => {
  test('passes on matching project (eur)', () => {
    const filePath = createValidRollbackFile('project-match-eur.json', { project: 'eur' });
    const data = loadRollbackFile(filePath);

    // Should not throw
    validateProjectMatch(data, 'eur');
  });

  test('passes on matching project (multi)', () => {
    const filePath = createValidRollbackFile('project-match-multi.json', { project: 'multi' });
    const data = loadRollbackFile(filePath);

    // Should not throw
    validateProjectMatch(data, 'multi');
  });

  test('throws on eur file with multi CLI', () => {
    const filePath = createValidRollbackFile('project-mismatch-1.json', { project: 'eur' });
    const data = loadRollbackFile(filePath);

    assert.throws(
      () => validateProjectMatch(data, 'multi'),
      /Project mismatch.*eur.*multi/
    );
  });

  test('throws on multi file with eur CLI', () => {
    const filePath = createValidRollbackFile('project-mismatch-2.json', { project: 'multi' });
    const data = loadRollbackFile(filePath);

    assert.throws(
      () => validateProjectMatch(data, 'eur'),
      /Project mismatch.*multi.*eur/
    );
  });
});

// ============================================================================
// validateFilePath() tests
// ============================================================================

describe('validateFilePath()', () => {
  test('accepts valid file in current directory', () => {
    // Should not throw
    validateFilePath('test-file.json');
  });

  test('accepts valid file in subdirectory', () => {
    // Should not throw
    validateFilePath('./test-rollback-files/test.json');
  });

  test('throws on null path', () => {
    assert.throws(
      () => validateFilePath(null),
      /Rollback file path is required/
    );
  });

  test('throws on empty string', () => {
    assert.throws(
      () => validateFilePath(''),
      /Rollback file path is required/
    );
  });

  test('throws on non-string path', () => {
    assert.throws(
      () => validateFilePath(123),
      /Rollback file path is required/
    );
  });

  test('throws on path traversal attempt', () => {
    assert.throws(
      () => validateFilePath('/etc/passwd'),
      /must be within current working directory/
    );
  });
});

// ============================================================================
// sanitizePathForError() tests
// ============================================================================

describe('sanitizePathForError()', () => {
  test('returns basename for full path', () => {
    assert.strictEqual(sanitizePathForError('/home/user/secrets/file.json'), 'file.json');
  });

  test('returns basename for relative path', () => {
    assert.strictEqual(sanitizePathForError('./dir/file.json'), 'file.json');
  });

  test('returns "unknown" for null', () => {
    assert.strictEqual(sanitizePathForError(null), 'unknown');
  });

  test('returns "unknown" for empty string', () => {
    assert.strictEqual(sanitizePathForError(''), 'unknown');
  });
});

// ============================================================================
// Integration tests
// ============================================================================

describe('Integration tests', () => {
  test('full workflow: load, validate env, validate project, calculate summary', () => {
    const filePath = createValidRollbackFile('integration.json', {
      environment: 'sandbox',
      project: 'eur',
      timestamp: '2026-01-15T10:30:00.000Z',
      clients: [
        { id: 'acc1', status: 'RESCUED', before: { state: 'closed' }, after: { state: 'active', subscription_id: 'sub_1' } },
        { id: 'acc2', status: 'RESCUED', before: { state: 'closed' }, after: { state: 'active', subscription_id: 'sub_2' } },
        { id: 'acc3', status: 'FAILED', before: { state: 'closed' }, after: null, error: 'API timeout' }
      ]
    });

    // Load file
    const data = loadRollbackFile(filePath);

    // Validate environment
    validateEnvironmentMatch(data, 'sandbox');

    // Validate project
    validateProjectMatch(data, 'eur');

    // Calculate summary
    const summary = calculateRollbackSummary(data);

    assert.strictEqual(summary.environment, 'sandbox');
    assert.strictEqual(summary.project, 'eur');
    assert.strictEqual(summary.toRollback, 2);
    assert.strictEqual(summary.toSkip, 1);

    // Verify rollback clients have subscription_id for cancellation
    summary.clients.rollback.forEach(c => {
      assert.ok(c.after?.subscription_id, `Client ${c.id} should have subscription_id`);
    });
  });
});
