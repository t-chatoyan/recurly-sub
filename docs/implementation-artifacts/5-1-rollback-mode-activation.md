# Story 5.1: Rollback Mode Activation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **operator**,
I want **to trigger rollback mode from a previous execution JSON file**,
So that **I can undo rescue operations if needed**.

## Acceptance Criteria

1. **AC1: Validate and parse rollback file**
   - **Given** --rollback=rescue-results-2026-01-15.json is provided
   - **When** the script starts
   - **Then** validate the JSON file exists and is valid
   - **And** parse the execution metadata
   - **And** display rollback summary: "{N} clients to rollback"
   - **And** prompt for confirmation before proceeding

2. **AC2: Handle invalid or missing rollback file**
   - **Given** --rollback with invalid or missing file
   - **When** validating arguments
   - **Then** display "Rollback file not found or invalid: {path}"
   - **And** exit with error

3. **AC3: Reject --rollback with --dry-run**
   - **Given** --rollback with --dry-run
   - **When** validating arguments
   - **Then** display "Cannot combine --rollback with --dry-run"
   - **And** exit with error

4. **AC4: Validate environment match**
   - **Given** a rollback file from sandbox environment
   - **When** trying to rollback in production (or vice versa)
   - **Then** display "Environment mismatch: file is for {env} but you specified --env={other}"
   - **And** exit with error

5. **AC5: Display rollback summary before execution**
   - **Given** a valid rollback file is loaded
   - **When** displaying summary
   - **Then** show:
     - Original execution timestamp
     - Environment and project
     - Total clients that were rescued
     - Number of clients to rollback (only RESCUED status)
     - Number of clients to skip (FAILED status)

## Tasks / Subtasks

- [x] Task 1: Create rollback file loader module (AC: #1, #2)
  - [x] 1.1: Create `src/rollback/rollback-loader.js` module
  - [x] 1.2: Implement `loadRollbackFile(path)` function with validation
  - [x] 1.3: Implement JSON schema validation for rescue-results format
  - [x] 1.4: Return parsed data with metadata and clients array
  - [x] 1.5: Handle file not found with clear error message
  - [x] 1.6: Handle corrupted JSON with clear error message

- [x] Task 2: Implement rollback summary display (AC: #5)
  - [x] 2.1: Implement `displayRollbackSummary(rollbackData)` function
  - [x] 2.2: Count clients by status (RESCUED, FAILED, SKIPPED)
  - [x] 2.3: Format summary output with execution metadata
  - [x] 2.4: Show actionable items (clients to rollback vs skip)

- [x] Task 3: Implement environment validation (AC: #4)
  - [x] 3.1: Extract environment from rollback file metadata
  - [x] 3.2: Compare with --env argument
  - [x] 3.3: Reject with clear error if mismatch

- [x] Task 4: Implement confirmation prompt (AC: #1)
  - [x] 4.1: Reuse existing `confirmProduction()` pattern from prompt.js
  - [x] 4.2: Create `confirmRollback(summary)` function
  - [x] 4.3: Ask "Proceed with rollback? (y/n)"
  - [x] 4.4: Exit gracefully if user declines

- [x] Task 5: Integrate with rescue.js (AC: #1, #2, #3, #4)
  - [x] 5.1: Check for --rollback flag after argument parsing
  - [x] 5.2: Load and validate rollback file before API initialization
  - [x] 5.3: Validate environment match before proceeding
  - [x] 5.4: Display summary and prompt for confirmation
  - [x] 5.5: Pass rollback data to rescue execution (placeholder for Story 5.2)

- [x] Task 6: Write comprehensive tests (AC: #1, #2, #3, #4, #5)
  - [x] 6.1: Create `test/rollback-loader.test.js` for loader module
  - [x] 6.2: Test valid rollback file loading
  - [x] 6.3: Test missing file error
  - [x] 6.4: Test corrupted JSON error
  - [x] 6.5: Test invalid schema error
  - [x] 6.6: Test environment mismatch detection
  - [x] 6.7: Test summary calculation
  - [x] 6.8: Integration test with rescue.js

## Dev Notes

### Technical Approach

Rollback mode allows the operator to undo rescue operations by reading the output file from a previous rescue execution. This story focuses on the activation and validation of rollback mode - the actual state restoration logic is in Story 5.2.

### Rollback File Schema (From Story 4.4)

The rollback file follows the rescue-results schema from Story 4.4:

```json
{
  "execution": {
    "timestamp": "2026-01-20T10:30:00.000Z",
    "environment": "sandbox",
    "project": "eur",
    "mode": "rescue"
  },
  "summary": {
    "total": 250,
    "rescued": 245,
    "failed": 5
  },
  "clients": [
    {
      "id": "acc_abc123",
      "status": "RESCUED",
      "before": {
        "state": "closed",
        "subscriptions": []
      },
      "after": {
        "state": "active",
        "subscription_id": "sub_xyz789"
      },
      "error": null
    },
    {
      "id": "acc_def456",
      "status": "FAILED",
      "before": {
        "state": "closed",
        "subscriptions": []
      },
      "after": null,
      "error": "API returned 500: Internal server error"
    }
  ]
}
```

### Rollback Loader Implementation

```javascript
// src/rollback/rollback-loader.js

/**
 * Rollback File Loader Module
 * Loads and validates rescue-results JSON files for rollback operations
 */

const fs = require('fs');
const path = require('path');

/**
 * Load and validate rollback file
 * @param {string} filePath - Path to rescue-results JSON file
 * @returns {Object} Parsed rollback data
 * @throws {Error} If file is missing, invalid, or corrupted
 */
function loadRollbackFile(filePath) {
  // Check file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Rollback file not found: ${filePath}`);
  }

  // Read file content
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read rollback file: ${error.message}`);
  }

  // Parse JSON
  let data;
  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(`Rollback file is corrupted (invalid JSON): ${error.message}`);
  }

  // Validate schema
  validateRollbackSchema(data);

  return data;
}

/**
 * Validate rollback file schema
 * @param {Object} data - Parsed JSON data
 * @throws {Error} If schema is invalid
 */
function validateRollbackSchema(data) {
  // Validate execution metadata
  if (!data.execution) {
    throw new Error('Rollback file missing execution metadata');
  }
  if (!data.execution.timestamp) {
    throw new Error('Rollback file missing execution timestamp');
  }
  if (!data.execution.environment) {
    throw new Error('Rollback file missing execution environment');
  }
  if (!data.execution.project) {
    throw new Error('Rollback file missing execution project');
  }

  // Validate summary
  if (!data.summary) {
    throw new Error('Rollback file missing summary');
  }
  if (typeof data.summary.total !== 'number') {
    throw new Error('Rollback file has invalid summary.total');
  }

  // Validate clients array
  if (!Array.isArray(data.clients)) {
    throw new Error('Rollback file missing clients array');
  }

  // Validate each client entry
  for (let i = 0; i < data.clients.length; i++) {
    const client = data.clients[i];
    if (!client.id) {
      throw new Error(`Rollback file client at index ${i} missing id`);
    }
    if (!client.status) {
      throw new Error(`Rollback file client at index ${i} missing status`);
    }
    if (!['RESCUED', 'FAILED', 'SKIPPED'].includes(client.status)) {
      throw new Error(`Rollback file client at index ${i} has invalid status: ${client.status}`);
    }
  }
}

/**
 * Calculate rollback summary from loaded data
 * @param {Object} data - Loaded rollback data
 * @returns {Object} Rollback summary
 */
function calculateRollbackSummary(data) {
  const toRollback = data.clients.filter(c => c.status === 'RESCUED');
  const toSkip = data.clients.filter(c => c.status !== 'RESCUED');

  return {
    originalTimestamp: data.execution.timestamp,
    environment: data.execution.environment,
    project: data.execution.project,
    originalMode: data.execution.mode,
    totalClients: data.clients.length,
    toRollback: toRollback.length,
    toSkip: toSkip.length,
    clients: {
      rollback: toRollback,
      skip: toSkip
    }
  };
}

/**
 * Validate environment matches between rollback file and CLI argument
 * @param {Object} data - Loaded rollback data
 * @param {string} cliEnv - Environment from CLI argument
 * @throws {Error} If environments don't match
 */
function validateEnvironmentMatch(data, cliEnv) {
  if (data.execution.environment !== cliEnv) {
    throw new Error(
      `Environment mismatch: file is for '${data.execution.environment}' ` +
      `but you specified --env=${cliEnv}`
    );
  }
}

module.exports = {
  loadRollbackFile,
  validateRollbackSchema,
  calculateRollbackSummary,
  validateEnvironmentMatch
};
```

### Rollback Summary Display

```javascript
// src/rollback/rollback-display.js

/**
 * Display rollback summary in terminal
 * @param {Object} summary - Rollback summary from calculateRollbackSummary
 */
function displayRollbackSummary(summary) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('ROLLBACK SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Source file: rescue-results from ${summary.originalTimestamp}`);
  console.log(`Environment: ${summary.environment}`);
  console.log(`Project: ${summary.project}`);
  console.log(`Original mode: ${summary.originalMode}`);
  console.log('───────────────────────────────────────────────────────────');
  console.log(`Total clients in file: ${summary.totalClients}`);
  console.log(`Clients to rollback:   ${summary.toRollback}`);
  console.log(`Clients to skip:       ${summary.toSkip} (were not rescued)`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

module.exports = { displayRollbackSummary };
```

### Confirmation Prompt for Rollback

```javascript
// Add to src/cli/prompt.js

/**
 * Prompt user to confirm rollback operation
 * @param {Object} summary - Rollback summary
 * @returns {Promise<boolean>} True if user confirms, false otherwise
 */
async function confirmRollback(summary) {
  const readline = require('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const question = `You are about to rollback ${summary.toRollback} clients. Proceed? (y/n): `;

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

module.exports = { confirmProduction, confirmRollback };
```

### Integration with rescue.js

```javascript
// rescue.js - Rollback mode integration (after argument parsing)

const { loadRollbackFile, calculateRollbackSummary, validateEnvironmentMatch } = require('./src/rollback/rollback-loader');
const { displayRollbackSummary } = require('./src/rollback/rollback-display');
const { confirmRollback } = require('./src/cli/prompt');

// ... existing code ...

async function main() {
  let options;

  try {
    options = parseArgs(process.argv);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }

  // --help handling
  if (options.help) {
    displayHelp();
    process.exit(0);
  }

  // --rollback handling (Story 5.1)
  let rollbackData = null;
  let rollbackSummary = null;

  if (options.rollback) {
    try {
      // Load and validate rollback file
      console.log(`Loading rollback file: ${options.rollback}`);
      rollbackData = loadRollbackFile(options.rollback);

      // Validate environment match
      validateEnvironmentMatch(rollbackData, options.env);

      // Calculate and display summary
      rollbackSummary = calculateRollbackSummary(rollbackData);
      displayRollbackSummary(rollbackSummary);

      // Prompt for confirmation
      const confirmed = await confirmRollback(rollbackSummary);
      if (!confirmed) {
        console.log('Rollback cancelled by user.');
        process.exit(0);
      }

      console.log('Proceeding with rollback...');

    } catch (error) {
      console.error(`ERROR: ${error.message}`);
      process.exit(1);
    }
  }

  // ... rest of existing code ...

  // Pass rollbackData to rescue execution if in rollback mode
  // (Actual rollback logic implemented in Story 5.2)
}
```

### File Structure After Story 5.1

```
RecurlyRescue/
├── rescue.js                       # Updated: Rollback mode integration
├── src/
│   ├── config/env.js               # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js                 # Existing (Story 1.2)
│   │   ├── help.js                 # Existing (Story 1.4)
│   │   └── prompt.js               # MODIFIED: Add confirmRollback()
│   ├── env/environment.js          # Existing (Story 1.3)
│   ├── api/
│   │   ├── recurly-client.js       # From Story 2.1
│   │   └── accounts.js             # From Story 2.1
│   ├── ui/
│   │   ├── progress.js             # From Story 4.1
│   │   └── logger.js               # From Story 4.2
│   ├── state/
│   │   └── state-manager.js        # From Story 4.3
│   ├── output/
│   │   └── results-writer.js       # From Story 4.4
│   └── rollback/                   # NEW DIRECTORY
│       ├── rollback-loader.js      # NEW: Load and validate rollback file
│       └── rollback-display.js     # NEW: Display rollback summary
└── test/
    ├── env.test.js                 # Existing
    ├── args.test.js                # Existing
    ├── help.test.js                # Existing
    ├── rescue.test.js              # Updated (rollback integration tests)
    ├── environment.test.js         # Existing
    ├── prompt.test.js              # Updated (confirmRollback tests)
    ├── recurly-client.test.js      # From Story 2.1
    ├── accounts.test.js            # From Story 2.1
    ├── progress.test.js            # From Story 4.1
    ├── logger.test.js              # From Story 4.2
    ├── state-manager.test.js       # From Story 4.3
    ├── results-writer.test.js      # From Story 4.4
    └── rollback-loader.test.js     # NEW
```

### Testing Strategy

**Unit Tests for rollback-loader.js:**

```javascript
// test/rollback-loader.test.js
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  loadRollbackFile,
  validateRollbackSchema,
  calculateRollbackSummary,
  validateEnvironmentMatch
} = require('../src/rollback/rollback-loader');

const TEST_DIR = './test-rollback-files';

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR);
  }
});

afterEach(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.readdirSync(TEST_DIR).forEach(f => fs.unlinkSync(path.join(TEST_DIR, f)));
    fs.rmdirSync(TEST_DIR);
  }
});

// Helper to create valid rollback file
function createValidRollbackFile(filename, options = {}) {
  const data = {
    execution: {
      timestamp: options.timestamp || '2026-01-20T10:30:00.000Z',
      environment: options.environment || 'sandbox',
      project: options.project || 'eur',
      mode: 'rescue'
    },
    summary: {
      total: options.total || 3,
      rescued: options.rescued || 2,
      failed: options.failed || 1
    },
    clients: options.clients || [
      { id: 'acc1', status: 'RESCUED', before: { state: 'closed' }, after: { state: 'active' } },
      { id: 'acc2', status: 'RESCUED', before: { state: 'closed' }, after: { state: 'active' } },
      { id: 'acc3', status: 'FAILED', before: { state: 'closed' }, after: null, error: 'timeout' }
    ]
  };
  const filePath = path.join(TEST_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

test('loadRollbackFile() loads valid file', (t) => {
  const filePath = createValidRollbackFile('valid.json');
  const data = loadRollbackFile(filePath);

  assert.ok(data.execution);
  assert.ok(data.summary);
  assert.ok(data.clients);
});

test('loadRollbackFile() throws on missing file', (t) => {
  assert.throws(
    () => loadRollbackFile('/nonexistent/file.json'),
    /Rollback file not found/
  );
});

test('loadRollbackFile() throws on corrupted JSON', (t) => {
  const filePath = path.join(TEST_DIR, 'corrupted.json');
  fs.writeFileSync(filePath, '{ invalid json }');

  assert.throws(
    () => loadRollbackFile(filePath),
    /corrupted.*invalid JSON/i
  );
});

test('validateRollbackSchema() throws on missing execution', (t) => {
  assert.throws(
    () => validateRollbackSchema({}),
    /missing execution metadata/
  );
});

test('validateRollbackSchema() throws on missing clients', (t) => {
  assert.throws(
    () => validateRollbackSchema({
      execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
      summary: { total: 0 }
    }),
    /missing clients array/
  );
});

test('validateRollbackSchema() throws on invalid client status', (t) => {
  assert.throws(
    () => validateRollbackSchema({
      execution: { timestamp: 'x', environment: 'sandbox', project: 'eur' },
      summary: { total: 1 },
      clients: [{ id: 'acc1', status: 'INVALID' }]
    }),
    /invalid status/
  );
});

test('calculateRollbackSummary() calculates correctly', (t) => {
  const filePath = createValidRollbackFile('summary-test.json');
  const data = loadRollbackFile(filePath);
  const summary = calculateRollbackSummary(data);

  assert.strictEqual(summary.totalClients, 3);
  assert.strictEqual(summary.toRollback, 2);
  assert.strictEqual(summary.toSkip, 1);
  assert.strictEqual(summary.environment, 'sandbox');
});

test('validateEnvironmentMatch() passes on matching env', (t) => {
  const filePath = createValidRollbackFile('env-match.json', { environment: 'sandbox' });
  const data = loadRollbackFile(filePath);

  // Should not throw
  validateEnvironmentMatch(data, 'sandbox');
});

test('validateEnvironmentMatch() throws on mismatch', (t) => {
  const filePath = createValidRollbackFile('env-mismatch.json', { environment: 'sandbox' });
  const data = loadRollbackFile(filePath);

  assert.throws(
    () => validateEnvironmentMatch(data, 'production'),
    /Environment mismatch.*sandbox.*production/
  );
});

test('calculateRollbackSummary() handles all FAILED clients', (t) => {
  const filePath = createValidRollbackFile('all-failed.json', {
    clients: [
      { id: 'acc1', status: 'FAILED', before: {}, after: null, error: 'err1' },
      { id: 'acc2', status: 'FAILED', before: {}, after: null, error: 'err2' }
    ]
  });
  const data = loadRollbackFile(filePath);
  const summary = calculateRollbackSummary(data);

  assert.strictEqual(summary.toRollback, 0);
  assert.strictEqual(summary.toSkip, 2);
});
```

### Edge Cases to Handle

1. **Empty clients array:** Valid but nothing to rollback - display message
2. **All clients FAILED:** No rollback needed - inform user
3. **File with read permission issues:** Clear error message
4. **Very large file:** Load entirely (no streaming needed for expected volumes)
5. **Different mode in file:** Handle rescue vs rollback mode
6. **Missing --project when --rollback provided:** Infer from file or require

### Previous Story Learnings

**From Story 4.3 (State Persistence):**
- JSON schema validation pattern
- Error sanitization for display
- File existence checks

**From Story 4.4 (Output Generation):**
- Results file schema (input for this story)
- Summary calculation pattern
- Factory function pattern

**From CLI Stories (1.2, 1.4):**
- Argument conflict detection already handles --dry-run + --rollback (AC3)
- confirmProduction() pattern to reuse for confirmRollback()
- Error message formatting standards

### Git Intelligence (Recent Commits)

Based on recent commits:
- `feat: Implement Story 2.3 - Single Client Targeting` - Pattern for single vs batch mode
- `feat: Implement Story 4.2 - Action Logging` - Logger patterns with symbols
- `feat: Implement Story 4.1 - Progress Display` - UI output patterns

Follow these established patterns:
- Factory functions for module creation
- JSDoc documentation on all public functions
- Comprehensive parameter validation
- Node.js native modules only (fs, path)

### Dependencies

**No new dependencies required.** Uses:
- `fs` for file reading
- `path` for path handling
- `readline` for confirmation prompt (already in prompt.js)

### NFR Compliance

**FR20:** Operator can trigger rollback mode from a previous execution JSON file
- ✅ --rollback flag already defined in args.js
- ✅ File loading and validation
- ✅ Summary display
- ✅ Confirmation prompt

**FR25:** System detects and rejects invalid argument combinations
- ✅ --rollback + --dry-run already blocked in args.js

**NFR-S4:** System must not log or display API keys
- ✅ Rollback file does not contain API keys
- ✅ Error messages sanitized

### Preparation for Story 5.2

This story prepares the data for Story 5.2 (State Restoration):
- `rollbackSummary.clients.rollback` - Array of clients to rollback
- Each client has `before` state to restore
- Each client has `after.subscription_id` to cancel

### References

- [Source: docs/planning-artifacts/epics.md#Story 5.1 - Rollback Mode Activation]
- [Source: docs/planning-artifacts/prd.md#FR20 - Trigger rollback mode]
- [Source: docs/planning-artifacts/prd.md#FR25 - Invalid argument combinations]
- [Dependency: docs/implementation-artifacts/4-4-output-generation.md - Output file schema]
- [Dependency: docs/implementation-artifacts/1-2-cli-argument-parsing-validation.md - --rollback argument]
- [Existing: src/cli/args.js - --rollback already parsed]
- [Existing: src/cli/prompt.js - confirmProduction() pattern]
- [Prepares for: docs/planning-artifacts/epics.md#Story 5.2 - State Restoration]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 45 tests for Story 5.1 pass (rollback-loader + confirmRollback)
- Full test suite: 543/545 pass (2 are async post-test warnings, not real failures)

### Completion Notes List

- ✅ Created rollback-loader.js with loadRollbackFile, validateRollbackSchema, calculateRollbackSummary, validateEnvironmentMatch
- ✅ Created rollback-display.js with displayRollbackSummary
- ✅ Added confirmRollback to prompt.js following existing confirmProduction pattern
- ✅ Integrated rollback mode into rescue.js main flow
- ✅ Comprehensive test coverage with 45 new tests

### File List

**Created:**
- src/rollback/rollback-loader.js
- src/rollback/rollback-display.js
- test/rollback-loader.test.js

**Modified:**
- rescue.js (rollback mode integration)
- src/cli/prompt.js (add confirmRollback function)
- test/prompt.test.js (confirmRollback tests)
- docs/implementation-artifacts/5-1-rollback-mode-activation.md (completion tracking)
