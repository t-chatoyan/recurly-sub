# Story 1.2: CLI Argument Parsing & Validation

Status: done

## Story

As a **operator**,
I want **the script to parse and validate command-line arguments**,
So that **I can control execution behavior and catch errors early**.

## Acceptance Criteria

1. **AC1: Required --env validation**
   - **Given** the operator runs the script
   - **When** `--env` is missing
   - **Then** display "Missing required argument: --env" and exit with code 1
   - **Note:** Already implemented in Story 1.1, but needs integration with full parser

2. **AC2: Required --project validation**
   - **Given** the operator runs the script
   - **When** `--project` is missing
   - **Then** display "Missing required argument: --project" and exit with code 1

3. **AC3: --dry-run and --rollback conflict**
   - **Given** `--dry-run` and `--rollback` are both provided
   - **When** validating arguments
   - **Then** display "Cannot combine --dry-run with --rollback" and exit with code 1

4. **AC4: --confirm-every and --no-confirm conflict**
   - **Given** `--confirm-every` and `--no-confirm` are both provided
   - **When** validating arguments
   - **Then** display "Cannot use both --confirm-every and --no-confirm" and exit with code 1

5. **AC5: Successful argument parsing**
   - **Given** all required arguments are valid and no conflicts exist
   - **When** the script parses arguments
   - **Then** return a structured options object with all parsed values
   - **And** set appropriate defaults for optional arguments

## Tasks / Subtasks

- [x] Task 1: Create CLI argument parser module (AC: all)
  - [x] 1.1: Create `src/cli/args.js` module
  - [x] 1.2: Implement `parseArgs(argv)` function that parses process.argv
  - [x] 1.3: Define all supported arguments with their types:
    - `--env` (string, required): 'sandbox' | 'production'
    - `--project` (string, required): project identifier
    - `--dry-run` (boolean, optional): simulation mode
    - `--rollback` (string, optional): path to results file
    - `--confirm-every` (number, optional): pause interval
    - `--no-confirm` (boolean, optional): continuous mode
    - `--client-id` (string, optional): single client targeting
    - `--help` (boolean, optional): display help
    - `--resume` (boolean, optional): resume from state file

- [x] Task 2: Implement required argument validation (AC: #1, #2)
  - [x] 2.1: Check `--env` is present and has valid value
  - [x] 2.2: Check `--project` is present
  - [x] 2.3: Return descriptive error messages with exit code 1

- [x] Task 3: Implement conflict detection (AC: #3, #4)
  - [x] 3.1: Detect `--dry-run` + `--rollback` combination
  - [x] 3.2: Detect `--confirm-every` + `--no-confirm` combination
  - [x] 3.3: Return specific error messages for each conflict

- [x] Task 4: Implement default values (AC: #5)
  - [x] 4.1: Default `--confirm-every` to 100 when neither `--confirm-every` nor `--no-confirm` is provided
  - [x] 4.2: Default `--dry-run` to false
  - [x] 4.3: Return structured options object

- [x] Task 5: Integrate with rescue.js (AC: all)
  - [x] 5.1: Replace current inline argument parsing with `parseArgs()`
  - [x] 5.2: Maintain backward compatibility with existing config loading
  - [x] 5.3: Display parsed options summary (without sensitive data)

- [x] Task 6: Write unit tests (AC: all)
  - [x] 6.1: Create `test/args.test.js` with tests for:
    - Missing --env error
    - Missing --project error
    - --dry-run + --rollback conflict
    - --confirm-every + --no-confirm conflict
    - Valid argument combinations
    - Default value assignment
  - [x] 6.2: Update `test/rescue.test.js` to test integration

## Dev Notes

### Technical Approach

**No external dependencies** - Use native Node.js argument parsing to keep dependencies minimal.

The current `rescue.js` already has basic `--env` parsing. This story extends that pattern to handle all arguments consistently.

### Argument Specification

| Argument | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `--env` | string | Yes | - | Target environment (sandbox\|production) |
| `--project` | string | Yes | - | Recurly project identifier |
| `--dry-run` | boolean | No | false | Simulate without making changes |
| `--rollback` | string | No | - | Path to rescue-results JSON for rollback |
| `--confirm-every` | number | No | 100 | Pause every N clients |
| `--no-confirm` | boolean | No | false | Run continuously without pauses |
| `--client-id` | string | No | - | Target single client by ID |
| `--help` | boolean | No | false | Display usage help |
| `--resume` | boolean | No | false | Resume from state file |

### Argument Parsing Pattern

```javascript
// Example implementation approach
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    env: null,
    project: null,
    dryRun: false,
    rollback: null,
    confirmEvery: null,
    noConfirm: false,
    clientId: null,
    help: false,
    resume: false
  };

  for (const arg of args) {
    if (arg.startsWith('--env=')) {
      options.env = arg.split('=')[1];
    } else if (arg.startsWith('--project=')) {
      options.project = arg.split('=')[1];
    }
    // ... etc
  }

  return options;
}
```

### Validation Order

1. Check for `--help` first (exit 0 immediately if present - Story 1.4)
2. Validate required arguments (`--env`, `--project`)
3. Check for argument conflicts
4. Apply defaults
5. Return options object

### Error Message Format

Follow established pattern from Story 1.1:
```
ERROR: Missing required argument: --env
ERROR: Missing required argument: --project
ERROR: Cannot combine --dry-run with --rollback
ERROR: Cannot use both --confirm-every and --no-confirm
```

### File Structure

```
RecurlyRescue/
├── rescue.js                    # Main entry point (update)
├── src/
│   ├── config/
│   │   └── env.js               # Existing (from Story 1.1)
│   └── cli/
│       └── args.js              # NEW: Argument parser
└── test/
    ├── env.test.js              # Existing (from Story 1.1)
    ├── rescue.test.js           # Existing (update)
    └── args.test.js             # NEW: Argument parser tests
```

### Integration with Existing Code

The current `rescue.js` has inline --env parsing (lines 19-35). This will be replaced with:

```javascript
const { parseArgs } = require('./src/cli/args');

function main() {
  const options = parseArgs(process.argv);

  // --help is handled in Story 1.4

  // Load config with validated envType
  const config = loadConfig(options.env);

  // Continue with options object...
}
```

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.2]
- [Source: docs/planning-artifacts/prd.md#FR24, FR25]
- [Existing: rescue.js - current inline parsing to be replaced]
- [Existing: src/config/env.js - loadConfig integration]

## Senior Developer Review (AI)

**Review Date:** 2026-01-20
**Review Outcome:** Approved (after fixes)
**Reviewer:** Claude Opus 4.5

### Findings Summary
- **HIGH:** 1 issue (fixed)
- **MEDIUM:** 3 issues (fixed)
- **LOW:** 2 issues (fixed)

### Action Items (All Resolved)

- [x] [HIGH] `args.js:40-64` - Arguments inconnus silencieusement ignorés → Added unknown argument detection
- [x] [MEDIUM] `args.js:50-55` - --confirm-every accepte valeurs négatives/zéro → Added positive integer validation
- [x] [MEDIUM] `args.js` - --project avec whitespace accepté → Added trim() and empty check
- [x] [MEDIUM] `test/args.test.js` - Tests manquants pour edge cases → Added 6 new edge case tests
- [x] [LOW] `args.js` - Arguments dupliqués silencieusement écrasés → Documented as expected behavior
- [x] [LOW] `test/rescue.test.js:8` - Import spawn inutilisé → Removed unused import

### Fixes Applied
1. **args.js** - Added `KNOWN_ARGS` list and `isKnownArg()` function to detect unknown arguments
2. **args.js** - Added validation for --confirm-every > 0 (must be positive)
3. **args.js** - Added trim() and empty check for --project value
4. **test/args.test.js** - Added 6 new tests: unknown args, typos, confirm-every=0, negative values, whitespace project
5. **test/rescue.test.js** - Removed unused `spawn` import

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 61 tests passing (node --test)
- Unit tests for args.js: 27 tests (6 new from code review)
- Integration tests for rescue.js: 19 tests
- Existing env.js tests: 16 tests

### Completion Notes List

- Created `src/cli/args.js` module with `parseArgs()` function
- Implemented native Node.js argument parsing (no external dependencies)
- Validated required arguments: --env and --project
- Implemented conflict detection: --dry-run + --rollback, --confirm-every + --no-confirm
- Applied default values: --confirm-every=100, --dry-run=false
- Integrated with rescue.js, replacing inline parsing
- Added options summary display (without sensitive data)
- All 5 acceptance criteria validated with tests
- Code review findings addressed: unknown args detection, positive confirm-every, project trim

### File List

**Created:**
- src/cli/args.js
- test/args.test.js

**Modified:**
- rescue.js (replaced inline arg parsing with parseArgs())
- test/rescue.test.js (added --project tests, conflict tests, options display tests, removed unused import)

### Change Log

- 2026-01-20: Initial implementation of Story 1.2 - CLI Argument Parsing & Validation
- 2026-01-20: Code review fixes - unknown args detection, positive confirm-every, project trim validation
