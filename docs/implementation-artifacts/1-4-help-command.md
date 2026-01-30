# Story 1.4: Help Command

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **operator**,
I want **to display usage help**,
So that **I can understand available options without reading documentation**.

## Acceptance Criteria

1. **AC1: Display help with --help flag**
   - **Given** `--help` is provided
   - **When** the script starts
   - **Then** it displays formatted help with:
     - Script description
     - Required arguments (--env, --project)
     - Optional arguments (--dry-run, --client-id, --confirm-every, --no-confirm, --rollback)
     - Usage examples
   - **And** exits with status code 0

## Tasks / Subtasks

- [x] Task 1: Create help module (AC: #1)
  - [x] 1.1: Create `src/cli/help.js` module
  - [x] 1.2: Implement `displayHelp()` function that:
    - Displays script description and purpose
    - Lists all required arguments with descriptions
    - Lists all optional arguments with descriptions and defaults
    - Shows usage examples for common scenarios
    - Uses consistent formatting (align columns, clear sections)
  - [x] 1.3: Export displayHelp function

- [x] Task 2: Integrate with rescue.js (AC: #1)
  - [x] 2.1: Update rescue.js to call displayHelp() when options.help is true
  - [x] 2.2: Ensure help displays before any other processing
  - [x] 2.3: Ensure clean exit with code 0 after displaying help
  - [x] 2.4: Remove placeholder help message from rescue.js:34

- [x] Task 3: Write tests (AC: #1)
  - [x] 3.1: Create `test/help.test.js` for help module
  - [x] 3.2: Test help content includes all required sections
  - [x] 3.3: Test help includes all argument descriptions
  - [x] 3.4: Test help includes usage examples
  - [x] 3.5: Update `test/rescue.test.js` integration tests for --help flag

## Dev Notes

### Technical Approach

The help system should be comprehensive but maintainable. Rather than duplicating argument descriptions, the help text should serve as the single source of truth for user-facing documentation.

### Help Content Structure

The help output should follow this structure:

```
Recurly Rescue Script
A CLI tool to recover subscriptions closed by dunning bot via Recurly API v3

USAGE:
  node rescue.js --env=<sandbox|production> --project=<id> [options]

REQUIRED ARGUMENTS:
  --env=<sandbox|production>     Target environment
  --project=<id>                 Recurly project identifier

OPTIONAL ARGUMENTS:
  --help                         Display this help message
  --dry-run                      Simulate without making changes
  --client-id=<id>               Target single client for testing
  --confirm-every=<n>            Pause every N clients for confirmation (default: 100)
  --no-confirm                   Run continuously without pauses
  --rollback=<file>              Restore state from previous execution file
  --resume                       Resume from last interrupted execution

EXAMPLES:
  # Test in sandbox with dry-run
  node rescue.js --env=sandbox --project=eur --dry-run

  # Rescue single client for testing
  node rescue.js --env=sandbox --project=eur --client-id=abc123

  # Full rescue with confirmations every 50 clients
  node rescue.js --env=production --project=eur --confirm-every=50

  # Continuous mode without pauses
  node rescue.js --env=production --project=eur --no-confirm

  # Rollback previous execution
  node rescue.js --env=production --rollback=./rescue-results-eur-2026-01-20.json

NOTES:
  - Production mode requires explicit confirmation before execution
  - All actions are logged with timestamps and Recurly URLs
  - State is persisted automatically for crash recovery
```

### Implementation Pattern

```javascript
// src/cli/help.js

/**
 * Display comprehensive help message
 * Exits with code 0 after display
 */
function displayHelp() {
  console.log(`
Recurly Rescue Script
A CLI tool to recover subscriptions closed by dunning bot via Recurly API v3

USAGE:
  node rescue.js --env=<sandbox|production> --project=<id> [options]

REQUIRED ARGUMENTS:
  --env=<sandbox|production>     Target environment
  --project=<id>                 Recurly project identifier

OPTIONAL ARGUMENTS:
  --help                         Display this help message
  --dry-run                      Simulate without making changes
  --client-id=<id>               Target single client for testing
  --confirm-every=<n>            Pause every N clients for confirmation (default: 100)
  --no-confirm                   Run continuously without pauses
  --rollback=<file>              Restore state from previous execution file
  --resume                       Resume from last interrupted execution

EXAMPLES:
  # Test in sandbox with dry-run
  node rescue.js --env=sandbox --project=eur --dry-run

  # Rescue single client for testing
  node rescue.js --env=sandbox --project=eur --client-id=abc123

  # Full rescue with confirmations every 50 clients
  node rescue.js --env=production --project=eur --confirm-every=50

  # Continuous mode without pauses
  node rescue.js --env=production --project=eur --no-confirm

  # Rollback previous execution
  node rescue.js --env=production --rollback=./rescue-results-eur-2026-01-20.json

NOTES:
  - Production mode requires explicit confirmation before execution
  - All actions are logged with timestamps and Recurly URLs
  - State is persisted automatically for crash recovery
`.trim());
}

module.exports = { displayHelp };
```

### Integration with rescue.js

Update rescue.js to replace the placeholder help message:

```javascript
// rescue.js (lines 32-36)
const { displayHelp } = require('./src/cli/help');

// Replace placeholder with actual help
if (options.help) {
  displayHelp();
  process.exit(0);
}
```

### Testing Strategy

```javascript
// test/help.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { displayHelp } = require('../src/cli/help');

test('displayHelp() includes script description', (t) => {
  // Capture console.log output
  // Verify "Recurly Rescue Script" is present
});

test('displayHelp() includes all required arguments', (t) => {
  // Verify --env and --project are documented
});

test('displayHelp() includes all optional arguments', (t) => {
  // Verify --help, --dry-run, --client-id, etc. are documented
});

test('displayHelp() includes usage examples', (t) => {
  // Verify examples section exists with real command examples
});
```

For integration testing with rescue.js, use child_process spawn:

```javascript
// test/rescue.test.js - add new test
test('rescue.js --help displays help and exits with code 0', async (t) => {
  const { spawn } = require('child_process');

  const proc = spawn('node', ['rescue.js', '--help']);
  let output = '';

  proc.stdout.on('data', (data) => {
    output += data.toString();
  });

  return new Promise((resolve) => {
    proc.on('close', (code) => {
      assert.strictEqual(code, 0);
      assert.ok(output.includes('Recurly Rescue Script'));
      assert.ok(output.includes('USAGE:'));
      assert.ok(output.includes('EXAMPLES:'));
      resolve();
    });
  });
});
```

### File Structure After Story 1.4

```
RecurlyRescue/
├── rescue.js                    # Updated: displayHelp() integration
├── src/
│   ├── config/
│   │   └── env.js               # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js              # Existing (Story 1.2)
│   │   ├── prompt.js            # Existing (Story 1.3)
│   │   └── help.js              # NEW: Help display
│   └── env/
│       └── environment.js       # Existing (Story 1.3)
└── test/
    ├── env.test.js              # Existing (Story 1.1)
    ├── args.test.js             # Existing (Story 1.2)
    ├── rescue.test.js           # Updated (new --help test)
    ├── environment.test.js      # Existing (Story 1.3)
    ├── prompt.test.js           # Existing (Story 1.3)
    └── help.test.js             # NEW
```

### Previous Story Learnings

**From Story 1.1 (Project Setup):**
- Use clear error messages for missing configuration
- Never log sensitive data (API keys)
- Load .env file with dotenv package

**From Story 1.2 (CLI Parsing):**
- Use KNOWN_ARGS pattern for validation
- Validate user input thoroughly (trim, check empty)
- Remove unused imports during code review
- Add edge case tests proactively
- Unknown argument detection prevents user mistakes

**From Story 1.3 (Environment Management):**
- Use async/await for interactive prompts
- Production confirmation prevents accidental executions
- Validate function parameters (throw errors for invalid values)
- Clean up timeouts in async tests
- Test concurrency: Use --test-concurrency=1 for tests that share .env file

### Git Intelligence Summary

**Recent commit (aca269a):**
- Implemented Stories 1.2 and 1.3 together
- Added comprehensive test suites (83 tests total)
- Code review fixes applied before commit
- Co-authored with Claude Opus 4.5

**File patterns established:**
- Module files: `src/<category>/<name>.js`
- Test files: `test/<name>.test.js`
- Story docs: `docs/implementation-artifacts/<story-key>.md`

**Code quality standards:**
- All tests must pass before commit
- Code review findings documented in story files
- Parameter validation required for public functions
- Unused imports removed
- Timeout cleanup in async tests

### Argument Coverage Verification

The help text must document ALL arguments defined in Story 1.2 (args.js):

**Required:**
- `--env` (sandbox|production)
- `--project` (project ID)

**Optional:**
- `--help` (this feature)
- `--dry-run` (Story 3.3)
- `--rollback` (Story 5.1)
- `--client-id` (Story 2.3)
- `--confirm-every` (Story 3.4)
- `--no-confirm` (Story 3.4)
- `--resume` (Story 4.3)

### Help Display Considerations

1. **Clarity:** Each argument description should be concise but complete
2. **Examples:** Show real-world usage patterns from User Journeys in PRD
3. **Grouping:** Separate required vs optional, group related options
4. **Formatting:** Consistent alignment, readable spacing
5. **No clutter:** Help should fit in a standard terminal window without scrolling excessively

### Testing Edge Cases

- Help should work even if .env file is missing
- Help should work with invalid argument combinations
- Help output should be testable (capture console.log)
- Integration test should verify exit code 0

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.4]
- [Source: docs/planning-artifacts/prd.md#FR26 - Display help]
- [Source: docs/planning-artifacts/prd.md#User Journeys - CLI Arguments table]
- [Existing: src/cli/args.js - All argument definitions]
- [Existing: rescue.js:33-36 - Help placeholder to replace]
- [Existing: test/rescue.test.js - Integration test pattern]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

- All 95 tests passing (node --test --test-concurrency=1)
- Unit tests for help.js: 9 tests
- Integration tests for rescue.js --help: 3 tests
- Total test count: 95 (up from 83 in Story 1.3)
- No regressions detected

### Completion Notes List

**Implementation:**
- ✅ Created `src/cli/help.js` with comprehensive `displayHelp()` function
- ✅ Help text includes all sections: USAGE, REQUIRED ARGUMENTS, OPTIONAL ARGUMENTS, EXAMPLES, NOTES
- ✅ All 9 arguments documented: --env, --project, --help, --dry-run, --client-id, --confirm-every, --no-confirm, --rollback, --resume
- ✅ Integrated displayHelp() into rescue.js (lines 14, 33-36)
- ✅ Replaced placeholder help message with actual implementation
- ✅ Help displays before any other processing (early exit pattern)
- ✅ Clean exit with code 0 after displaying help

**Testing:**
- ✅ Created test/help.test.js with 11 comprehensive unit tests (9 initial + 2 from code review)
- ✅ Tests verify all help sections, argument documentation, examples, and formatting
- ✅ Tests verify section ordering and error handling (console.log restoration)
- ✅ Added 5 integration tests to test/rescue.test.js (3 initial + 2 from code review)
- ✅ Integration tests verify --help works without .env file
- ✅ Integration tests verify exit code 0, help priority, --resume example, and .env mention
- ✅ All tests pass (99/99) with no regressions

**Code Quality:**
- ✅ Follows established patterns from Stories 1.1-1.3
- ✅ JSDoc comments for function documentation
- ✅ Consistent code style and formatting
- ✅ No unused imports
- ✅ Help content serves as single source of truth for CLI documentation

### File List

**Created:**
- src/cli/help.js
- test/help.test.js

**Modified:**
- rescue.js (added displayHelp import and integration, replaced placeholder)
- test/rescue.test.js (added 3 new --help integration tests)
- docs/implementation-artifacts/sprint-status.yaml (status updates)
- docs/implementation-artifacts/1-4-help-command.md (task completion, dev notes)

## Senior Developer Review (AI)

**Review Date:** 2026-01-20
**Reviewer:** Claude Sonnet 4.5 (Adversarial Review Mode)
**Outcome:** ✅ **Approved with fixes applied**

### Review Summary

**Initial Analysis:**
- 95 tests passing
- All acceptance criteria implemented
- Git changes match story File List (6 files)

**Issues Found:** 10 total
- 🔴 CRITICAL: 0
- 🟡 MEDIUM: 6
- 🟢 LOW: 4

### Action Items

**Fixed Automatically:**
- ✅ [M2] Added error handling with try/catch in displayHelp()
- ✅ [M3] Added test to verify section order in help output
- ✅ [M4] Added test to verify console.log restoration after error
- ✅ [M5] Added --resume example to EXAMPLES section
- ✅ [M6] Corrected JSDoc documentation (@returns, @note)
- ✅ [L3] Added .env file requirement to NOTES section
- ✅ Added 2 integration tests for --resume example and .env mention

**Not Fixed (Future Enhancement):**
- [M1] DRY violation - Help text duplicates argument descriptions (architectural improvement, requires args.js refactor)
- [L1] No version number in help (optional for MVP)
- [L2] Minor alignment inconsistencies (cosmetic)
- [L4] Commit message footer (already committed)

### Review Details

**Code Quality Improvements:**
1. Added robust error handling to prevent crashes if stdout fails
2. Improved JSDoc clarity about caller responsibilities
3. Added comprehensive test coverage for edge cases
4. Enhanced help text with .env requirements
5. Added missing --resume usage example

**Test Coverage:**
- Unit tests: 9 → 11 (+2 new tests)
- Integration tests: 3 → 5 (+2 new tests)
- Total tests: 95 → 99 (+4 tests)
- Coverage: All help sections, error handling, section ordering

**Final Validation:**
- ✅ All 99 tests passing
- ✅ All acceptance criteria satisfied
- ✅ Help displays correctly with all sections
- ✅ Exit code 0 verified
- ✅ Works without .env file
- ✅ Error handling robust

## Change Log

- 2026-01-20: Initial implementation of Story 1.4 - Help Command
- 2026-01-20: All tasks completed, 95 tests passing (12 new tests added)
- 2026-01-20: Code review fixes applied - Added error handling, improved tests, enhanced help text (99 tests passing)
