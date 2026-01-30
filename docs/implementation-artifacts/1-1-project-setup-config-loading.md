# Story 1.1: Project Setup & Config Loading

Status: done

## Story

As a **operator**,
I want **the script to load API credentials from a .env file**,
So that **I can securely configure the tool without hardcoding secrets**.

## Acceptance Criteria

1. **AC1: Successful .env loading**
   - **Given** a `.env` file exists with `RECURLY_SANDBOX_API_KEY` and/or `RECURLY_PRODUCTION_API_KEY`
   - **When** the script starts
   - **Then** it loads the appropriate API key based on the `--env` argument
   - **And** validates the key is not empty
   - **And** never logs or displays the API key value

2. **AC2: Missing .env handling**
   - **Given** no `.env` file exists or required key is missing
   - **When** the script starts
   - **Then** it displays a clear error message indicating which variable is missing
   - **And** exits with non-zero status code (exit code 1)

3. **AC3: .env file in .gitignore**
   - **Given** the project has a `.gitignore` file
   - **When** the project is initialized
   - **Then** `.env` is listed in `.gitignore` to prevent accidental commits

## Tasks / Subtasks

- [x] Task 1: Initialize Node.js project (AC: all)
  - [x] 1.1: Create `package.json` with project metadata
  - [x] 1.2: Add `.gitignore` with `.env`, `node_modules/`, and output files patterns
  - [x] 1.3: Create `.env.example` as documentation template

- [x] Task 2: Implement .env loading with dotenv (AC: #1, #2)
  - [x] 2.1: Install `dotenv` package as dependency
  - [x] 2.2: Create `src/config/env.js` module for centralized config loading
  - [x] 2.3: Implement `loadConfig(envType)` function that:
    - Calls `dotenv.config()` with error handling
    - Validates required variables based on `envType` (sandbox|production)
    - Returns config object or throws descriptive error
  - [x] 2.4: Implement key validation (non-empty string check)

- [x] Task 3: Create main entry point with config loading (AC: #1, #2)
  - [x] 3.1: Create `rescue.js` as main entry point
  - [x] 3.2: Import and call `loadConfig()` at startup
  - [x] 3.3: Handle config errors with user-friendly messages and exit(1)

- [x] Task 4: Security validation (AC: #1)
  - [x] 4.1: Ensure API key is never logged (no console.log of key value)
  - [x] 4.2: Verify key is stored only in memory, not written to any file

## Dev Notes

### Technical Stack
- **Runtime:** Node.js (LTS recommended: v20.x or v22.x)
- **Package Manager:** npm
- **Key Dependency:** `dotenv` v17.x

### File Structure (to create)
```
RecurlyRescue/
├── rescue.js           # Main entry point
├── src/
│   └── config/
│       └── env.js      # Environment configuration module
├── test/
│   ├── env.test.js     # Unit tests for env.js
│   └── rescue.test.js  # Integration tests for rescue.js
├── package.json
├── package-lock.json
├── .env                # Actual credentials (gitignored)
├── .env.example        # Template for documentation
└── .gitignore
```

### Required Environment Variables
```env
# .env.example - Copy to .env and fill with real values
RECURLY_SANDBOX_API_KEY=your-sandbox-api-key-here
RECURLY_PRODUCTION_API_KEY=your-production-api-key-here

# Optional (with defaults)
RETRY_COUNT=3
RETRY_BACKOFF_BASE=2
RETRY_BACKOFF_MAX=30
```

### Security Requirements (NFR-S1 to NFR-S4)
- **NFR-S1:** API credentials ONLY from `.env` file - NEVER hardcode
- **NFR-S2:** `.env` MUST be in `.gitignore` - verify before first commit
- **NFR-S3:** Validate API key presence BEFORE any API call
- **NFR-S4:** NEVER log or display API key values - mask if needed for debug

### Error Messages Format
```
ERROR: Missing required argument: --env
ERROR: Invalid --env value. Must be 'sandbox' or 'production'
ERROR: .env file not found. Copy .env.example to .env and fill with your credentials.
ERROR: Missing required environment variable: RECURLY_SANDBOX_API_KEY
ERROR: Invalid RETRY_COUNT: 'abc' is not a valid integer
```

### Project Structure Notes

- This is a **greenfield project** - no existing code to integrate with
- CLI tool (single file entry point + src/ modules)
- No build step required (pure Node.js)
- CommonJS modules (`require`/`module.exports`)

### References

- [Source: docs/planning-artifacts/prd.md#Security & Credentials]
- [Source: docs/planning-artifacts/prd.md#Configuration Summary (.env)]
- [Source: docs/planning-artifacts/prd.md#NFR-S1 to NFR-S4]
- [Source: docs/planning-artifacts/epics.md#Story 1.1]
- [External: dotenv documentation - https://github.com/motdotla/dotenv]

## Senior Developer Review (AI)

**Review Date:** 2026-01-20
**Review Outcome:** Approved (after fixes)
**Reviewer:** Claude Opus 4.5

### Findings Summary
- **HIGH:** 1 issue (fixed)
- **MEDIUM:** 4 issues (fixed)
- **LOW:** 2 issues (fixed)

### Action Items (All Resolved)

- [x] [HIGH] `rescue.js:22` - Make --env required instead of silently defaulting to sandbox
- [x] [MEDIUM] `src/config/env.js:47-49` - Add parseInt NaN validation for retry config
- [x] [MEDIUM] `test/env.test.js:88-103` - Replace placeholder test with real console spy
- [x] [MEDIUM] Add integration tests for rescue.js CLI behavior
- [x] [MEDIUM] Add package-lock.json to File List documentation
- [x] [LOW] `src/config/env.js:32-34` - Add envType validation
- [x] [LOW] Configure dotenv with quiet mode to suppress tips

### Fixes Applied
1. **rescue.js** - Added required --env validation with helpful error message and usage hint
2. **src/config/env.js** - Added `parseIntEnv()` helper with NaN validation, envType validation, quiet mode
3. **test/env.test.js** - Improved API key logging test with console.log capture, added envType and retry validation tests
4. **test/rescue.test.js** - New file with CLI integration tests (7 tests)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 23 tests passing (node --test)
- Manual validation of error scenarios completed
- Code review findings addressed

### Completion Notes List

- Implemented complete project initialization with package.json, .gitignore, .env.example
- Created src/config/env.js module with loadConfig() function with robust validation
- Implemented robust error handling for missing .env file and missing/empty API keys
- Created rescue.js main entry point with required --env argument validation
- All acceptance criteria validated:
  - AC1: .env loads correctly, validates keys, never logs API key value
  - AC2: Clear error messages with exit(1) for missing .env or keys
  - AC3: .env is in .gitignore
- Security requirements NFR-S1 to NFR-S4 all satisfied
- 23 unit and integration tests covering all acceptance criteria and edge cases
- Code review findings addressed: envType validation, parseInt NaN handling, required --env

### File List

**Created:**
- package.json
- package-lock.json
- .gitignore
- .env.example
- src/config/env.js
- rescue.js
- test/env.test.js
- test/rescue.test.js

**Modified:**
- package.json (by npm install - added dotenv dependency)

### Change Log

- 2026-01-20: Initial implementation of Story 1.1 - Project Setup & Config Loading
- 2026-01-20: Code review fixes - added envType validation, parseInt NaN handling, required --env, integration tests
