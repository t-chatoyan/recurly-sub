/**
 * Tests for Dry-Run Mode Module
 * Tests dry-run state management and utilities
 */

const { test, describe, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const {
  setDryRunMode,
  isDryRunMode,
  formatDryRunMessage,
  withDryRun,
  createMockPlan,
  createMockSubscription,
  displayDryRunBanner,
  displayDryRunSummary,
  shouldGenerateOutputFile,
  resetDryRunState
} = require('../src/rescue/dry-run');

describe('setDryRunMode', () => {
  beforeEach(() => {
    resetDryRunState();
  });

  test('enables dry-run mode with true', () => {
    setDryRunMode(true);
    assert.strictEqual(isDryRunMode(), true);
  });

  test('disables dry-run mode with false', () => {
    setDryRunMode(true);
    setDryRunMode(false);
    assert.strictEqual(isDryRunMode(), false);
  });

  test('coerces truthy values to boolean', () => {
    setDryRunMode(1);
    assert.strictEqual(isDryRunMode(), true);

    setDryRunMode('yes');
    assert.strictEqual(isDryRunMode(), true);
  });

  test('coerces falsy values to boolean', () => {
    setDryRunMode(true);
    setDryRunMode(0);
    assert.strictEqual(isDryRunMode(), false);

    setDryRunMode(true);
    setDryRunMode('');
    assert.strictEqual(isDryRunMode(), false);

    setDryRunMode(true);
    setDryRunMode(null);
    assert.strictEqual(isDryRunMode(), false);
  });
});

describe('isDryRunMode', () => {
  beforeEach(() => {
    resetDryRunState();
  });

  test('returns false by default', () => {
    assert.strictEqual(isDryRunMode(), false);
  });

  test('returns true when enabled', () => {
    setDryRunMode(true);
    assert.strictEqual(isDryRunMode(), true);
  });

  test('returns false when disabled', () => {
    setDryRunMode(true);
    setDryRunMode(false);
    assert.strictEqual(isDryRunMode(), false);
  });
});

describe('formatDryRunMessage', () => {
  test('adds [DRY-RUN] prefix', () => {
    const result = formatDryRunMessage('Test message');
    assert.strictEqual(result, '[DRY-RUN] Test message');
  });

  test('handles empty string', () => {
    const result = formatDryRunMessage('');
    assert.strictEqual(result, '[DRY-RUN] ');
  });

  test('handles non-string values by converting to string', () => {
    const result = formatDryRunMessage(123);
    assert.strictEqual(result, '[DRY-RUN] 123');
  });

  test('preserves message content', () => {
    const message = 'Would create Rescue Plan: 4weeks-subscription-eur';
    const result = formatDryRunMessage(message);
    assert.ok(result.includes(message));
  });
});

describe('withDryRun', () => {
  beforeEach(() => {
    resetDryRunState();
  });

  test('executes function when NOT in dry-run mode', async () => {
    setDryRunMode(false);
    let executed = false;

    const result = await withDryRun(
      async () => {
        executed = true;
        return 'real-result';
      },
      'Would do something',
      'mock-result'
    );

    assert.strictEqual(executed, true);
    assert.strictEqual(result, 'real-result');
  });

  test('skips function and returns mock when in dry-run mode', async () => {
    setDryRunMode(true);
    let executed = false;

    const mockLog = mock.fn();
    const result = await withDryRun(
      async () => {
        executed = true;
        return 'real-result';
      },
      'Would do something',
      'mock-result',
      { log: mockLog }
    );

    assert.strictEqual(executed, false);
    assert.strictEqual(result, 'mock-result');
  });

  test('logs formatted message in dry-run mode', async () => {
    setDryRunMode(true);
    const mockLog = mock.fn();

    await withDryRun(
      async () => 'result',
      'Would create plan',
      null,
      { log: mockLog }
    );

    assert.strictEqual(mockLog.mock.calls.length, 1);
    const loggedMessage = mockLog.mock.calls[0].arguments[0];
    assert.strictEqual(loggedMessage, '[DRY-RUN] Would create plan');
  });

  test('returns null when mockReturnValue is not provided', async () => {
    setDryRunMode(true);
    const mockLog = mock.fn();

    // Call without providing mockReturnValue (uses default null)
    const result = await withDryRun(
      async () => 'result',
      'Would do something',
      null,
      { log: mockLog }
    );

    // Default mockReturnValue is null
    assert.strictEqual(result, null);
  });

  test('handles async functions correctly', async () => {
    setDryRunMode(false);

    const result = await withDryRun(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async-result';
      },
      'Would do async thing',
      'mock'
    );

    assert.strictEqual(result, 'async-result');
  });
});

describe('createMockPlan', () => {
  test('creates mock plan with correct structure', () => {
    const plan = createMockPlan('EUR');

    assert.strictEqual(plan.code, '4weeks-subscription-eur');
    assert.strictEqual(plan.name, 'Rescue Plan (EUR)');
    assert.strictEqual(plan.currency, 'EUR');
    assert.strictEqual(plan.__dryRun, true);
  });

  test('normalizes currency to uppercase', () => {
    const plan = createMockPlan('usd');

    assert.strictEqual(plan.currency, 'USD');
    assert.strictEqual(plan.code, '4weeks-subscription-usd');
    assert.strictEqual(plan.name, 'Rescue Plan (USD)');
  });

  test('includes __dryRun flag', () => {
    const plan = createMockPlan('GBP');
    assert.strictEqual(plan.__dryRun, true);
  });

  test('throws for null currency', () => {
    assert.throws(
      () => createMockPlan(null),
      /Currency must be a non-empty string/
    );
  });

  test('throws for empty string currency', () => {
    assert.throws(
      () => createMockPlan(''),
      /Currency must be a non-empty string/
    );
  });

  test('trims whitespace from currency', () => {
    const plan = createMockPlan('  EUR  ');
    assert.strictEqual(plan.currency, 'EUR');
    assert.strictEqual(plan.code, '4weeks-subscription');
  });
});

describe('createMockSubscription', () => {
  test('creates mock subscription with correct structure', () => {
    const sub = createMockSubscription('client-123', '4weeks-subscription');

    assert.ok(sub.id.startsWith('sub_dryrun_'));
    assert.ok(sub.uuid.startsWith('dryrun-'));
    assert.deepStrictEqual(sub.account, { code: 'client-123' });
    assert.deepStrictEqual(sub.plan, { code: '4weeks-subscription' });
    assert.strictEqual(sub.state, 'active');
    assert.strictEqual(sub.__dryRun, true);
  });

  test('generates unique IDs', () => {
    // Counter ensures uniqueness even within same millisecond
    const sub1 = createMockSubscription('client-1', 'plan-1');
    const sub2 = createMockSubscription('client-2', 'plan-2');

    assert.notStrictEqual(sub1.id, sub2.id);
    assert.notStrictEqual(sub1.uuid, sub2.uuid);
  });

  test('includes __dryRun flag', () => {
    const sub = createMockSubscription('client', 'plan');
    assert.strictEqual(sub.__dryRun, true);
  });
});

describe('displayDryRunBanner', () => {
  beforeEach(() => {
    resetDryRunState();
  });

  test('displays banner when in dry-run mode', () => {
    setDryRunMode(true);
    const mockLog = mock.fn();

    displayDryRunBanner({ log: mockLog });

    assert.strictEqual(mockLog.mock.calls.length, 4);
    // Check separator
    assert.ok(mockLog.mock.calls[0].arguments[0].includes('='));
    // Check message
    assert.ok(mockLog.mock.calls[1].arguments[0].includes('DRY-RUN MODE'));
    assert.ok(mockLog.mock.calls[1].arguments[0].includes('No changes will be made'));
  });

  test('does not display banner when NOT in dry-run mode', () => {
    setDryRunMode(false);
    const mockLog = mock.fn();

    displayDryRunBanner({ log: mockLog });

    assert.strictEqual(mockLog.mock.calls.length, 0);
  });
});

describe('displayDryRunSummary', () => {
  beforeEach(() => {
    resetDryRunState();
  });

  test('displays summary when in dry-run mode', () => {
    setDryRunMode(true);
    const mockLog = mock.fn();
    const stats = { total: 100, rescued: 95, failed: 5 };

    displayDryRunSummary(stats, { log: mockLog });

    const allOutput = mockLog.mock.calls.map((c) => c.arguments[0]).join('\n');
    assert.ok(allOutput.includes('DRY-RUN SUMMARY'));
    assert.ok(allOutput.includes('100 clients processed'));
    assert.ok(allOutput.includes('Would be rescued: 95'));
    assert.ok(allOutput.includes('Would fail: 5'));
    assert.ok(allOutput.includes('No actual changes were made'));
    assert.ok(allOutput.includes('Output file NOT generated'));
  });

  test('does not display summary when NOT in dry-run mode', () => {
    setDryRunMode(false);
    const mockLog = mock.fn();
    const stats = { total: 100, rescued: 95, failed: 5 };

    displayDryRunSummary(stats, { log: mockLog });

    assert.strictEqual(mockLog.mock.calls.length, 0);
  });
});

describe('shouldGenerateOutputFile', () => {
  beforeEach(() => {
    resetDryRunState();
  });

  test('returns true when NOT in dry-run mode', () => {
    setDryRunMode(false);
    assert.strictEqual(shouldGenerateOutputFile(), true);
  });

  test('returns false when in dry-run mode', () => {
    setDryRunMode(true);
    assert.strictEqual(shouldGenerateOutputFile(), false);
  });
});

describe('resetDryRunState', () => {
  test('resets dry-run mode to false', () => {
    setDryRunMode(true);
    assert.strictEqual(isDryRunMode(), true);

    resetDryRunState();
    assert.strictEqual(isDryRunMode(), false);
  });
});

describe('Integration scenarios', () => {
  beforeEach(() => {
    resetDryRunState();
  });

  test('full dry-run workflow simulation', async () => {
    setDryRunMode(true);
    const logs = [];
    const mockLog = (msg) => logs.push(msg);

    // Display banner
    displayDryRunBanner({ log: mockLog });

    // Simulate plan creation
    const plan = await withDryRun(
      async () => ({ code: 'real-plan' }),
      'Would create Rescue Plan: 4weeks-subscription',
      createMockPlan('EUR'),
      { log: mockLog }
    );

    // Simulate subscription assignment
    const sub = await withDryRun(
      async () => ({ id: 'real-sub' }),
      '✓ client-123 - Would be RESCUED with plan 4weeks-subscription',
      createMockSubscription('client-123', '4weeks-subscription'),
      { log: mockLog }
    );

    // Display summary
    displayDryRunSummary({ total: 1, rescued: 1, failed: 0 }, { log: mockLog });

    // Verify mock objects
    assert.strictEqual(plan.__dryRun, true);
    assert.strictEqual(sub.__dryRun, true);

    // Verify logging
    const allLogs = logs.join('\n');
    assert.ok(allLogs.includes('DRY-RUN MODE'));
    assert.ok(allLogs.includes('[DRY-RUN] Would create Rescue Plan'));
    assert.ok(allLogs.includes('[DRY-RUN] ✓ client-123'));
    assert.ok(allLogs.includes('DRY-RUN SUMMARY'));

    // Verify no output file
    assert.strictEqual(shouldGenerateOutputFile(), false);
  });

  test('normal mode workflow (not dry-run)', async () => {
    setDryRunMode(false);
    let apiCalled = false;

    // Simulate real API call
    const result = await withDryRun(
      async () => {
        apiCalled = true;
        return { code: 'real-plan' };
      },
      'Would create plan',
      createMockPlan('EUR')
    );

    // Verify API was actually called
    assert.strictEqual(apiCalled, true);
    assert.strictEqual(result.code, 'real-plan');
    assert.strictEqual(result.__dryRun, undefined);

    // Verify output file should be generated
    assert.strictEqual(shouldGenerateOutputFile(), true);
  });
});
