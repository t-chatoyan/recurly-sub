/**
 * Tests for src/config/env.js
 * Using Node.js built-in test runner (node --test)
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// We need to test loadConfig with different .env scenarios
// Since dotenv reads from cwd, we'll manipulate process.env directly for most tests

describe('loadConfig', () => {
  const originalEnv = { ...process.env };
  const envPath = path.join(process.cwd(), '.env');
  let envExisted = false;
  let originalEnvContent = null;

  beforeEach(() => {
    // Check if .env exists and backup
    envExisted = fs.existsSync(envPath);
    if (envExisted) {
      originalEnvContent = fs.readFileSync(envPath, 'utf8');
    }
    // Reset process.env
    process.env = { ...originalEnv };
    // Clear require cache to reload dotenv state
    delete require.cache[require.resolve('../src/config/env')];
    delete require.cache[require.resolve('dotenv')];
  });

  afterEach(() => {
    // Restore original .env
    if (envExisted && originalEnvContent !== null) {
      fs.writeFileSync(envPath, originalEnvContent);
    } else if (!envExisted && fs.existsSync(envPath)) {
      fs.unlinkSync(envPath);
    }
    // Restore process.env
    process.env = originalEnv;
  });

  describe('AC1: Successful .env loading', () => {
    it('should load sandbox API key when envType is sandbox', () => {
      // Create test .env file
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-sandbox-key-123\nRECURLY_PRODUCTION_API_KEY=test-prod-key-456');

      const { loadConfig } = require('../src/config/env');
      const config = loadConfig('sandbox');

      assert.strictEqual(config.apiKey, 'test-sandbox-key-123');
      assert.strictEqual(config.envType, 'sandbox');
    });

    it('should load production API key when envType is production', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-sandbox-key-123\nRECURLY_PRODUCTION_API_KEY=test-prod-key-456');

      const { loadConfig } = require('../src/config/env');
      const config = loadConfig('production');

      assert.strictEqual(config.apiKey, 'test-prod-key-456');
      assert.strictEqual(config.envType, 'production');
    });

    it('should load default retry settings when not specified', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key');

      const { loadConfig } = require('../src/config/env');
      const config = loadConfig('sandbox');

      assert.strictEqual(config.retryCount, 3);
      assert.strictEqual(config.retryBackoffBase, 2);
      assert.strictEqual(config.retryBackoffMax, 30);
    });

    it('should load default API base URL when not specified', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key');

      const { loadConfig } = require('../src/config/env');
      const config = loadConfig('sandbox');

      assert.strictEqual(config.apiBaseUrl, 'https://v3.recurly.com');
    });

    it('should load custom API base URL when specified', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nRECURLY_API_BASE_URL=https://v3.eu.recurly.com');

      const { loadConfig } = require('../src/config/env');
      const config = loadConfig('sandbox');

      assert.strictEqual(config.apiBaseUrl, 'https://v3.eu.recurly.com');
    });

    it('should load custom retry settings when specified', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nRETRY_COUNT=5\nRETRY_BACKOFF_BASE=3\nRETRY_BACKOFF_MAX=60');

      const { loadConfig } = require('../src/config/env');
      const config = loadConfig('sandbox');

      assert.strictEqual(config.retryCount, 5);
      assert.strictEqual(config.retryBackoffBase, 3);
      assert.strictEqual(config.retryBackoffMax, 60);
    });

    it('should not log API key value to console', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=secret-api-key-12345');

      // Capture all console.log calls
      const loggedMessages = [];
      const originalLog = console.log;
      console.log = (...args) => {
        loggedMessages.push(args.join(' '));
      };

      try {
        const { loadConfig } = require('../src/config/env');
        const config = loadConfig('sandbox');

        // Verify config was loaded
        assert.ok(config.apiKey);

        // Verify API key was never logged
        const allLogs = loggedMessages.join('\n');
        assert.ok(!allLogs.includes('secret-api-key-12345'), 'API key should not appear in console output');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('AC2: Missing .env handling', () => {
    it('should throw error when .env file does not exist', () => {
      // Ensure no .env file exists
      if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('sandbox'),
        /\.env file not found/
      );
    });

    it('should throw error when sandbox key is missing', () => {
      fs.writeFileSync(envPath, 'RECURLY_PRODUCTION_API_KEY=prod-key-only');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('sandbox'),
        /Missing required environment variable: RECURLY_SANDBOX_API_KEY/
      );
    });

    it('should throw error when production key is missing', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=sandbox-key-only');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('production'),
        /Missing required environment variable: RECURLY_PRODUCTION_API_KEY/
      );
    });

    it('should throw error when API key is empty string', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('sandbox'),
        /Missing required environment variable: RECURLY_SANDBOX_API_KEY/
      );
    });

    it('should throw error when API key is only whitespace', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=   ');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('sandbox'),
        /Missing required environment variable: RECURLY_SANDBOX_API_KEY/
      );
    });
  });

  describe('envType validation', () => {
    it('should throw error for invalid envType', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('invalid'),
        /Invalid envType: 'invalid'/
      );
    });

    it('should throw error for undefined envType', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig(undefined),
        /Invalid envType/
      );
    });
  });

  describe('retry config validation', () => {
    it('should throw error when RETRY_COUNT is not a number', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nRETRY_COUNT=abc');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('sandbox'),
        /Invalid RETRY_COUNT: 'abc' is not a valid integer/
      );
    });

    it('should throw error when RETRY_BACKOFF_BASE is not a number', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nRETRY_BACKOFF_BASE=xyz');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('sandbox'),
        /Invalid RETRY_BACKOFF_BASE: 'xyz' is not a valid integer/
      );
    });

    it('should throw error when RETRY_BACKOFF_MAX is not a number', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nRETRY_BACKOFF_MAX=!@#');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('sandbox'),
        /Invalid RETRY_BACKOFF_MAX/
      );
    });
  });

  describe('API base URL validation', () => {
    it('should throw error when RECURLY_API_BASE_URL is empty', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nRECURLY_API_BASE_URL=   ');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('sandbox'),
        /Invalid RECURLY_API_BASE_URL: value is empty/
      );
    });

    it('should throw error when RECURLY_API_BASE_URL is not a URL', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nRECURLY_API_BASE_URL=not-a-url');

      const { loadConfig } = require('../src/config/env');

      assert.throws(
        () => loadConfig('sandbox'),
        /Invalid RECURLY_API_BASE_URL: 'not-a-url' is not a valid URL/
      );
    });
  });
});

describe('AC3: .gitignore validation', () => {
  it('should have .env in .gitignore', () => {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore file should exist');

    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(gitignoreContent.includes('.env'), '.env should be listed in .gitignore');
  });
});
