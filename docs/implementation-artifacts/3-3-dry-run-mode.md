# Story 3.3: Dry-Run Mode

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **operator**,
I want **to simulate the rescue without making real changes**,
So that **I can verify the process before executing**.

## Acceptance Criteria

### AC1: Simulate rescue operations without API changes

**Given** --dry-run is provided
**When** the script runs
**Then** it queries and identifies all clients
**And** displays what WOULD be done for each client
**And** does NOT make any API calls that modify data
**And** displays summary: "DRY-RUN: {N} clients would be rescued"

### AC2: Indicate dry-run mode clearly in all output

**Given** --dry-run mode completes
**When** displaying results
**Then** clearly indicate "[DRY-RUN]" in all output
**And** do NOT generate the rescue-results JSON file

## Tasks / Subtasks

- [x] Task 1: Create Dry-Run Configuration Module (AC: #1, #2)
  - [x] 1.1: Create `src/rescue/dry-run.js` module
  - [x] 1.2: Implement `isDryRunMode()` function that:
    - Checks if --dry-run flag is active
    - Returns boolean state
  - [x] 1.3: Implement `withDryRun(fn, dryRunMessage)` wrapper that:
    - Executes function normally if NOT dry-run
    - Skips execution and logs message if IS dry-run
    - Returns mock success data in dry-run mode
  - [x] 1.4: Implement `formatDryRunMessage(message)` to add [DRY-RUN] prefix
  - [x] 1.5: Export functions

- [x] Task 2: Integrate Dry-Run with Plan Manager (AC: #1)
  - [x] 2.1: Update `src/rescue/plan-manager.js` from Story 3.1
  - [x] 2.2: Wrap `createRescuePlan()` with dry-run check
  - [x] 2.3: In dry-run mode:
    - Skip actual plan creation API call
    - Log "[DRY-RUN] Would create Rescue Plan: {plan_code}" (uses getRescuePlanCode(currency) from RESCUE_PLAN_CODE env var)
    - Return mock plan object
  - [x] 2.4: Allow `findOrCreateRescuePlan()` to still check for existing plans (read-only)

- [x] Task 3: Integrate Dry-Run with Subscription Manager (AC: #1, #2)
  - [x] 3.1: Update `src/rescue/subscription-manager.js` from Story 3.2
  - [x] 3.2: Wrap `assignRescuePlan()` with dry-run check
  - [x] 3.3: In dry-run mode:
    - Skip actual subscription creation API call
    - Log "[DRY-RUN] ✓ {client_id} - Would be RESCUED with plan {plan_code}"
    - Return mock subscription object
  - [x] 3.4: Ensure no modifications to client accounts
  - [x] 3.5: Update log format to include [DRY-RUN] prefix

- [x] Task 4: Update Main Rescue Flow (AC: #1, #2)
  - [x] 4.1: Pass dry-run state to all rescue operations
  - [x] 4.2: Display dry-run banner at start: "=== DRY-RUN MODE: No changes will be made ==="
  - [x] 4.3: Display dry-run summary at end with statistics
  - [x] 4.4: Skip JSON output file generation in dry-run mode
  - [x] 4.5: Ensure all read operations (queries) still execute normally

- [x] Task 5: Write Tests (AC: #1, #2)
  - [x] 5.1: Create `test/dry-run.test.js`
  - [x] 5.2: Test `isDryRunMode()` detection
  - [x] 5.3: Test `withDryRun()` wrapper execution/skip logic
  - [x] 5.4: Test `formatDryRunMessage()` prefix addition
  - [x] 5.5: Update `test/plan-manager.test.js` with dry-run scenarios
  - [x] 5.6: Update `test/subscription-manager.test.js` with dry-run scenarios
  - [x] 5.7: Integration test: Full rescue in dry-run mode
  - [x] 5.8: Verify no API modifications in dry-run mode

## Dev Notes

### Technical Approach

Dry-run mode provides a safe way to validate the rescue process without affecting real data. It should:
1. Allow all READ operations (queries) to execute normally
2. Skip all WRITE/MODIFY operations (plan creation, subscription assignment)
3. Clearly indicate dry-run status in all output
4. Provide realistic simulation by showing what WOULD happen

### Implementation Pattern

```javascript
// src/rescue/dry-run.js

let dryRunMode = false;

/**
 * Enable or disable dry-run mode
 * @param {boolean} enabled - True to enable dry-run mode
 */
function setDryRunMode(enabled) {
  dryRunMode = !!enabled;
}

/**
 * Check if dry-run mode is active
 * @returns {boolean} True if in dry-run mode
 */
function isDryRunMode() {
  return dryRunMode;
}

/**
 * Execute function or skip with message in dry-run mode
 * @param {Function} fn - Function to execute (if not dry-run)
 * @param {string} dryRunMessage - Message to log in dry-run mode
 * @param {any} mockReturnValue - Value to return in dry-run mode
 * @returns {Promise<any>} Function result or mock value
 */
async function withDryRun(fn, dryRunMessage, mockReturnValue = null) {
  if (isDryRunMode()) {
    console.log(formatDryRunMessage(dryRunMessage));
    return mockReturnValue;
  }
  return await fn();
}

/**
 * Format message with [DRY-RUN] prefix
 * @param {string} message - Message to format
 * @returns {string} Formatted message
 */
function formatDryRunMessage(message) {
  return `[DRY-RUN] ${message}`;
}

module.exports = { setDryRunMode, isDryRunMode, withDryRun, formatDryRunMessage };
```

### Integration with Plan Manager (Story 3.1)

```javascript
// src/rescue/plan-manager.js - Update createRescuePlan()

const { isDryRunMode, formatDryRunMessage } = require('./dry-run');

async function createRescuePlan(currency) {
  const planCode = getRescuePlanCode(currency);

  // Dry-run mode: Skip actual creation
  if (isDryRunMode()) {
    console.log(formatDryRunMessage(`Would create Rescue Plan: ${planCode}`));
    // Return mock plan object
    return {
      code: planCode,
      name: `Rescue Plan (${currency.toUpperCase()})`,
      currency: currency.toUpperCase(),
      __dryRun: true // Flag to indicate mock data
    };
  }

  // Normal mode: Create plan via API
  const planData = {
    code: planCode,
    name: `Rescue Plan (${currency.toUpperCase()})`,
    currencies: [
      {
        currency: currency.toUpperCase(),
        setup_fee: 0,
        unit_amount: 0
      }
    ]
  };

  const plan = await recurlyRequest('POST', '/plans', planData);
  console.log(`Created Rescue Plan: ${planCode}`);
  return plan;
}
```

### Integration with Subscription Manager (Story 3.2)

```javascript
// src/rescue/subscription-manager.js - Update assignRescuePlan()

const { isDryRunMode, formatDryRunMessage } = require('./dry-run');

async function assignRescuePlan(clientId, planCode, currency) {
  const payload = getSubscriptionPayload(clientId, planCode, currency, 1);

  // Dry-run mode: Skip actual assignment
  if (isDryRunMode()) {
    const message = `✓ ${clientId} - Would be RESCUED with plan ${planCode}`;
    console.log(formatDryRunMessage(message));

    // Return mock subscription object
    return {
      id: `sub_dryrun_${Date.now()}`,
      account: { code: clientId },
      plan: { code: planCode },
      state: 'active',
      __dryRun: true
    };
  }

  // Normal mode: Create subscription via API
  try {
    const subscription = await withRetry(async () => {
      return await recurlyRequest('POST', `/accounts/${clientId}/subscriptions`, payload);
    });

    const recurlyUrl = buildRecurlyUrl('subscription', subscription.uuid);
    console.log(`✓ ${clientId} - RESCUED - ${recurlyUrl}`);

    return subscription;
  } catch (error) {
    console.error(`✗ ${clientId} - FAILED (${error.message})`);
    throw error;
  }
}
```

### Main Rescue Flow Integration

```javascript
// rescue.js (main entry point) - Dry-run initialization

const { parseArgs } = require('./src/cli/args');
const { setDryRunMode, isDryRunMode } = require('./src/rescue/dry-run');

async function main() {
  const options = parseArgs();

  // Initialize dry-run mode
  setDryRunMode(options.dryRun);

  if (isDryRunMode()) {
    console.log('='.repeat(60));
    console.log('DRY-RUN MODE: No changes will be made');
    console.log('='.repeat(60));
    console.log('');
  }

  // ... rest of rescue logic ...

  // At end, display dry-run summary
  if (isDryRunMode()) {
    console.log('');
    console.log('='.repeat(60));
    console.log(`DRY-RUN SUMMARY: ${results.total} clients would be rescued`);
    console.log(`  Success: ${results.rescued}`);
    console.log(`  Failures: ${results.failed}`);
    console.log('No actual changes were made.');
    console.log('='.repeat(60));

    // Skip JSON output generation
    console.log('\nNote: Output file NOT generated in dry-run mode');
    return;
  }

  // Normal mode: Generate output file
  generateOutputFile(results);
}
```

### Dry-Run Banner Design

**Start banner:**
```
============================================================
DRY-RUN MODE: No changes will be made
============================================================
```

**Per-client logs:**
```
[DRY-RUN] Would create Rescue Plan: 4weeks-subscription-eur
[DRY-RUN] ✓ client-abc123 - Would be RESCUED with plan 4weeks-subscription-eur
[DRY-RUN] ✓ client-def456 - Would be RESCUED with plan 4weeks-subscription-eur
```
Note: Plan codes are generated from RESCUE_PLAN_CODE env var (default: '4weeks-subscription')

**End summary:**
```
============================================================
DRY-RUN SUMMARY: 250 clients would be rescued
  Success: 245
  Failures: 5
No actual changes were made.
============================================================

Note: Output file NOT generated in dry-run mode
```

### Read vs Write Operations

**Operations that SHOULD execute in dry-run:**
- ✅ Query accounts from Recurly (GET requests)
- ✅ Check if Rescue Plan exists (GET /plans/{code})
- ✅ Validate API credentials
- ✅ Parse CLI arguments
- ✅ Load environment configuration

**Operations that SHOULD NOT execute in dry-run:**
- ❌ Create Rescue Plan (POST /plans)
- ❌ Assign subscription (POST /accounts/{id}/subscriptions)
- ❌ Generate JSON output file
- ❌ Update client account state
- ❌ Any POST, PUT, PATCH, DELETE requests

### Testing Strategy

```javascript
// test/dry-run.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const { setDryRunMode, isDryRunMode, withDryRun, formatDryRunMessage } = require('../src/rescue/dry-run');

test('setDryRunMode() enables dry-run mode', (t) => {
  setDryRunMode(true);
  assert.strictEqual(isDryRunMode(), true);
});

test('setDryRunMode() disables dry-run mode', (t) => {
  setDryRunMode(false);
  assert.strictEqual(isDryRunMode(), false);
});

test('withDryRun() executes function when NOT in dry-run mode', async (t) => {
  setDryRunMode(false);
  let executed = false;

  await withDryRun(async () => {
    executed = true;
    return 'result';
  }, 'Would do something', null);

  assert.strictEqual(executed, true);
});

test('withDryRun() skips function when in dry-run mode', async (t) => {
  setDryRunMode(true);
  let executed = false;

  const result = await withDryRun(async () => {
    executed = true;
    return 'result';
  }, 'Would do something', 'mock-result');

  assert.strictEqual(executed, false);
  assert.strictEqual(result, 'mock-result');
});

test('withDryRun() logs message in dry-run mode', async (t) => {
  setDryRunMode(true);
  // Capture console.log
  // Verify message contains '[DRY-RUN]' and custom message
});

test('formatDryRunMessage() adds [DRY-RUN] prefix', (t) => {
  const formatted = formatDryRunMessage('Test message');
  assert.strictEqual(formatted, '[DRY-RUN] Test message');
});
```

**Integration tests:**
```javascript
// test/rescue.test.js - Add dry-run integration test

test('rescue.js --dry-run does not modify data', async (t) => {
  // Setup test environment with mock Recurly API
  // Track all API calls made
  // Run rescue with --dry-run flag
  // Verify:
  //   - GET requests executed (queries)
  //   - NO POST/PUT/PATCH/DELETE requests made
  //   - Output contains [DRY-RUN] markers
  //   - No JSON file created
  //   - Exit code 0
});
```

### File Structure After Story 3.3

```
RecurlyRescue/
├── rescue.js                           # Updated: Dry-run initialization and summary
├── src/
│   ├── config/
│   │   └── env.js                      # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js                     # Existing (Story 1.2) - already has --dry-run
│   │   ├── prompt.js                   # Existing (Story 1.3)
│   │   └── help.js                     # Existing (Story 1.4) - already documents --dry-run
│   ├── env/
│   │   └── environment.js              # Existing (Story 1.3)
│   ├── api/
│   │   └── recurly-client.js           # Existing
│   ├── utils/
│   │   └── retry.js                    # Existing (Story 3.2)
│   └── rescue/
│       ├── plan-manager.js             # Updated: Dry-run integration
│       ├── subscription-manager.js     # Updated: Dry-run integration
│       └── dry-run.js                  # NEW: Dry-run state and utilities
└── test/
    ├── env.test.js                     # Existing
    ├── args.test.js                    # Existing
    ├── rescue.test.js                  # Updated: Dry-run integration test
    ├── environment.test.js             # Existing
    ├── prompt.test.js                  # Existing
    ├── help.test.js                    # Existing
    ├── recurly-client.test.js          # Existing
    ├── plan-manager.test.js            # Updated: Dry-run test scenarios
    ├── subscription-manager.test.js    # Updated: Dry-run test scenarios
    ├── retry.test.js                   # Existing
    └── dry-run.test.js                 # NEW
```

### Previous Story Learnings

**From Story 1.1 (Project Setup):**
- Environment configuration loading
- Clear separation of concerns

**From Story 1.2 (CLI Parsing):**
- `--dry-run` argument already defined in args.js
- Validation patterns for boolean flags

**From Story 1.3 (Environment Management):**
- State management patterns
- Global configuration vs function parameters

**From Story 1.4 (Help Command):**
- `--dry-run` already documented in help text
- User-facing messaging patterns

**From Story 3.1 (Plan Management):**
- Plan creation API patterns
- Mock data structure for testing

**From Story 3.2 (Subscription Assignment):**
- Subscription creation API patterns
- Logging format and standards
- Mock subscription objects

### Git Intelligence Summary

**Code patterns to follow:**
- Use module-level state for global configuration (like dry-run mode)
- Export clear, testable functions
- Separate concerns: state management, business logic, integration
- Mock external dependencies in tests
- Test both enabled and disabled states

### Mock Data Standards

**Mock plan object:**
```javascript
{
  code: '4weeks-subscription-eur',  // Generated from RESCUE_PLAN_CODE env var
  name: 'Rescue Plan (EUR)',
  currency: 'EUR',
  __dryRun: true  // Flag to indicate mock data
}
```

**Mock subscription object:**
```javascript
{
  id: 'sub_dryrun_1234567890',
  account: { code: 'client-abc123' },
  plan: { code: '4weeks-subscription-eur' },  // Generated from RESCUE_PLAN_CODE env var
  state: 'active',
  __dryRun: true  // Flag to indicate mock data
}
```

### Integration with Future Stories

**Story 3.4 (Execution Control):**
- Dry-run mode should respect confirmation intervals
- Pause/continue logic still applies in dry-run

**Story 4.1 (Progress Display):**
- Progress bar should work in dry-run mode
- May show "(DRY-RUN)" indicator in progress display

**Story 4.2 (Action Logging):**
- Logs should include [DRY-RUN] prefix
- Structured logs may have dry-run flag

**Story 4.4 (Output Generation):**
- NO JSON file created in dry-run mode
- Summary displayed in terminal instead

**Story 5.1-5.3 (Rollback):**
- --rollback and --dry-run are mutually exclusive (already validated in Story 1.2)

### Edge Cases to Handle

1. **Dry-run with --client-id:** Should work, simulate rescue for single client
2. **Dry-run with missing .env:** Should still fail if API key missing (can't even query)
3. **Dry-run with invalid --project:** Should still fail on validation
4. **Dry-run with API errors during queries:** Real errors should still surface
5. **Dry-run state cleanup:** Ensure dry-run state resets between test runs

### User Experience Considerations

**Clear indication:**
- Banner at start and end
- [DRY-RUN] prefix on every simulated action
- Explicit note about no changes made

**Realistic simulation:**
- Show what WOULD happen with real data
- Use actual client IDs from queries
- Display realistic error scenarios (if applicable)

**No surprises:**
- Clearly state no output file created
- Indicate when dry-run mode is active in logs
- Exit cleanly with success code (0)

### NFR Compliance Summary

This story maintains all NFR compliance from previous stories:
- **NFR-I1:** Still uses Recurly API v3 for read operations
- **NFR-I2, NFR-I3:** Pagination still works for account queries
- **NFR-P1-P3:** Rate limits still monitored for read operations
- **NFR-S1-S4:** Security standards maintained

### References

- [Source: docs/planning-artifacts/epics.md#Story 3.3]
- [Source: docs/planning-artifacts/prd.md#FR9 - Dry-run mode]
- [Source: docs/planning-artifacts/prd.md#User Journey 1 - Safe testing workflow]
- [Source: docs/implementation-artifacts/1-2-cli-argument-parsing-validation.md - --dry-run argument]
- [Source: docs/implementation-artifacts/1-4-help-command.md - --dry-run documentation]
- [Source: docs/implementation-artifacts/3-1-rescue-plan-management.md - Plan creation to skip]
- [Source: docs/implementation-artifacts/3-2-plan-assignment-with-trial.md - Assignment to skip]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

### Completion Notes List

### File List
