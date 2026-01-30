/**
 * Tests for Execution Control Module
 * Tests confirmation intervals, pausing, and graceful stop
 */

const { test, describe, mock, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  getConfirmationInterval,
  shouldPauseForConfirmation,
  displayStopMessage,
  displayConfirmationInfo,
  createExecutionController
} = require('../src/rescue/execution-control');

describe('getConfirmationInterval', () => {
  test('returns null for --no-confirm', () => {
    const interval = getConfirmationInterval({ noConfirm: true });
    assert.strictEqual(interval, null);
  });

  test('returns custom interval for --confirm-every', () => {
    const interval = getConfirmationInterval({ confirmEvery: 50 });
    assert.strictEqual(interval, 50);
  });

  test('returns default 100 when no options', () => {
    const interval = getConfirmationInterval({});
    assert.strictEqual(interval, 100);
  });

  test('returns default 100 for undefined options', () => {
    const interval = getConfirmationInterval();
    assert.strictEqual(interval, 100);
  });

  test('--no-confirm takes precedence over --confirm-every', () => {
    const interval = getConfirmationInterval({ noConfirm: true, confirmEvery: 50 });
    assert.strictEqual(interval, null);
  });

  test('ignores invalid confirmEvery values', () => {
    assert.strictEqual(getConfirmationInterval({ confirmEvery: 'not-a-number' }), 100);
    assert.strictEqual(getConfirmationInterval({ confirmEvery: 0 }), 100);
    assert.strictEqual(getConfirmationInterval({ confirmEvery: -10 }), 100);
  });

  test('accepts valid confirmEvery values', () => {
    assert.strictEqual(getConfirmationInterval({ confirmEvery: 1 }), 1);
    assert.strictEqual(getConfirmationInterval({ confirmEvery: 500 }), 500);
  });
});

describe('shouldPauseForConfirmation', () => {
  test('pauses at correct intervals', () => {
    // Interval = 50, pause after 50, 100, 150...
    // Index 49 = 50th client (should pause)
    assert.strictEqual(shouldPauseForConfirmation(49, 50), true);
    // Index 99 = 100th client (should pause)
    assert.strictEqual(shouldPauseForConfirmation(99, 50), true);
    // Index 149 = 150th client (should pause)
    assert.strictEqual(shouldPauseForConfirmation(149, 50), true);
  });

  test('does not pause between intervals', () => {
    // Index 50 = 51st client (should not pause)
    assert.strictEqual(shouldPauseForConfirmation(50, 50), false);
    // Index 48 = 49th client (should not pause)
    assert.strictEqual(shouldPauseForConfirmation(48, 50), false);
  });

  test('never pauses for null interval', () => {
    assert.strictEqual(shouldPauseForConfirmation(49, null), false);
    assert.strictEqual(shouldPauseForConfirmation(99, null), false);
    assert.strictEqual(shouldPauseForConfirmation(999, null), false);
  });

  test('handles first client correctly', () => {
    // Index 0 = 1st client, should not pause for normal intervals
    assert.strictEqual(shouldPauseForConfirmation(0, 100), false);
    // Edge case: interval=1 means pause after every client including first
    // But if we provide totalCount and it's the only client, don't pause
    assert.strictEqual(shouldPauseForConfirmation(0, 1, 1), false); // Single client = last
    // Without totalCount, interval=1 pauses after first
    assert.strictEqual(shouldPauseForConfirmation(0, 1), true);
  });

  test('does not pause at last item when totalCount provided', () => {
    // 100 total items, interval 50
    // Index 49 = 50th client (should pause, not last)
    assert.strictEqual(shouldPauseForConfirmation(49, 50, 100), true);
    // Index 99 = 100th client (should NOT pause, is last)
    assert.strictEqual(shouldPauseForConfirmation(99, 50, 100), false);
  });

  test('does not pause when totalCount equals interval', () => {
    // 50 total items, interval 50
    // Index 49 = 50th client (last item, should not pause)
    assert.strictEqual(shouldPauseForConfirmation(49, 50, 50), false);
  });

  test('does not pause when totalCount less than interval', () => {
    // 30 total items, interval 50
    assert.strictEqual(shouldPauseForConfirmation(29, 50, 30), false);
  });

  test('handles interval of 1', () => {
    // Interval = 1 means pause after every client (except last)
    assert.strictEqual(shouldPauseForConfirmation(0, 1, 10), true);
    assert.strictEqual(shouldPauseForConfirmation(1, 1, 10), true);
    assert.strictEqual(shouldPauseForConfirmation(9, 1, 10), false); // Last item
  });
});

describe('displayStopMessage', () => {
  test('displays correct stop message', () => {
    const mockLog = mock.fn();
    const stats = {
      processedCount: 50,
      successCount: 48,
      failedCount: 2,
      totalCount: 250
    };

    displayStopMessage(stats, { log: mockLog });

    const allOutput = mockLog.mock.calls.map((c) => c.arguments[0]).join('\n');
    assert.ok(allOutput.includes('EXECUTION STOPPED BY USER'));
    assert.ok(allOutput.includes('Processed: 50/250 clients'));
    assert.ok(allOutput.includes('Success: 48'));
    assert.ok(allOutput.includes('Failed: 2'));
    assert.ok(allOutput.includes('Remaining: 200'));
    assert.ok(allOutput.includes('Use --resume to continue later'));
  });

  test('calculates remaining correctly', () => {
    const mockLog = mock.fn();
    const stats = {
      processedCount: 100,
      successCount: 100,
      failedCount: 0,
      totalCount: 500
    };

    displayStopMessage(stats, { log: mockLog });

    const allOutput = mockLog.mock.calls.map((c) => c.arguments[0]).join('\n');
    assert.ok(allOutput.includes('Remaining: 400'));
  });
});

describe('displayConfirmationInfo', () => {
  test('displays continuous mode for null interval', () => {
    const mockLog = mock.fn();

    displayConfirmationInfo(null, 100, { log: mockLog });

    assert.strictEqual(mockLog.mock.calls.length, 1);
    assert.ok(mockLog.mock.calls[0].arguments[0].includes('Continuous'));
    assert.ok(mockLog.mock.calls[0].arguments[0].includes('--no-confirm'));
  });

  test('displays expected pauses for interval mode', () => {
    const mockLog = mock.fn();

    displayConfirmationInfo(50, 251, { log: mockLog });

    const output = mockLog.mock.calls[0].arguments[0];
    assert.ok(output.includes('every 50 clients'));
    // (251-1)/50 = 5 pauses (at 50, 100, 150, 200, 250)
    assert.ok(output.includes('5 pause(s) expected'));
  });

  test('handles zero totalCount', () => {
    const mockLog = mock.fn();

    displayConfirmationInfo(50, 0, { log: mockLog });

    const output = mockLog.mock.calls[0].arguments[0];
    assert.ok(output.includes('No clients to process'));
  });

  test('handles negative totalCount', () => {
    const mockLog = mock.fn();

    displayConfirmationInfo(50, -10, { log: mockLog });

    const output = mockLog.mock.calls[0].arguments[0];
    assert.ok(output.includes('No clients to process'));
  });

  test('displays no confirmations needed when totalCount < interval', () => {
    const mockLog = mock.fn();

    displayConfirmationInfo(100, 50, { log: mockLog });

    const output = mockLog.mock.calls[0].arguments[0];
    assert.ok(output.includes('No confirmations needed'));
    assert.ok(output.includes('50 clients < interval 100'));
  });
});

describe('createExecutionController', () => {
  test('creates controller with initial state', () => {
    const controller = createExecutionController({
      interval: 50,
      totalCount: 100
    });

    const stats = controller.getStats();
    assert.strictEqual(stats.processedCount, 0);
    assert.strictEqual(stats.successCount, 0);
    assert.strictEqual(stats.failedCount, 0);
    assert.strictEqual(stats.totalCount, 100);
    assert.strictEqual(stats.stopped, false);
  });

  test('recordResult updates counts correctly', () => {
    const controller = createExecutionController({
      interval: 50,
      totalCount: 100
    });

    controller.recordResult(true);
    controller.recordResult(true);
    controller.recordResult(false);

    const stats = controller.getStats();
    assert.strictEqual(stats.processedCount, 3);
    assert.strictEqual(stats.successCount, 2);
    assert.strictEqual(stats.failedCount, 1);
  });

  test('isStopped returns correct state', () => {
    const controller = createExecutionController({
      interval: 50,
      totalCount: 100
    });

    assert.strictEqual(controller.isStopped(), false);
  });
});

describe('Integration scenarios', () => {
  test('full batch without confirmations (--no-confirm)', () => {
    const interval = getConfirmationInterval({ noConfirm: true });
    assert.strictEqual(interval, null);

    const clients = Array.from({ length: 150 }, (_, i) => `client-${i}`);
    let pauseCount = 0;

    for (let i = 0; i < clients.length; i++) {
      if (shouldPauseForConfirmation(i, interval)) {
        pauseCount++;
      }
    }

    assert.strictEqual(pauseCount, 0);
  });

  test('correct number of pauses with default interval', () => {
    const interval = getConfirmationInterval({});
    assert.strictEqual(interval, 100);

    const clients = Array.from({ length: 350 }, (_, i) => `client-${i}`);
    let pauseCount = 0;

    for (let i = 0; i < clients.length; i++) {
      if (shouldPauseForConfirmation(i, interval, clients.length)) {
        pauseCount++;
      }
    }

    // Should pause at 100, 200, 300 (not at 350 since it's last)
    assert.strictEqual(pauseCount, 3);
  });

  test('correct number of pauses with custom interval', () => {
    const interval = getConfirmationInterval({ confirmEvery: 25 });
    assert.strictEqual(interval, 25);

    const clients = Array.from({ length: 100 }, (_, i) => `client-${i}`);
    let pauseCount = 0;

    for (let i = 0; i < clients.length; i++) {
      if (shouldPauseForConfirmation(i, interval, clients.length)) {
        pauseCount++;
      }
    }

    // Should pause at 25, 50, 75 (not at 100 since it's last)
    assert.strictEqual(pauseCount, 3);
  });

  test('no pauses when totalCount less than interval', () => {
    const interval = getConfirmationInterval({ confirmEvery: 100 });
    const clients = Array.from({ length: 50 }, (_, i) => `client-${i}`);
    let pauseCount = 0;

    for (let i = 0; i < clients.length; i++) {
      if (shouldPauseForConfirmation(i, interval, clients.length)) {
        pauseCount++;
      }
    }

    assert.strictEqual(pauseCount, 0);
  });

  test('single client never triggers pause', () => {
    const interval = getConfirmationInterval({ confirmEvery: 1 });
    const clients = ['client-0'];
    let pauseCount = 0;

    for (let i = 0; i < clients.length; i++) {
      if (shouldPauseForConfirmation(i, interval, clients.length)) {
        pauseCount++;
      }
    }

    assert.strictEqual(pauseCount, 0);
  });

  test('execution controller tracks progress correctly', () => {
    const mockLog = mock.fn();
    const controller = createExecutionController({
      interval: null, // No confirmations
      totalCount: 10,
      log: mockLog
    });

    // Simulate processing 10 clients: 8 success, 2 failed
    for (let i = 0; i < 10; i++) {
      const success = i !== 3 && i !== 7; // Fail on 4th and 8th
      controller.recordResult(success);
    }

    const stats = controller.getStats();
    assert.strictEqual(stats.processedCount, 10);
    assert.strictEqual(stats.successCount, 8);
    assert.strictEqual(stats.failedCount, 2);
  });
});
