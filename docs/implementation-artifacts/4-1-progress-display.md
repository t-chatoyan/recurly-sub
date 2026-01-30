# Story 4.1: Progress Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **operator**,
I want **to see real-time progress with a visual progress bar**,
So that **I can monitor execution and estimate remaining time**.

## Acceptance Criteria

1. **AC1: Visual progress bar during processing**
   - **Given** the rescue process is running
   - **When** clients are being processed
   - **Then** display a progress bar with:
     - Visual bar (e.g., [████████░░░░░░░░] 50%)
     - Counter: "125/250 clients"
     - Current client ID being processed
   - **And** update in real-time without scrolling

2. **AC2: Clean completion state**
   - **Given** processing completes
   - **When** displaying final state
   - **Then** clear the progress bar
   - **And** display final summary statistics

## Tasks / Subtasks

- [x] Task 1: Create progress display module (AC: #1)
  - [x] 1.1: Create `src/ui/progress.js` module
  - [x] 1.2: Implement `createProgressBar(total)` factory function
  - [x] 1.3: Implement `progressBar.update(current, clientId)` method
  - [x] 1.4: Implement visual bar rendering with:
    - Filled blocks (█) and empty blocks (░)
    - Percentage calculation
    - Counter (current/total)
    - Current client ID display
  - [x] 1.5: Use `process.stdout.write('\r')` for in-place updates
  - [x] 1.6: Handle terminal width detection for responsive bar

- [x] Task 2: Implement completion handling (AC: #2)
  - [x] 2.1: Implement `progressBar.complete(stats)` method
  - [x] 2.2: Clear progress line with spaces or cursor movement
  - [x] 2.3: Display final summary with stats object:
    - Total processed
    - Successful count
    - Failed count
    - Duration
  - [x] 2.4: Handle edge case when total is 0

- [x] Task 3: Integrate with rescue process (AC: #1, #2)
  - [x] 3.1: Import progress module in rescue.js
  - [x] 3.2: Initialize progress bar after querying accounts
  - [x] 3.3: Update progress bar in processing loop
  - [x] 3.4: Call complete() after processing finishes

- [x] Task 4: Write comprehensive tests (AC: #1, #2)
  - [x] 4.1: Create `test/progress.test.js` for progress module
  - [x] 4.2: Test progress bar initialization with total count
  - [x] 4.3: Test percentage calculation accuracy
  - [x] 4.4: Test update() output format
  - [x] 4.5: Test complete() clears and displays stats
  - [x] 4.6: Test edge cases (0 total, 1 total, 1000+ total)

## Dev Notes

### Technical Approach

The progress display needs to provide real-time feedback without flooding the terminal. Key technique: use carriage return (`\r`) to update the same line in-place.

### Progress Bar Implementation Pattern

```javascript
// src/ui/progress.js

/**
 * Progress Display Module
 * Provides real-time visual feedback for batch operations
 */

/**
 * Create a progress bar instance
 * @param {number} total - Total items to process
 * @returns {Object} Progress bar instance with update() and complete() methods
 */
function createProgressBar(total) {
  if (typeof total !== 'number' || total < 0) {
    throw new Error('Total must be a non-negative number');
  }

  const barWidth = 30; // Characters for the bar itself
  let startTime = Date.now();

  /**
   * Update progress display
   * @param {number} current - Current item number (1-indexed)
   * @param {string} [clientId] - Optional current client ID
   */
  function update(current, clientId = '') {
    if (total === 0) {
      process.stdout.write(`\r[No items to process]`);
      return;
    }

    const percent = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * barWidth);
    const empty = barWidth - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const counter = `${current}/${total}`;
    const clientInfo = clientId ? ` → ${clientId}` : '';

    // Clear line and write progress
    process.stdout.write(`\r[${bar}] ${percent}% ${counter} clients${clientInfo}`);
  }

  /**
   * Complete progress and display final stats
   * @param {Object} stats - Final statistics
   * @param {number} stats.successful - Count of successful operations
   * @param {number} stats.failed - Count of failed operations
   */
  function complete(stats) {
    const duration = Math.round((Date.now() - startTime) / 1000);

    // Clear the progress line
    process.stdout.write('\r' + ' '.repeat(80) + '\r');

    // Display final summary
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('           EXECUTION COMPLETE');
    console.log('═══════════════════════════════════════════');
    console.log(`Total processed: ${total}`);
    console.log(`Successful:      ${stats.successful}`);
    console.log(`Failed:          ${stats.failed}`);
    console.log(`Duration:        ${formatDuration(duration)}`);
    console.log('═══════════════════════════════════════════');
  }

  return { update, complete };
}

/**
 * Format seconds into human-readable duration
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1m 30s")
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

module.exports = { createProgressBar, formatDuration };
```

### Integration with Rescue Process

```javascript
// rescue.js - Progress integration (after account query)
const { createProgressBar } = require('./src/ui/progress');

// ... existing code ...

const accounts = await queryClosedAccounts(recurlyClient);
console.log(`Found ${accounts.length} accounts to rescue`);

// Initialize progress bar
const progress = createProgressBar(accounts.length);

let successful = 0;
let failed = 0;

// Process accounts with progress updates
for (let i = 0; i < accounts.length; i++) {
  const account = accounts[i];
  progress.update(i + 1, account.id);

  try {
    // Story 3.x: Rescue logic
    await rescueAccount(account);
    successful++;
  } catch (error) {
    // Story 4.2: Logging
    failed++;
  }

  // Story 3.4: Confirmation interval check
}

// Display final summary
progress.complete({ successful, failed });
```

### Terminal Width Considerations

For responsive progress bar:

```javascript
/**
 * Get terminal width, with fallback for non-TTY environments
 * @returns {number} Terminal width in columns
 */
function getTerminalWidth() {
  return process.stdout.columns || 80;
}

// Adjust bar width dynamically
function calculateBarWidth() {
  const termWidth = getTerminalWidth();
  // Reserve space for: "[" + "]" + " 100% " + "1000/1000" + " clients → " + "client_id_max_20"
  // Minimum viable width: 50 characters
  const reservedChars = 50;
  return Math.max(10, Math.min(30, termWidth - reservedChars));
}
```

### Dry-Run Mode Consideration

In dry-run mode, progress should still display:

```javascript
// Prefix for dry-run mode
function update(current, clientId = '', isDryRun = false) {
  const prefix = isDryRun ? '[DRY-RUN] ' : '';
  // ... rest of implementation
}
```

### File Structure After Story 4.1

```
RecurlyRescue/
├── rescue.js                     # Updated: Progress bar integration
├── src/
│   ├── config/env.js             # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js               # Existing (Story 1.2)
│   │   ├── help.js               # Existing (Story 1.4)
│   │   └── prompt.js             # Existing (Story 1.3)
│   ├── env/environment.js        # Existing (Story 1.3)
│   ├── api/
│   │   ├── recurly-client.js     # From Story 2.1
│   │   └── accounts.js           # From Story 2.1
│   └── ui/
│       └── progress.js           # NEW: Progress display
└── test/
    ├── env.test.js               # Existing
    ├── args.test.js              # Existing
    ├── help.test.js              # Existing
    ├── rescue.test.js            # Updated (progress tests)
    ├── environment.test.js       # Existing
    ├── prompt.test.js            # Existing
    ├── recurly-client.test.js    # From Story 2.1
    ├── accounts.test.js          # From Story 2.1
    └── progress.test.js          # NEW
```

### Testing Strategy

**Unit Tests for progress.js:**

```javascript
// test/progress.test.js
const { test, mock } = require('node:test');
const assert = require('node:assert');
const { createProgressBar, formatDuration } = require('../src/ui/progress');

test('createProgressBar() requires non-negative total', (t) => {
  assert.throws(() => createProgressBar(-1), /non-negative number/);
  assert.throws(() => createProgressBar('invalid'), /non-negative number/);
});

test('createProgressBar() accepts zero total', (t) => {
  const progress = createProgressBar(0);
  assert.ok(progress);
});

test('update() calculates correct percentage', (t) => {
  // Mock process.stdout.write
  let output = '';
  const originalWrite = process.stdout.write;
  process.stdout.write = (str) => { output = str; };

  const progress = createProgressBar(100);
  progress.update(50);

  process.stdout.write = originalWrite;

  assert.ok(output.includes('50%'));
  assert.ok(output.includes('50/100'));
});

test('update() displays client ID when provided', (t) => {
  let output = '';
  const originalWrite = process.stdout.write;
  process.stdout.write = (str) => { output = str; };

  const progress = createProgressBar(10);
  progress.update(5, 'client_abc123');

  process.stdout.write = originalWrite;

  assert.ok(output.includes('client_abc123'));
});

test('formatDuration() handles seconds', (t) => {
  assert.strictEqual(formatDuration(45), '45s');
});

test('formatDuration() handles minutes and seconds', (t) => {
  assert.strictEqual(formatDuration(90), '1m 30s');
});

test('complete() displays stats correctly', (t) => {
  // Capture console.log output
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  const progress = createProgressBar(10);
  progress.complete({ successful: 8, failed: 2 });

  console.log = originalLog;

  assert.ok(logs.some(l => l.includes('Total processed: 10')));
  assert.ok(logs.some(l => l.includes('Successful:      8')));
  assert.ok(logs.some(l => l.includes('Failed:          2')));
});
```

### Edge Cases to Handle

1. **Zero accounts:** Display "No items to process" message
2. **Single account:** Bar shows 0% then 100%
3. **Very long client IDs:** Truncate to prevent line overflow
4. **Non-TTY environment:** Use simpler output format (no carriage return)
5. **Interrupted execution:** Progress state should be preserved (Story 4.3)

### Previous Story Learnings (Epic 1-3 Intelligence)

**From Epic 1:**
- JSDoc comments required for all exported functions
- Parameter validation with clear error messages
- Clean up resources in tests (restore mocked functions)
- Test concurrency issues with --test-concurrency=1 if needed

**From Story 2.1:**
- Module pattern: `src/<category>/<name>.js`
- Integration happens in rescue.js main flow
- Comprehensive unit tests + integration tests

**Code quality standards:**
- All tests must pass before commit
- No unused imports
- Error handling with descriptive messages

### Dependencies

**No new dependencies required.** Uses:
- Native `process.stdout.write` for output
- Native `process.stdout.columns` for terminal width
- Native `Date.now()` for timing

### NFR Compliance

**FR16:** System displays real-time progress bar with percentage and counter
- ✅ Visual bar with filled/empty blocks
- ✅ Percentage display
- ✅ Counter (current/total)
- ✅ Current client ID
- ✅ Real-time updates without scrolling

### References

- [Source: docs/planning-artifacts/epics.md#Story 4.1 - Progress Display]
- [Source: docs/planning-artifacts/prd.md#FR16 - Progress bar]
- [Existing: src/cli/prompt.js - Terminal interaction pattern]
- [Existing: rescue.js - Main execution flow]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 43 unit tests passing for progress.js (29 original + 7 from code review #1 + 7 from code review #2)
- All 635 tests passing (no regressions)
- Test command: `node --test --test-concurrency=1`

### Completion Notes List

**Implementation:**
- ✅ Created `src/ui/progress.js` with comprehensive progress bar functionality
- ✅ Implemented `createProgressBar(total)` factory function with validation
- ✅ Implemented `update(current, clientId)` for real-time progress display
- ✅ Implemented `complete(stats)` for final summary display with stats validation
- ✅ Implemented `formatDuration(seconds)` with hours/minutes/seconds support
- ✅ Implemented `getTerminalWidth()` with fallback for non-TTY environments
- ✅ Implemented `truncateClientId()` to prevent line overflow with long IDs
- ✅ Visual bar uses Unicode blocks (█ filled, ░ empty)
- ✅ Carriage return (\r) for in-place updates without scrolling
- ✅ Parameter validation with clear error messages (total, stats)
- ✅ JSDoc documentation for all exported functions

**Testing:**
- ✅ Created `test/progress.test.js` with 43 comprehensive tests
- ✅ Tests cover: createProgressBar validation (including NaN), update() display, complete() output/validation, formatDuration, truncateClientId, edge cases
- ✅ Mock setup/teardown for process.stdout.write, console.log, and process.stdout.isTTY
- ✅ Tests for 0 total, 1 total, large totals (10000+)
- ✅ Tests for percentage rounding accuracy
- ✅ Tests for stats validation in complete()
- ✅ Tests for long client ID truncation
- ✅ Tests for current parameter clamping (current > total, current < 0)
- ✅ Tests for TTY detection and non-TTY output suppression
- ✅ Tests for dry-run mode prefix display

**Code Review #1 Fixes (2026-01-21):**
- ✅ Fixed accounts.test.js for new Recurly API v3 client-side filtering
- ✅ Added stats parameter validation in complete()
- ✅ Implemented client ID truncation for long IDs
- ✅ Replaced magic number 80 with getTerminalWidth()
- ✅ Corrected Task 3 status (integration deferred to Epic 3)

**Integration (2026-01-21):**
- ✅ Integrated progress bar into main rescue loop in rescue.js
- ✅ Progress bar initializes after accounts are queried
- ✅ Progress updates on each client processed with client ID display
- ✅ Progress complete() called with success/fail stats at end
- ✅ Fixed rollback section using incorrect progress bar API (was passing object instead of number, was calling non-existent stop())
- ✅ Added imports for rescue modules (plan-manager, subscription-manager, execution-control)
- ✅ Full rescue loop now operational with progress display

**Code Review #2 Fixes (2026-01-21):**
- ✅ Added `current` parameter validation with clamping to [0, total] range
- ✅ Added isTTY() function for TTY detection (suppresses output in non-interactive environments)
- ✅ Implemented dry-run mode prefix via options.dryRun parameter
- ✅ Updated rescue.js to pass dryRun option to createProgressBar
- ✅ Cleaned up File List (removed unrelated accounts.js references)
- ✅ Added 7 new tests (current bounds, isTTY, non-TTY suppression, dry-run mode)

### File List

**Created:**
- src/ui/progress.js
- test/progress.test.js

**Modified:**
- rescue.js (progress bar integration, rescue loop implementation, fixed rollback progress bar API, dry-run option)
- docs/implementation-artifacts/sprint-status.yaml (status: in-progress → review)
- docs/implementation-artifacts/4-1-progress-display.md (task completion, dev record)

**Note:** Previous code review incorrectly listed accounts.js changes here. Those changes belong to Story 2.1 and have been removed from this File List.

## Change Log

- 2026-01-21: Code Review #2 - Adversarial review fixes:
  - Added `current` parameter validation in update() (clamps to valid range [0, total])
  - Added TTY detection via isTTY() - suppresses carriage return output in non-interactive environments
  - Implemented dry-run mode prefix support via options.dryRun parameter
  - Updated rescue.js to pass dryRun option to createProgressBar
  - Added 7 new tests for edge cases (current > total, current < 0, isTTY, dry-run mode)
  - Cleaned up File List (removed unrelated accounts.js references)
  - All 635 tests passing
- 2026-01-21: Task 3 Integration - Progress bar integration with rescue process:
  - Integrated createProgressBar() into main rescue loop in rescue.js
  - Progress bar initializes with accounts.length after query
  - Progress updates (current, clientId) on each processed client
  - Progress complete() called with success/failed stats
  - Fixed rollback section's incorrect progress bar API usage
  - Added rescue module imports (plan-manager, subscription-manager, execution-control)
  - Full rescue loop now operational
  - All 628 tests passing
- 2026-01-21: Code Review - Fixed issues found during adversarial review:
  - Fixed accounts.test.js to match new API implementation (client-side filtering)
  - Added stats validation to progress.js complete() method
  - Implemented client ID truncation for long IDs
  - Used getTerminalWidth() instead of magic number for line clearing
  - Added 7 new tests (NaN validation, truncation, stats validation)
  - Corrected Task 3 status (was marked [x] but integration is deferred to Epic 3)
  - Updated File List with accounts.js changes
- 2026-01-20: Implemented Story 4.1 - Progress Display module with 29 tests
