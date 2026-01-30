# Story 1.3: Environment Management

Status: done

## Story

As a **operator**,
I want **to target sandbox or production environments explicitly**,
So that **I can test safely before running on real data**.

## Acceptance Criteria

1. **AC1: Sandbox environment targeting**
   - **Given** `--env=sandbox` is provided
   - **When** the script initializes
   - **Then** it uses `RECURLY_SANDBOX_API_KEY`
   - **And** connects to Recurly sandbox API

2. **AC2: Production environment targeting with confirmation**
   - **Given** `--env=production` is provided
   - **When** the script initializes
   - **Then** it uses `RECURLY_PRODUCTION_API_KEY`
   - **And** displays a confirmation prompt: "You are about to run in PRODUCTION. Continue? (y/n)"
   - **And** only proceeds if user confirms with 'y'
   - **And** exits gracefully with code 0 if user declines with 'n'

3. **AC3: Invalid environment rejection**
   - **Given** `--env` has invalid value (not sandbox or production)
   - **When** validating arguments
   - **Then** display "Invalid --env value. Must be 'sandbox' or 'production'" and exit with code 1
   - **Note:** Already implemented in Story 1.2 in `args.js`

## Tasks / Subtasks

- [x] Task 1: Create environment module (AC: #1, #2)
  - [x] 1.1: Create `src/env/environment.js` module
  - [x] 1.2: Implement `initEnvironment(envType)` function that:
    - Returns environment configuration object
    - Sets API base URL for sandbox vs production
  - [x] 1.3: Export environment constants (API URLs, environment names)

- [x] Task 2: Implement production confirmation prompt (AC: #2)
  - [x] 2.1: Create `src/cli/prompt.js` module for user interaction
  - [x] 2.2: Implement `confirmProduction()` async function that:
    - Displays warning message with environment name
    - Reads user input from stdin
    - Returns true for 'y'/'Y', false otherwise
  - [x] 2.3: Integrate prompt into rescue.js main flow

- [x] Task 3: Integrate with existing code (AC: all)
  - [x] 3.1: Update `rescue.js` to call `initEnvironment()` after config loading
  - [x] 3.2: Add production confirmation check before proceeding
  - [x] 3.3: Display environment info in startup output
  - [x] 3.4: Pass environment config to future API modules (placeholder)

- [x] Task 4: Write tests (AC: all)
  - [x] 4.1: Create `test/environment.test.js` for environment module
  - [x] 4.2: Create `test/prompt.test.js` for prompt module (mock stdin)
  - [x] 4.3: Update `test/rescue.test.js` for integration tests

## Dev Notes

### Technical Approach

**Key insight:** The production confirmation prompt needs async/await for stdin reading. This requires making `main()` async.

### Recurly API URLs

| Environment | API Base URL |
|-------------|--------------|
| Sandbox | `https://v3.recurly.com` (same endpoint, different API key) |
| Production | `https://v3.recurly.com` (same endpoint, different API key) |

**Note:** Recurly uses the same API endpoint for both environments. The API key determines which environment is accessed.

### Environment Configuration Object

```javascript
// src/env/environment.js
function initEnvironment(envType) {
  return {
    name: envType,
    isProduction: envType === 'production',
    apiBaseUrl: 'https://v3.recurly.com',
    // API key is NOT stored here - loaded separately via loadConfig()
  };
}
```

### Production Confirmation Prompt Pattern

```javascript
// src/cli/prompt.js
const readline = require('readline');

async function confirmProduction() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n⚠️  WARNING: PRODUCTION ENVIRONMENT');
    rl.question('You are about to run in PRODUCTION. Continue? (y/n): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
```

### Integration with rescue.js

```javascript
// rescue.js (updated flow)
const { parseArgs } = require('./src/cli/args');
const { loadConfig } = require('./src/config/env');
const { initEnvironment } = require('./src/env/environment');
const { confirmProduction } = require('./src/cli/prompt');

async function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    // Story 1.4
    process.exit(0);
  }

  const config = loadConfig(options.env);
  const environment = initEnvironment(options.env);

  // Production confirmation (FR29: prevent accidental mixing)
  if (environment.isProduction) {
    const confirmed = await confirmProduction();
    if (!confirmed) {
      console.log('Operation cancelled by user.');
      process.exit(0);
    }
  }

  // Continue with rescue logic...
}

main().catch(err => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
```

### Testing the Prompt

Testing stdin interaction requires mocking. Use Node.js test runner's mock capabilities:

```javascript
// test/prompt.test.js
const { mock } = require('node:test');

// Mock readline to simulate user input
// Test cases:
// - User enters 'y' → returns true
// - User enters 'Y' → returns true
// - User enters 'n' → returns false
// - User enters 'N' → returns false
// - User enters anything else → returns false
```

### File Structure After Story 1.3

```
RecurlyRescue/
├── rescue.js                    # Updated: async main(), production check
├── src/
│   ├── config/
│   │   └── env.js               # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js              # Existing (Story 1.2)
│   │   └── prompt.js            # NEW: User prompts
│   └── env/
│       └── environment.js       # NEW: Environment configuration
└── test/
    ├── env.test.js              # Existing (Story 1.1)
    ├── args.test.js             # Existing (Story 1.2)
    ├── rescue.test.js           # Updated
    ├── environment.test.js      # NEW
    └── prompt.test.js           # NEW
```

### Previous Story Learnings (from Story 1.2)

- Use `KNOWN_ARGS` pattern for argument validation
- Always validate user input (trim whitespace, check for empty)
- Remove unused imports during code review
- Add edge case tests proactively

### Security Considerations (FR29)

The production confirmation serves as a safety gate to prevent:
- Accidental production execution when testing
- Copy-paste errors with wrong --env value
- Muscle memory mistakes

### Error Messages Format

Follow established pattern:
```
⚠️  WARNING: PRODUCTION ENVIRONMENT
You are about to run in PRODUCTION. Continue? (y/n): n
Operation cancelled by user.
```

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.3]
- [Source: docs/planning-artifacts/prd.md#FR27, FR28, FR29]
- [Source: docs/planning-artifacts/prd.md#Gestion des Environnements]
- [Existing: src/cli/args.js - --env validation already done]
- [Existing: src/config/env.js - loadConfig() returns envType]
- [Existing: rescue.js - main entry point to update]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 80 tests passing (node --test --test-concurrency=1)
- Unit tests for environment.js: 8 tests
- Unit tests for prompt.js: 9 tests
- Integration tests for rescue.js: 22 tests (3 new for Story 1.3)
- Existing env.js tests: 16 tests
- Existing args.js tests: 27 tests

### Completion Notes List

- Created `src/env/environment.js` with `initEnvironment()` function
- Exports `ENVIRONMENT_NAMES` and `API_BASE_URL` constants
- Created `src/cli/prompt.js` with async `confirmProduction()` function
- Uses Node.js readline module for stdin interaction
- Updated `rescue.js` to async main() with production confirmation flow
- Added environment info display in startup output
- Tests use readline mocking for prompt testing
- Integration tests use spawn with stdin for production confirmation tests
- Note: Tests require --test-concurrency=1 due to shared .env file

## File List

**Created:**
- src/env/environment.js
- src/cli/prompt.js
- test/environment.test.js
- test/prompt.test.js

**Modified:**
- rescue.js (async main, environment integration, production confirmation)
- test/rescue.test.js (spawn import, production tests, environment display test)
- docs/implementation-artifacts/sprint-status.yaml (status updates)

## Change Log

- 2026-01-20: Initial implementation of Story 1.3 - Environment Management
- 2026-01-20: Code review fixes - envType validation, unused imports, timeout cleanup

## Senior Developer Review (AI)

**Review Date:** 2026-01-20
**Review Outcome:** Approved (after fixes)
**Reviewer:** Claude Opus 4.5

### Findings Summary
- **HIGH:** 1 issue (fixed)
- **MEDIUM:** 4 issues (3 fixed, 1 deferred - M4 console.log hardcoded is acceptable for current requirements)
- **LOW:** 2 issues (fixed)

### Action Items (All Resolved)

- [x] [HIGH] `environment.js:23` - Pas de validation du paramètre envType → Added validation with error throwing
- [x] [MEDIUM] `prompt.test.js:8` - Import `mock` inutilisé → Removed unused import
- [x] [MEDIUM] `rescue.test.js:105-109,148-152` - Timeouts non nettoyés → Added clearTimeout() calls
- [ ] [MEDIUM-DEFERRED] `prompt.js:23` - Console.log hardcodé → Acceptable for FR29 requirements
- [x] [LOW] `sprint-status.yaml` - Non listé dans File List → Added to File List
- [x] [LOW] `prompt.test.js:109-125` - Duplication de mock setup → Refactored to use mockReadline()

### Fixes Applied
1. **environment.js** - Added envType validation that throws Error for invalid values
2. **environment.test.js** - Added 3 new tests for invalid/undefined/null envType
3. **prompt.test.js** - Removed unused `mock` import, refactored close() test
4. **rescue.test.js** - Added clearTimeout() in close/error handlers for both production tests
