/**
 * Tests for Recurly API Client Module
 * Tests authentication, rate limiting, and retry logic
 */

const { test, describe, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { createClient, sleep } = require('../src/api/recurly-client');

describe('createClient', () => {
  test('requires API key', () => {
    assert.throws(
      () => createClient({}),
      /API key is required/
    );
  });

  test('requires non-empty API key', () => {
    assert.throws(
      () => createClient({ apiKey: '' }),
      /API key is required|API key must be a non-empty string/
    );

    assert.throws(
      () => createClient({ apiKey: '   ' }),
      /API key must be a non-empty string/
    );
  });

  test('requires string API key', () => {
    assert.throws(
      () => createClient({ apiKey: 123 }),
      /API key must be a non-empty string/
    );

    assert.throws(
      () => createClient({ apiKey: null }),
      /API key is required/
    );
  });

  test('returns client with request method', () => {
    const client = createClient({ apiKey: 'test-key' });
    assert.ok(typeof client.request === 'function');
  });

  test('returns client with getRateLimitStatus method', () => {
    const client = createClient({ apiKey: 'test-key' });
    assert.ok(typeof client.getRateLimitStatus === 'function');
  });

  test('accepts custom retry configuration', () => {
    const client = createClient({
      apiKey: 'test-key',
      maxRetries: 5,
      retryBackoffBase: 3,
      retryBackoffMax: 60
    });
    assert.ok(client);
  });

  test('getRateLimitStatus returns initial null values', () => {
    const client = createClient({ apiKey: 'test-key' });
    const status = client.getRateLimitStatus();

    assert.strictEqual(status.remaining, null);
    assert.strictEqual(status.reset, null);
    assert.strictEqual(status.resetDate, null);
  });
});

describe('sleep', () => {
  test('sleeps for specified milliseconds', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;

    // Allow some tolerance for timing
    assert.ok(elapsed >= 45, `Expected at least 45ms, got ${elapsed}ms`);
    assert.ok(elapsed < 150, `Expected less than 150ms, got ${elapsed}ms`);
  });

  test('resolves without value', async () => {
    const result = await sleep(1);
    assert.strictEqual(result, undefined);
  });
});

describe('Error message handling', () => {
  // These tests verify that the client module is properly structured
  // Real HTTP tests would require mocking the https module

  test('createClient handles different config values', () => {
    // Test with minimal config
    const client1 = createClient({ apiKey: 'key1' });
    assert.ok(client1);

    // Test with full config
    const client2 = createClient({
      apiKey: 'key2',
      maxRetries: 5,
      retryBackoffBase: 3,
      retryBackoffMax: 60,
      rateLimitThreshold: 20
    });
    assert.ok(client2);
  });
});

describe('Client creation edge cases', () => {
  test('handles API key with special characters', () => {
    const client = createClient({ apiKey: 'test-key-with-special!@#$%' });
    assert.ok(client);
  });

  test('handles very long API key', () => {
    const longKey = 'a'.repeat(1000);
    const client = createClient({ apiKey: longKey });
    assert.ok(client);
  });

  test('handles whitespace-only API key', () => {
    assert.throws(
      () => createClient({ apiKey: '   \t\n  ' }),
      /API key must be a non-empty string/
    );
  });

  test('handles undefined maxRetries (uses default)', () => {
    const client = createClient({
      apiKey: 'test-key',
      maxRetries: undefined
    });
    assert.ok(client);
  });

  test('handles zero maxRetries', () => {
    const client = createClient({
      apiKey: 'test-key',
      maxRetries: 0
    });
    assert.ok(client);
  });
});

describe('Rate limit status', () => {
  test('returns object with expected properties', () => {
    const client = createClient({ apiKey: 'test-key' });
    const status = client.getRateLimitStatus();

    assert.ok('remaining' in status);
    assert.ok('reset' in status);
    assert.ok('resetDate' in status);
  });
});

describe('Project configuration (Story 2.2)', () => {
  test('accepts projectConfig with siteId', () => {
    const client = createClient({
      apiKey: 'test-key',
      projectConfig: {
        id: 'eur',
        siteId: 'eur-site-id'
      }
    });
    assert.ok(client);
    assert.strictEqual(client.getSiteId(), 'eur-site-id');
  });

  test('returns null siteId when no projectConfig provided', () => {
    const client = createClient({ apiKey: 'test-key' });
    assert.strictEqual(client.getSiteId(), null);
  });

  test('returns null siteId when projectConfig has no siteId', () => {
    const client = createClient({
      apiKey: 'test-key',
      projectConfig: { id: 'test' }
    });
    assert.strictEqual(client.getSiteId(), null);
  });

  test('getSiteId method exists on client', () => {
    const client = createClient({ apiKey: 'test-key' });
    assert.ok(typeof client.getSiteId === 'function');
  });
});
