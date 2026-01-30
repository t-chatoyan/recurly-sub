/**
 * Tests for Subscription Manager Module
 * Tests subscription assignment and rescue plan operations
 */

const { test, describe, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const {
  calculateTrialEndDate,
  getSubscriptionPayload,
  extractSubscriptionId,
  buildSubscriptionUrl,
  assignRescuePlan,
  rescueClient,
  isRetriableError
} = require('../src/rescue/subscription-manager');
const { setDryRunMode, resetDryRunState } = require('../src/rescue/dry-run');
const { getRescuePlanCode } = require('../src/rescue/plan-manager');

describe('calculateTrialEndDate', () => {
  test('returns ISO date string for 1 day trial', () => {
    const result = calculateTrialEndDate(1);

    assert.ok(typeof result === 'string');
    assert.ok(result.includes('T')); // ISO format

    const trialDate = new Date(result);
    const now = new Date();
    const diffHours = (trialDate - now) / (1000 * 60 * 60);

    // Should be approximately 24 hours (with some tolerance)
    assert.ok(diffHours >= 23 && diffHours <= 25, `Expected ~24 hours, got ${diffHours}`);
  });

  test('returns ISO date string for 7 day trial', () => {
    const result = calculateTrialEndDate(7);

    const trialDate = new Date(result);
    const now = new Date();
    const diffDays = (trialDate - now) / (1000 * 60 * 60 * 24);

    assert.ok(diffDays >= 6.9 && diffDays <= 7.1, `Expected ~7 days, got ${diffDays}`);
  });

  test('returns current time for 0 day trial', () => {
    const result = calculateTrialEndDate(0);

    const trialDate = new Date(result);
    const now = new Date();
    const diffMinutes = Math.abs(trialDate - now) / (1000 * 60);

    assert.ok(diffMinutes < 1, `Expected same time, got ${diffMinutes} minutes difference`);
  });

  test('throws for negative trial days', () => {
    assert.throws(
      () => calculateTrialEndDate(-1),
      /Trial days must be a non-negative number/
    );
  });

  test('throws for non-number trial days', () => {
    assert.throws(
      () => calculateTrialEndDate('1'),
      /Trial days must be a non-negative number/
    );
    assert.throws(
      () => calculateTrialEndDate(null),
      /Trial days must be a non-negative number/
    );
  });

  test('throws for NaN trial days', () => {
    assert.throws(
      () => calculateTrialEndDate(NaN),
      /Trial days must be a non-negative number/
    );
  });
});

describe('getSubscriptionPayload', () => {
  test('builds correct payload structure', () => {
    const payload = getSubscriptionPayload('client-123', '4weeks-subscription', 'EUR', 1);

    assert.strictEqual(payload.plan_code, '4weeks-subscription');
    assert.strictEqual(payload.currency, 'EUR');
    assert.strictEqual(payload.collection_method, 'manual'); // Avoid billing info requirements
    assert.ok(payload.trial_ends_at);
    assert.deepStrictEqual(payload.account, { code: 'client-123' });
  });

  test('includes account code in payload', () => {
    const payload = getSubscriptionPayload('my-account', '4weeks-subscription', 'USD', 1);

    assert.ok(payload.account);
    assert.strictEqual(payload.account.code, 'my-account');
  });

  test('normalizes currency to uppercase', () => {
    const payload = getSubscriptionPayload('client-123', '4weeks-subscription', 'eur', 1);

    assert.strictEqual(payload.currency, 'EUR');
  });

  test('trims whitespace from parameters', () => {
    const payload = getSubscriptionPayload('  client-123  ', ' 4weeks-subscription  ', '  eur  ', 1);

    assert.strictEqual(payload.plan_code, '4weeks-subscription');
    assert.strictEqual(payload.currency, 'EUR');
    assert.strictEqual(payload.account.code, 'client-123');
  });

  test('uses default 1 day trial when not specified', () => {
    const payload = getSubscriptionPayload('client-123', '4weeks-subscription', 'EUR');

    const trialDate = new Date(payload.trial_ends_at);
    const now = new Date();
    const diffHours = (trialDate - now) / (1000 * 60 * 60);

    assert.ok(diffHours >= 23 && diffHours <= 25);
  });

  test('throws for empty account code', () => {
    assert.throws(
      () => getSubscriptionPayload('', '4weeks-subscription', 'EUR', 1),
      /Account code must be a non-empty string/
    );
    assert.throws(
      () => getSubscriptionPayload('   ', '4weeks-subscription', 'EUR', 1),
      /Account code must be a non-empty string/
    );
    assert.throws(
      () => getSubscriptionPayload(null, '4weeks-subscription', 'EUR', 1),
      /Account code must be a non-empty string/
    );
  });

  test('throws for empty plan code', () => {
    assert.throws(
      () => getSubscriptionPayload('client-123', '', 'EUR', 1),
      /Plan code must be a non-empty string/
    );
    assert.throws(
      () => getSubscriptionPayload('client-123', null, 'EUR', 1),
      /Plan code must be a non-empty string/
    );
  });

  test('throws for empty currency', () => {
    assert.throws(
      () => getSubscriptionPayload('client-123', getRescuePlanCode('EUR'), '', 1),
      /Currency must be a non-empty string/
    );
    assert.throws(
      () => getSubscriptionPayload('client-123', getRescuePlanCode('EUR'), null, 1),
      /Currency must be a non-empty string/
    );
  });
});

describe('buildSubscriptionUrl', () => {
  test('builds correct Recurly subscription URL', () => {
    const url = buildSubscriptionUrl('my-project', 'sub-uuid-123');
    assert.strictEqual(url, 'https://app.recurly.com/go/my-project/subscriptions/sub-uuid-123');
  });

  test('returns empty string when project is missing', () => {
    const url = buildSubscriptionUrl('', 'sub-uuid-123');
    assert.strictEqual(url, '');
  });

  test('returns empty string when subscriptionId is missing', () => {
    const url = buildSubscriptionUrl('my-project', '');
    assert.strictEqual(url, '');
  });

  test('returns empty string when both are missing', () => {
    const url = buildSubscriptionUrl('', '');
    assert.strictEqual(url, '');
  });

  test('returns empty string for null values', () => {
    assert.strictEqual(buildSubscriptionUrl(null, 'sub-123'), '');
    assert.strictEqual(buildSubscriptionUrl('project', null), '');
  });
});

describe('extractSubscriptionId', () => {
  test('extracts uuid when present', () => {
    const result = extractSubscriptionId({ uuid: 'sub-uuid-123', id: 'sub-id-456' });
    assert.strictEqual(result, 'sub-uuid-123');
  });

  test('extracts id when uuid not present', () => {
    const result = extractSubscriptionId({ id: 'sub-id-456' });
    assert.strictEqual(result, 'sub-id-456');
  });

  test('returns null for empty object', () => {
    const result = extractSubscriptionId({});
    assert.strictEqual(result, null);
  });

  test('returns null for null input', () => {
    const result = extractSubscriptionId(null);
    assert.strictEqual(result, null);
  });

  test('returns null for undefined input', () => {
    const result = extractSubscriptionId(undefined);
    assert.strictEqual(result, null);
  });
});

describe('assignRescuePlan', () => {
  let logSpy;
  let mockLogger;

  beforeEach(() => {
    logSpy = {
      logSuccess: mock.fn(),
      logFailure: mock.fn()
    };
    mockLogger = logSpy;
    resetDryRunState();
  });

  afterEach(() => {
    resetDryRunState();
  });

  test('requires valid client', async () => {
    await assert.rejects(
      async () => assignRescuePlan(null, 'client-123', getRescuePlanCode('EUR'), 'EUR'),
      /Valid Recurly client is required/
    );

    await assert.rejects(
      async () => assignRescuePlan({}, 'client-123', getRescuePlanCode('EUR'), 'EUR'),
      /Valid Recurly client is required/
    );
  });

  test('creates subscription with correct payload', async () => {
    const mockSubscription = {
      uuid: 'sub-uuid-123',
      id: 'sub-id-456',
      state: 'active'
    };

    const mockClient = {
      request: mock.fn(async () => ({ data: mockSubscription, statusCode: 201 }))
    };

    const planCode = getRescuePlanCode('EUR');
    const result = await assignRescuePlan(
      mockClient,
      'client-123',
      planCode,
      'EUR',
      { logger: mockLogger }
    );

    assert.deepStrictEqual(result, mockSubscription);
    assert.strictEqual(mockClient.request.mock.calls.length, 1);

    const [method, path, options] = mockClient.request.mock.calls[0].arguments;
    assert.strictEqual(method, 'POST');
    // Uses POST /subscriptions endpoint, account specified in payload
    assert.strictEqual(path, '/subscriptions');
    assert.strictEqual(options.body.plan_code, planCode);
    assert.strictEqual(options.body.currency, 'EUR');
    assert.ok(options.body.trial_ends_at);
  });

  test('logs success on successful assignment', async () => {
    const mockSubscription = { uuid: 'sub-uuid-123' };

    const mockClient = {
      request: mock.fn(async () => ({ data: mockSubscription, statusCode: 201 }))
    };

    await assignRescuePlan(
      mockClient,
      'client-123',
      getRescuePlanCode('EUR'),
      'EUR',
      { logger: mockLogger }
    );

    assert.strictEqual(logSpy.logSuccess.mock.calls.length, 1);
    assert.strictEqual(logSpy.logSuccess.mock.calls[0].arguments[0], 'client-123');
    assert.strictEqual(logSpy.logSuccess.mock.calls[0].arguments[1], 'sub-uuid-123');
  });

  test('logs failure and throws on API error', async () => {
    const apiError = new Error('Account not found');
    apiError.statusCode = 404;

    const mockClient = {
      request: mock.fn(async () => { throw apiError; })
    };

    await assert.rejects(
      async () => assignRescuePlan(
        mockClient,
        'client-123',
        getRescuePlanCode('EUR'),
        'EUR',
        { logger: mockLogger }
      ),
      /Failed to assign rescue plan to client-123/
    );

    assert.strictEqual(logSpy.logFailure.mock.calls.length, 1);
    assert.strictEqual(logSpy.logFailure.mock.calls[0].arguments[0], 'client-123');
    assert.ok(logSpy.logFailure.mock.calls[0].arguments[1].includes('Account not found'));
  });

  test('handles account code with special characters in payload', async () => {
    const mockClient = {
      request: mock.fn(async () => ({ data: { uuid: 'sub-123' }, statusCode: 201 }))
    };

    await assignRescuePlan(
      mockClient,
      'client/with/slashes',
      getRescuePlanCode('EUR'),
      'EUR',
      { logger: mockLogger }
    );

    const [, path, options] = mockClient.request.mock.calls[0].arguments;
    // Uses POST /subscriptions endpoint
    assert.strictEqual(path, '/subscriptions');
    // Account code with special chars is passed in payload body
    assert.strictEqual(options.body.account.code, 'client/with/slashes');
  });

  test('uses custom trial days', async () => {
    const mockClient = {
      request: mock.fn(async () => ({ data: { uuid: 'sub-123' }, statusCode: 201 }))
    };

    await assignRescuePlan(
      mockClient,
      'client-123',
      getRescuePlanCode('EUR'),
      'EUR',
      { logger: mockLogger, trialDays: 7 }
    );

    const payload = mockClient.request.mock.calls[0].arguments[2].body;
    const trialDate = new Date(payload.trial_ends_at);
    const now = new Date();
    const diffDays = (trialDate - now) / (1000 * 60 * 60 * 24);

    assert.ok(diffDays >= 6.9 && diffDays <= 7.1);
  });

  test('returns mock subscription in dry-run mode (skips API)', async () => {
    setDryRunMode(true);

    const mockClient = {
      request: mock.fn(async () => { throw new Error('Should not be called'); })
    };

    const planCode = getRescuePlanCode('EUR');
    const result = await assignRescuePlan(
      mockClient,
      'client-123',
      planCode,
      'EUR',
      { logger: mockLogger }
    );

    // Verify API was NOT called
    assert.strictEqual(mockClient.request.mock.calls.length, 0);

    // Verify mock subscription structure
    assert.strictEqual(result.account.code, 'client-123');
    assert.strictEqual(result.plan.code, planCode);
    assert.strictEqual(result.state, 'active');
    assert.strictEqual(result.__dryRun, true);
    assert.ok(result.id.startsWith('sub_dryrun_'));
    assert.ok(result.uuid.startsWith('dryrun-'));
  });

  test('dry-run mode logs formatted message with [DRY-RUN] prefix', async () => {
    setDryRunMode(true);

    const mockClient = { request: mock.fn() };
    const consoleLogs = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      await assignRescuePlan(
        mockClient,
        'client-abc',
        getRescuePlanCode('USD'),
        'USD',
        { logger: mockLogger }
      );

      // Verify dry-run message format
      assert.ok(consoleLogs.some(log =>
        log.includes('[DRY-RUN]') &&
        log.includes('client-abc') &&
        log.includes('Would be RESCUED') &&
        log.includes('rescue-plan-usd')
      ));
    } finally {
      console.log = originalLog;
    }
  });
});

describe('rescueClient', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      logSuccess: mock.fn(),
      logFailure: mock.fn()
    };
    resetDryRunState();
  });

  afterEach(() => {
    resetDryRunState();
  });

  test('returns RESCUED status on success', async () => {
    const mockSubscription = { uuid: 'sub-uuid-123', state: 'active' };

    const mockClient = {
      request: mock.fn(async () => ({ data: mockSubscription, statusCode: 201 }))
    };

    const result = await rescueClient(
      mockClient,
      'client-123',
      getRescuePlanCode('EUR'),
      'EUR',
      { logger: mockLogger }
    );

    assert.strictEqual(result.status, 'RESCUED');
    assert.strictEqual(result.accountCode, 'client-123');
    assert.deepStrictEqual(result.subscription, mockSubscription);
    assert.strictEqual(result.error, undefined);
  });

  test('returns FAILED status on error (NFR-R5)', async () => {
    const apiError = new Error('Account not found');
    apiError.statusCode = 404;

    const mockClient = {
      request: mock.fn(async () => { throw apiError; })
    };

    const result = await rescueClient(
      mockClient,
      'client-123',
      getRescuePlanCode('EUR'),
      'EUR',
      { logger: mockLogger }
    );

    assert.strictEqual(result.status, 'FAILED');
    assert.strictEqual(result.accountCode, 'client-123');
    assert.strictEqual(result.subscription, undefined);
    assert.ok(result.error.includes('Account not found'));
  });

  test('does not throw on error (NFR-R5: continue to next client)', async () => {
    const apiError = new Error('Server error');
    apiError.statusCode = 500;

    const mockClient = {
      request: mock.fn(async () => { throw apiError; })
    };

    // Should not throw - returns result object instead
    const result = await rescueClient(
      mockClient,
      'client-123',
      getRescuePlanCode('EUR'),
      'EUR',
      { logger: mockLogger }
    );

    assert.strictEqual(result.status, 'FAILED');
  });

  test('returns RESCUED status in dry-run mode', async () => {
    setDryRunMode(true);

    const mockClient = {
      request: mock.fn(async () => { throw new Error('Should not be called'); })
    };

    const result = await rescueClient(
      mockClient,
      'client-dry-run',
      getRescuePlanCode('EUR'),
      'EUR',
      { logger: mockLogger }
    );

    assert.strictEqual(result.status, 'RESCUED');
    assert.strictEqual(result.accountCode, 'client-dry-run');
    assert.strictEqual(result.subscription.__dryRun, true);
    assert.strictEqual(result.error, undefined);
  });
});

describe('isRetriableError', () => {
  test('returns true for network errors', () => {
    const errors = [
      { code: 'ENOTFOUND' },
      { code: 'ETIMEDOUT' },
      { code: 'ECONNRESET' },
      { code: 'ECONNREFUSED' },
      { code: 'EPIPE' }
    ];

    for (const error of errors) {
      assert.strictEqual(isRetriableError(error), true, `Expected ${error.code} to be retriable`);
    }
  });

  test('returns true for 5xx server errors', () => {
    const statusCodes = [500, 502, 503, 504];

    for (const statusCode of statusCodes) {
      const error = { statusCode };
      assert.strictEqual(isRetriableError(error), true, `Expected ${statusCode} to be retriable`);
    }
  });

  test('returns true for 429 rate limit', () => {
    const error = { statusCode: 429 };
    assert.strictEqual(isRetriableError(error), true);
  });

  test('returns false for 4xx client errors', () => {
    const statusCodes = [400, 401, 403, 404, 422];

    for (const statusCode of statusCodes) {
      const error = { statusCode };
      assert.strictEqual(isRetriableError(error), false, `Expected ${statusCode} to not be retriable`);
    }
  });

  test('returns false for unknown errors', () => {
    const error = { message: 'Unknown error' };
    assert.strictEqual(isRetriableError(error), false);
  });

  test('returns false for 2xx success codes (edge case)', () => {
    const error = { statusCode: 200 };
    assert.strictEqual(isRetriableError(error), false);
  });
});

describe('Integration scenarios', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      logSuccess: mock.fn(),
      logFailure: mock.fn()
    };
    resetDryRunState();
  });

  afterEach(() => {
    resetDryRunState();
  });

  test('multiple clients can be processed in sequence', async () => {
    const clients = ['client-1', 'client-2', 'client-3'];
    const results = [];

    const mockClient = {
      request: mock.fn(async (method, path, options) => {
        // Extract client ID from payload (POST /subscriptions uses body.account.code)
        const clientId = options?.body?.account?.code || 'unknown';

        // Simulate client-2 failing
        if (clientId === 'client-2') {
          const error = new Error('Account inactive');
          error.statusCode = 422;
          throw error;
        }

        return { data: { uuid: `sub-${clientId}` }, statusCode: 201 };
      })
    };

    for (const accountCode of clients) {
      const result = await rescueClient(
        mockClient,
        accountCode,
        getRescuePlanCode('EUR'),
        'EUR',
        { logger: mockLogger }
      );
      results.push(result);
    }

    // Verify all clients were processed
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].status, 'RESCUED');
    assert.strictEqual(results[1].status, 'FAILED');
    assert.strictEqual(results[2].status, 'RESCUED');

    // Verify logging
    assert.strictEqual(mockLogger.logSuccess.mock.calls.length, 2);
    assert.strictEqual(mockLogger.logFailure.mock.calls.length, 1);
  });

  test('dry-run mode processes multiple clients without API calls', async () => {
    setDryRunMode(true);
    const clients = ['client-1', 'client-2', 'client-3'];
    const results = [];

    const mockClient = {
      request: mock.fn(async () => { throw new Error('Should not be called in dry-run'); })
    };

    for (const accountCode of clients) {
      const result = await rescueClient(
        mockClient,
        accountCode,
        getRescuePlanCode('EUR'),
        'EUR',
        { logger: mockLogger }
      );
      results.push(result);
    }

    // Verify all clients were "rescued" in dry-run mode
    assert.strictEqual(results.length, 3);
    assert.ok(results.every(r => r.status === 'RESCUED'));
    assert.ok(results.every(r => r.subscription.__dryRun === true));

    // Verify NO API calls were made
    assert.strictEqual(mockClient.request.mock.calls.length, 0);
  });
});
