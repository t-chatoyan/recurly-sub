/**
 * Unit tests for rollback-executor.js module
 * Tests client processing, API operations, error handling
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { createRollbackExecutor } = require('../src/rollback/rollback-executor');

/**
 * Create mock Recurly client
 * @param {Object} responses - Map of path to response
 * @returns {Object} Mock client
 */
function createMockRecurlyClient(responses = {}) {
  const calls = [];
  return {
    request: async (method, path) => {
      calls.push({ method, path });
      if (responses[path]) {
        const response = responses[path];
        if (response.error) {
          const err = new Error(response.error);
          err.statusCode = response.statusCode;
          throw err;
        }
        return { data: response.data || {}, statusCode: response.statusCode || 200 };
      }
      return { data: {}, statusCode: 200 };
    },
    getCalls: () => calls
  };
}

/**
 * Create mock logger
 * @returns {Object} Mock logger with tracking
 */
function createMockLogger() {
  const logs = { success: [], failure: [], skip: [], info: [] };
  return {
    logSuccess: (clientId, subscriptionId) => logs.success.push({ clientId, subscriptionId }),
    logFailure: (clientId, error) => logs.failure.push({ clientId, error }),
    logSkip: (clientId, reason) => logs.skip.push({ clientId, reason }),
    logInfo: (message) => logs.info.push(message),
    getLogs: () => logs
  };
}

/**
 * Create mock state manager
 * @returns {Object} Mock state manager with tracking
 */
function createMockStateManager() {
  const processed = [];
  return {
    markProcessed: (clientId, result) => processed.push({ clientId, result }),
    getProcessed: () => processed
  };
}

// ============================================================================
// createRollbackExecutor() validation tests
// ============================================================================

describe('createRollbackExecutor() validation', () => {
  test('throws if recurlyClient is missing', () => {
    assert.throws(
      () => createRollbackExecutor({ logger: createMockLogger(), project: 'eur' }),
      /recurlyClient is required/
    );
  });

  test('throws if logger is missing', () => {
    assert.throws(
      () => createRollbackExecutor({ recurlyClient: createMockRecurlyClient(), project: 'eur' }),
      /logger is required/
    );
  });

  test('throws if project is missing', () => {
    assert.throws(
      () => createRollbackExecutor({ recurlyClient: createMockRecurlyClient(), logger: createMockLogger() }),
      /project is required/
    );
  });

  test('creates executor with valid options', () => {
    const executor = createRollbackExecutor({
      recurlyClient: createMockRecurlyClient(),
      logger: createMockLogger(),
      project: 'eur'
    });

    assert.ok(executor.processClient);
    assert.ok(executor.processAllClients);
    assert.ok(executor.cancelSubscription);
    assert.ok(executor.closeAccount);
  });
});

// ============================================================================
// processClient() input validation tests
// ============================================================================

describe('processClient() input validation', () => {
  let executor;

  beforeEach(() => {
    executor = createRollbackExecutor({
      recurlyClient: createMockRecurlyClient(),
      logger: createMockLogger(),
      project: 'eur'
    });
  });

  test('throws on null clientData', async () => {
    await assert.rejects(
      () => executor.processClient(null),
      /clientData must be an object/
    );
  });

  test('throws on undefined clientData', async () => {
    await assert.rejects(
      () => executor.processClient(undefined),
      /clientData must be an object/
    );
  });

  test('throws on non-object clientData', async () => {
    await assert.rejects(
      () => executor.processClient('string'),
      /clientData must be an object/
    );
  });

  test('throws on missing clientData.id', async () => {
    await assert.rejects(
      () => executor.processClient({ status: 'RESCUED' }),
      /clientData.id is required/
    );
  });
});

// ============================================================================
// processClient() tests
// ============================================================================

describe('processClient()', () => {
  let mockClient;
  let mockLogger;
  let executor;

  beforeEach(() => {
    mockClient = createMockRecurlyClient({
      '/subscriptions/sub_123/cancel': { data: { id: 'sub_123', state: 'canceled' }, statusCode: 200 },
      '/subscriptions/sub_123': { data: { id: 'sub_123', state: 'expired' }, statusCode: 200 }, // For terminate
      '/accounts/acc1': { data: {}, statusCode: 204 }
    });
    mockLogger = createMockLogger();
    executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });
  });

  test('skips FAILED clients', async () => {
    const result = await executor.processClient({
      id: 'acc1',
      status: 'FAILED',
      before: { state: 'closed' },
      after: null,
      error: 'original error'
    });

    assert.strictEqual(result.status, 'SKIPPED');
    assert.strictEqual(result.reason, 'Client was not rescued in original execution');
    assert.strictEqual(mockLogger.getLogs().skip.length, 1);
    assert.strictEqual(mockClient.getCalls().length, 0); // No API calls
  });

  test('skips SKIPPED clients', async () => {
    const result = await executor.processClient({
      id: 'acc2',
      status: 'SKIPPED',
      before: null,
      after: null
    });

    assert.strictEqual(result.status, 'SKIPPED');
    assert.strictEqual(mockClient.getCalls().length, 0);
  });

  test('rolls back RESCUED clients with no prior subscriptions (uses terminate)', async () => {
    const result = await executor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'closed', subscriptions: [] },
      after: { state: 'active', subscription_id: 'sub_123' }
    });

    assert.strictEqual(result.status, 'ROLLED_BACK');
    assert.strictEqual(result.error, null);

    const calls = mockClient.getCalls();
    assert.strictEqual(calls.length, 2);
    // With empty subscriptions array, should use DELETE (terminate) not PUT (cancel)
    assert.strictEqual(calls[0].method, 'DELETE');
    assert.strictEqual(calls[0].path, '/subscriptions/sub_123');
    assert.strictEqual(calls[1].method, 'DELETE');
    assert.strictEqual(calls[1].path, '/accounts/acc1');
  });

  test('skips closeAccount if original state was not closed', async () => {
    const result = await executor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'active', subscriptions: [] }, // Not closed originally
      after: { state: 'active', subscription_id: 'sub_123' }
    });

    assert.strictEqual(result.status, 'ROLLED_BACK');

    const calls = mockClient.getCalls();
    assert.strictEqual(calls.length, 1); // Only terminate subscription (no closeAccount)
    // With empty subscriptions, uses terminate (DELETE) not cancel (PUT)
    assert.strictEqual(calls[0].method, 'DELETE');
    assert.strictEqual(calls[0].path, '/subscriptions/sub_123');
  });

  test('uses terminate when before.subscriptions is undefined', async () => {
    const result = await executor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'active' }, // No subscriptions property at all
      after: { state: 'active', subscription_id: 'sub_123' }
    });

    assert.strictEqual(result.status, 'ROLLED_BACK');

    const calls = mockClient.getCalls();
    assert.strictEqual(calls.length, 1);
    // undefined subscriptions should use terminate (DELETE)
    assert.strictEqual(calls[0].method, 'DELETE');
    assert.strictEqual(calls[0].path, '/subscriptions/sub_123');
  });

  test('uses cancel when before.subscriptions has items', async () => {
    const result = await executor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'active', subscriptions: [{ id: 'existing_sub' }] }, // Had prior subscriptions
      after: { state: 'active', subscription_id: 'sub_123' }
    });

    assert.strictEqual(result.status, 'ROLLED_BACK');

    const calls = mockClient.getCalls();
    assert.strictEqual(calls.length, 1);
    // With existing subscriptions, should use cancel (PUT) not terminate (DELETE)
    assert.strictEqual(calls[0].method, 'PUT');
    assert.strictEqual(calls[0].path, '/subscriptions/sub_123/cancel');
  });

  test('fails if no subscription_id in rollback data', async () => {
    const result = await executor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'closed' },
      after: { state: 'active' } // Missing subscription_id
    });

    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.error.includes('No subscription_id'));
    assert.strictEqual(mockLogger.getLogs().failure.length, 1);
  });

  test('handles API errors', async () => {
    const errorClient = createMockRecurlyClient({
      '/subscriptions/sub_123/cancel': { error: 'API timeout', statusCode: 500 }
    });
    const errorExecutor = createRollbackExecutor({
      recurlyClient: errorClient,
      logger: mockLogger,
      project: 'eur'
    });

    const result = await errorExecutor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'closed', subscriptions: [{ id: 'existing' }] }, // Has subscriptions, so uses cancel
      after: { state: 'active', subscription_id: 'sub_123' }
    });

    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.error.includes('API timeout'));
  });

  test('treats 404 as success (already rolled back)', async () => {
    const notFoundClient = createMockRecurlyClient({
      '/subscriptions/sub_123/cancel': { error: 'Not found', statusCode: 404 }
    });
    const notFoundExecutor = createRollbackExecutor({
      recurlyClient: notFoundClient,
      logger: mockLogger,
      project: 'eur'
    });

    const result = await notFoundExecutor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'closed', subscriptions: [{ id: 'existing' }] }, // Has subscriptions, so uses cancel
      after: { state: 'active', subscription_id: 'sub_123' }
    });

    assert.strictEqual(result.status, 'ROLLED_BACK');
    assert.ok(result.note?.includes('Already rolled back'));
  });

  test('updates state manager on success', async () => {
    const stateManager = createMockStateManager();
    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      stateManager,
      project: 'eur'
    });

    await executor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'closed', subscriptions: [] }, // Empty subscriptions, uses terminate
      after: { state: 'active', subscription_id: 'sub_123' }
    });

    const processed = stateManager.getProcessed();
    assert.strictEqual(processed.length, 1);
    assert.strictEqual(processed[0].clientId, 'acc1');
    assert.strictEqual(processed[0].result.status, 'rolled_back');
  });

  test('updates state manager on failure', async () => {
    const errorClient = createMockRecurlyClient({
      '/subscriptions/sub_123/cancel': { error: 'Server error', statusCode: 500 }
    });
    const stateManager = createMockStateManager();
    const executor = createRollbackExecutor({
      recurlyClient: errorClient,
      logger: mockLogger,
      stateManager,
      project: 'eur'
    });

    await executor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'closed', subscriptions: [{ id: 'existing' }] }, // Has subscriptions, so uses cancel
      after: { state: 'active', subscription_id: 'sub_123' }
    });

    const processed = stateManager.getProcessed();
    assert.strictEqual(processed.length, 1);
    assert.strictEqual(processed[0].result.status, 'failed');
    assert.ok(processed[0].result.error);
  });

  test('updates state manager on skip', async () => {
    const stateManager = createMockStateManager();
    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      stateManager,
      project: 'eur'
    });

    await executor.processClient({
      id: 'acc1',
      status: 'FAILED',
      before: { state: 'closed' },
      after: null
    });

    // Note: SKIPPED clients don't update state manager (they weren't processed)
    const processed = stateManager.getProcessed();
    assert.strictEqual(processed.length, 0);
  });
});

// ============================================================================
// processAllClients() tests
// ============================================================================

describe('processAllClients()', () => {
  test('processes multiple clients', async () => {
    const mockClient = createMockRecurlyClient({
      '/subscriptions/sub_1/cancel': { data: {}, statusCode: 200 },
      '/accounts/acc1': { data: {}, statusCode: 204 }
    });
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    const clients = [
      { id: 'acc1', status: 'RESCUED', before: { state: 'closed' }, after: { subscription_id: 'sub_1' } },
      { id: 'acc2', status: 'FAILED', before: { state: 'closed' }, after: null }
    ];

    const results = await executor.processAllClients(clients);

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].status, 'ROLLED_BACK');
    assert.strictEqual(results[1].status, 'SKIPPED');
  });

  test('calls progress callback', async () => {
    const mockClient = createMockRecurlyClient();
    const mockLogger = createMockLogger();
    const progressCalls = [];

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    const clients = [
      { id: 'acc1', status: 'FAILED', before: {}, after: null },
      { id: 'acc2', status: 'FAILED', before: {}, after: null }
    ];

    await executor.processAllClients(clients, {
      onProgress: (progress) => progressCalls.push(progress)
    });

    assert.strictEqual(progressCalls.length, 2);
    assert.deepStrictEqual(progressCalls[0], { current: 1, total: 2, clientId: 'acc1' });
    assert.deepStrictEqual(progressCalls[1], { current: 2, total: 2, clientId: 'acc2' });
  });

  test('handles empty clients array', async () => {
    const mockClient = createMockRecurlyClient();
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    const results = await executor.processAllClients([]);

    assert.strictEqual(results.length, 0);
  });
});

// ============================================================================
// calculateResultsSummary() tests
// ============================================================================

describe('calculateResultsSummary()', () => {
  test('calculates summary from mixed results', () => {
    const mockClient = createMockRecurlyClient();
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    const results = [
      { id: 'acc1', status: 'ROLLED_BACK' },
      { id: 'acc2', status: 'ROLLED_BACK' },
      { id: 'acc3', status: 'SKIPPED' },
      { id: 'acc4', status: 'FAILED' }
    ];

    const summary = executor.calculateResultsSummary(results);

    assert.strictEqual(summary.total, 4);
    assert.strictEqual(summary.rolled_back, 2);
    assert.strictEqual(summary.skipped, 1);
    assert.strictEqual(summary.failed, 1);
  });

  test('handles empty results', () => {
    const mockClient = createMockRecurlyClient();
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    const summary = executor.calculateResultsSummary([]);

    assert.strictEqual(summary.total, 0);
    assert.strictEqual(summary.rolled_back, 0);
    assert.strictEqual(summary.skipped, 0);
    assert.strictEqual(summary.failed, 0);
  });

  test('handles all rolled back', () => {
    const mockClient = createMockRecurlyClient();
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    const results = [
      { id: 'acc1', status: 'ROLLED_BACK' },
      { id: 'acc2', status: 'ROLLED_BACK' }
    ];

    const summary = executor.calculateResultsSummary(results);

    assert.strictEqual(summary.rolled_back, 2);
    assert.strictEqual(summary.failed, 0);
  });
});

// ============================================================================
// cancelSubscription() tests
// ============================================================================

describe('cancelSubscription()', () => {
  test('calls correct API endpoint', async () => {
    const mockClient = createMockRecurlyClient({
      '/subscriptions/sub_xyz789/cancel': { data: { id: 'sub_xyz789', state: 'canceled' } }
    });
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    await executor.cancelSubscription('sub_xyz789');

    const calls = mockClient.getCalls();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, 'PUT');
    assert.strictEqual(calls[0].path, '/subscriptions/sub_xyz789/cancel');
  });

  test('throws on missing subscription ID', async () => {
    const mockClient = createMockRecurlyClient();
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    await assert.rejects(
      () => executor.cancelSubscription(null),
      /No subscription ID to cancel/
    );
  });
});

// ============================================================================
// terminateSubscription() tests
// ============================================================================

describe('terminateSubscription()', () => {
  test('calls correct API endpoint (DELETE)', async () => {
    const mockClient = createMockRecurlyClient({
      '/subscriptions/sub_xyz789': { data: { id: 'sub_xyz789', state: 'expired' }, statusCode: 200 }
    });
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    await executor.terminateSubscription('sub_xyz789');

    const calls = mockClient.getCalls();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, 'DELETE');
    assert.strictEqual(calls[0].path, '/subscriptions/sub_xyz789');
  });

  test('throws on missing subscription ID', async () => {
    const mockClient = createMockRecurlyClient();
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    await assert.rejects(
      () => executor.terminateSubscription(null),
      /No subscription ID to terminate/
    );
  });

  test('throws on empty subscription ID', async () => {
    const mockClient = createMockRecurlyClient();
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    await assert.rejects(
      () => executor.terminateSubscription(''),
      /No subscription ID to terminate/
    );
  });
});

// ============================================================================
// closeAccount() tests
// ============================================================================

describe('closeAccount()', () => {
  test('calls correct API endpoint', async () => {
    const mockClient = createMockRecurlyClient({
      '/accounts/acc_abc123': { data: {}, statusCode: 204 }
    });
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    await executor.closeAccount('acc_abc123');

    const calls = mockClient.getCalls();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, 'DELETE');
    assert.strictEqual(calls[0].path, '/accounts/acc_abc123');
  });

  test('throws on missing account ID', async () => {
    const mockClient = createMockRecurlyClient();
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    await assert.rejects(
      () => executor.closeAccount(''),
      /No account ID to close/
    );
  });
});

// ============================================================================
// Edge cases tests
// ============================================================================

describe('Edge cases', () => {
  test('handles closeAccount failure after cancelSubscription success', async () => {
    // Create client where cancel succeeds but close fails
    const mockClient = createMockRecurlyClient({
      '/subscriptions/sub_123/cancel': { data: { id: 'sub_123', state: 'canceled' }, statusCode: 200 }
    });
    // Override to fail on account close
    const originalRequest = mockClient.request;
    mockClient.request = async (method, path) => {
      if (path.includes('/accounts/')) {
        const err = new Error('Server error');
        err.statusCode = 500;
        throw err;
      }
      return originalRequest(method, path);
    };

    const mockLogger = createMockLogger();
    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    const result = await executor.processClient({
      id: 'acc1',
      status: 'RESCUED',
      before: { state: 'closed' },
      after: { state: 'active', subscription_id: 'sub_123' }
    });

    // Should fail because closeAccount failed
    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.error.includes('Server error'));
  });

  test('encodes special characters in subscription ID', async () => {
    const mockClient = createMockRecurlyClient({
      '/subscriptions/sub%2F123%3Ftest/cancel': { data: {}, statusCode: 200 }
    });
    const mockLogger = createMockLogger();

    const executor = createRollbackExecutor({
      recurlyClient: mockClient,
      logger: mockLogger,
      project: 'eur'
    });

    // This should URL encode the special characters
    await executor.cancelSubscription('sub/123?test');

    const calls = mockClient.getCalls();
    assert.ok(calls[0].path.includes('%2F')); // / encoded
    assert.ok(calls[0].path.includes('%3F')); // ? encoded
  });
});
