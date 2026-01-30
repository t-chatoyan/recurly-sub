/**
 * Results Writer Module Tests
 * Tests for output generation functionality
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TEST_DIR = './test-output-files';

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
// createResultsWriter() tests
// ====================

test('createResultsWriter() requires project', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  assert.throws(
    () => createResultsWriter({ environment: 'sandbox' }),
    /Project is required/
  );
});

test('createResultsWriter() requires environment', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  assert.throws(
    () => createResultsWriter({ project: 'eur' }),
    /Environment is required/
  );
});

test('createResultsWriter() returns writer with all methods', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  assert.ok(typeof writer.addClientResult === 'function');
  assert.ok(typeof writer.finalize === 'function');
  assert.ok(typeof writer.getResults === 'function');
  assert.ok(typeof writer.getSummary === 'function');
});

test('createResultsWriter() initializes with correct structure', (t) => {
  const { createResultsWriter, RESULTS_VERSION } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    outputDir: TEST_DIR
  });

  const results = writer.getResults();

  // Version field
  assert.strictEqual(results.version, RESULTS_VERSION);

  // Execution block
  assert.ok(results.execution);
  assert.strictEqual(results.execution.project, 'eur');
  assert.strictEqual(results.execution.environment, 'sandbox');
  assert.strictEqual(results.execution.mode, 'rescue');
  assert.ok(results.execution.timestamp);

  // Summary block
  assert.ok(results.summary);
  assert.strictEqual(results.summary.total, 0);
  assert.strictEqual(results.summary.rescued, 0);
  assert.strictEqual(results.summary.failed, 0);

  // Clients array
  assert.ok(Array.isArray(results.clients));
  assert.strictEqual(results.clients.length, 0);
});

test('createResultsWriter() defaults mode to rescue', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  const results = writer.getResults();
  assert.strictEqual(results.execution.mode, 'rescue');
});

test('createResultsWriter() supports rollback mode with source file', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    sourceFile: '/tmp/rescue-results-eur-2026-01-15.json',
    outputDir: TEST_DIR
  });

  const results = writer.getResults();
  assert.strictEqual(results.execution.mode, 'rollback');
  assert.strictEqual(results.execution.source_file, 'rescue-results-eur-2026-01-15.json');
  assert.strictEqual(results.summary.rolled_back, 0);
  assert.strictEqual(results.summary.skipped, 0);
  assert.strictEqual(results.summary.failed, 0);
});

// ====================
// addClientResult() tests
// ====================

test('addClientResult() adds client to results', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({
    id: 'acc_001',
    status: 'RESCUED',
    before: { state: 'closed', subscriptions: [] },
    after: { state: 'active', subscription_id: 'sub_xyz' }
  });

  const results = writer.getResults();
  assert.strictEqual(results.clients.length, 1);
  assert.strictEqual(results.clients[0].id, 'acc_001');
  assert.strictEqual(results.clients[0].status, 'RESCUED');
});

test('addClientResult() updates summary for RESCUED', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'RESCUED', before: {}, after: {} });
  writer.addClientResult({ id: 'acc2', status: 'RESCUED', before: {}, after: {} });

  const summary = writer.getSummary();
  assert.strictEqual(summary.total, 2);
  assert.strictEqual(summary.rescued, 2);
  assert.strictEqual(summary.failed, 0);
});

test('addClientResult() updates summary for FAILED', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'FAILED', before: {}, error: 'timeout' });
  writer.addClientResult({ id: 'acc2', status: 'FAILED', before: {}, error: 'error' });

  const summary = writer.getSummary();
  assert.strictEqual(summary.total, 2);
  assert.strictEqual(summary.rescued, 0);
  assert.strictEqual(summary.failed, 2);
});

test('addClientResult() handles mixed results', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'RESCUED', before: {}, after: {} });
  writer.addClientResult({ id: 'acc2', status: 'FAILED', before: {}, error: 'timeout' });
  writer.addClientResult({ id: 'acc3', status: 'RESCUED', before: {}, after: {} });

  const summary = writer.getSummary();
  assert.strictEqual(summary.total, 3);
  assert.strictEqual(summary.rescued, 2);
  assert.strictEqual(summary.failed, 1);
});

test('addClientResult() updates summary for rollback statuses', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'ROLLED_BACK', before: {}, after: {} });
  writer.addClientResult({ id: 'acc2', status: 'SKIPPED', before: null, after: null, reason: 'not rescued' });
  writer.addClientResult({ id: 'acc3', status: 'FAILED', before: {}, after: null, error: 'API error' });

  const summary = writer.getSummary();
  assert.strictEqual(summary.total, 3);
  assert.strictEqual(summary.rolled_back, 1);
  assert.strictEqual(summary.skipped, 1);
  assert.strictEqual(summary.failed, 1);
});

test('addClientResult() updates summary for SKIPPED in rescue mode', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'RESCUED', before: {}, after: {} });
  writer.addClientResult({ id: 'acc2', status: 'SKIPPED', before: {}, reason: 'no billing info' });
  writer.addClientResult({ id: 'acc3', status: 'FAILED', before: {}, error: 'API error' });

  const summary = writer.getSummary();
  assert.strictEqual(summary.total, 3);
  assert.strictEqual(summary.rescued, 1);
  assert.strictEqual(summary.skipped, 1);
  assert.strictEqual(summary.failed, 1);
});

test('addClientResult() updates summary for REQUIRES_3DS in rescue mode', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'RESCUED', before: {}, after: {} });
  writer.addClientResult({ id: 'acc2', status: 'REQUIRES_3DS', before: {}, error: '3DS required' });

  const summary = writer.getSummary();
  assert.strictEqual(summary.total, 2);
  assert.strictEqual(summary.rescued, 1);
  assert.strictEqual(summary.skipped, 1); // REQUIRES_3DS counts as skipped
  assert.strictEqual(summary.failed, 0);
});

test('addClientResult() throws for missing id', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  assert.throws(
    () => writer.addClientResult({ status: 'RESCUED', before: {}, after: {} }),
    /Client ID is required/
  );
});

test('addClientResult() throws for null id', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  assert.throws(
    () => writer.addClientResult({ id: null, status: 'RESCUED', before: {}, after: {} }),
    /Client ID is required/
  );
});

test('addClientResult() throws for empty id', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  assert.throws(
    () => writer.addClientResult({ id: '', status: 'RESCUED', before: {}, after: {} }),
    /Client ID is required/
  );
});

test('addClientResult() includes reason for skipped rollback clients', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    outputDir: TEST_DIR
  });

  writer.addClientResult({
    id: 'acc1',
    status: 'SKIPPED',
    before: null,
    after: null,
    reason: 'Client was not rescued in original execution'
  });

  const results = writer.getResults();
  assert.strictEqual(results.clients[0].reason, 'Client was not rescued in original execution');
});

test('addClientResult() uses default before state if missing', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'RESCUED', after: {} });

  const results = writer.getResults();
  assert.deepStrictEqual(results.clients[0].before, { state: 'unknown', subscriptions: [] });
});

test('addClientResult() sets after to null if missing', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'FAILED', before: {}, error: 'error' });

  const results = writer.getResults();
  assert.strictEqual(results.clients[0].after, null);
});

test('addClientResult() sanitizes error messages', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({
    id: 'acc1',
    status: 'FAILED',
    before: {},
    error: 'Request failed with api_key=secret123'
  });

  const results = writer.getResults();
  assert.ok(!results.clients[0].error.includes('secret123'));
  assert.ok(results.clients[0].error.includes('[REDACTED]'));
});

// ====================
// finalize() tests
// ====================

test('finalize() creates JSON file', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'RESCUED', before: {}, after: {} });

  const result = writer.finalize();

  assert.ok(result.filePath);
  assert.ok(fs.existsSync(result.filePath));
  assert.strictEqual(result.skipped, false);
});

test('finalize() creates file with correct naming', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'multi',
    environment: 'production',
    outputDir: TEST_DIR
  });

  const result = writer.finalize();

  assert.ok(result.filePath.includes('rescue-results-multi-'));
  assert.ok(result.filePath.endsWith('.json'));
});

test('finalize() creates rollback file with correct naming', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    outputDir: TEST_DIR
  });

  const result = writer.finalize();

  assert.ok(result.filePath.includes('rollback-results-eur-'));
  assert.ok(result.filePath.endsWith('.json'));
});

test('finalize() returns correct summary', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'RESCUED', before: {}, after: {} });
  writer.addClientResult({ id: 'acc2', status: 'FAILED', before: {}, error: 'error' });

  const result = writer.finalize();

  assert.strictEqual(result.summary.total, 2);
  assert.strictEqual(result.summary.rescued, 1);
  assert.strictEqual(result.summary.failed, 1);
});

test('finalize() skips file in dry-run mode', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    dryRun: true,
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'RESCUED', before: {}, after: {} });

  const result = writer.finalize();

  assert.strictEqual(result.filePath, null);
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.reason, 'dry-run mode');
});

test('finalize() still returns summary in dry-run mode', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    dryRun: true,
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'RESCUED', before: {}, after: {} });
  writer.addClientResult({ id: 'acc2', status: 'RESCUED', before: {}, after: {} });

  const result = writer.finalize();

  assert.strictEqual(result.summary.total, 2);
  assert.strictEqual(result.summary.rescued, 2);
});

test('finalize() creates valid JSON content', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    outputDir: TEST_DIR
  });

  writer.addClientResult({
    id: 'acc_abc123',
    status: 'RESCUED',
    before: { state: 'closed', subscriptions: [] },
    after: { state: 'active', subscription_id: 'sub_xyz789' }
  });

  const result = writer.finalize();
  const content = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));

  // Verify structure
  assert.ok(content.execution);
  assert.ok(content.summary);
  assert.ok(Array.isArray(content.clients));
});

test('finalize() creates file matching PRD schema', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    outputDir: TEST_DIR
  });

  writer.addClientResult({
    id: 'acc_abc123',
    status: 'RESCUED',
    before: { state: 'closed', subscriptions: [] },
    after: { state: 'active', subscription_id: 'sub_xyz789' }
  });

  writer.addClientResult({
    id: 'acc_def456',
    status: 'FAILED',
    before: { state: 'closed', subscriptions: [] },
    error: 'API returned 500: Internal server error'
  });

  const result = writer.finalize();
  const content = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));

  // Verify PRD schema compliance
  assert.ok(content.execution.timestamp);
  assert.strictEqual(content.execution.environment, 'sandbox');
  assert.strictEqual(content.execution.project, 'eur');
  assert.strictEqual(content.execution.mode, 'rescue');

  assert.strictEqual(content.summary.total, 2);
  assert.strictEqual(content.summary.rescued, 1);
  assert.strictEqual(content.summary.failed, 1);

  // Verify first client (success)
  const successClient = content.clients[0];
  assert.strictEqual(successClient.id, 'acc_abc123');
  assert.strictEqual(successClient.status, 'RESCUED');
  assert.ok(successClient.before);
  assert.ok(successClient.after);
  assert.strictEqual(successClient.error, null);

  // Verify second client (failure)
  const failedClient = content.clients[1];
  assert.strictEqual(failedClient.id, 'acc_def456');
  assert.strictEqual(failedClient.status, 'FAILED');
  assert.ok(failedClient.before);
  assert.strictEqual(failedClient.after, null);
  assert.ok(failedClient.error.includes('Internal server error'));
});

test('finalize() creates rollback file matching PRD schema', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    sourceFile: 'rescue-results-2026-01-15.json',
    outputDir: TEST_DIR
  });

  writer.addClientResult({
    id: 'acc_abc123',
    status: 'ROLLED_BACK',
    before: { state: 'active', subscription_id: 'sub_xyz789' },
    after: { state: 'closed', subscriptions: [] }
  });

  const result = writer.finalize();
  const content = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));

  assert.strictEqual(content.execution.mode, 'rollback');
  assert.strictEqual(content.execution.source_file, 'rescue-results-2026-01-15.json');
  assert.ok(content.summary.rolled_back !== undefined);
  assert.ok(content.summary.skipped !== undefined);
  assert.ok(content.summary.failed !== undefined);
});

test('finalize() handles empty clients array', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  const result = writer.finalize();

  assert.ok(result.filePath);
  assert.strictEqual(result.summary.total, 0);

  const content = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));
  assert.strictEqual(content.clients.length, 0);
});

// ====================
// displayStatistics() tests
// ====================

test('displayStatistics() shows all required fields', (t) => {
  const { displayStatistics } = require('../src/output/results-writer');

  const logs = [];
  const mockLog = (msg) => logs.push(msg);

  displayStatistics(
    { total: 100, rescued: 95, skipped: 0, failed: 5 },
    '/path/to/file.json',
    false,
    { log: mockLog }
  );

  const output = logs.join('\n');
  assert.ok(output.includes('Total clients processed: 100'));
  assert.ok(output.includes('Successful rescues:      95'));
  assert.ok(output.includes('Failed rescues:          5'));
  assert.ok(output.includes('Success rate:            95.0%'));
  assert.ok(output.includes('/path/to/file.json'));
});

test('displayStatistics() shows skipped count when present', (t) => {
  const { displayStatistics } = require('../src/output/results-writer');

  const logs = [];
  const mockLog = (msg) => logs.push(msg);

  displayStatistics(
    { total: 100, rescued: 85, skipped: 10, failed: 5 },
    '/path/to/file.json',
    false,
    { log: mockLog }
  );

  const output = logs.join('\n');
  assert.ok(output.includes('Total clients processed: 100'));
  assert.ok(output.includes('Successful rescues:      85'));
  assert.ok(output.includes('Skipped:                 10'));
  assert.ok(output.includes('Failed rescues:          5'));
  // Success rate should exclude skipped: 85 / (100 - 10) = 94.4%
  assert.ok(output.includes('Success rate:            94.4%'));
});

test('displayStatistics() shows dry-run prefix', (t) => {
  const { displayStatistics } = require('../src/output/results-writer');

  const logs = [];
  const mockLog = (msg) => logs.push(msg);

  displayStatistics(
    { total: 10, rescued: 10, failed: 0 },
    null,
    true,
    { log: mockLog }
  );

  const output = logs.join('\n');
  assert.ok(output.includes('[DRY-RUN]'));
  assert.ok(output.includes('Would rescue:'));
  assert.ok(output.includes('Not generated (dry-run mode)'));
});

test('displayStatistics() shows success rate', (t) => {
  const { displayStatistics } = require('../src/output/results-writer');

  const logs = [];
  const mockLog = (msg) => logs.push(msg);

  displayStatistics(
    { total: 50, rescued: 40, failed: 10 },
    null,
    false,
    { log: mockLog }
  );

  const output = logs.join('\n');
  assert.ok(output.includes('Success rate:            80.0%'));
});

test('displayStatistics() handles zero total', (t) => {
  const { displayStatistics } = require('../src/output/results-writer');

  const logs = [];
  const mockLog = (msg) => logs.push(msg);

  // Should not throw on division by zero
  displayStatistics(
    { total: 0, rescued: 0, failed: 0 },
    null,
    false,
    { log: mockLog }
  );

  const output = logs.join('\n');
  assert.ok(output.includes('Total clients processed: 0'));
  // Should not include success rate when total is 0
  assert.ok(!output.includes('Success rate'));
});

// ====================
// displayRollbackStatistics() tests
// ====================

test('displayRollbackStatistics() shows correct labels and success rate', (t) => {
  const { displayRollbackStatistics } = require('../src/output/results-writer');

  const logs = [];
  const mockLog = (msg) => logs.push(msg);

  displayRollbackStatistics(
    { total: 100, rolled_back: 90, skipped: 5, failed: 5 },
    '/path/to/rollback-results.json',
    { log: mockLog }
  );

  const output = logs.join('\n');
  assert.ok(output.includes('ROLLBACK SUMMARY'));
  assert.ok(output.includes('Total clients processed:   100'));
  assert.ok(output.includes('Successfully rolled back:  90'));
  assert.ok(output.includes('Skipped (not rescued):     5'));
  assert.ok(output.includes('Failed:                    5'));
  assert.ok(output.includes('Success rate:              94.7%'));
  assert.ok(output.includes('/path/to/rollback-results.json'));
});

// ====================
// loadResultsFile() tests
// ====================

test('loadResultsFile() throws for non-existent file', (t) => {
  const { loadResultsFile } = require('../src/output/results-writer');

  assert.throws(
    () => loadResultsFile('/non/existent/file.json'),
    /Results file not found/
  );
});

test('loadResultsFile() throws for invalid JSON', (t) => {
  const { loadResultsFile } = require('../src/output/results-writer');

  const filePath = path.join(TEST_DIR, 'invalid.json');
  fs.writeFileSync(filePath, '{ invalid json }');

  assert.throws(
    () => loadResultsFile(filePath),
    /corrupted.*invalid JSON/
  );
});

test('loadResultsFile() throws for missing version', (t) => {
  const { loadResultsFile } = require('../src/output/results-writer');

  const filePath = path.join(TEST_DIR, 'missing-version.json');
  fs.writeFileSync(filePath, JSON.stringify({ execution: {}, summary: {}, clients: [] }));

  assert.throws(
    () => loadResultsFile(filePath),
    /missing version field/
  );
});

test('loadResultsFile() throws for missing execution section', (t) => {
  const { loadResultsFile, RESULTS_VERSION } = require('../src/output/results-writer');

  const filePath = path.join(TEST_DIR, 'missing-execution.json');
  fs.writeFileSync(filePath, JSON.stringify({ version: RESULTS_VERSION, summary: {}, clients: [] }));

  assert.throws(
    () => loadResultsFile(filePath),
    /missing execution section/
  );
});

test('loadResultsFile() throws for missing summary section', (t) => {
  const { loadResultsFile, RESULTS_VERSION } = require('../src/output/results-writer');

  const filePath = path.join(TEST_DIR, 'missing-summary.json');
  fs.writeFileSync(filePath, JSON.stringify({ version: RESULTS_VERSION, execution: {}, clients: [] }));

  assert.throws(
    () => loadResultsFile(filePath),
    /missing summary section/
  );
});

test('loadResultsFile() throws for missing clients array', (t) => {
  const { loadResultsFile, RESULTS_VERSION } = require('../src/output/results-writer');

  const filePath = path.join(TEST_DIR, 'missing-clients.json');
  fs.writeFileSync(filePath, JSON.stringify({ version: RESULTS_VERSION, execution: {}, summary: {} }));

  assert.throws(
    () => loadResultsFile(filePath),
    /missing or invalid clients array/
  );
});

test('loadResultsFile() returns valid results', (t) => {
  const { loadResultsFile, RESULTS_VERSION } = require('../src/output/results-writer');

  const validResults = {
    version: RESULTS_VERSION,
    execution: {
      timestamp: '2026-01-20T10:00:00.000Z',
      environment: 'sandbox',
      project: 'eur',
      mode: 'rescue'
    },
    summary: { total: 10, rescued: 8, failed: 2 },
    clients: [{ id: 'acc1', status: 'RESCUED' }]
  };

  const filePath = path.join(TEST_DIR, 'valid-results.json');
  fs.writeFileSync(filePath, JSON.stringify(validResults));

  const loaded = loadResultsFile(filePath);
  assert.deepStrictEqual(loaded, validResults);
});

test('finalize() throws for non-existent output directory', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: '/non/existent/directory'
  });

  assert.throws(
    () => writer.finalize(),
    /Output directory does not exist/
  );
});

// ====================
// sanitizeError() tests
// ====================

test('sanitizeError() returns null for null input', (t) => {
  const { sanitizeError } = require('../src/output/results-writer');

  assert.strictEqual(sanitizeError(null), null);
});

test('sanitizeError() returns null for undefined input', (t) => {
  const { sanitizeError } = require('../src/output/results-writer');

  assert.strictEqual(sanitizeError(undefined), null);
});

test('sanitizeError() redacts API keys', (t) => {
  const { sanitizeError } = require('../src/output/results-writer');

  const result = sanitizeError('Error with api_key=secret123');
  assert.ok(!result.includes('secret123'));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitizeError() redacts Bearer tokens', (t) => {
  const { sanitizeError } = require('../src/output/results-writer');

  const result = sanitizeError('Auth failed: Bearer abc123xyz');
  assert.ok(!result.includes('abc123xyz'));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitizeError() redacts passwords', (t) => {
  const { sanitizeError } = require('../src/output/results-writer');

  const result = sanitizeError('Connection failed: password=secret');
  assert.ok(!result.includes('secret'));
  assert.ok(result.includes('[REDACTED]'));
});

test('sanitizeError() redacts URL credentials', (t) => {
  const { sanitizeError } = require('../src/output/results-writer');

  const result = sanitizeError('Connection to https://user:pass@api.example.com failed');
  assert.ok(!result.includes('pass'));
  assert.ok(result.includes('[REDACTED]@'));
});

test('sanitizeError() preserves safe messages', (t) => {
  const { sanitizeError } = require('../src/output/results-writer');

  const safe = 'Connection timeout after 30 seconds';
  assert.strictEqual(sanitizeError(safe), safe);
});

// ====================
// RESULTS_VERSION constant tests
// ====================

test('RESULTS_VERSION is defined', (t) => {
  const { RESULTS_VERSION } = require('../src/output/results-writer');

  assert.ok(RESULTS_VERSION);
  assert.strictEqual(typeof RESULTS_VERSION, 'string');
  assert.ok(/^\d+\.\d+\.\d+$/.test(RESULTS_VERSION), 'Should be semver format');
});

// ====================
// Integration tests
// ====================

test('full workflow: create, add results, finalize', (t) => {
  const { createResultsWriter } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    outputDir: TEST_DIR
  });

  // Add multiple results
  writer.addClientResult({
    id: 'acc1',
    status: 'RESCUED',
    before: { state: 'closed', subscriptions: [] },
    after: { state: 'active', subscription_id: 'sub1' }
  });

  writer.addClientResult({
    id: 'acc2',
    status: 'FAILED',
    before: { state: 'closed', subscriptions: [] },
    error: 'API timeout'
  });

  writer.addClientResult({
    id: 'acc3',
    status: 'RESCUED',
    before: { state: 'closed', subscriptions: [] },
    after: { state: 'active', subscription_id: 'sub3' }
  });

  // Finalize
  const result = writer.finalize();

  // Verify file and summary
  assert.ok(fs.existsSync(result.filePath));
  assert.strictEqual(result.summary.total, 3);
  assert.strictEqual(result.summary.rescued, 2);
  assert.strictEqual(result.summary.failed, 1);

  // Load and verify content
  const content = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));
  assert.strictEqual(content.clients.length, 3);
  assert.strictEqual(content.clients[0].status, 'RESCUED');
  assert.strictEqual(content.clients[1].status, 'FAILED');
  assert.strictEqual(content.clients[2].status, 'RESCUED');
});

test('workflow with loadResultsFile', (t) => {
  const { createResultsWriter, loadResultsFile } = require('../src/output/results-writer');

  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    outputDir: TEST_DIR
  });

  writer.addClientResult({
    id: 'acc1',
    status: 'RESCUED',
    before: { state: 'closed' },
    after: { state: 'active' }
  });

  const { filePath } = writer.finalize();

  // Load the file we just created
  const loaded = loadResultsFile(filePath);

  assert.strictEqual(loaded.execution.project, 'eur');
  assert.strictEqual(loaded.summary.total, 1);
  assert.strictEqual(loaded.clients[0].id, 'acc1');
});
