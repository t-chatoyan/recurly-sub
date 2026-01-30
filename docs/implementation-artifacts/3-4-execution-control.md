# Story 3.4: Execution Control

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **operator**,
I want **to control the execution pace with confirmations**,
So that **I can monitor progress and stop if needed**.

## Acceptance Criteria

### AC1: Pause for confirmation at intervals

**Given** --confirm-every=50 is provided
**When** processing clients
**Then** pause after every 50 clients
**And** display "Processed 50/1000. Continue? (y/n)"
**And** if 'y', continue processing
**And** if 'n', stop gracefully and save state

### AC2: Run continuously without confirmations

**Given** --no-confirm is provided
**When** processing clients
**Then** run continuously without pauses
**And** process all clients in sequence

### AC3: Use default confirmation interval

**Given** neither --confirm-every nor --no-confirm is provided
**When** processing clients
**Then** default to --confirm-every=100

## Tasks / Subtasks

- [x] Task 1: Create Execution Control Module (AC: #1, #2, #3)
  - [x] 1.1: Create `src/rescue/execution-control.js` module
  - [x] 1.2: Implement `getConfirmationInterval(options)` function that:
    - Returns null if --no-confirm is set
    - Returns options.confirmEvery if provided
    - Returns 100 as default
  - [x] 1.3: Implement `shouldPauseForConfirmation(index, interval)` helper
  - [x] 1.4: Implement `promptContinue(processedCount, totalCount)` async function
  - [x] 1.5: Export functions

- [x] Task 2: Implement Confirmation Prompt (AC: #1)
  - [x] 2.1: Use readline or existing prompt utility from Story 1.3
  - [x] 2.2: Display clear message: "Processed X/Y. Continue? (y/n)"
  - [x] 2.3: Wait for user input (blocking)
  - [x] 2.4: Parse response: 'y' → continue, 'n' → stop
  - [x] 2.5: Handle invalid input (re-prompt or default to 'y')
  - [x] 2.6: Clean up prompt resources properly

- [x] Task 3: Integrate with Main Rescue Loop (AC: #1, #2, #3)
  - [x] 3.1: Update main rescue loop to check confirmation interval
  - [x] 3.2: After processing each client, check if pause needed
  - [x] 3.3: If pause needed, call promptContinue()
  - [x] 3.4: If user says 'n', exit loop gracefully
  - [x] 3.5: If user says 'y', continue to next batch
  - [x] 3.6: Ensure loop works correctly in dry-run mode

- [x] Task 4: Graceful Stop Implementation (AC: #1)
  - [x] 4.1: Implement `displayStopMessage()` function
  - [x] 4.2: Display stop message with statistics
  - [x] 4.3: Persist state for resume capability (coordinate with Story 4.3)
  - [x] 4.4: Exit with success code (0)
  - [x] 4.5: Ensure no data loss on stop

- [x] Task 5: Write Tests (AC: #1, #2, #3)
  - [x] 5.1: Create `test/execution-control.test.js`
  - [x] 5.2: Test `getConfirmationInterval()` with various options
  - [x] 5.3: Test `shouldPauseForConfirmation()` logic
  - [x] 5.4: Test `promptContinue()` with 'y' response
  - [x] 5.5: Test `promptContinue()` with 'n' response
  - [x] 5.6: Test default interval (100)
  - [x] 5.7: Integration test: Full rescue with confirmation intervals
  - [x] 5.8: Integration test: Full rescue with --no-confirm

## Dev Notes

### Technical Approach

This story implements execution control to give operators visibility and control during batch rescue operations. It builds on previous stories and coordinates with state management (Story 4.3) for graceful stops.

### Implementation Pattern

```javascript
// src/rescue/execution-control.js

const readline = require('readline');

/**
 * Get confirmation interval based on CLI options
 * @param {Object} options - Parsed CLI options
 * @param {boolean} options.noConfirm - True if --no-confirm flag set
 * @param {number} options.confirmEvery - Confirmation interval from --confirm-every
 * @returns {number|null} Interval (null means no confirmations)
 */
function getConfirmationInterval(options) {
  // --no-confirm takes precedence
  if (options.noConfirm) {
    return null;
  }

  // --confirm-every if provided
  if (options.confirmEvery && typeof options.confirmEvery === 'number') {
    return options.confirmEvery;
  }

  // Default: confirm every 100 clients
  return 100;
}

/**
 * Check if should pause for confirmation
 * @param {number} currentIndex - Current position (0-based)
 * @param {number} interval - Confirmation interval (null = never pause)
 * @returns {boolean} True if should pause
 */
function shouldPauseForConfirmation(currentIndex, interval) {
  if (interval === null) {
    return false; // Never pause if interval is null (--no-confirm)
  }

  // Pause after every 'interval' clients (1-based counting for user)
  // currentIndex is 0-based, so (currentIndex + 1) gives processed count
  const processedCount = currentIndex + 1;
  return processedCount > 0 && processedCount % interval === 0;
}

/**
 * Prompt user to continue or stop
 * @param {number} processedCount - Number of clients processed so far
 * @param {number} totalCount - Total number of clients to process
 * @returns {Promise<boolean>} True to continue, false to stop
 */
async function promptContinue(processedCount, totalCount) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(
      `Processed ${processedCount}/${totalCount}. Continue? (y/n) `,
      (answer) => {
        rl.close();

        const normalizedAnswer = answer.trim().toLowerCase();

        if (normalizedAnswer === 'y' || normalizedAnswer === 'yes') {
          resolve(true); // Continue
        } else if (normalizedAnswer === 'n' || normalizedAnswer === 'no') {
          resolve(false); // Stop
        } else {
          // Invalid input - default to continue for safety
          console.log(`Invalid input '${answer}'. Defaulting to 'y' (continue).`);
          resolve(true);
        }
      }
    );
  });
}

/**
 * Display graceful stop message
 * @param {number} processedCount - Clients successfully processed
 * @param {number} failedCount - Clients that failed
 * @param {number} totalCount - Total clients in batch
 */
function displayStopMessage(processedCount, failedCount, totalCount) {
  console.log('');
  console.log('='.repeat(60));
  console.log('EXECUTION STOPPED BY USER');
  console.log('='.repeat(60));
  console.log(`Processed: ${processedCount}/${totalCount} clients`);
  console.log(`  Success: ${processedCount - failedCount}`);
  console.log(`  Failed: ${failedCount}`);
  console.log(`  Remaining: ${totalCount - processedCount}`);
  console.log('');
  console.log('State has been saved. Use --resume to continue later.');
  console.log('='.repeat(60));
}

module.exports = {
  getConfirmationInterval,
  shouldPauseForConfirmation,
  promptContinue,
  displayStopMessage
};
```

### Integration with Main Rescue Loop

```javascript
// rescue.js - Main execution loop

const { parseArgs } = require('./src/cli/args');
const { getConfirmationInterval, shouldPauseForConfirmation, promptContinue, displayStopMessage } = require('./src/rescue/execution-control');
const { findOrCreateRescuePlan } = require('./src/rescue/plan-manager');
const { assignRescuePlan } = require('./src/rescue/subscription-manager');
const { setDryRunMode } = require('./src/rescue/dry-run');

async function main() {
  const options = parseArgs();

  // Setup
  setDryRunMode(options.dryRun);
  const confirmationInterval = getConfirmationInterval(options);

  // Get clients to rescue (from Story 2.1)
  const clients = await getClientsToRescue(options);
  console.log(`Found ${clients.length} clients to rescue`);

  // Ensure rescue plan exists
  const plan = await findOrCreateRescuePlan(options.currency);

  // Process clients with confirmation control
  let processedCount = 0;
  let failedCount = 0;
  const results = [];

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];

    try {
      // Rescue client
      const subscription = await assignRescuePlan(client.id, plan.code, options.currency);
      results.push({ client: client.id, status: 'RESCUED', subscription });
      processedCount++;
    } catch (error) {
      results.push({ client: client.id, status: 'FAILED', error: error.message });
      processedCount++;
      failedCount++;
      // NFR-R5: Continue to next client
    }

    // Check if should pause for confirmation
    if (shouldPauseForConfirmation(i, confirmationInterval)) {
      const shouldContinue = await promptContinue(processedCount, clients.length);

      if (!shouldContinue) {
        // User wants to stop - graceful exit
        displayStopMessage(processedCount, failedCount, clients.length);
        // Save state for resume (Story 4.3)
        await saveState(results, clients.slice(i + 1));
        process.exit(0);
      }
    }
  }

  // All clients processed
  console.log(`\nRescue complete: ${processedCount} clients processed`);
  return results;
}
```

### Confirmation Interval Logic

**Examples:**

1. **--confirm-every=50:**
   - Pause after client 50, 100, 150, 200...
   - User can stop at any interval

2. **--no-confirm:**
   - No pauses, run all clients continuously
   - Fastest execution

3. **No flags (default):**
   - Pause after client 100, 200, 300...
   - Safe default for large batches

### Graceful Stop Flow

**When user says 'n':**
1. Display stop message with statistics
2. Save current state to state file (Story 4.3)
3. List processed vs pending clients
4. Indicate --resume can continue later
5. Exit with code 0 (success, not error)

**State to save:**
- Clients already processed (IDs and results)
- Clients remaining (IDs to process)
- Execution parameters (env, project, plan)
- Timestamp of stop

### User Experience Design

**Confirmation prompt:**
```
Processed 50/250. Continue? (y/n) _
```

**After 'y' response:**
```
Continuing...
✓ client-123 - RESCUED - https://...
✓ client-124 - RESCUED - https://...
...
```

**After 'n' response:**
```
============================================================
EXECUTION STOPPED BY USER
============================================================
Processed: 50/250 clients
  Success: 48
  Failed: 2
  Remaining: 200

State has been saved. Use --resume to continue later.
============================================================
```

### Testing Strategy

```javascript
// test/execution-control.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const { getConfirmationInterval, shouldPauseForConfirmation } = require('../src/rescue/execution-control');

test('getConfirmationInterval() returns null for --no-confirm', (t) => {
  const interval = getConfirmationInterval({ noConfirm: true });
  assert.strictEqual(interval, null);
});

test('getConfirmationInterval() returns custom interval', (t) => {
  const interval = getConfirmationInterval({ confirmEvery: 50 });
  assert.strictEqual(interval, 50);
});

test('getConfirmationInterval() returns default 100', (t) => {
  const interval = getConfirmationInterval({});
  assert.strictEqual(interval, 100);
});

test('getConfirmationInterval() prefers --no-confirm over --confirm-every', (t) => {
  const interval = getConfirmationInterval({ noConfirm: true, confirmEvery: 50 });
  assert.strictEqual(interval, null);
});

test('shouldPauseForConfirmation() pauses at correct intervals', (t) => {
  // Interval = 50, pause after 50, 100, 150...
  assert.strictEqual(shouldPauseForConfirmation(49, 50), true);  // Index 49 = 50th client
  assert.strictEqual(shouldPauseForConfirmation(99, 50), true);  // Index 99 = 100th client
  assert.strictEqual(shouldPauseForConfirmation(50, 50), false); // Index 50 = 51st client
});

test('shouldPauseForConfirmation() never pauses for null interval', (t) => {
  assert.strictEqual(shouldPauseForConfirmation(49, null), false);
  assert.strictEqual(shouldPauseForConfirmation(99, null), false);
});

test('shouldPauseForConfirmation() handles first client correctly', (t) => {
  // Index 0 = 1st client, should not pause
  assert.strictEqual(shouldPauseForConfirmation(0, 100), false);
});

test('promptContinue() returns true for y input', async (t) => {
  // Mock readline to simulate 'y' input
  // Verify returns true
});

test('promptContinue() returns false for n input', async (t) => {
  // Mock readline to simulate 'n' input
  // Verify returns false
});

test('promptContinue() handles invalid input', async (t) => {
  // Mock readline to simulate invalid input like 'xyz'
  // Verify defaults to true (continue)
  // Verify warning message logged
});
```

**Integration test:**
```javascript
// test/rescue.test.js

test('rescue with --confirm-every pauses at intervals', async (t) => {
  // Mock getClientsToRescue to return 150 clients
  // Mock readline to auto-respond 'y' twice (at 50 and 100)
  // Run rescue with --confirm-every=50
  // Verify:
  //   - 2 confirmation prompts shown (at 50 and 100)
  //   - All 150 clients processed
  //   - No prompt at 150 (end of list)
});

test('rescue with --no-confirm runs without pauses', async (t) => {
  // Mock getClientsToRescue to return 150 clients
  // Run rescue with --no-confirm
  // Verify:
  //   - No prompts shown
  //   - All 150 clients processed
});

test('rescue stops gracefully when user says n', async (t) => {
  // Mock getClientsToRescue to return 150 clients
  // Mock readline to respond 'n' at first prompt (50)
  // Run rescue with --confirm-every=50
  // Verify:
  //   - Only 50 clients processed
  //   - Stop message displayed
  //   - State saved for resume
  //   - Exit code 0
});
```

### File Structure After Story 3.4

```
RecurlyRescue/
├── rescue.js                           # Updated: Execution loop with confirmation control
├── src/
│   ├── config/
│   │   └── env.js                      # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js                     # Existing (Story 1.2) - has --confirm-every, --no-confirm
│   │   ├── prompt.js                   # Existing (Story 1.3) - may reuse for prompts
│   │   └── help.js                     # Existing (Story 1.4) - documents options
│   ├── env/
│   │   └── environment.js              # Existing (Story 1.3)
│   ├── api/
│   │   └── recurly-client.js           # Existing
│   ├── utils/
│   │   └── retry.js                    # Existing (Story 3.2)
│   └── rescue/
│       ├── plan-manager.js             # Existing (Story 3.1)
│       ├── subscription-manager.js     # Existing (Story 3.2)
│       ├── dry-run.js                  # Existing (Story 3.3)
│       └── execution-control.js        # NEW: Confirmation and control
└── test/
    ├── env.test.js                     # Existing
    ├── args.test.js                    # Existing
    ├── rescue.test.js                  # Updated: Confirmation integration tests
    ├── environment.test.js             # Existing
    ├── prompt.test.js                  # Existing
    ├── help.test.js                    # Existing
    ├── recurly-client.test.js          # Existing
    ├── plan-manager.test.js            # Existing (Story 3.1)
    ├── subscription-manager.test.js    # Existing (Story 3.2)
    ├── dry-run.test.js                 # Existing (Story 3.3)
    ├── retry.test.js                   # Existing
    └── execution-control.test.js       # NEW
```

### Previous Story Learnings

**From Story 1.1 (Project Setup):**
- Clear configuration patterns
- Environment variable handling

**From Story 1.2 (CLI Parsing):**
- `--confirm-every` and `--no-confirm` already defined
- Argument validation for mutual exclusivity
- Number parsing for --confirm-every value

**From Story 1.3 (Environment Management):**
- Async prompt patterns with readline
- Production confirmation similar to this story
- Clean resource handling (rl.close())

**From Story 1.4 (Help Command):**
- Both options already documented in help
- User-facing messaging patterns

**From Story 3.1 (Plan Management):**
- API integration patterns
- Error handling standards

**From Story 3.2 (Subscription Assignment):**
- Retry logic and error handling
- NFR-R5: Continue to next client on failure
- Logging standards

**From Story 3.3 (Dry-Run Mode):**
- Confirmation prompts should work in dry-run mode
- State management considerations

### Git Intelligence Summary

**Code patterns:**
- Readline usage from Story 1.3 (prompt.js)
- Async/await for user input
- Resource cleanup (rl.close())
- Clear function naming
- Comprehensive tests for all branches

### Edge Cases to Handle

1. **Confirmation at exact end:** Don't prompt after last client
2. **Single client with interval:** Don't prompt for only 1 client
3. **Interval larger than total:** No prompts if interval > total clients
4. **Zero clients:** No prompts if no clients to process
5. **Invalid confirmation response:** Default to 'y' (continue) for safety
6. **Interrupted prompt:** Handle Ctrl+C gracefully
7. **Dry-run with confirmations:** Should still prompt (operator validation)

### Prompt Design Considerations

**Prompt timing:**
- Display AFTER processing the Nth client, not before
- Shows accurate count of processed clients
- Clear indication of progress

**Response handling:**
- 'y' or 'yes' → continue
- 'n' or 'no' → stop gracefully
- Other input → warn and default to 'y'
- Empty input → warn and default to 'y'

**Readline cleanup:**
- Always call rl.close() in promise resolution
- Avoid resource leaks
- Ensure stdin/stdout return to normal state

### Integration with Future Stories

**Story 4.1 (Progress Display):**
- Progress bar may need to pause/update during confirmations
- Consider whether to clear progress bar for prompt

**Story 4.2 (Action Logging):**
- Confirmation prompts should not interfere with logs
- May need to format logs to not conflict with prompt

**Story 4.3 (State Persistence & Recovery):**
- **CRITICAL:** Graceful stop must save state for --resume
- State should include: processed clients, pending clients, execution params
- Resume should skip already processed clients

**Story 4.4 (Output Generation):**
- Partial results should still generate output file (if not dry-run)
- Output should indicate execution was stopped early

### Argument Validation (Already in Story 1.2)

**From args.js:**
```javascript
// Already validated in Story 1.2
if (options.confirmEvery && options.noConfirm) {
  console.error('Error: Cannot use both --confirm-every and --no-confirm');
  process.exit(1);
}
```

### Production Confirmation Interaction

**From Story 1.3:**
Production mode already prompts: "You are about to run in PRODUCTION. Continue? (y/n)"

**Interaction with this story:**
1. Production prompt (Story 1.3) → runs once at start
2. Batch confirmation (this story) → runs every N clients during execution

These are separate and compatible.

### Performance Considerations

**Confirmation overhead:**
- Prompt display is instant
- Waiting for user input is blocking (intended behavior)
- No performance impact when --no-confirm used

**State saving (for graceful stop):**
- Should be fast (write JSON file)
- Minimal delay before exit
- User should see confirmation quickly

### NFR Compliance Summary

This story implements:
- **FR10:** Operator can set confirmation intervals
- **FR11:** Operator can run in continuous mode (--no-confirm)
- **FR12:** Production confirmation (already in Story 1.3)
- **NFR-R5:** Continue to next client without crashing (maintained in loop)

### User Journey Example

**Journey 3: Large batch rescue with monitoring**

```bash
$ node rescue.js --env=production --project=eur --confirm-every=100
```

**Output:**
```
You are about to run in PRODUCTION. Continue? (y/n) y

Found 500 clients to rescue
Created Rescue Plan: 4weeks-subscription-eur
Note: Plan code is generated from RESCUE_PLAN_CODE env var (default: '4weeks-subscription')

✓ client-001 - RESCUED - https://...
✓ client-002 - RESCUED - https://...
...
✓ client-100 - RESCUED - https://...

Processed 100/500. Continue? (y/n) y

Continuing...
✓ client-101 - RESCUED - https://...
...
✓ client-200 - RESCUED - https://...

Processed 200/500. Continue? (y/n) n

============================================================
EXECUTION STOPPED BY USER
============================================================
Processed: 200/500 clients
  Success: 198
  Failed: 2
  Remaining: 300

State has been saved. Use --resume to continue later.
============================================================
```

### References

- [Source: docs/planning-artifacts/epics.md#Story 3.4]
- [Source: docs/planning-artifacts/prd.md#FR10 - Confirmation intervals]
- [Source: docs/planning-artifacts/prd.md#FR11 - Continuous mode]
- [Source: docs/planning-artifacts/prd.md#User Journey 3 - Large batch with monitoring]
- [Source: docs/implementation-artifacts/1-2-cli-argument-parsing-validation.md - Arguments defined]
- [Source: docs/implementation-artifacts/1-3-environment-management.md - Prompt patterns]
- [Source: docs/implementation-artifacts/1-4-help-command.md - Options documented]
- [Source: docs/implementation-artifacts/3-2-plan-assignment-with-trial.md - Loop integration]
- [Source: docs/implementation-artifacts/3-3-dry-run-mode.md - Dry-run compatibility]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

### Completion Notes List

### File List
