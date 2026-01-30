/**
 * Unit tests for rollback-display.js module
 * Tests the rollback summary display functionality
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { displayRollbackSummary } = require('../src/rollback/rollback-display');

describe('displayRollbackSummary()', () => {
  test('displays correct summary content', () => {
    const logs = [];
    const mockLog = (msg) => logs.push(msg);

    const summary = {
      originalTimestamp: '2026-01-20T10:30:00.000Z',
      environment: 'sandbox',
      project: 'eur',
      originalMode: 'rescue',
      totalClients: 100,
      toRollback: 90,
      toSkip: 10
    };

    displayRollbackSummary(summary, { log: mockLog });

    const output = logs.join('\n');
    assert.ok(output.includes('ROLLBACK SUMMARY'));
    assert.ok(output.includes('2026-01-20T10:30:00.000Z'));
    assert.ok(output.includes('sandbox'));
    assert.ok(output.includes('eur'));
    assert.ok(output.includes('rescue'));
    assert.ok(output.includes('100'));
    assert.ok(output.includes('90'));
    assert.ok(output.includes('10'));
  });

  test('handles undefined values gracefully', () => {
    const logs = [];
    const mockLog = (msg) => logs.push(msg);

    const summary = {};

    // Should not throw
    displayRollbackSummary(summary, { log: mockLog });

    const output = logs.join('\n');
    assert.ok(output.includes('unknown'));
    assert.ok(output.includes('0'));
  });

  test('handles partial summary', () => {
    const logs = [];
    const mockLog = (msg) => logs.push(msg);

    const summary = {
      environment: 'production',
      toRollback: 50
    };

    displayRollbackSummary(summary, { log: mockLog });

    const output = logs.join('\n');
    assert.ok(output.includes('production'));
    assert.ok(output.includes('50'));
    assert.ok(output.includes('unknown')); // for missing fields
  });

  test('uses console.log by default', () => {
    // This test verifies the function runs without error when no options provided
    const summary = {
      originalTimestamp: '2026-01-20T10:30:00.000Z',
      environment: 'sandbox',
      project: 'eur',
      originalMode: 'rescue',
      totalClients: 10,
      toRollback: 8,
      toSkip: 2
    };

    // Should not throw
    displayRollbackSummary(summary);
  });

  test('displays formatted box characters', () => {
    const logs = [];
    const mockLog = (msg) => logs.push(msg);

    displayRollbackSummary({ totalClients: 1, toRollback: 1, toSkip: 0 }, { log: mockLog });

    const output = logs.join('\n');
    assert.ok(output.includes('═══'), 'Should contain box header');
    assert.ok(output.includes('───'), 'Should contain separator');
  });

  test('correctly labels skipped clients', () => {
    const logs = [];
    const mockLog = (msg) => logs.push(msg);

    displayRollbackSummary({ toSkip: 5 }, { log: mockLog });

    const output = logs.join('\n');
    assert.ok(output.includes('were not rescued'), 'Should explain why clients are skipped');
  });
});
