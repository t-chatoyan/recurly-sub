/**
 * Action Logger Module Tests
 * Tests for structured logging of client operations
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Shared imports (Issue #6 fix)
const {
  createLogger,
  buildRecurlyUrl,
  truncateError,
  sanitizeErrorMessage,
  SYMBOLS
} = require('../src/ui/logger');

// Store original functions for restoration
let originalConsoleLog;
let capturedLogs;

beforeEach(() => {
  // Capture console.log
  originalConsoleLog = console.log;
  capturedLogs = [];
  console.log = function(msg) {
    capturedLogs.push(msg);
  };
});

afterEach(() => {
  // Restore original functions
  console.log = originalConsoleLog;
});

// ====================
// createLogger() tests
// ====================

test('createLogger() returns logger with all methods', (t) => {
  const logger = createLogger();
  assert.ok(typeof logger.logSuccess === 'function');
  assert.ok(typeof logger.logFailure === 'function');
  assert.ok(typeof logger.logSkip === 'function');
  assert.ok(typeof logger.logInfo === 'function');
});

test('createLogger() accepts options', (t) => {
  const logger = createLogger({ dryRun: true, project: 'eur', verbose: true });
  assert.ok(logger);
});

test('createLogger() works without options', (t) => {
  const logger = createLogger();
  assert.ok(logger);
});

// ====================
// logSuccess() tests
// ====================

test('logSuccess() includes checkmark symbol', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSuccess('client123', 'sub456');

  assert.ok(capturedLogs[0].includes(SYMBOLS.SUCCESS));
});

test('logSuccess() includes client ID', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSuccess('client_abc123');

  assert.ok(capturedLogs[0].includes('client_abc123'));
});

test('logSuccess() includes RESCUED action', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSuccess('client123');

  assert.ok(capturedLogs[0].includes('RESCUED'));
});

test('logSuccess() includes subscription ID when provided', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSuccess('client123', 'sub_xyz789');

  assert.ok(capturedLogs[0].includes('sub_xyz789'));
});

test('logSuccess() includes Recurly URL', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSuccess('client123');

  assert.ok(capturedLogs[0].includes('https://app.recurly.com/go/eur/accounts/client123'));
});

test('logSuccess() in dry-run includes [DRY-RUN] prefix', (t) => {
  const logger = createLogger({ dryRun: true, project: 'eur' });
  logger.logSuccess('client123');

  assert.ok(capturedLogs[0].includes('[DRY-RUN]'));
});

test('logSuccess() in dry-run shows WOULD RESCUE', (t) => {
  const logger = createLogger({ dryRun: true, project: 'eur' });
  logger.logSuccess('client123');

  assert.ok(capturedLogs[0].includes('WOULD RESCUE'));
  assert.ok(!capturedLogs[0].includes('RESCUED'), 'Should not include RESCUED in dry-run');
});

test('logSuccess() omits URL when project is empty', (t) => {
  const logger = createLogger({ project: '' });
  logger.logSuccess('client123');

  assert.ok(!capturedLogs[0].includes('https://'), 'Should not include URL when project is empty');
});

// Issue #2 fix: null/undefined clientId tests
test('logSuccess() handles null clientId gracefully', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSuccess(null);

  assert.ok(capturedLogs[0].includes('unknown'));
  assert.ok(capturedLogs[0].includes('RESCUED'));
});

test('logSuccess() handles undefined clientId gracefully', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSuccess(undefined);

  assert.ok(capturedLogs[0].includes('unknown'));
  assert.ok(capturedLogs[0].includes('RESCUED'));
});

// ====================
// logFailure() tests
// ====================

test('logFailure() includes cross symbol', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logFailure('client123', 'Connection timeout');

  assert.ok(capturedLogs[0].includes(SYMBOLS.FAILURE));
});

test('logFailure() includes client ID', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logFailure('client_def456', 'Error');

  assert.ok(capturedLogs[0].includes('client_def456'));
});

test('logFailure() includes FAILED action', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logFailure('client123', 'Error');

  assert.ok(capturedLogs[0].includes('FAILED'));
});

test('logFailure() includes error reason', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logFailure('client123', 'Connection timeout');

  assert.ok(capturedLogs[0].includes('Connection timeout'));
});

test('logFailure() in dry-run includes [DRY-RUN] prefix', (t) => {
  const logger = createLogger({ dryRun: true, project: 'eur' });
  logger.logFailure('client123', 'Error');

  assert.ok(capturedLogs[0].includes('[DRY-RUN]'));
});

test('logFailure() in dry-run shows WOULD FAIL', (t) => {
  const logger = createLogger({ dryRun: true, project: 'eur' });
  logger.logFailure('client123', 'Error');

  assert.ok(capturedLogs[0].includes('WOULD FAIL'));
});

test('logFailure() truncates long error messages', (t) => {
  const logger = createLogger({ project: 'eur' });
  const longError = 'A'.repeat(200);
  logger.logFailure('client123', longError);

  // Should be truncated with ...
  assert.ok(capturedLogs[0].includes('...'));
  assert.ok(capturedLogs[0].length < 300, 'Log line should be reasonably short');
});

test('logFailure() handles null error reason', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logFailure('client123', null);

  assert.ok(capturedLogs[0].includes('Unknown error'));
});

test('logFailure() handles undefined error reason', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logFailure('client123', undefined);

  assert.ok(capturedLogs[0].includes('Unknown error'));
});

test('logFailure() shows verbose details when enabled', (t) => {
  const logger = createLogger({ project: 'eur', verbose: true });
  logger.logFailure('client123', 'Error', { retryCount: 3, httpStatus: 500 });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('Retries attempted: 3'));
  assert.ok(output.includes('HTTP Status: 500'));
});

test('logFailure() hides verbose details when disabled', (t) => {
  const logger = createLogger({ project: 'eur', verbose: false });
  logger.logFailure('client123', 'Error', { retryCount: 3, httpStatus: 500 });

  const output = capturedLogs.join('\n');
  assert.ok(!output.includes('Retries attempted:'));
  assert.ok(!output.includes('HTTP Status:'));
});

// Issue #2 fix: null/undefined clientId in logFailure
test('logFailure() handles null clientId gracefully', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logFailure(null, 'Error');

  assert.ok(capturedLogs[0].includes('unknown'));
  assert.ok(capturedLogs[0].includes('FAILED'));
});

// Issue #4 fix: verbose details type checking
test('logFailure() only shows retryCount if it is a number', (t) => {
  const logger = createLogger({ project: 'eur', verbose: true });
  logger.logFailure('client123', 'Error', { retryCount: 'not a number', httpStatus: 500 });

  const output = capturedLogs.join('\n');
  assert.ok(!output.includes('Retries attempted:'), 'Should not show non-numeric retryCount');
  assert.ok(output.includes('HTTP Status: 500'));
});

test('logFailure() only shows httpStatus if it is a number', (t) => {
  const logger = createLogger({ project: 'eur', verbose: true });
  logger.logFailure('client123', 'Error', { retryCount: 3, httpStatus: 'invalid' });

  const output = capturedLogs.join('\n');
  assert.ok(output.includes('Retries attempted: 3'));
  assert.ok(!output.includes('HTTP Status:'), 'Should not show non-numeric httpStatus');
});

// ====================
// logSkip() tests
// ====================

test('logSkip() includes skip symbol', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSkip('client123', 'was not rescued');

  assert.ok(capturedLogs[0].includes(SYMBOLS.SKIP));
});

test('logSkip() includes client ID', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSkip('client_ghi789', 'was not rescued');

  assert.ok(capturedLogs[0].includes('client_ghi789'));
});

test('logSkip() includes SKIPPED action', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSkip('client123', 'reason');

  assert.ok(capturedLogs[0].includes('SKIPPED'));
});

test('logSkip() includes reason', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSkip('client123', 'was not rescued in original execution');

  assert.ok(capturedLogs[0].includes('was not rescued in original execution'));
});

test('logSkip() in dry-run includes [DRY-RUN] prefix', (t) => {
  const logger = createLogger({ dryRun: true, project: 'eur' });
  logger.logSkip('client123', 'reason');

  assert.ok(capturedLogs[0].includes('[DRY-RUN]'));
});

// Issue #2 fix: null/undefined clientId in logSkip
test('logSkip() handles null clientId gracefully', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSkip(null, 'reason');

  assert.ok(capturedLogs[0].includes('unknown'));
  assert.ok(capturedLogs[0].includes('SKIPPED'));
});

// Issue #3 fix: sanitization in logSkip
test('logSkip() sanitizes reason for sensitive data', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSkip('client123', 'failed with password=secret123');

  assert.ok(!capturedLogs[0].includes('secret123'));
  assert.ok(capturedLogs[0].includes('[REDACTED]'));
});

test('logSkip() handles null reason gracefully', (t) => {
  const logger = createLogger({ project: 'eur' });
  logger.logSkip('client123', null);

  assert.ok(capturedLogs[0].includes('no reason provided'));
});

// ====================
// logInfo() tests
// ====================

test('logInfo() includes info symbol', (t) => {
  const logger = createLogger();
  logger.logInfo('Processing started');

  assert.ok(capturedLogs[0].includes(SYMBOLS.INFO));
});

test('logInfo() includes message', (t) => {
  const logger = createLogger();
  logger.logInfo('Processing 250 accounts');

  assert.ok(capturedLogs[0].includes('Processing 250 accounts'));
});

test('logInfo() in dry-run includes [DRY-RUN] prefix', (t) => {
  const logger = createLogger({ dryRun: true });
  logger.logInfo('Starting process');

  assert.ok(capturedLogs[0].includes('[DRY-RUN]'));
});

// Issue #3 fix: sanitization in logInfo
test('logInfo() sanitizes message for sensitive data', (t) => {
  const logger = createLogger();
  logger.logInfo('Connecting with api_key=mysecretkey');

  assert.ok(!capturedLogs[0].includes('mysecretkey'));
  assert.ok(capturedLogs[0].includes('[REDACTED]'));
});

test('logInfo() handles null message gracefully', (t) => {
  const logger = createLogger();
  logger.logInfo(null);

  // Should not throw, just log empty or Unknown error
  assert.ok(capturedLogs[0].includes(SYMBOLS.INFO));
});

// ====================
// buildRecurlyUrl() tests
// ====================

test('buildRecurlyUrl() creates correct URL format', (t) => {
  const url = buildRecurlyUrl('eur', 'accounts', 'acc123');
  assert.strictEqual(url, 'https://app.recurly.com/go/eur/accounts/acc123');
});

test('buildRecurlyUrl() handles different resource types', (t) => {
  const accountUrl = buildRecurlyUrl('eur', 'accounts', 'acc123');
  const subscriptionUrl = buildRecurlyUrl('eur', 'subscriptions', 'sub456');

  assert.strictEqual(accountUrl, 'https://app.recurly.com/go/eur/accounts/acc123');
  assert.strictEqual(subscriptionUrl, 'https://app.recurly.com/go/eur/subscriptions/sub456');
});

test('buildRecurlyUrl() returns empty string for empty project', (t) => {
  const url = buildRecurlyUrl('', 'accounts', 'acc123');
  assert.strictEqual(url, '');
});

test('buildRecurlyUrl() returns empty string for empty resourceId', (t) => {
  const url = buildRecurlyUrl('eur', 'accounts', '');
  assert.strictEqual(url, '');
});

test('buildRecurlyUrl() returns empty string for null project', (t) => {
  const url = buildRecurlyUrl(null, 'accounts', 'acc123');
  assert.strictEqual(url, '');
});

// Issue #5 fix: URL encoding tests
test('buildRecurlyUrl() URL-encodes special characters in project', (t) => {
  const url = buildRecurlyUrl('eur project', 'accounts', 'acc123');
  assert.ok(url.includes('eur%20project'));
  assert.ok(!url.includes('eur project'));
});

test('buildRecurlyUrl() URL-encodes special characters in resourceId', (t) => {
  const url = buildRecurlyUrl('eur', 'accounts', 'acc/123');
  assert.ok(url.includes('acc%2F123'));
  assert.ok(!url.includes('acc/123'));
});

test('buildRecurlyUrl() URL-encodes ampersands', (t) => {
  const url = buildRecurlyUrl('eur', 'accounts', 'acc&id=123');
  assert.ok(url.includes('acc%26id%3D123'));
});

// ====================
// truncateError() tests
// ====================

test('truncateError() returns original for short messages', (t) => {
  const result = truncateError('Short error', 50);
  assert.strictEqual(result, 'Short error');
});

test('truncateError() truncates long messages', (t) => {
  const longError = 'A'.repeat(200);
  const result = truncateError(longError, 50);

  assert.strictEqual(result.length, 50);
  assert.ok(result.endsWith('...'));
});

test('truncateError() returns "Unknown error" for null', (t) => {
  assert.strictEqual(truncateError(null, 50), 'Unknown error');
});

test('truncateError() returns "Unknown error" for undefined', (t) => {
  assert.strictEqual(truncateError(undefined, 50), 'Unknown error');
});

test('truncateError() returns "Unknown error" for empty string', (t) => {
  assert.strictEqual(truncateError('', 50), 'Unknown error');
});

// Issue #7 fix: boundary test for exact maxLength
test('truncateError() returns original when exactly maxLength', (t) => {
  const exactLength = 'A'.repeat(50);
  const result = truncateError(exactLength, 50);

  assert.strictEqual(result.length, 50);
  assert.strictEqual(result, exactLength);
  assert.ok(!result.endsWith('...'), 'Should not truncate when exactly at limit');
});

// ====================
// sanitizeErrorMessage() tests
// ====================

test('sanitizeErrorMessage() redacts API keys', (t) => {
  const dirty = 'Error with api_key=secret123abc';
  const clean = sanitizeErrorMessage(dirty);

  assert.ok(!clean.includes('secret123abc'));
  assert.ok(clean.includes('[REDACTED]'));
});

test('sanitizeErrorMessage() redacts Bearer tokens', (t) => {
  const dirty = 'Authorization failed: Bearer abc123xyz';
  const clean = sanitizeErrorMessage(dirty);

  assert.ok(!clean.includes('abc123xyz'));
  assert.ok(clean.includes('[REDACTED]'));
});

test('sanitizeErrorMessage() redacts Authorization headers', (t) => {
  const dirty = 'Header Authorization: Basic secret';
  const clean = sanitizeErrorMessage(dirty);

  assert.ok(!clean.includes('Basic secret'));
  assert.ok(clean.includes('[REDACTED]'));
});

test('sanitizeErrorMessage() handles null', (t) => {
  assert.strictEqual(sanitizeErrorMessage(null), 'Unknown error');
});

test('sanitizeErrorMessage() preserves safe messages', (t) => {
  const safe = 'Connection timeout after 30 seconds';
  const result = sanitizeErrorMessage(safe);

  assert.strictEqual(result, safe);
});

// Issue #1 fix: additional sensitive data patterns
test('sanitizeErrorMessage() redacts passwords', (t) => {
  const dirty = 'Failed with password=mysecretpass';
  const clean = sanitizeErrorMessage(dirty);

  assert.ok(!clean.includes('mysecretpass'));
  assert.ok(clean.includes('[REDACTED]'));
});

test('sanitizeErrorMessage() redacts secrets', (t) => {
  const dirty = 'Config error: secret=topsecret123';
  const clean = sanitizeErrorMessage(dirty);

  assert.ok(!clean.includes('topsecret123'));
  assert.ok(clean.includes('[REDACTED]'));
});

test('sanitizeErrorMessage() redacts generic tokens', (t) => {
  const dirty = 'Token validation failed: token=abc123token';
  const clean = sanitizeErrorMessage(dirty);

  assert.ok(!clean.includes('abc123token'));
  assert.ok(clean.includes('[REDACTED]'));
});

test('sanitizeErrorMessage() redacts credentials', (t) => {
  const dirty = 'Invalid credentials=user:pass123';
  const clean = sanitizeErrorMessage(dirty);

  assert.ok(!clean.includes('user:pass123'));
  assert.ok(clean.includes('[REDACTED]'));
});

test('sanitizeErrorMessage() is case insensitive', (t) => {
  const dirty = 'Error: PASSWORD=Secret123 and API_KEY=key456';
  const clean = sanitizeErrorMessage(dirty);

  assert.ok(!clean.includes('Secret123'));
  assert.ok(!clean.includes('key456'));
});

// ====================
// SYMBOLS constant tests
// ====================

test('SYMBOLS has all required symbols', (t) => {
  assert.ok(SYMBOLS.SUCCESS);
  assert.ok(SYMBOLS.FAILURE);
  assert.ok(SYMBOLS.SKIP);
  assert.ok(SYMBOLS.INFO);
});

test('SYMBOLS are Unicode characters', (t) => {
  assert.strictEqual(SYMBOLS.SUCCESS, '✓');
  assert.strictEqual(SYMBOLS.FAILURE, '✗');
  assert.strictEqual(SYMBOLS.SKIP, '⊘');
  assert.strictEqual(SYMBOLS.INFO, 'ℹ');
});
