/**
 * State Manager Module Tests
 * Tests for state persistence and recovery functionality
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TEST_DIR = './test-state-files';

// Helper to create test directory
function setupTestDir() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

// Helper to clean up test directory
function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.readdirSync(TEST_DIR).forEach(f => {
      try {
        fs.unlinkSync(path.join(TEST_DIR, f));
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    try {
      fs.rmdirSync(TEST_DIR);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

beforeEach(() => {
  setupTestDir();
});

afterEach(() => {
  cleanupTestDir();
});

// ====================
// createStateManager() tests
// ====================

test('createStateManager() requires project', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  assert.throws(
    () => createStateManager({ environment: 'sandbox' }),
    /Project is required/
  );
});

test('createStateManager() requires environment', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  assert.throws(
    () => createStateManager({ project: 'eur' }),
    /Environment is required/
  );
});

test('createStateManager() returns manager with all methods', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  assert.ok(typeof manager.initialize === 'function');
  assert.ok(typeof manager.markProcessed === 'function');
  assert.ok(typeof manager.save === 'function');
  assert.ok(typeof manager.getState === 'function');
  assert.ok(typeof manager.getStateFilePath === 'function');
  assert.ok(typeof manager.cleanup === 'function');
  assert.ok(typeof manager.resumeFrom === 'function');
  assert.ok(typeof manager.getPendingAccounts === 'function');
  assert.ok(typeof manager.getProcessedCount === 'function');
  assert.ok(typeof manager.getTotalCount === 'function');
});

test('createStateManager() accepts optional mode', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);
  const state = manager.getState();

  assert.strictEqual(state.metadata.mode, 'rollback');
});

// ====================
// initialize() tests
// ====================

test('initialize() creates state file', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    stateDir: TEST_DIR
  });

  const accounts = [{ id: 'acc1' }, { id: 'acc2' }];
  manager.initialize(accounts);

  const filePath = manager.getStateFilePath();
  assert.ok(fs.existsSync(filePath), 'State file should exist');
});

test('initialize() creates valid state structure', (t) => {
  const { createStateManager, STATE_VERSION } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    stateDir: TEST_DIR
  });

  const accounts = [{ id: 'acc1' }, { id: 'acc2' }, { id: 'acc3' }];
  const state = manager.initialize(accounts);

  assert.strictEqual(state.version, STATE_VERSION);
  assert.strictEqual(state.metadata.project, 'eur');
  assert.strictEqual(state.metadata.environment, 'sandbox');
  assert.strictEqual(state.metadata.mode, 'rescue');
  assert.ok(state.metadata.startedAt);
  assert.ok(state.metadata.lastUpdated);
  assert.strictEqual(state.progress.total, 3);
  assert.strictEqual(state.progress.processed, 0);
  assert.strictEqual(state.progress.currentIndex, 0);
  assert.deepStrictEqual(state.accounts.pending, ['acc1', 'acc2', 'acc3']);
  assert.deepStrictEqual(state.accounts.processed, []);
});

test('initialize() handles empty accounts array', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  const state = manager.initialize([]);

  assert.strictEqual(state.progress.total, 0);
  assert.deepStrictEqual(state.accounts.pending, []);
});

test('initialize() creates state file with correct naming', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);

  const filePath = manager.getStateFilePath();
  const fileName = path.basename(filePath);

  assert.ok(fileName.startsWith('rescue-state-eur-'), 'File name should start with rescue-state-eur-');
  assert.ok(fileName.endsWith('.json'), 'File name should end with .json');
});

// ====================
// markProcessed() tests
// ====================

test('markProcessed() throws if not initialized', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  assert.throws(
    () => manager.markProcessed('acc1', { status: 'rescued' }),
    /State not initialized/
  );
});

test('markProcessed() updates progress correctly', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }, { id: 'acc2' }]);
  manager.markProcessed('acc1', { status: 'rescued', subscriptionId: 'sub1' });

  const state = manager.getState();
  assert.strictEqual(state.progress.processed, 1);
  assert.strictEqual(state.progress.currentIndex, 1);
});

test('markProcessed() moves account from pending to processed', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }, { id: 'acc2' }]);
  manager.markProcessed('acc1', { status: 'rescued' });

  const state = manager.getState();
  assert.deepStrictEqual(state.accounts.pending, ['acc2']);
  assert.strictEqual(state.accounts.processed.length, 1);
  assert.strictEqual(state.accounts.processed[0].id, 'acc1');
});

test('markProcessed() records success result correctly', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);
  manager.markProcessed('acc1', { status: 'rescued', subscriptionId: 'sub_xyz' });

  const state = manager.getState();
  const processed = state.accounts.processed[0];

  assert.strictEqual(processed.id, 'acc1');
  assert.strictEqual(processed.status, 'rescued');
  assert.strictEqual(processed.subscriptionId, 'sub_xyz');
  assert.strictEqual(processed.error, null);
  assert.ok(processed.processedAt);
});

test('markProcessed() records failure result correctly', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);
  manager.markProcessed('acc1', { status: 'failed', error: 'Connection timeout' });

  const state = manager.getState();
  const processed = state.accounts.processed[0];

  assert.strictEqual(processed.id, 'acc1');
  assert.strictEqual(processed.status, 'failed');
  assert.strictEqual(processed.subscriptionId, null);
  assert.strictEqual(processed.error, 'Connection timeout');
});

test('markProcessed() sanitizes sensitive error data', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);
  manager.markProcessed('acc1', {
    status: 'failed',
    error: 'Request failed with api_key=secret123abc'
  });

  const state = manager.getState();
  const processed = state.accounts.processed[0];

  assert.ok(!processed.error.includes('secret123abc'), 'API key should be redacted');
  assert.ok(processed.error.includes('[REDACTED]'), 'Should contain [REDACTED]');
});

test('markProcessed() persists state to disk', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }, { id: 'acc2' }]);
  manager.markProcessed('acc1', { status: 'rescued' });

  // Read file directly to verify persistence
  const filePath = manager.getStateFilePath();
  const content = fs.readFileSync(filePath, 'utf8');
  const savedState = JSON.parse(content);

  assert.strictEqual(savedState.progress.processed, 1);
  assert.strictEqual(savedState.accounts.processed[0].id, 'acc1');
});

// ====================
// getState() tests
// ====================

test('getState() returns null before initialize', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  assert.strictEqual(manager.getState(), null);
});

test('getState() returns current state after initialize', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);
  const state = manager.getState();

  assert.ok(state);
  assert.strictEqual(state.progress.total, 1);
});

// ====================
// getPendingAccounts() tests
// ====================

test('getPendingAccounts() returns empty array before initialize', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  assert.deepStrictEqual(manager.getPendingAccounts(), []);
});

test('getPendingAccounts() returns pending IDs', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }, { id: 'acc2' }]);
  manager.markProcessed('acc1', { status: 'rescued' });

  assert.deepStrictEqual(manager.getPendingAccounts(), ['acc2']);
});

// ====================
// getProcessedCount() tests
// ====================

test('getProcessedCount() returns 0 before initialize', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  assert.strictEqual(manager.getProcessedCount(), 0);
});

test('getProcessedCount() returns correct count', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }, { id: 'acc2' }, { id: 'acc3' }]);
  manager.markProcessed('acc1', { status: 'rescued' });
  manager.markProcessed('acc2', { status: 'failed', error: 'Error' });

  assert.strictEqual(manager.getProcessedCount(), 2);
});

// ====================
// getTotalCount() tests
// ====================

test('getTotalCount() returns 0 before initialize', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  assert.strictEqual(manager.getTotalCount(), 0);
});

test('getTotalCount() returns total count', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }, { id: 'acc2' }, { id: 'acc3' }]);

  assert.strictEqual(manager.getTotalCount(), 3);
});

// ====================
// cleanup() tests
// ====================

test('cleanup() removes state file', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);
  const filePath = manager.getStateFilePath();
  assert.ok(fs.existsSync(filePath), 'State file should exist before cleanup');

  manager.cleanup();
  assert.ok(!fs.existsSync(filePath), 'State file should not exist after cleanup');
});

test('cleanup() handles non-existent file gracefully', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);
  const filePath = manager.getStateFilePath();

  // Manually delete file
  fs.unlinkSync(filePath);

  // Should not throw
  assert.doesNotThrow(() => manager.cleanup());
});

// [MEDIUM-4 FIX] Test for orphaned temp file cleanup
test('cleanup() removes orphaned temp files', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);
  const filePath = manager.getStateFilePath();
  const stateBasename = path.basename(filePath);

  // Create orphaned temp files (simulating crash during save)
  const tempFile1 = path.join(TEST_DIR, `${stateBasename}.tmp.12345.1234567890`);
  const tempFile2 = path.join(TEST_DIR, `${stateBasename}.tmp.67890.9876543210`);
  fs.writeFileSync(tempFile1, '{}');
  fs.writeFileSync(tempFile2, '{}');

  assert.ok(fs.existsSync(tempFile1), 'Temp file 1 should exist before cleanup');
  assert.ok(fs.existsSync(tempFile2), 'Temp file 2 should exist before cleanup');

  manager.cleanup();

  assert.ok(!fs.existsSync(filePath), 'State file should be removed');
  assert.ok(!fs.existsSync(tempFile1), 'Temp file 1 should be removed');
  assert.ok(!fs.existsSync(tempFile2), 'Temp file 2 should be removed');
});

// ====================
// resumeFrom() tests
// ====================

test('resumeFrom() restores state', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  const loadedState = {
    version: '1.0.0',
    metadata: {
      project: 'eur',
      environment: 'sandbox',
      startedAt: '2026-01-20T10:00:00.000Z',
      lastUpdated: '2026-01-20T10:05:00.000Z',
      mode: 'rescue'
    },
    progress: {
      total: 10,
      processed: 5,
      currentIndex: 5
    },
    accounts: {
      processed: [{ id: 'acc1', status: 'rescued' }],
      pending: ['acc6', 'acc7', 'acc8', 'acc9', 'acc10']
    }
  };

  manager.resumeFrom(loadedState, '/fake/path/state.json');

  assert.deepStrictEqual(manager.getState(), loadedState);
  assert.strictEqual(manager.getStateFilePath(), '/fake/path/state.json');
  assert.strictEqual(manager.getProcessedCount(), 5);
  assert.deepStrictEqual(manager.getPendingAccounts(), ['acc6', 'acc7', 'acc8', 'acc9', 'acc10']);
});

// ====================
// findLatestStateFile() tests
// ====================

test('findLatestStateFile() returns null for empty directory', (t) => {
  const { findLatestStateFile } = require('../src/state/state-manager');

  const result = findLatestStateFile('eur', TEST_DIR);
  assert.strictEqual(result, null);
});

test('findLatestStateFile() returns null for non-existent directory', (t) => {
  const { findLatestStateFile } = require('../src/state/state-manager');

  const result = findLatestStateFile('eur', '/non/existent/dir');
  assert.strictEqual(result, null);
});

test('findLatestStateFile() returns latest file by mtime', (t) => {
  const { findLatestStateFile } = require('../src/state/state-manager');

  // Create two state files
  const file1 = path.join(TEST_DIR, 'rescue-state-eur-2026-01-20T10-00-00.json');
  const file2 = path.join(TEST_DIR, 'rescue-state-eur-2026-01-20T11-00-00.json');

  fs.writeFileSync(file1, '{"version":"1.0.0"}');

  // Small delay to ensure different mtime
  const start = Date.now();
  while (Date.now() - start < 10) { /* wait */ }

  fs.writeFileSync(file2, '{"version":"1.0.0"}');

  const latest = findLatestStateFile('eur', TEST_DIR);
  assert.strictEqual(path.basename(latest), 'rescue-state-eur-2026-01-20T11-00-00.json');
});

test('findLatestStateFile() filters by project', (t) => {
  const { findLatestStateFile } = require('../src/state/state-manager');

  // Create files for different projects
  const eurFile = path.join(TEST_DIR, 'rescue-state-eur-2026-01-20T10-00-00.json');
  const usFile = path.join(TEST_DIR, 'rescue-state-us-2026-01-20T11-00-00.json');

  fs.writeFileSync(eurFile, '{}');
  fs.writeFileSync(usFile, '{}');

  const latest = findLatestStateFile('eur', TEST_DIR);
  assert.ok(latest.includes('eur'), 'Should find eur file');
  assert.ok(!latest.includes('us'), 'Should not find us file');
});

test('findLatestStateFile() ignores .tmp files', (t) => {
  const { findLatestStateFile } = require('../src/state/state-manager');

  const stateFile = path.join(TEST_DIR, 'rescue-state-eur-2026-01-20T10-00-00.json');
  const tempFile = path.join(TEST_DIR, 'rescue-state-eur-2026-01-20T11-00-00.json.tmp');

  fs.writeFileSync(stateFile, '{}');
  fs.writeFileSync(tempFile, '{}');

  const latest = findLatestStateFile('eur', TEST_DIR);
  assert.ok(!latest.includes('.tmp'), 'Should not return .tmp file');
});

// ====================
// loadStateFile() tests
// ====================

test('loadStateFile() throws for non-existent file', (t) => {
  const { loadStateFile } = require('../src/state/state-manager');

  assert.throws(
    () => loadStateFile('/non/existent/file.json'),
    /State file not found/
  );
});

test('loadStateFile() throws for invalid JSON', (t) => {
  const { loadStateFile } = require('../src/state/state-manager');

  const filePath = path.join(TEST_DIR, 'invalid.json');
  fs.writeFileSync(filePath, '{ invalid json }');

  assert.throws(
    () => loadStateFile(filePath),
    /corrupted.*invalid JSON/
  );
});

// [MEDIUM-1 FIX] Test for empty file (also corrupted)
test('loadStateFile() throws for empty file', (t) => {
  const { loadStateFile } = require('../src/state/state-manager');

  const filePath = path.join(TEST_DIR, 'empty.json');
  fs.writeFileSync(filePath, '');

  assert.throws(
    () => loadStateFile(filePath),
    /corrupted.*invalid JSON/
  );
});

test('loadStateFile() throws for truncated JSON', (t) => {
  const { loadStateFile } = require('../src/state/state-manager');

  const filePath = path.join(TEST_DIR, 'truncated.json');
  fs.writeFileSync(filePath, '{"version": "1.0.0", "metadata": {');

  assert.throws(
    () => loadStateFile(filePath),
    /corrupted.*invalid JSON/
  );
});

test('loadStateFile() returns valid state', (t) => {
  const { loadStateFile } = require('../src/state/state-manager');

  // Create valid state with consistent counts
  const processedAccounts = [
    { id: 'acc1', status: 'rescued' },
    { id: 'acc2', status: 'rescued' },
    { id: 'acc3', status: 'rescued' },
    { id: 'acc4', status: 'rescued' },
    { id: 'acc5', status: 'rescued' }
  ];

  const validState = {
    version: '1.0.0',
    metadata: {
      project: 'eur',
      environment: 'sandbox',
      startedAt: '2026-01-20T10:00:00.000Z',
      lastUpdated: '2026-01-20T10:00:00.000Z',
      mode: 'rescue'
    },
    progress: {
      total: 10,
      processed: 5,  // Must match processedAccounts.length
      currentIndex: 5
    },
    accounts: {
      processed: processedAccounts,
      pending: []
    }
  };

  const filePath = path.join(TEST_DIR, 'valid.json');
  fs.writeFileSync(filePath, JSON.stringify(validState));

  const loaded = loadStateFile(filePath);
  assert.deepStrictEqual(loaded, validState);
});

// ====================
// validateStateSchema() tests
// ====================

test('validateStateSchema() throws on missing version', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({}),
    /missing version/
  );
});

test('validateStateSchema() throws on missing metadata', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({ version: '1.0.0' }),
    /missing metadata/
  );
});

test('validateStateSchema() throws on missing project in metadata', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { environment: 'sandbox' }
    }),
    /missing project in metadata/
  );
});

test('validateStateSchema() throws on missing environment in metadata', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { project: 'eur' }
    }),
    /missing environment in metadata/
  );
});

test('validateStateSchema() throws on missing progress', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { project: 'eur', environment: 'sandbox' }
    }),
    /missing progress section/
  );
});

test('validateStateSchema() throws on invalid progress.total', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { project: 'eur', environment: 'sandbox' },
      progress: { total: 'invalid', processed: 0 }
    }),
    /invalid progress.total/
  );
});

test('validateStateSchema() throws on invalid progress.processed', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { project: 'eur', environment: 'sandbox' },
      progress: { total: 10, processed: 'invalid' }
    }),
    /invalid progress.processed/
  );
});

test('validateStateSchema() throws on missing accounts section', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { project: 'eur', environment: 'sandbox' },
      progress: { total: 10, processed: 0, currentIndex: 0 }
    }),
    /missing accounts section/
  );
});

test('validateStateSchema() throws on invalid accounts.processed', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { project: 'eur', environment: 'sandbox' },
      progress: { total: 10, processed: 0, currentIndex: 0 },
      accounts: { processed: 'invalid', pending: [] }
    }),
    /invalid accounts.processed/
  );
});

test('validateStateSchema() throws on invalid accounts.pending', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { project: 'eur', environment: 'sandbox' },
      progress: { total: 10, processed: 0, currentIndex: 0 },
      accounts: { processed: [], pending: 'invalid' }
    }),
    /invalid accounts.pending/
  );
});

test('validateStateSchema() throws on invalid currentIndex', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { project: 'eur', environment: 'sandbox' },
      progress: { total: 10, processed: 0, currentIndex: 'invalid' },
      accounts: { processed: [], pending: [] }
    }),
    /invalid progress.currentIndex/
  );
});

test('validateStateSchema() throws on processed count mismatch', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  assert.throws(
    () => validateStateSchema({
      version: '1.0.0',
      metadata: { project: 'eur', environment: 'sandbox' },
      progress: { total: 10, processed: 5, currentIndex: 5 },
      accounts: { processed: [{ id: 'acc1' }], pending: [] }  // Only 1 processed, but progress.processed = 5
    }),
    /processed does not match accounts.processed count/
  );
});

test('validateStateSchema() accepts valid state', (t) => {
  const { validateStateSchema } = require('../src/state/state-manager');

  const validState = {
    version: '1.0.0',
    metadata: { project: 'eur', environment: 'sandbox' },
    progress: { total: 10, processed: 0, currentIndex: 0 },
    accounts: { processed: [], pending: [] }
  };

  assert.doesNotThrow(() => validateStateSchema(validState));
});

// ====================
// sanitizeErrorForState() tests
// ====================

test('sanitizeErrorForState() redacts API keys', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  const result = sanitizeErrorForState('Error with api_key=secret123');
  assert.ok(!result.includes('secret123'));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitizeErrorForState() redacts Bearer tokens', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  const result = sanitizeErrorForState('Auth failed: Bearer abc123xyz');
  assert.ok(!result.includes('abc123xyz'));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitizeErrorForState() redacts Authorization headers', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  const result = sanitizeErrorForState('Header Authorization: Basic secret');
  assert.ok(!result.includes('Basic secret'));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitizeErrorForState() handles null', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  assert.strictEqual(sanitizeErrorForState(null), 'Unknown error');
});

test('sanitizeErrorForState() handles undefined', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  assert.strictEqual(sanitizeErrorForState(undefined), 'Unknown error');
});

test('sanitizeErrorForState() preserves safe messages', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  const safe = 'Connection timeout after 30 seconds';
  assert.strictEqual(sanitizeErrorForState(safe), safe);
});

test('sanitizeErrorForState() redacts password patterns', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  const result = sanitizeErrorForState('Connection failed: password=secret123');
  assert.ok(!result.includes('secret123'));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitizeErrorForState() redacts token patterns', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  const result = sanitizeErrorForState('Request failed with token=abc123xyz');
  assert.ok(!result.includes('abc123xyz'));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitizeErrorForState() redacts URL credentials', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  const result = sanitizeErrorForState('Connection to https://user:pass123@api.example.com failed');
  assert.ok(!result.includes('pass123'));
  assert.ok(!result.includes('user:'));
  assert.ok(result.includes('[REDACTED]@'));
});

test('sanitizeErrorForState() redacts secret patterns', (t) => {
  const { sanitizeErrorForState } = require('../src/state/state-manager');

  const result = sanitizeErrorForState('Config error: secret=mysecret');
  assert.ok(!result.includes('mysecret'));
  assert.ok(result.includes('[REDACTED]'));
});

// ====================
// STATE_VERSION constant tests
// ====================

test('STATE_VERSION is defined', (t) => {
  const { STATE_VERSION } = require('../src/state/state-manager');

  assert.ok(STATE_VERSION);
  assert.strictEqual(typeof STATE_VERSION, 'string');
});

// ====================
// Integration tests
// ====================

test('full workflow: initialize, process, complete', (t) => {
  const { createStateManager } = require('../src/state/state-manager');

  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  // Initialize
  manager.initialize([{ id: 'acc1' }, { id: 'acc2' }, { id: 'acc3' }]);
  assert.strictEqual(manager.getTotalCount(), 3);
  assert.strictEqual(manager.getProcessedCount(), 0);
  assert.deepStrictEqual(manager.getPendingAccounts(), ['acc1', 'acc2', 'acc3']);

  // Process first
  manager.markProcessed('acc1', { status: 'rescued', subscriptionId: 'sub1' });
  assert.strictEqual(manager.getProcessedCount(), 1);
  assert.deepStrictEqual(manager.getPendingAccounts(), ['acc2', 'acc3']);

  // Process second (failure)
  manager.markProcessed('acc2', { status: 'failed', error: 'API error' });
  assert.strictEqual(manager.getProcessedCount(), 2);
  assert.deepStrictEqual(manager.getPendingAccounts(), ['acc3']);

  // Process third
  manager.markProcessed('acc3', { status: 'rescued', subscriptionId: 'sub3' });
  assert.strictEqual(manager.getProcessedCount(), 3);
  assert.deepStrictEqual(manager.getPendingAccounts(), []);

  // Verify final state
  const state = manager.getState();
  assert.strictEqual(state.accounts.processed.length, 3);
  assert.strictEqual(state.accounts.processed[0].status, 'rescued');
  assert.strictEqual(state.accounts.processed[1].status, 'failed');
  assert.strictEqual(state.accounts.processed[2].status, 'rescued');

  // Cleanup
  const filePath = manager.getStateFilePath();
  manager.cleanup();
  assert.ok(!fs.existsSync(filePath));
});

test('resume workflow: load and continue', (t) => {
  const { createStateManager, loadStateFile, findLatestStateFile } = require('../src/state/state-manager');

  // First run: initialize and process some
  const manager1 = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager1.initialize([{ id: 'acc1' }, { id: 'acc2' }, { id: 'acc3' }]);
  manager1.markProcessed('acc1', { status: 'rescued' });
  const savedPath = manager1.getStateFilePath();

  // Simulate crash - just read the file
  const loadedState = loadStateFile(savedPath);
  assert.strictEqual(loadedState.progress.processed, 1);
  assert.deepStrictEqual(loadedState.accounts.pending, ['acc2', 'acc3']);

  // Second run: resume
  const manager2 = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    stateDir: TEST_DIR
  });

  manager2.resumeFrom(loadedState, savedPath);
  assert.strictEqual(manager2.getProcessedCount(), 1);
  assert.deepStrictEqual(manager2.getPendingAccounts(), ['acc2', 'acc3']);

  // Continue processing
  manager2.markProcessed('acc2', { status: 'rescued' });
  assert.strictEqual(manager2.getProcessedCount(), 2);
  assert.deepStrictEqual(manager2.getPendingAccounts(), ['acc3']);
});
