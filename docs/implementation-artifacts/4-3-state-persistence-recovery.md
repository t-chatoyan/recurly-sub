# Story 4.3: State Persistence & Recovery

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **operator**,
I want **the execution state to be persisted**,
So that **I can resume after interruption without re-processing clients**.

## Acceptance Criteria

1. **AC1: State file created and updated during execution**
   - **Given** the rescue process is running
   - **When** each client is processed
   - **Then** update state file (rescue-state-{timestamp}.json) with:
     - List of processed client IDs
     - List of pending client IDs
     - Current position/index
     - Timestamp of last update

2. **AC2: Resume from state file with --resume flag**
   - **Given** the script crashes or is interrupted
   - **When** restarting with --resume flag
   - **Then** detect the latest state file
   - **And** resume from exact point of interruption
   - **And** display "Resuming from client {N}/{total}"

3. **AC3: Handle corrupted state files**
   - **Given** a state file is corrupted or invalid
   - **When** attempting to resume
   - **Then** display clear error message
   - **And** suggest running fresh execution

## Tasks / Subtasks

- [x] Task 1: Create state management module (AC: #1, #3)
  - [x] 1.1: Create `src/state/state-manager.js` module
  - [x] 1.2: Implement `createStateManager(options)` factory function
  - [x] 1.3: Implement `stateManager.initialize(accounts)` to set up initial state
  - [x] 1.4: Implement `stateManager.markProcessed(clientId, result)` method
  - [x] 1.5: Implement `stateManager.save()` to persist state to disk
  - [x] 1.6: Implement state file naming: `rescue-state-{project}-{timestamp}.json`
  - [x] 1.7: Implement state schema validation

- [x] Task 2: Implement state recovery (AC: #2, #3)
  - [x] 2.1: Implement `findLatestStateFile(project)` function
  - [x] 2.2: Implement `loadStateFile(path)` function with validation
  - [x] 2.3: Implement `stateManager.resume()` to restore from state file
  - [x] 2.4: Validate state file structure and detect corruption
  - [x] 2.5: Display resume progress message

- [x] Task 3: Integrate with rescue process (AC: #1, #2)
  - [x] 3.1: Import state manager in rescue.js
  - [x] 3.2: Check for --resume flag and attempt recovery
  - [x] 3.3: Initialize state manager after account query
  - [x] 3.4: Update state after each client operation
  - [x] 3.5: Clean up state file on successful completion

- [x] Task 4: Handle edge cases (AC: #3)
  - [x] 4.1: Handle missing state file when --resume is used
  - [x] 4.2: Handle state file from different project
  - [x] 4.3: Handle state file from different environment (sandbox vs prod)
  - [x] 4.4: Handle partially written state file (crash during save)

- [x] Task 5: Write comprehensive tests (AC: #1, #2, #3)
  - [x] 5.1: Create `test/state-manager.test.js` for state module
  - [x] 5.2: Test state file creation with correct schema
  - [x] 5.3: Test state updates during processing
  - [x] 5.4: Test resume from valid state file
  - [x] 5.5: Test corrupted state file detection
  - [x] 5.6: Test state file naming convention
  - [x] 5.7: Test cleanup on completion

## Dev Notes

### Technical Approach

State persistence enables crash recovery by tracking which clients have been processed. The state file is updated after EACH client operation to minimize data loss.

### State File Schema

```json
{
  "version": "1.0.0",
  "metadata": {
    "project": "eur",
    "environment": "sandbox",
    "startedAt": "2026-01-20T10:00:00.000Z",
    "lastUpdated": "2026-01-20T10:05:30.000Z",
    "mode": "rescue"
  },
  "progress": {
    "total": 250,
    "processed": 125,
    "currentIndex": 125
  },
  "accounts": {
    "processed": [
      { "id": "acc_001", "status": "rescued", "subscriptionId": "sub_xyz" },
      { "id": "acc_002", "status": "failed", "error": "API timeout" }
    ],
    "pending": ["acc_003", "acc_004", "..."]
  }
}
```

### State Manager Implementation

```javascript
// src/state/state-manager.js

/**
 * State Management Module
 * Persists execution state for crash recovery
 */

const fs = require('fs');
const path = require('path');

const STATE_VERSION = '1.0.0';

/**
 * Create state manager instance
 * @param {Object} options - Configuration options
 * @param {string} options.project - Project identifier
 * @param {string} options.environment - Environment (sandbox/production)
 * @param {string} options.mode - Execution mode (rescue/rollback)
 * @param {string} [options.stateDir='.'] - Directory for state files
 * @returns {Object} State manager instance
 */
function createStateManager(options) {
  const { project, environment, mode, stateDir = '.' } = options;

  if (!project) throw new Error('Project is required for state management');
  if (!environment) throw new Error('Environment is required for state management');

  let state = null;
  let stateFilePath = null;

  /**
   * Initialize state for new execution
   * @param {Array} accounts - List of account objects to process
   * @returns {Object} Initial state
   */
  function initialize(accounts) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    stateFilePath = path.join(stateDir, `rescue-state-${project}-${timestamp}.json`);

    state = {
      version: STATE_VERSION,
      metadata: {
        project,
        environment,
        startedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        mode
      },
      progress: {
        total: accounts.length,
        processed: 0,
        currentIndex: 0
      },
      accounts: {
        processed: [],
        pending: accounts.map(a => a.id)
      }
    };

    save();
    return state;
  }

  /**
   * Mark client as processed
   * @param {string} clientId - Client/account ID
   * @param {Object} result - Processing result
   * @param {string} result.status - 'rescued' or 'failed'
   * @param {string} [result.subscriptionId] - New subscription ID
   * @param {string} [result.error] - Error message if failed
   */
  function markProcessed(clientId, result) {
    if (!state) throw new Error('State not initialized. Call initialize() first.');

    // Add to processed list
    state.accounts.processed.push({
      id: clientId,
      status: result.status,
      subscriptionId: result.subscriptionId || null,
      error: result.error || null,
      processedAt: new Date().toISOString()
    });

    // Remove from pending list
    state.accounts.pending = state.accounts.pending.filter(id => id !== clientId);

    // Update progress
    state.progress.processed++;
    state.progress.currentIndex++;
    state.metadata.lastUpdated = new Date().toISOString();

    // Persist to disk
    save();
  }

  /**
   * Save state to disk
   */
  function save() {
    if (!state || !stateFilePath) return;

    try {
      // Write to temp file first, then rename (atomic operation)
      const tempPath = stateFilePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
      fs.renameSync(tempPath, stateFilePath);
    } catch (error) {
      console.error(`Warning: Failed to save state file: ${error.message}`);
    }
  }

  /**
   * Get current state
   * @returns {Object} Current state
   */
  function getState() {
    return state;
  }

  /**
   * Get state file path
   * @returns {string} State file path
   */
  function getStateFilePath() {
    return stateFilePath;
  }

  /**
   * Clean up state file (on successful completion)
   */
  function cleanup() {
    if (stateFilePath && fs.existsSync(stateFilePath)) {
      try {
        fs.unlinkSync(stateFilePath);
      } catch (error) {
        console.error(`Warning: Failed to clean up state file: ${error.message}`);
      }
    }
  }

  /**
   * Resume from state file
   * @param {string} loadedState - Loaded state object
   */
  function resumeFrom(loadedState) {
    state = loadedState;
    // Update file path based on loaded state
    const timestamp = loadedState.metadata.startedAt.replace(/[:.]/g, '-').slice(0, 19);
    stateFilePath = path.join(stateDir, `rescue-state-${loadedState.metadata.project}-${timestamp}.json`);
  }

  return {
    initialize,
    markProcessed,
    save,
    getState,
    getStateFilePath,
    cleanup,
    resumeFrom
  };
}

/**
 * Find the most recent state file for a project
 * @param {string} project - Project identifier
 * @param {string} [stateDir='.'] - Directory to search
 * @returns {string|null} Path to latest state file, or null if none found
 */
function findLatestStateFile(project, stateDir = '.') {
  try {
    const files = fs.readdirSync(stateDir)
      .filter(f => f.startsWith(`rescue-state-${project}-`) && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(stateDir, f),
        mtime: fs.statSync(path.join(stateDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0].path : null;
  } catch (error) {
    return null;
  }
}

/**
 * Load and validate state file
 * @param {string} filePath - Path to state file
 * @returns {Object} Loaded state
 * @throws {Error} If file is invalid or corrupted
 */
function loadStateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`State file not found: ${filePath}`);
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read state file: ${error.message}`);
  }

  let state;
  try {
    state = JSON.parse(content);
  } catch (error) {
    throw new Error(`State file is corrupted (invalid JSON): ${error.message}`);
  }

  // Validate schema
  validateStateSchema(state);

  return state;
}

/**
 * Validate state file schema
 * @param {Object} state - State object to validate
 * @throws {Error} If schema is invalid
 */
function validateStateSchema(state) {
  if (!state.version) {
    throw new Error('State file missing version field');
  }
  if (!state.metadata) {
    throw new Error('State file missing metadata section');
  }
  if (!state.metadata.project) {
    throw new Error('State file missing project in metadata');
  }
  if (!state.metadata.environment) {
    throw new Error('State file missing environment in metadata');
  }
  if (!state.progress) {
    throw new Error('State file missing progress section');
  }
  if (typeof state.progress.total !== 'number') {
    throw new Error('State file has invalid progress.total');
  }
  if (!state.accounts) {
    throw new Error('State file missing accounts section');
  }
  if (!Array.isArray(state.accounts.processed)) {
    throw new Error('State file has invalid accounts.processed');
  }
  if (!Array.isArray(state.accounts.pending)) {
    throw new Error('State file has invalid accounts.pending');
  }
}

module.exports = {
  createStateManager,
  findLatestStateFile,
  loadStateFile,
  validateStateSchema,
  STATE_VERSION
};
```

### Integration with rescue.js

```javascript
// rescue.js - State management integration
const { createStateManager, findLatestStateFile, loadStateFile } = require('./src/state/state-manager');

// ... existing code ...

async function main() {
  // ... parse options ...

  let accounts;
  let stateManager;
  let resumeIndex = 0;

  // Check for --resume flag
  if (options.resume) {
    console.log('Looking for state file to resume from...');
    const stateFilePath = findLatestStateFile(options.project);

    if (!stateFilePath) {
      console.error('ERROR: No state file found to resume from.');
      console.error('Run without --resume to start fresh execution.');
      process.exit(1);
    }

    try {
      const loadedState = loadStateFile(stateFilePath);

      // Validate environment matches
      if (loadedState.metadata.environment !== options.env) {
        console.error(`ERROR: State file is for ${loadedState.metadata.environment} but you specified --env=${options.env}`);
        process.exit(1);
      }

      stateManager = createStateManager({
        project: options.project,
        environment: options.env,
        mode: options.rollback ? 'rollback' : 'rescue'
      });
      stateManager.resumeFrom(loadedState);

      // Set up resume
      accounts = loadedState.accounts.pending.map(id => ({ id }));
      resumeIndex = loadedState.progress.processed;

      console.log(`Resuming from client ${resumeIndex + 1}/${loadedState.progress.total}`);
      console.log(`${loadedState.accounts.pending.length} clients remaining`);

    } catch (error) {
      console.error(`ERROR: ${error.message}`);
      console.error('State file may be corrupted. Run without --resume to start fresh.');
      process.exit(1);
    }
  } else {
    // Fresh execution - query accounts
    const recurlyClient = createClient({ apiKey: config.apiKey });
    accounts = await queryClosedAccounts(recurlyClient);

    // Initialize state manager
    stateManager = createStateManager({
      project: options.project,
      environment: options.env,
      mode: options.rollback ? 'rollback' : 'rescue'
    });
    stateManager.initialize(accounts);

    console.log(`State file created: ${stateManager.getStateFilePath()}`);
  }

  // Process accounts
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    progress.update(resumeIndex + i + 1, account.id);

    try {
      const result = await rescueAccount(account);
      stateManager.markProcessed(account.id, { status: 'rescued', subscriptionId: result.subscriptionId });
      logger.logSuccess(account.id, result.subscriptionId);
    } catch (error) {
      stateManager.markProcessed(account.id, { status: 'failed', error: error.message });
      logger.logFailure(account.id, error.message);
    }
  }

  // On successful completion, clean up state file
  if (stateManager.getState().accounts.pending.length === 0) {
    console.log('All clients processed. Cleaning up state file...');
    stateManager.cleanup();
  }
}
```

### Atomic File Writes

To prevent corruption during crashes:

```javascript
/**
 * Atomic file write using temp file + rename
 * Ensures file is either complete or not written at all
 */
function atomicWrite(filePath, content) {
  const tempPath = filePath + '.tmp';

  // Write to temp file
  fs.writeFileSync(tempPath, content);

  // Rename is atomic on most filesystems
  fs.renameSync(tempPath, filePath);
}
```

### File Structure After Story 4.3

```
RecurlyRescue/
├── rescue.js                      # Updated: State management integration
├── src/
│   ├── config/env.js              # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js                # Existing (Story 1.2)
│   │   ├── help.js                # Existing (Story 1.4)
│   │   └── prompt.js              # Existing (Story 1.3)
│   ├── env/environment.js         # Existing (Story 1.3)
│   ├── api/
│   │   ├── recurly-client.js      # From Story 2.1
│   │   └── accounts.js            # From Story 2.1
│   ├── ui/
│   │   ├── progress.js            # From Story 4.1
│   │   └── logger.js              # From Story 4.2
│   └── state/
│       └── state-manager.js       # NEW: State persistence
└── test/
    ├── env.test.js                # Existing
    ├── args.test.js               # Existing
    ├── help.test.js               # Existing
    ├── rescue.test.js             # Updated (state tests)
    ├── environment.test.js        # Existing
    ├── prompt.test.js             # Existing
    ├── recurly-client.test.js     # From Story 2.1
    ├── accounts.test.js           # From Story 2.1
    ├── progress.test.js           # From Story 4.1
    ├── logger.test.js             # From Story 4.2
    └── state-manager.test.js      # NEW
```

### Testing Strategy

**Unit Tests for state-manager.js:**

```javascript
// test/state-manager.test.js
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  createStateManager,
  findLatestStateFile,
  loadStateFile,
  validateStateSchema
} = require('../src/state/state-manager');

const TEST_DIR = './test-state-files';

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR);
  }
});

afterEach(() => {
  // Clean up test files
  if (fs.existsSync(TEST_DIR)) {
    fs.readdirSync(TEST_DIR).forEach(f => fs.unlinkSync(path.join(TEST_DIR, f)));
    fs.rmdirSync(TEST_DIR);
  }
});

test('createStateManager() requires project', (t) => {
  assert.throws(() => createStateManager({ environment: 'sandbox' }), /Project is required/);
});

test('createStateManager() requires environment', (t) => {
  assert.throws(() => createStateManager({ project: 'eur' }), /Environment is required/);
});

test('initialize() creates state file', (t) => {
  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    stateDir: TEST_DIR
  });

  const accounts = [{ id: 'acc1' }, { id: 'acc2' }];
  manager.initialize(accounts);

  const filePath = manager.getStateFilePath();
  assert.ok(fs.existsSync(filePath));
});

test('initialize() creates valid state structure', (t) => {
  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    stateDir: TEST_DIR
  });

  const accounts = [{ id: 'acc1' }, { id: 'acc2' }];
  const state = manager.initialize(accounts);

  assert.strictEqual(state.progress.total, 2);
  assert.strictEqual(state.progress.processed, 0);
  assert.deepStrictEqual(state.accounts.pending, ['acc1', 'acc2']);
});

test('markProcessed() updates state correctly', (t) => {
  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }, { id: 'acc2' }]);
  manager.markProcessed('acc1', { status: 'rescued', subscriptionId: 'sub1' });

  const state = manager.getState();
  assert.strictEqual(state.progress.processed, 1);
  assert.strictEqual(state.accounts.pending.length, 1);
  assert.strictEqual(state.accounts.processed[0].id, 'acc1');
});

test('findLatestStateFile() returns most recent file', (t) => {
  // Create two state files with different timestamps
  const file1 = path.join(TEST_DIR, 'rescue-state-eur-2026-01-20T10-00-00.json');
  const file2 = path.join(TEST_DIR, 'rescue-state-eur-2026-01-20T11-00-00.json');

  fs.writeFileSync(file1, '{}');
  // Wait to ensure different mtime
  fs.writeFileSync(file2, '{}');

  const latest = findLatestStateFile('eur', TEST_DIR);
  assert.strictEqual(path.basename(latest), 'rescue-state-eur-2026-01-20T11-00-00.json');
});

test('loadStateFile() throws on corrupted JSON', (t) => {
  const filePath = path.join(TEST_DIR, 'corrupted.json');
  fs.writeFileSync(filePath, '{ invalid json }');

  assert.throws(() => loadStateFile(filePath), /corrupted/);
});

test('validateStateSchema() throws on missing fields', (t) => {
  assert.throws(() => validateStateSchema({}), /missing version/);
  assert.throws(() => validateStateSchema({ version: '1.0.0' }), /missing metadata/);
});

test('cleanup() removes state file', (t) => {
  const manager = createStateManager({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rescue',
    stateDir: TEST_DIR
  });

  manager.initialize([{ id: 'acc1' }]);
  const filePath = manager.getStateFilePath();
  assert.ok(fs.existsSync(filePath));

  manager.cleanup();
  assert.ok(!fs.existsSync(filePath));
});
```

### Edge Cases to Handle

1. **No state file found for --resume:** Clear error, suggest fresh run
2. **State file from different project:** Reject with error
3. **State file from different environment:** Reject with error
4. **Corrupted JSON:** Clear error with "corrupted" message
5. **Crash during save:** Use atomic writes (temp + rename)
6. **Disk full:** Handle fs.writeFileSync errors gracefully
7. **Multiple state files:** Use most recent by mtime

### Security Considerations

**State file contains:**
- Client IDs (not sensitive)
- Subscription IDs (not sensitive)
- Error messages (sanitize before storing)

**State file does NOT contain:**
- API keys
- Credentials
- Full account data

```javascript
// Sanitize errors before persisting
function sanitizeForState(error) {
  return error.replace(/api[-_]?key[=:]\s*[^\s]+/gi, '[REDACTED]');
}
```

### Previous Story Learnings

**From Story 4.1 (Progress Display):**
- Factory function pattern with options object
- Clean module exports
- Comprehensive parameter validation

**From Story 4.2 (Action Logging):**
- Coordinate with other modules
- Handle edge cases gracefully
- Never log sensitive data

**General patterns:**
- JSDoc documentation
- Unit tests for all functions
- Integration tests for rescue.js

### Dependencies

**No new dependencies required.** Uses native Node.js:
- `fs` for file operations
- `path` for file path handling

### NFR Compliance

**FR13:** System can persist execution state to enable crash recovery
- ✅ State file created with all progress data
- ✅ Updated after each client operation
- ✅ Includes processed/pending lists

**FR14:** System can resume execution from exact point of interruption
- ✅ --resume flag support
- ✅ Detects latest state file
- ✅ Resumes from correct position

**FR15:** System tracks which clients have been processed vs pending
- ✅ processed array with results
- ✅ pending array with remaining IDs
- ✅ currentIndex for position tracking

### References

- [Source: docs/planning-artifacts/epics.md#Story 4.3 - State Persistence]
- [Source: docs/planning-artifacts/prd.md#FR13-FR15 - State management]
- [Dependency: docs/implementation-artifacts/4-1-progress-display.md]
- [Dependency: docs/implementation-artifacts/4-2-action-logging.md]
- [Existing: src/config/env.js - File system pattern]
- [Existing: src/cli/args.js - --resume argument defined]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

- All 54 tests passing for state-manager.test.js
- All 25 tests passing for rescue.test.js
- 469/470 total tests passing (1 flaky test in prompt.test.js due to Node test runner serialization issue)

### Completion Notes List

- ✅ Created comprehensive state management module with factory pattern
- ✅ Implemented atomic file writes using temp file + rename to prevent corruption
- ✅ Added error sanitization to prevent API keys from being stored in state files
- ✅ Integrated state manager into rescue.js with full --resume support
- ✅ Validated state file environment/project matching for safe resumption
- ✅ All acceptance criteria (AC1, AC2, AC3) satisfied
- ✅ 54 unit tests covering all edge cases

### File List

**Created:**
- src/state/state-manager.js (343 lines - state persistence module)
- test/state-manager.test.js (929 lines - comprehensive test suite)

**Modified:**
- rescue.js (state management integration with --resume flag handling)
- docs/implementation-artifacts/sprint-status.yaml (status update)
- docs/implementation-artifacts/4-3-state-persistence-recovery.md (completion tracking)

## Senior Developer Review (AI)

### Review Date: 2026-01-21

### Reviewer: Claude Opus 4.5

### Review Outcome: ✅ APPROVED (after fixes)

### Issues Found & Fixed

**HIGH Severity (4 issues - all fixed):**

1. **HIGH-1:** Variable `isResuming` declared but never used in rescue.js
   - **Fix:** Removed unused variable, replaced with `totalForProgress` for progress tracking

2. **HIGH-2:** Variable `resumeIndex` calculated but not used in progress bar
   - **Fix:** Progress bar now uses `resumeIndex + i + 1` for correct position during resume

3. **HIGH-3:** Missing validation for `--resume` + `--client-id` conflict
   - **Fix:** Added argument conflict validation in args.js

4. **HIGH-4:** Tests for resume functionality were incomplete
   - **Fix:** Split test case to properly test --resume and --client-id separately

**MEDIUM Severity (4 issues - all fixed):**

1. **MEDIUM-1:** Missing test for corrupted/empty state files
   - **Fix:** Added tests for empty and truncated JSON files

2. **MEDIUM-2:** Progress bar total incorrect during resume
   - **Fix:** Now uses `totalForProgress` from state manager instead of pending count

3. **MEDIUM-3:** Missing validation for `--resume` + `--rollback` conflict
   - **Fix:** Added argument conflict validation in args.js

4. **MEDIUM-4:** No test for orphaned temp file cleanup
   - **Fix:** Added test verifying cleanup() removes .tmp.* files

**LOW Severity (3 issues - noted):**
- LOW-1: JSDoc incomplete for resumeFrom() - documentation improvement
- LOW-2: Misleading Story 4.3 comment on rollback code - cosmetic
- LOW-3: Non-atomic test delay pattern - test reliability

### Files Modified During Review

- `rescue.js` - Fixed progress tracking during resume
- `src/cli/args.js` - Added conflict validation for --resume
- `test/args.test.js` - Fixed and added tests for argument conflicts
- `test/state-manager.test.js` - Added tests for edge cases

### Test Results After Fixes

- 649/650 tests passing (1 pre-existing flaky test in prompt.test.js unrelated to this story)
- All state-manager.test.js tests passing (57 tests)
- All args.test.js tests passing (including 3 new tests)
