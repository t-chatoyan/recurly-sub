/**
 * Tests for Project Configuration Module
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  PROJECT_IDENTIFIERS,
  getProjectConfig,
  getValidProjectIds,
  isValidProjectId
} = require('../src/config/projects');

describe('PROJECT_IDENTIFIERS', () => {
  test('contains eur project', () => {
    assert.ok('eur' in PROJECT_IDENTIFIERS);
    assert.strictEqual(PROJECT_IDENTIFIERS.eur.id, 'eur');
    assert.strictEqual(PROJECT_IDENTIFIERS.eur.currency, 'EUR');
  });

  test('contains multi project', () => {
    assert.ok('multi' in PROJECT_IDENTIFIERS);
    assert.strictEqual(PROJECT_IDENTIFIERS.multi.id, 'multi');
    assert.strictEqual(PROJECT_IDENTIFIERS.multi.currency, null);
  });

  test('all projects have required fields', () => {
    for (const [key, config] of Object.entries(PROJECT_IDENTIFIERS)) {
      assert.ok(config.id, `${key} should have id`);
      assert.ok(config.name, `${key} should have name`);
      assert.ok(config.siteId, `${key} should have siteId`);
      assert.ok(config.description, `${key} should have description`);
      assert.ok('currency' in config, `${key} should have currency (can be null)`);
    }
  });
});

describe('getProjectConfig', () => {
  describe('valid project IDs', () => {
    test('returns EUR project config', () => {
      const config = getProjectConfig('eur');
      assert.strictEqual(config.id, 'eur');
      assert.strictEqual(config.currency, 'EUR');
      assert.ok(config.name);
      assert.ok(config.siteId);
    });

    test('returns multi-currency project config', () => {
      const config = getProjectConfig('multi');
      assert.strictEqual(config.id, 'multi');
      assert.strictEqual(config.currency, null);
      assert.ok(config.name);
      assert.ok(config.siteId);
    });

    test('is case-insensitive', () => {
      const config1 = getProjectConfig('EUR');
      const config2 = getProjectConfig('eur');
      const config3 = getProjectConfig('EuR');

      assert.strictEqual(config1.id, config2.id);
      assert.strictEqual(config2.id, config3.id);
    });

    test('trims whitespace', () => {
      const config1 = getProjectConfig('  eur  ');
      const config2 = getProjectConfig('eur');

      assert.strictEqual(config1.id, config2.id);
    });

    test('returns a copy to prevent mutation', () => {
      const config1 = getProjectConfig('eur');
      const config2 = getProjectConfig('eur');

      config1.name = 'MODIFIED';

      assert.notStrictEqual(config2.name, 'MODIFIED');
    });
  });

  describe('invalid project IDs', () => {
    test('throws for invalid project ID', () => {
      assert.throws(
        () => getProjectConfig('invalid'),
        /Invalid project identifier: "invalid"/
      );
    });

    test('throws for empty string', () => {
      assert.throws(
        () => getProjectConfig(''),
        /Project ID is required/
      );
    });

    test('throws for whitespace-only string', () => {
      assert.throws(
        () => getProjectConfig('   '),
        /Project ID is required/
      );
    });

    test('throws for null', () => {
      assert.throws(
        () => getProjectConfig(null),
        /Project ID is required/
      );
    });

    test('throws for undefined', () => {
      assert.throws(
        () => getProjectConfig(undefined),
        /Project ID is required/
      );
    });

    test('throws for non-string types', () => {
      assert.throws(
        () => getProjectConfig(123),
        /Project ID is required/
      );

      assert.throws(
        () => getProjectConfig({}),
        /Project ID is required/
      );

      assert.throws(
        () => getProjectConfig([]),
        /Project ID is required/
      );
    });

    test('includes valid options in error message', () => {
      try {
        getProjectConfig('invalid');
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error.message.includes('eur'), 'Error should mention eur');
        assert.ok(error.message.includes('multi'), 'Error should mention multi');
      }
    });
  });
});

describe('getValidProjectIds', () => {
  test('returns array of project IDs', () => {
    const ids = getValidProjectIds();

    assert.ok(Array.isArray(ids));
    assert.ok(ids.length > 0);
  });

  test('includes eur and multi', () => {
    const ids = getValidProjectIds();

    assert.ok(ids.includes('eur'));
    assert.ok(ids.includes('multi'));
  });

  test('returns strings only', () => {
    const ids = getValidProjectIds();

    for (const id of ids) {
      assert.strictEqual(typeof id, 'string');
    }
  });

  test('returns a new array on each call to prevent mutation (Finding 4)', () => {
    const ids1 = getValidProjectIds();
    const ids2 = getValidProjectIds();

    ids1.push('malicious');

    // ids2 should not include 'malicious'
    assert.ok(!ids2.includes('malicious'));
    assert.strictEqual(ids2.length, 2);
  });
});

describe('isValidProjectId', () => {
  test('returns true for valid project IDs', () => {
    assert.strictEqual(isValidProjectId('eur'), true);
    assert.strictEqual(isValidProjectId('multi'), true);
  });

  test('is case-insensitive', () => {
    assert.strictEqual(isValidProjectId('EUR'), true);
    assert.strictEqual(isValidProjectId('MULTI'), true);
    assert.strictEqual(isValidProjectId('Eur'), true);
  });

  test('trims whitespace', () => {
    assert.strictEqual(isValidProjectId('  eur  '), true);
    assert.strictEqual(isValidProjectId('\tmulti\n'), true);
  });

  test('returns false for invalid project IDs', () => {
    assert.strictEqual(isValidProjectId('invalid'), false);
    assert.strictEqual(isValidProjectId('xyz'), false);
    assert.strictEqual(isValidProjectId(''), false);
  });

  test('returns false for non-string types', () => {
    assert.strictEqual(isValidProjectId(null), false);
    assert.strictEqual(isValidProjectId(undefined), false);
    assert.strictEqual(isValidProjectId(123), false);
    assert.strictEqual(isValidProjectId({}), false);
    assert.strictEqual(isValidProjectId([]), false);
  });
});
