# Story 5.2: State Restoration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **operator**,
I want **each client's previous state to be restored from the backup data**,
So that **clients return to their pre-rescue state**.

## Acceptance Criteria

1. **AC1: Cancel rescue subscription for RESCUED clients**
   - **Given** a client entry in the rollback file with status "RESCUED"
   - **When** performing rollback
   - **Then** cancel the rescue subscription via Recurly API
   - **And** restore the account to "closed" state if it was closed before
   - **And** log "✓ {client_id} - ROLLED BACK"

2. **AC2: Skip clients with FAILED status**
   - **Given** a client entry with status "FAILED"
   - **When** performing rollback
   - **Then** skip the client (nothing to rollback)
   - **And** log "⊘ {client_id} - SKIPPED (was not rescued)"

3. **AC3: Handle API errors during rollback**
   - **Given** API error during rollback
   - **When** processing a client
   - **Then** retry with exponential backoff
   - **And** after max retries, mark as FAILED and continue
   - **And** log "✗ {client_id} - ROLLBACK FAILED ({error})"

4. **AC4: Track rollback progress**
   - **Given** rollback is in progress
   - **When** processing clients
   - **Then** update progress display with current/total
   - **And** persist state for crash recovery

5. **AC5: Collect rollback results for output**
   - **Given** each client is processed
   - **When** completing a rollback operation
   - **Then** capture before/after state
   - **And** collect results for Story 5.3 output generation

## Tasks / Subtasks

- [x] Task 1: Create rollback executor module (AC: #1, #2, #3)
  - [x] 1.1: Create `src/rollback/rollback-executor.js` module
  - [x] 1.2: Implement `createRollbackExecutor(options)` factory function
  - [x] 1.3: Implement `executor.processClient(clientData)` method
  - [x] 1.4: Handle RESCUED clients: cancel subscription, close account
  - [x] 1.5: Handle FAILED clients: skip with appropriate logging
  - [x] 1.6: Return result object with before/after state

- [x] Task 2: Implement Recurly API operations (AC: #1)
  - [x] 2.1: Implement `cancelSubscription(subscriptionId)` function
  - [x] 2.2: Implement `closeAccount(accountId)` function (if needed)
  - [x] 2.3: Handle Recurly API responses and errors
  - [x] 2.4: Validate subscription exists before cancellation

- [x] Task 3: Implement error handling and retry (AC: #3)
  - [x] 3.1: Reuse exponential backoff from recurly-client.js
  - [x] 3.2: Track retry attempts per client
  - [x] 3.3: Mark as FAILED after max retries
  - [x] 3.4: Continue to next client on failure (NFR-R5)

- [x] Task 4: Integrate with logger (AC: #1, #2, #3)
  - [x] 4.1: Use `logger.logSuccess()` for rolled back → adapt message
  - [x] 4.2: Use `logger.logSkip()` for skipped clients
  - [x] 4.3: Use `logger.logFailure()` for failed rollbacks
  - [x] 4.4: Add rollback-specific log method if needed

- [x] Task 5: Integrate with state manager (AC: #4)
  - [x] 5.1: Initialize state manager for rollback mode
  - [x] 5.2: Mark clients processed after each operation
  - [x] 5.3: Support resume for interrupted rollback

- [x] Task 6: Integrate with rescue.js main loop (AC: #1, #2, #4, #5)
  - [x] 6.1: Check for rollback mode after initialization
  - [x] 6.2: Use rollbackSummary.clients.rollback from Story 5.1
  - [x] 6.3: Loop through clients with progress updates
  - [x] 6.4: Handle confirmation intervals (if applicable)
  - [x] 6.5: Pass results to Story 5.3 output generation

- [x] Task 7: Write comprehensive tests (AC: #1, #2, #3, #4, #5)
  - [x] 7.1: Create `test/rollback-executor.test.js`
  - [x] 7.2: Test RESCUED client processing
  - [x] 7.3: Test FAILED client skipping
  - [x] 7.4: Test API error handling with retry
  - [x] 7.5: Test max retries exhaustion
  - [x] 7.6: Test result collection
  - [x] 7.7: Integration test with mocked Recurly API

## Dev Notes

### Technical Approach

This story implements the actual rollback logic that restores clients to their pre-rescue state. It uses the data loaded in Story 5.1 and produces results for Story 5.3.

**Rollback Flow:**
1. Story 5.1 loads and validates the rollback file
2. Story 5.2 (this story) processes each client:
   - RESCUED → Cancel subscription, close account, log success
   - FAILED → Skip, log skip
   - API error → Retry, eventually log failure
3. Story 5.3 generates the rollback results file

### Rollback Executor Implementation

```javascript
// src/rollback/rollback-executor.js

/**
 * Rollback Executor Module
 * Processes clients for state restoration
 */

/**
 * Create rollback executor instance
 * @param {Object} options - Configuration options
 * @param {Object} options.recurlyClient - Recurly API client from Story 2.1
 * @param {Object} options.logger - Logger instance from Story 4.2
 * @param {Object} options.stateManager - State manager from Story 4.3
 * @param {string} options.project - Project identifier for URLs
 * @returns {Object} Rollback executor instance
 */
function createRollbackExecutor(options) {
  const { recurlyClient, logger, stateManager, project } = options;

  if (!recurlyClient) throw new Error('recurlyClient is required');
  if (!logger) throw new Error('logger is required');

  /**
   * Process a single client for rollback
   * @param {Object} clientData - Client data from rollback file
   * @param {string} clientData.id - Client/account ID
   * @param {string} clientData.status - Original status (RESCUED, FAILED)
   * @param {Object} clientData.before - State before rescue
   * @param {Object} clientData.after - State after rescue
   * @returns {Promise<Object>} Rollback result
   */
  async function processClient(clientData) {
    const { id, status, before, after } = clientData;

    // Skip clients that were not rescued
    if (status !== 'RESCUED') {
      logger.logSkip(id, 'was not rescued');
      return {
        id,
        status: 'SKIPPED',
        before: after, // Current state is 'after' rescue
        after: null,
        error: null,
        reason: 'Client was not rescued in original execution'
      };
    }

    // Attempt to rollback RESCUED clients
    try {
      // Step 1: Cancel the rescue subscription
      if (after?.subscription_id) {
        await cancelSubscription(after.subscription_id);
      }

      // Step 2: Close the account (restore to original state)
      // Only if original state was 'closed'
      if (before?.state === 'closed') {
        await closeAccount(id);
      }

      // Log success
      logRollbackSuccess(id);

      // Update state manager
      if (stateManager) {
        stateManager.markProcessed(id, { status: 'rolled_back' });
      }

      return {
        id,
        status: 'ROLLED_BACK',
        before: after, // State before rollback (which is after rescue)
        after: before, // State after rollback (which is original state)
        error: null
      };

    } catch (error) {
      // Log failure
      logger.logFailure(id, `ROLLBACK FAILED: ${error.message}`);

      // Update state manager
      if (stateManager) {
        stateManager.markProcessed(id, { status: 'failed', error: error.message });
      }

      return {
        id,
        status: 'FAILED',
        before: after,
        after: null,
        error: error.message
      };
    }
  }

  /**
   * Cancel a subscription via Recurly API
   * @param {string} subscriptionId - Subscription ID to cancel
   * @throws {Error} If cancellation fails
   */
  async function cancelSubscription(subscriptionId) {
    if (!subscriptionId) {
      throw new Error('No subscription ID to cancel');
    }

    // Recurly API: Cancel subscription
    // DELETE /subscriptions/{subscription_id}
    // or PUT /subscriptions/{subscription_id}/cancel
    const response = await recurlyClient.request(
      'PUT',
      `/subscriptions/${subscriptionId}/cancel`
    );

    return response.data;
  }

  /**
   * Close an account via Recurly API
   * @param {string} accountId - Account ID to close
   * @throws {Error} If closing fails
   */
  async function closeAccount(accountId) {
    if (!accountId) {
      throw new Error('No account ID to close');
    }

    // Recurly API: Close account
    // DELETE /accounts/{account_id} (or PUT to update state)
    // Note: Closing an account typically requires canceling all active subscriptions first
    // The subscription was already cancelled, so we can proceed
    const response = await recurlyClient.request(
      'DELETE',
      `/accounts/${accountId}`
    );

    return response.data;
  }

  /**
   * Log successful rollback
   * @param {string} clientId - Client ID
   */
  function logRollbackSuccess(clientId) {
    const { SYMBOLS } = require('../ui/logger');
    const url = `https://app.recurly.com/go/${project}/accounts/${clientId}`;
    console.log(`${SYMBOLS.SUCCESS} ${clientId} - ROLLED BACK - ${url}`);
  }

  /**
   * Process all clients from rollback summary
   * @param {Array} clients - Array of clients to process
   * @param {Object} options - Processing options
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<Array>} Array of results
   */
  async function processAllClients(clients, options = {}) {
    const { onProgress } = options;
    const results = [];

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];

      // Report progress
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: clients.length,
          clientId: client.id
        });
      }

      // Process client
      const result = await processClient(client);
      results.push(result);
    }

    return results;
  }

  return {
    processClient,
    processAllClients,
    cancelSubscription,
    closeAccount
  };
}

module.exports = { createRollbackExecutor };
```

### Integration with rescue.js

```javascript
// rescue.js - Rollback execution integration

const { createRollbackExecutor } = require('./src/rollback/rollback-executor');
const { createProgressBar } = require('./src/ui/progress');
const { createLogger } = require('./src/ui/logger');
const { createStateManager } = require('./src/state/state-manager');

// ... existing code from Story 5.1 ...

async function main() {
  // ... argument parsing, help, rollback file loading from Story 5.1 ...

  if (options.rollback && rollbackSummary) {
    // Rollback mode execution
    console.log('Starting rollback execution...');

    // Initialize components for rollback
    const logger = createLogger({
      dryRun: false, // Rollback doesn't have dry-run
      project: rollbackSummary.project
    });

    const stateManager = createStateManager({
      project: rollbackSummary.project,
      environment: rollbackSummary.environment,
      mode: 'rollback'
    });

    const progressBar = createProgressBar({
      total: rollbackSummary.toRollback,
      format: 'Rollback: [{bar}] {percentage}% | {current}/{total} clients'
    });

    // Create rollback executor
    const executor = createRollbackExecutor({
      recurlyClient,
      logger,
      stateManager,
      project: rollbackSummary.project
    });

    // Initialize state manager with clients
    stateManager.initialize(
      rollbackSummary.clients.rollback.map(c => ({ id: c.id }))
    );

    // Process all clients
    const results = await executor.processAllClients(
      [...rollbackSummary.clients.rollback, ...rollbackSummary.clients.skip],
      {
        onProgress: ({ current, total, clientId }) => {
          progressBar.update(current, clientId);
        }
      }
    );

    progressBar.stop();

    // Calculate summary
    const summary = {
      total: results.length,
      rolledBack: results.filter(r => r.status === 'ROLLED_BACK').length,
      skipped: results.filter(r => r.status === 'SKIPPED').length,
      failed: results.filter(r => r.status === 'FAILED').length
    };

    // Pass results to Story 5.3 for output generation
    // ... to be implemented in Story 5.3 ...

    console.log('Rollback execution complete.');
    displayRollbackStatistics(summary);

    return;
  }

  // ... rest of rescue mode code ...
}
```

### Recurly API Operations

**Cancel Subscription:**
```
PUT /subscriptions/{subscription_id}/cancel
```

Response: 200 OK with subscription object

**Close Account:**
```
DELETE /accounts/{account_id}
```

Response: 204 No Content (or 200 with account object)

**Important Notes:**
- An account can only be closed if all subscriptions are canceled
- The cancel operation happens first, then the close
- If account has other active subscriptions (not from rescue), we should NOT close it
- Consider checking account state before closing

### Rollback Result Schema

Each client result follows this schema for Story 5.3:

```json
{
  "id": "acc_abc123",
  "status": "ROLLED_BACK|SKIPPED|FAILED",
  "before": {
    "state": "active",
    "subscription_id": "sub_xyz789"
  },
  "after": {
    "state": "closed",
    "subscriptions": []
  },
  "error": null
}
```

**Status values:**
- `ROLLED_BACK`: Subscription canceled, account restored
- `SKIPPED`: Client was not rescued in original execution
- `FAILED`: API error prevented rollback

### File Structure After Story 5.2

```
RecurlyRescue/
├── rescue.js                       # Updated: Rollback execution
├── src/
│   ├── config/
│   │   ├── env.js                  # Existing
│   │   └── projects.js             # Existing
│   ├── cli/
│   │   ├── args.js                 # Existing
│   │   ├── help.js                 # Existing
│   │   └── prompt.js               # From Story 5.1
│   ├── env/environment.js          # Existing
│   ├── api/
│   │   ├── recurly-client.js       # Existing (Story 2.1)
│   │   └── accounts.js             # Existing (Story 2.1)
│   ├── ui/
│   │   ├── progress.js             # From Story 4.1
│   │   └── logger.js               # From Story 4.2 (has logSkip)
│   ├── state/
│   │   └── state-manager.js        # From Story 4.3
│   ├── output/
│   │   └── results-writer.js       # From Story 4.4
│   └── rollback/
│       ├── rollback-loader.js      # From Story 5.1
│       ├── rollback-display.js     # From Story 5.1
│       └── rollback-executor.js    # NEW: Rollback execution
└── test/
    ├── ... existing tests ...
    ├── rollback-loader.test.js     # From Story 5.1
    └── rollback-executor.test.js   # NEW
```

### Testing Strategy

**Unit Tests for rollback-executor.js:**

```javascript
// test/rollback-executor.test.js
const { test, mock } = require('node:test');
const assert = require('node:assert');
const { createRollbackExecutor } = require('../src/rollback/rollback-executor');

// Mock Recurly client
function createMockRecurlyClient(responses = {}) {
  return {
    request: mock.fn(async (method, path) => {
      if (responses[path]) {
        return responses[path];
      }
      return { data: {}, statusCode: 200 };
    })
  };
}

// Mock logger
function createMockLogger() {
  return {
    logSuccess: mock.fn(),
    logFailure: mock.fn(),
    logSkip: mock.fn(),
    logInfo: mock.fn()
  };
}

test('processClient() skips FAILED clients', async (t) => {
  const logger = createMockLogger();
  const executor = createRollbackExecutor({
    recurlyClient: createMockRecurlyClient(),
    logger,
    project: 'eur'
  });

  const result = await executor.processClient({
    id: 'acc1',
    status: 'FAILED',
    before: { state: 'closed' },
    after: null,
    error: 'original error'
  });

  assert.strictEqual(result.status, 'SKIPPED');
  assert.strictEqual(logger.logSkip.mock.calls.length, 1);
});

test('processClient() rolls back RESCUED clients', async (t) => {
  const mockClient = createMockRecurlyClient({
    '/subscriptions/sub_123/cancel': { data: { id: 'sub_123' }, statusCode: 200 },
    '/accounts/acc1': { data: {}, statusCode: 204 }
  });
  const logger = createMockLogger();

  const executor = createRollbackExecutor({
    recurlyClient: mockClient,
    logger,
    project: 'eur'
  });

  const result = await executor.processClient({
    id: 'acc1',
    status: 'RESCUED',
    before: { state: 'closed', subscriptions: [] },
    after: { state: 'active', subscription_id: 'sub_123' }
  });

  assert.strictEqual(result.status, 'ROLLED_BACK');
  assert.strictEqual(mockClient.request.mock.calls.length, 2);
});

test('processClient() handles API errors', async (t) => {
  const mockClient = {
    request: mock.fn(async () => {
      throw new Error('API error');
    })
  };
  const logger = createMockLogger();

  const executor = createRollbackExecutor({
    recurlyClient: mockClient,
    logger,
    project: 'eur'
  });

  const result = await executor.processClient({
    id: 'acc1',
    status: 'RESCUED',
    before: { state: 'closed' },
    after: { state: 'active', subscription_id: 'sub_123' }
  });

  assert.strictEqual(result.status, 'FAILED');
  assert.ok(result.error.includes('API error'));
  assert.strictEqual(logger.logFailure.mock.calls.length, 1);
});

test('processAllClients() processes multiple clients', async (t) => {
  const mockClient = createMockRecurlyClient({
    '/subscriptions/sub_1/cancel': { data: {}, statusCode: 200 },
    '/accounts/acc1': { data: {}, statusCode: 204 }
  });
  const logger = createMockLogger();

  const executor = createRollbackExecutor({
    recurlyClient: mockClient,
    logger,
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

test('processAllClients() calls progress callback', async (t) => {
  const mockClient = createMockRecurlyClient();
  const logger = createMockLogger();
  const progressCallback = mock.fn();

  const executor = createRollbackExecutor({
    recurlyClient: mockClient,
    logger,
    project: 'eur'
  });

  const clients = [
    { id: 'acc1', status: 'FAILED', before: {}, after: null }
  ];

  await executor.processAllClients(clients, { onProgress: progressCallback });

  assert.strictEqual(progressCallback.mock.calls.length, 1);
  assert.deepStrictEqual(progressCallback.mock.calls[0].arguments[0], {
    current: 1,
    total: 1,
    clientId: 'acc1'
  });
});
```

### Edge Cases to Handle

1. **Subscription already canceled:** API may return 404 - treat as success
2. **Account already closed:** API may return 400/404 - treat as success
3. **Account has other active subscriptions:** Don't close account, only cancel rescue subscription
4. **Missing subscription_id in rollback data:** Log warning, skip subscription cancel
5. **Network timeout:** Retry with exponential backoff (already in recurly-client.js)
6. **Rate limiting:** Handle 429 response (already in recurly-client.js)

### Previous Story Learnings

**From Story 5.1 (Rollback Mode Activation):**
- `rollbackSummary.clients.rollback` contains RESCUED clients
- `rollbackSummary.clients.skip` contains FAILED clients
- Client data includes `before`, `after`, `subscription_id`

**From Story 4.2 (Action Logging):**
- `logger.logSkip()` already exists for rollback use
- Symbols: ✓ (SUCCESS), ✗ (FAILURE), ⊘ (SKIP)
- Error sanitization for display

**From Story 4.3 (State Persistence):**
- State manager pattern for crash recovery
- `markProcessed()` method available

**From Story 2.1 (Recurly Client):**
- `recurlyClient.request(method, path)` for API calls
- Retry logic and rate limiting built-in
- Error handling patterns

### NFR Compliance

**FR21:** System can restore previous state for each client from backup data
- ✅ Cancel rescue subscription
- ✅ Close account (if originally closed)
- ✅ Log each operation

**NFR-R1/R2/R3:** Retry with exponential backoff
- ✅ Reuses recurly-client.js retry logic

**NFR-R4/R5:** Mark as FAILED and continue
- ✅ Returns FAILED status
- ✅ Continues to next client

**NFR-S4:** Never log API keys
- ✅ Error sanitization from logger.js

### Dependencies

**From Previous Stories:**
- `src/api/recurly-client.js` (Story 2.1) - API client
- `src/ui/logger.js` (Story 4.2) - Logging
- `src/ui/progress.js` (Story 4.1) - Progress display
- `src/state/state-manager.js` (Story 4.3) - State persistence
- `src/rollback/rollback-loader.js` (Story 5.1) - Rollback data

**No new npm dependencies required.**

### Preparation for Story 5.3

This story produces an array of results for Story 5.3:

```javascript
const results = [
  { id: 'acc1', status: 'ROLLED_BACK', before: {...}, after: {...}, error: null },
  { id: 'acc2', status: 'SKIPPED', before: {...}, after: null, error: null },
  { id: 'acc3', status: 'FAILED', before: {...}, after: null, error: 'API timeout' }
];
```

Story 5.3 will use these results to generate `rollback-results-{timestamp}.json`.

### References

- [Source: docs/planning-artifacts/epics.md#Story 5.2 - State Restoration]
- [Source: docs/planning-artifacts/prd.md#FR21 - Restore previous state]
- [Source: docs/planning-artifacts/prd.md#NFR-R1 through NFR-R5 - Retry and error handling]
- [Dependency: docs/implementation-artifacts/5-1-rollback-mode-activation.md - Rollback data loading]
- [Dependency: docs/implementation-artifacts/2-1-query-closed-accounts.md - Recurly client]
- [Dependency: docs/implementation-artifacts/4-2-action-logging.md - Logger with logSkip]
- [Dependency: docs/implementation-artifacts/4-3-state-persistence-recovery.md - State manager]
- [Prepares for: docs/planning-artifacts/epics.md#Story 5.3 - Rollback Results Generation]
- [Recurly API: Cancel Subscription](https://developers.recurly.com/api/v2021-02-25/index.html#operation/cancel_subscription)
- [Recurly API: Close Account](https://developers.recurly.com/api/v2021-02-25/index.html#operation/delete_account)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 24 tests for rollback-executor pass
- Combined with Story 5.1 tests: 67 tests pass

### Completion Notes List

- ✅ Created rollback-executor.js with processClient, processAllClients, cancelSubscription, closeAccount
- ✅ Handles RESCUED → rollback, FAILED/SKIPPED → skip
- ✅ 404 errors treated as success (already rolled back)
- ✅ State manager integration for crash recovery
- ✅ Progress tracking with callbacks
- ✅ Full integration in rescue.js main loop

### File List

**Created:**
- src/rollback/rollback-executor.js
- test/rollback-executor.test.js

**Modified:**
- rescue.js (rollback execution integration)
- docs/implementation-artifacts/sprint-status.yaml (status update)
- docs/implementation-artifacts/5-2-state-restoration.md (completion tracking)
