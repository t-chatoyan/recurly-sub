/**
 * Progress Display Module Tests
 * Tests for real-time progress bar functionality
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Store original functions for restoration
let originalStdoutWrite;
let originalConsoleLog;
let originalIsTTY;
let capturedOutput;
let capturedLogs;

beforeEach(() => {
  // Capture stdout.write
  originalStdoutWrite = process.stdout.write;
  capturedOutput = '';
  process.stdout.write = function(str) {
    capturedOutput += str;
    return true;
  };

  // Capture console.log
  originalConsoleLog = console.log;
  capturedLogs = [];
  console.log = function(msg) {
    capturedLogs.push(msg);
  };

  // Mock isTTY to return true for tests (allows testing output format)
  originalIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
});

afterEach(() => {
  // Restore original functions
  process.stdout.write = originalStdoutWrite;
  console.log = originalConsoleLog;
  process.stdout.isTTY = originalIsTTY;
});

// ====================
// createProgressBar() tests
// ====================

test('createProgressBar() requires non-negative total', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  assert.throws(
    () => createProgressBar(-1),
    /Total must be a non-negative number/
  );
});

test('createProgressBar() rejects non-number total', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  assert.throws(
    () => createProgressBar('invalid'),
    /Total must be a non-negative number/
  );

  assert.throws(
    () => createProgressBar(null),
    /Total must be a non-negative number/
  );

  assert.throws(
    () => createProgressBar(undefined),
    /Total must be a non-negative number/
  );
});

test('createProgressBar() rejects NaN total', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  assert.throws(
    () => createProgressBar(NaN),
    /Total must be a non-negative number/
  );
});

test('createProgressBar() accepts zero total', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(0);
  assert.ok(progress);
  assert.ok(typeof progress.update === 'function');
  assert.ok(typeof progress.complete === 'function');
});

test('createProgressBar() accepts positive total', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  assert.ok(progress);
  assert.ok(typeof progress.update === 'function');
  assert.ok(typeof progress.complete === 'function');
});

// ====================
// update() tests
// ====================

test('update() displays progress bar with correct percentage', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  progress.update(50);

  assert.ok(capturedOutput.includes('50%'), 'Should include 50%');
  assert.ok(capturedOutput.includes('50/100'), 'Should include counter 50/100');
});

test('update() displays 0% at start', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  progress.update(0);

  assert.ok(capturedOutput.includes('0%'), 'Should include 0%');
  assert.ok(capturedOutput.includes('0/100'), 'Should include counter 0/100');
});

test('update() displays 100% at end', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  progress.update(100);

  assert.ok(capturedOutput.includes('100%'), 'Should include 100%');
  assert.ok(capturedOutput.includes('100/100'), 'Should include counter 100/100');
});

test('update() displays client ID when provided', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  progress.update(5, 'client_abc123');

  assert.ok(capturedOutput.includes('client_abc123'), 'Should include client ID');
});

test('update() works without client ID', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  progress.update(5);

  assert.ok(capturedOutput.includes('50%'), 'Should include percentage');
  assert.ok(!capturedOutput.includes('undefined'), 'Should not include undefined');
});

test('update() displays filled and empty blocks', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  progress.update(50);

  assert.ok(capturedOutput.includes('█'), 'Should include filled blocks');
  assert.ok(capturedOutput.includes('░'), 'Should include empty blocks');
});

test('update() handles zero total gracefully', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(0);
  progress.update(0);

  assert.ok(capturedOutput.includes('No items to process'), 'Should show no items message');
});

test('update() starts with carriage return for in-place update', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  progress.update(1);

  assert.ok(capturedOutput.startsWith('\r'), 'Should start with carriage return');
});

test('update() includes "clients" text', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  progress.update(25);

  assert.ok(capturedOutput.includes('clients'), 'Should include "clients" text');
});

// ====================
// complete() tests
// ====================

test('complete() displays total processed', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  progress.complete({ successful: 8, failed: 2 });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('Total processed: 10'), 'Should show total');
});

test('complete() displays successful count', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  progress.complete({ successful: 95, failed: 5 });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('Successful:'), 'Should show successful label');
  assert.ok(output.includes('95'), 'Should show successful count');
});

test('complete() displays failed count', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  progress.complete({ successful: 95, failed: 5 });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('Failed:'), 'Should show failed label');
  assert.ok(output.includes('5'), 'Should show failed count');
});

test('complete() displays duration', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  progress.complete({ successful: 10, failed: 0 });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('Duration:'), 'Should show duration');
});

test('complete() clears progress line', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  progress.update(5);
  capturedOutput = ''; // Reset captured output
  progress.complete({ successful: 10, failed: 0 });

  // Should write spaces to clear line
  assert.ok(capturedOutput.includes('\r'), 'Should use carriage return to clear');
});

test('complete() displays EXECUTION COMPLETE header', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  progress.complete({ successful: 10, failed: 0 });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('EXECUTION COMPLETE'), 'Should show completion header');
});

// ====================
// formatDuration() tests
// ====================

test('formatDuration() handles seconds only', (t) => {
  const { formatDuration } = require('../src/ui/progress');

  assert.strictEqual(formatDuration(0), '0s');
  assert.strictEqual(formatDuration(1), '1s');
  assert.strictEqual(formatDuration(45), '45s');
  assert.strictEqual(formatDuration(59), '59s');
});

test('formatDuration() handles minutes and seconds', (t) => {
  const { formatDuration } = require('../src/ui/progress');

  assert.strictEqual(formatDuration(60), '1m 0s');
  assert.strictEqual(formatDuration(90), '1m 30s');
  assert.strictEqual(formatDuration(125), '2m 5s');
});

test('formatDuration() handles hours', (t) => {
  const { formatDuration } = require('../src/ui/progress');

  assert.strictEqual(formatDuration(3600), '1h 0m 0s');
  assert.strictEqual(formatDuration(3661), '1h 1m 1s');
  assert.strictEqual(formatDuration(7325), '2h 2m 5s');
});

// ====================
// complete() validation tests
// ====================

test('complete() requires stats object', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);

  assert.throws(
    () => progress.complete(null),
    /Stats must be an object/
  );

  assert.throws(
    () => progress.complete(undefined),
    /Stats must be an object/
  );

  assert.throws(
    () => progress.complete('invalid'),
    /Stats must be an object/
  );
});

test('complete() requires numeric successful and failed', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);

  assert.throws(
    () => progress.complete({}),
    /Stats must contain numeric successful and failed/
  );

  assert.throws(
    () => progress.complete({ successful: 'invalid', failed: 0 }),
    /Stats must contain numeric successful and failed/
  );

  assert.throws(
    () => progress.complete({ successful: 10, failed: 'invalid' }),
    /Stats must contain numeric successful and failed/
  );
});

// ====================
// truncateClientId() tests
// ====================

test('truncateClientId() returns short strings unchanged', (t) => {
  const { truncateClientId } = require('../src/ui/progress');

  assert.strictEqual(truncateClientId('abc'), 'abc');
  assert.strictEqual(truncateClientId('short_id_123'), 'short_id_123');
});

test('truncateClientId() truncates long strings with ellipsis', (t) => {
  const { truncateClientId } = require('../src/ui/progress');

  const longId = 'this_is_a_very_long_client_id_that_exceeds_limit';
  const result = truncateClientId(longId);

  assert.ok(result.length <= 20, 'Should be max 20 chars');
  assert.ok(result.endsWith('...'), 'Should end with ellipsis');
});

test('truncateClientId() handles empty and null values', (t) => {
  const { truncateClientId } = require('../src/ui/progress');

  assert.strictEqual(truncateClientId(''), '');
  assert.strictEqual(truncateClientId(null), null);
  assert.strictEqual(truncateClientId(undefined), undefined);
});

test('update() truncates long client IDs', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  const longClientId = 'this_is_a_very_long_client_id_that_should_be_truncated';
  progress.update(5, longClientId);

  // Should not contain the full long ID
  assert.ok(!capturedOutput.includes(longClientId), 'Should not contain full long ID');
  // Should contain truncated version with ellipsis
  assert.ok(capturedOutput.includes('...'), 'Should contain ellipsis');
});

// ====================
// Edge cases
// ====================

test('update() handles single item total', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(1);
  progress.update(1);

  assert.ok(capturedOutput.includes('100%'), 'Should show 100% for single item');
  assert.ok(capturedOutput.includes('1/1'), 'Should show 1/1');
});

test('update() handles large totals', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10000);
  progress.update(5000);

  assert.ok(capturedOutput.includes('50%'), 'Should show 50%');
  assert.ok(capturedOutput.includes('5000/10000'), 'Should show large counter');
});

test('update() rounds percentage correctly', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(3);
  progress.update(1); // 33.33%

  assert.ok(capturedOutput.includes('33%'), 'Should round to 33%');
});

test('complete() works with zero successful', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  progress.complete({ successful: 0, failed: 10 });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('Successful:'), 'Should show successful');
  assert.ok(output.includes('0'), 'Should show zero');
});

test('complete() works with zero failed', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10);
  progress.complete({ successful: 10, failed: 0 });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('Failed:'), 'Should show failed');
});

// ====================
// current parameter validation tests
// ====================

test('update() clamps current > total to 100%', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  progress.update(150); // Exceeds total

  // Should clamp to 100%, not show 150%
  assert.ok(capturedOutput.includes('100%'), 'Should clamp to 100%');
  assert.ok(capturedOutput.includes('100/100'), 'Should show clamped counter');
  assert.ok(!capturedOutput.includes('150'), 'Should not show 150');
});

test('update() clamps negative current to 0%', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(100);
  progress.update(-10); // Negative value

  // Should clamp to 0%, not show negative percentage
  assert.ok(capturedOutput.includes('0%'), 'Should clamp to 0%');
  assert.ok(capturedOutput.includes('0/100'), 'Should show clamped counter');
  assert.ok(!capturedOutput.includes('-'), 'Should not show negative value');
});

// ====================
// isTTY() tests
// ====================

test('isTTY() returns boolean', (t) => {
  const { isTTY } = require('../src/ui/progress');

  const result = isTTY();
  assert.ok(typeof result === 'boolean', 'Should return a boolean');
});

test('update() suppresses output in non-TTY mode', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  // Temporarily set non-TTY mode
  process.stdout.isTTY = false;
  capturedOutput = ''; // Reset

  const progress = createProgressBar(10);
  progress.update(5);

  // Should not output anything in non-TTY mode
  assert.strictEqual(capturedOutput, '', 'Should not output in non-TTY mode');

  // Restore TTY mode for other tests
  process.stdout.isTTY = true;
});

// ====================
// dry-run mode tests
// ====================

test('createProgressBar() accepts dryRun option', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  // Should not throw
  const progress = createProgressBar(10, { dryRun: true });
  assert.ok(progress);
  assert.ok(typeof progress.update === 'function');
  assert.ok(typeof progress.complete === 'function');
});

test('complete() shows DRY-RUN label when dryRun is true', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10, { dryRun: true });
  progress.complete({ successful: 10, failed: 0 });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('DRY-RUN'), 'Should include DRY-RUN label');
});

test('complete() does not show DRY-RUN label when dryRun is false', (t) => {
  const { createProgressBar } = require('../src/ui/progress');

  const progress = createProgressBar(10, { dryRun: false });
  progress.complete({ successful: 10, failed: 0 });

  const output = capturedLogs.join('\n');
  assert.ok(!output.includes('DRY-RUN'), 'Should not include DRY-RUN label');
});

// ====================
// getTerminalWidth() tests
// ====================

test('getTerminalWidth() returns number', (t) => {
  const { getTerminalWidth } = require('../src/ui/progress');

  const width = getTerminalWidth();
  assert.ok(typeof width === 'number', 'Should return a number');
  assert.ok(width > 0, 'Should return positive number');
});

test('getTerminalWidth() has fallback for non-TTY', (t) => {
  const { getTerminalWidth } = require('../src/ui/progress');

  // Even in test environment (non-TTY), should return fallback
  const width = getTerminalWidth();
  assert.ok(width >= 80, 'Should have reasonable fallback width');
});
