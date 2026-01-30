/**
 * Tests for src/cli/args.js
 * Using Node.js built-in test runner (node --test)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('parseArgs', () => {
  // Clear require cache before each test module load
  function getParseArgs() {
    delete require.cache[require.resolve('../src/cli/args')];
    return require('../src/cli/args').parseArgs;
  }

  describe('AC1: Required --env validation', () => {
    it('should throw error when --env is missing', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--project=eur']),
        /Missing required argument: --env/
      );
    });

    it('should throw error when --env has invalid value', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=invalid', '--project=eur']),
        /Invalid --env value/
      );
    });

    it('should accept --env=sandbox', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur']);

      assert.strictEqual(options.env, 'sandbox');
    });

    it('should accept --env=production', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=production', '--project=eur']);

      assert.strictEqual(options.env, 'production');
    });
  });

  describe('AC2: Required --project validation', () => {
    it('should throw error when --project is missing', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox']),
        /Missing required argument: --project/
      );
    });

    it('should accept --project with value', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur']);

      assert.strictEqual(options.project, 'eur');
    });
  });

  describe('AC3: --dry-run and --rollback conflict', () => {
    it('should throw error when --dry-run and --rollback are both provided', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--dry-run', '--rollback=file.json']),
        /Cannot combine --dry-run with --rollback/
      );
    });

    it('should accept --dry-run alone', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--dry-run']);

      assert.strictEqual(options.dryRun, true);
      assert.strictEqual(options.rollback, null);
    });

    it('should accept --rollback alone', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--rollback=results.json']);

      assert.strictEqual(options.rollback, 'results.json');
      assert.strictEqual(options.dryRun, false);
    });
  });

  describe('AC4: --confirm-every and --no-confirm conflict', () => {
    it('should throw error when --confirm-every and --no-confirm are both provided', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--confirm-every=50', '--no-confirm']),
        /Cannot use both --confirm-every and --no-confirm/
      );
    });

    it('should accept --confirm-every alone', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--confirm-every=50']);

      assert.strictEqual(options.confirmEvery, 50);
      assert.strictEqual(options.noConfirm, false);
    });

    it('should accept --no-confirm alone', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--no-confirm']);

      assert.strictEqual(options.noConfirm, true);
      assert.strictEqual(options.confirmEvery, null);
    });
  });

  describe('--resume argument conflicts (Story 4.3)', () => {
    it('should throw error when --resume and --client-id are both provided', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--resume', '--client-id=abc123']),
        /Cannot combine --resume with --client-id/
      );
    });

    it('should throw error when --resume and --rollback are both provided', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--resume', '--rollback=file.json']),
        /Cannot combine --resume with --rollback/
      );
    });

    it('should accept --resume alone', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--resume']);

      assert.strictEqual(options.resume, true);
      assert.strictEqual(options.clientId, null);
      assert.strictEqual(options.rollback, null);
    });
  });

  describe('AC5: Successful argument parsing with defaults', () => {
    it('should return structured options object with all fields', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur']);

      assert.ok('env' in options);
      assert.ok('project' in options);
      assert.ok('dryRun' in options);
      assert.ok('rollback' in options);
      assert.ok('confirmEvery' in options);
      assert.ok('noConfirm' in options);
      assert.ok('clientId' in options);
      assert.ok('help' in options);
      assert.ok('resume' in options);
    });

    it('should set default --dry-run to false', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur']);

      assert.strictEqual(options.dryRun, false);
    });

    it('should set default --confirm-every to 100 when neither --confirm-every nor --no-confirm provided', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur']);

      assert.strictEqual(options.confirmEvery, 100);
    });

    it('should not apply default --confirm-every when --no-confirm is provided', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--no-confirm']);

      assert.strictEqual(options.confirmEvery, null);
    });

    it('should parse optional arguments correctly (with --client-id)', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs([
        'node', 'rescue.js',
        '--env=production',
        '--project=multi',
        '--dry-run',
        '--client-id=abc123',
        '--confirm-every=25'
      ]);

      assert.strictEqual(options.env, 'production');
      assert.strictEqual(options.project, 'multi');
      assert.strictEqual(options.dryRun, true);
      assert.strictEqual(options.clientId, 'abc123');
      assert.strictEqual(options.confirmEvery, 25);
      assert.strictEqual(options.resume, false);
    });

    it('should parse optional arguments correctly (with --resume)', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs([
        'node', 'rescue.js',
        '--env=production',
        '--project=multi',
        '--confirm-every=25',
        '--resume'
      ]);

      assert.strictEqual(options.env, 'production');
      assert.strictEqual(options.project, 'multi');
      assert.strictEqual(options.confirmEvery, 25);
      assert.strictEqual(options.resume, true);
      assert.strictEqual(options.clientId, null);
    });

    it('should throw error for empty --client-id', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--client-id=']),
        /--client-id requires a non-empty value/
      );
    });

    it('should throw error for whitespace-only --client-id', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--client-id=   ']),
        /--client-id requires a non-empty value/
      );
    });

    it('should trim whitespace from --client-id value', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--client-id=  abc123  ']);

      assert.strictEqual(options.clientId, 'abc123');
    });

    it('should parse --help flag', () => {
      const parseArgs = getParseArgs();
      // --help should return early without validating other args
      const options = parseArgs(['node', 'rescue.js', '--help']);

      assert.strictEqual(options.help, true);
    });
  });

  describe('Edge cases', () => {
    it('should handle arguments in any order', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--project=eur', '--dry-run', '--env=sandbox']);

      assert.strictEqual(options.env, 'sandbox');
      assert.strictEqual(options.project, 'eur');
      assert.strictEqual(options.dryRun, true);
    });

    it('should throw error for invalid --confirm-every value (not a number)', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--confirm-every=abc']),
        /Invalid --confirm-every value/
      );
    });

    it('should handle --rollback with file path containing special characters', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--rollback=path/to/rescue-results-2026-01-20.json']);

      assert.strictEqual(options.rollback, 'path/to/rescue-results-2026-01-20.json');
    });

    // [MEDIUM-3 FIX] Added tests for edge cases
    it('should throw error for unknown arguments', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--unknown-arg']),
        /Unknown argument: --unknown-arg/
      );
    });

    it('should throw error for typos in argument names', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--envv=sandbox', '--project=eur']),
        /Unknown argument: --envv=sandbox/
      );
    });

    it('should throw error for --confirm-every=0', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--confirm-every=0']),
        /must be a positive number/
      );
    });

    it('should throw error for negative --confirm-every', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur', '--confirm-every=-5']),
        /must be a positive number/
      );
    });

    it('should throw error for --project with only whitespace', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=   ']),
        /Missing required argument: --project/
      );
    });

    it('should trim whitespace from --project value', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=  eur  ']);

      assert.strictEqual(options.project, 'eur');
    });
  });

  describe('Project identifier validation (Story 2.2)', () => {
    it('should accept valid project identifier: eur', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=eur']);

      assert.strictEqual(options.project, 'eur');
    });

    it('should accept valid project identifier: multi', () => {
      const parseArgs = getParseArgs();
      const options = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=multi']);

      assert.strictEqual(options.project, 'multi');
    });

    it('should accept project identifiers case-insensitively and normalize to lowercase', () => {
      const parseArgs = getParseArgs();
      const options1 = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=EUR']);
      const options2 = parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=Multi']);

      // Project IDs should be normalized to lowercase
      assert.strictEqual(options1.project, 'eur');
      assert.strictEqual(options2.project, 'multi');
    });

    it('should throw error for invalid project identifier', () => {
      const parseArgs = getParseArgs();

      assert.throws(
        () => parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=invalid']),
        /Invalid --project value: 'invalid'/
      );
    });

    it('should include valid options in project error message', () => {
      const parseArgs = getParseArgs();

      try {
        parseArgs(['node', 'rescue.js', '--env=sandbox', '--project=xyz']);
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error.message.includes('eur'), 'Error should mention eur');
        assert.ok(error.message.includes('multi'), 'Error should mention multi');
      }
    });
  });
});
