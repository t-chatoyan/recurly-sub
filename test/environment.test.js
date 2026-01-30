/**
 * Tests for src/env/environment.js
 * Using Node.js built-in test runner (node --test)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('initEnvironment', () => {
  // Clear require cache before each test module load
  function getInitEnvironment() {
    delete require.cache[require.resolve('../src/env/environment')];
    return require('../src/env/environment').initEnvironment;
  }

  describe('AC1: Sandbox environment configuration', () => {
    it('should return environment config for sandbox', () => {
      const initEnvironment = getInitEnvironment();
      const env = initEnvironment('sandbox');

      assert.strictEqual(env.name, 'sandbox');
      assert.strictEqual(env.isProduction, false);
      assert.strictEqual(env.apiBaseUrl, 'https://v3.recurly.com');
    });

    it('should set isProduction to false for sandbox', () => {
      const initEnvironment = getInitEnvironment();
      const env = initEnvironment('sandbox');

      assert.strictEqual(env.isProduction, false);
    });
  });

  describe('AC2: Production environment configuration', () => {
    it('should return environment config for production', () => {
      const initEnvironment = getInitEnvironment();
      const env = initEnvironment('production');

      assert.strictEqual(env.name, 'production');
      assert.strictEqual(env.isProduction, true);
      assert.strictEqual(env.apiBaseUrl, 'https://v3.recurly.com');
    });

    it('should set isProduction to true for production', () => {
      const initEnvironment = getInitEnvironment();
      const env = initEnvironment('production');

      assert.strictEqual(env.isProduction, true);
    });
  });

  describe('Environment constants', () => {
    it('should use same API URL for both environments (Recurly API design)', () => {
      const initEnvironment = getInitEnvironment();
      const sandbox = initEnvironment('sandbox');
      const production = initEnvironment('production');

      assert.strictEqual(sandbox.apiBaseUrl, production.apiBaseUrl);
      assert.strictEqual(sandbox.apiBaseUrl, 'https://v3.recurly.com');
    });
  });

  describe('API base URL override', () => {
    it('should accept custom API base URL', () => {
      const initEnvironment = getInitEnvironment();
      const env = initEnvironment('sandbox', 'https://v3.eu.recurly.com');

      assert.strictEqual(env.apiBaseUrl, 'https://v3.eu.recurly.com');
    });
  });

  describe('Edge cases', () => {
    it('should handle environment type case as provided', () => {
      const initEnvironment = getInitEnvironment();
      const env = initEnvironment('sandbox');

      assert.strictEqual(env.name, 'sandbox');
    });

    // [H1 FIX] Added validation tests
    it('should throw error for invalid environment type', () => {
      const initEnvironment = getInitEnvironment();

      assert.throws(
        () => initEnvironment('staging'),
        /Invalid environment type: 'staging'/
      );
    });

    it('should throw error for undefined environment type', () => {
      const initEnvironment = getInitEnvironment();

      assert.throws(
        () => initEnvironment(undefined),
        /Invalid environment type/
      );
    });

    it('should throw error for null environment type', () => {
      const initEnvironment = getInitEnvironment();

      assert.throws(
        () => initEnvironment(null),
        /Invalid environment type/
      );
    });
  });
});

describe('ENVIRONMENT_NAMES constant', () => {
  function getConstants() {
    delete require.cache[require.resolve('../src/env/environment')];
    return require('../src/env/environment');
  }

  it('should export ENVIRONMENT_NAMES with sandbox and production', () => {
    const { ENVIRONMENT_NAMES } = getConstants();

    assert.ok(ENVIRONMENT_NAMES);
    assert.strictEqual(ENVIRONMENT_NAMES.SANDBOX, 'sandbox');
    assert.strictEqual(ENVIRONMENT_NAMES.PRODUCTION, 'production');
  });
});

describe('API_BASE_URL constant', () => {
  function getConstants() {
    delete require.cache[require.resolve('../src/env/environment')];
    return require('../src/env/environment');
  }

  it('should export API_BASE_URL', () => {
    const { API_BASE_URL } = getConstants();

    assert.ok(API_BASE_URL);
    assert.strictEqual(API_BASE_URL, 'https://v3.recurly.com');
  });
});
