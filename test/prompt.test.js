/**
 * Tests for src/cli/prompt.js
 * Using Node.js built-in test runner (node --test)
 *
 * Testing stdin interaction requires mocking readline
 */

// [M1 FIX] Removed unused 'mock' import - mocking done manually via readline module
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

describe('confirmProduction', () => {
  let originalCreateInterface;
  let mockRl;
  let readlineModule;

  beforeEach(() => {
    // Get readline module
    readlineModule = require('readline');
    originalCreateInterface = readlineModule.createInterface;
  });

  afterEach(() => {
    // Restore original
    readlineModule.createInterface = originalCreateInterface;
    delete require.cache[require.resolve('../src/cli/prompt')];
  });

  function getConfirmProduction() {
    delete require.cache[require.resolve('../src/cli/prompt')];
    return require('../src/cli/prompt').confirmProduction;
  }

  function mockReadline(userAnswer) {
    mockRl = {
      question: (prompt, callback) => {
        // Simulate user input
        setImmediate(() => callback(userAnswer));
      },
      close: () => {}
    };

    readlineModule.createInterface = () => mockRl;
  }

  describe('AC2: Production confirmation prompt', () => {
    it('should return true when user enters "y"', async () => {
      mockReadline('y');
      const confirmProduction = getConfirmProduction();

      const result = await confirmProduction();

      assert.strictEqual(result, true);
    });

    it('should return true when user enters "Y" (case insensitive)', async () => {
      mockReadline('Y');
      const confirmProduction = getConfirmProduction();

      const result = await confirmProduction();

      assert.strictEqual(result, true);
    });

    it('should return false when user enters "n"', async () => {
      mockReadline('n');
      const confirmProduction = getConfirmProduction();

      const result = await confirmProduction();

      assert.strictEqual(result, false);
    });

    it('should return false when user enters "N" (case insensitive)', async () => {
      mockReadline('N');
      const confirmProduction = getConfirmProduction();

      const result = await confirmProduction();

      assert.strictEqual(result, false);
    });

    it('should return false when user enters anything other than y', async () => {
      mockReadline('yes');
      const confirmProduction = getConfirmProduction();

      const result = await confirmProduction();

      assert.strictEqual(result, false);
    });

    it('should return false when user enters empty string', async () => {
      mockReadline('');
      const confirmProduction = getConfirmProduction();

      const result = await confirmProduction();

      assert.strictEqual(result, false);
    });

    it('should return false when user enters just whitespace', async () => {
      mockReadline('   ');
      const confirmProduction = getConfirmProduction();

      const result = await confirmProduction();

      assert.strictEqual(result, false);
    });

    // [L2 FIX] Refactored to track close() call via mockReadline pattern
    it('should close readline interface after prompt', async () => {
      let closeCalled = false;
      mockReadline('y');
      // Override close to track if it was called
      mockRl.close = () => { closeCalled = true; };

      const confirmProduction = getConfirmProduction();
      await confirmProduction();

      assert.strictEqual(closeCalled, true);
    });
  });

  describe('Edge cases', () => {
    it('should handle "y" with leading/trailing whitespace', async () => {
      mockReadline('  y  ');
      const confirmProduction = getConfirmProduction();

      const result = await confirmProduction();

      // Trimmed comparison, should return true
      assert.strictEqual(result, true);
    });
  });
});

describe('confirmRollback', () => {
  let originalCreateInterface;
  let mockRl;
  let readlineModule;

  beforeEach(() => {
    readlineModule = require('readline');
    originalCreateInterface = readlineModule.createInterface;
  });

  afterEach(() => {
    readlineModule.createInterface = originalCreateInterface;
    delete require.cache[require.resolve('../src/cli/prompt')];
  });

  function getConfirmRollback() {
    delete require.cache[require.resolve('../src/cli/prompt')];
    return require('../src/cli/prompt').confirmRollback;
  }

  function mockReadline(userAnswer) {
    mockRl = {
      question: (prompt, callback) => {
        setImmediate(() => callback(userAnswer));
      },
      close: () => {}
    };

    readlineModule.createInterface = () => mockRl;
  }

  describe('AC1: Rollback confirmation prompt', () => {
    it('should return true when user enters "y"', async () => {
      mockReadline('y');
      const confirmRollback = getConfirmRollback();
      const summary = { toRollback: 10 };

      const result = await confirmRollback(summary);

      assert.strictEqual(result, true);
    });

    it('should return true when user enters "Y" (case insensitive)', async () => {
      mockReadline('Y');
      const confirmRollback = getConfirmRollback();
      const summary = { toRollback: 10 };

      const result = await confirmRollback(summary);

      assert.strictEqual(result, true);
    });

    it('should return false when user enters "n"', async () => {
      mockReadline('n');
      const confirmRollback = getConfirmRollback();
      const summary = { toRollback: 10 };

      const result = await confirmRollback(summary);

      assert.strictEqual(result, false);
    });

    it('should return false when user enters anything other than y', async () => {
      mockReadline('no');
      const confirmRollback = getConfirmRollback();
      const summary = { toRollback: 10 };

      const result = await confirmRollback(summary);

      assert.strictEqual(result, false);
    });

    it('should return false when user enters empty string', async () => {
      mockReadline('');
      const confirmRollback = getConfirmRollback();
      const summary = { toRollback: 10 };

      const result = await confirmRollback(summary);

      assert.strictEqual(result, false);
    });

    it('should close readline interface after prompt', async () => {
      let closeCalled = false;
      mockReadline('y');
      mockRl.close = () => { closeCalled = true; };

      const confirmRollback = getConfirmRollback();
      await confirmRollback({ toRollback: 10 });

      assert.strictEqual(closeCalled, true);
    });
  });

  describe('Edge cases', () => {
    it('should handle "y" with leading/trailing whitespace', async () => {
      mockReadline('  y  ');
      const confirmRollback = getConfirmRollback();
      const summary = { toRollback: 10 };

      const result = await confirmRollback(summary);

      assert.strictEqual(result, true);
    });

    it('should work with zero clients to rollback', async () => {
      mockReadline('y');
      const confirmRollback = getConfirmRollback();
      const summary = { toRollback: 0 };

      const result = await confirmRollback(summary);

      assert.strictEqual(result, true);
    });
  });
});
