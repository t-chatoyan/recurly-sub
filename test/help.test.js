/**
 * Tests for help module
 * Validates help text content and structure
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { displayHelp } = require('../src/cli/help');

/**
 * Helper function to capture console.log output
 */
function captureConsoleOutput(fn) {
  const originalLog = console.log;
  let output = '';

  console.log = (msg) => {
    output += msg + '\n';
  };

  try {
    fn();
    return output;
  } finally {
    console.log = originalLog;
  }
}

test('displayHelp() includes script description', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  assert.ok(output.includes('Recurly Rescue Script'), 'Should include script title');
  assert.ok(output.includes('CLI tool to recover subscriptions'), 'Should include description');
});

test('displayHelp() includes usage section', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  assert.ok(output.includes('USAGE:'), 'Should include USAGE header');
  assert.ok(output.includes('node rescue.js'), 'Should include command syntax');
});

test('displayHelp() includes all required arguments', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  assert.ok(output.includes('REQUIRED ARGUMENTS:'), 'Should include required args header');
  assert.ok(output.includes('--env=<sandbox|production>'), 'Should document --env argument');
  assert.ok(output.includes('--project=<id>'), 'Should document --project argument');
  assert.ok(output.includes('Target environment'), 'Should include --env description');
  assert.ok(output.includes('Recurly project identifier'), 'Should include --project description');
});

test('displayHelp() includes all optional arguments', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  assert.ok(output.includes('OPTIONAL ARGUMENTS:'), 'Should include optional args header');
  assert.ok(output.includes('--help'), 'Should document --help');
  assert.ok(output.includes('--dry-run'), 'Should document --dry-run');
  assert.ok(output.includes('--client-id=<id>'), 'Should document --client-id');
  assert.ok(output.includes('--confirm-every=<n>'), 'Should document --confirm-every');
  assert.ok(output.includes('--no-confirm'), 'Should document --no-confirm');
  assert.ok(output.includes('--rollback=<file>'), 'Should document --rollback');
  assert.ok(output.includes('--resume'), 'Should document --resume');
});

test('displayHelp() includes default values for optional arguments', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  assert.ok(output.includes('default: 100'), 'Should show default for --confirm-every');
});

test('displayHelp() includes usage examples section', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  assert.ok(output.includes('EXAMPLES:'), 'Should include EXAMPLES header');
  assert.ok(output.includes('--dry-run'), 'Should include dry-run example');
  assert.ok(output.includes('--client-id=abc123'), 'Should include single client example');
  assert.ok(output.includes('--confirm-every=50'), 'Should include confirmation example');
  assert.ok(output.includes('--no-confirm'), 'Should include no-confirm example');
  assert.ok(output.includes('--rollback='), 'Should include rollback example');
});

test('displayHelp() includes real-world example commands', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  // Verify examples show both sandbox and production usage
  assert.ok(output.includes('--env=sandbox'), 'Should include sandbox examples');
  assert.ok(output.includes('--env=production'), 'Should include production examples');
  assert.ok(output.includes('--project=eur'), 'Should include project examples');
});

test('displayHelp() includes notes section', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  assert.ok(output.includes('NOTES:'), 'Should include NOTES header');
  assert.ok(output.includes('Production mode requires explicit confirmation'), 'Should mention production confirmation');
  assert.ok(output.includes('logged with timestamps'), 'Should mention logging');
  assert.ok(output.includes('State is persisted'), 'Should mention state persistence');
});

test('displayHelp() uses consistent formatting', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  // Verify sections are clearly separated
  assert.ok(output.includes('REQUIRED ARGUMENTS:'), 'Should have section headers');
  assert.ok(output.includes('OPTIONAL ARGUMENTS:'), 'Should have section headers');
  assert.ok(output.includes('EXAMPLES:'), 'Should have section headers');
  assert.ok(output.includes('NOTES:'), 'Should have section headers');

  // Verify examples use comment syntax
  assert.ok(output.includes('# Test in sandbox'), 'Should use # for comments in examples');
});

test('displayHelp() sections are in correct order', (t) => {
  const output = captureConsoleOutput(() => displayHelp());

  const usageIndex = output.indexOf('USAGE:');
  const requiredIndex = output.indexOf('REQUIRED ARGUMENTS:');
  const optionalIndex = output.indexOf('OPTIONAL ARGUMENTS:');
  const examplesIndex = output.indexOf('EXAMPLES:');
  const notesIndex = output.indexOf('NOTES:');

  assert.ok(usageIndex !== -1, 'USAGE section should exist');
  assert.ok(requiredIndex !== -1, 'REQUIRED ARGUMENTS section should exist');
  assert.ok(optionalIndex !== -1, 'OPTIONAL ARGUMENTS section should exist');
  assert.ok(examplesIndex !== -1, 'EXAMPLES section should exist');
  assert.ok(notesIndex !== -1, 'NOTES section should exist');

  assert.ok(usageIndex < requiredIndex, 'USAGE should come before REQUIRED ARGUMENTS');
  assert.ok(requiredIndex < optionalIndex, 'REQUIRED ARGUMENTS should come before OPTIONAL ARGUMENTS');
  assert.ok(optionalIndex < examplesIndex, 'OPTIONAL ARGUMENTS should come before EXAMPLES');
  assert.ok(examplesIndex < notesIndex, 'EXAMPLES should come before NOTES');
});

test('captureConsoleOutput restores console.log even if function throws', (t) => {
  const originalLog = console.log;

  try {
    captureConsoleOutput(() => {
      throw new Error('Test error');
    });
    assert.fail('Should have thrown an error');
  } catch (e) {
    // Expected error
    assert.ok(e.message === 'Test error', 'Should throw the expected error');
  }

  assert.strictEqual(console.log, originalLog, 'console.log should be restored after error');
});
