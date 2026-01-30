# Story 3.1: Rescue Plan Management

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **operator**,
I want **the system to check and create the Rescue Plan if needed**,
So that **I can assign it to affected clients**.

## Acceptance Criteria

### AC1: Check for existing Rescue Plan

**Given** the rescue process starts for a project with currency EUR
**When** checking for Rescue Plan
**Then** query Recurly API for plan with code from getRescuePlanCode('EUR') (uses RESCUE_PLAN_CODE from .env)
**And** if exists, use it for assignments

### AC2: Create Rescue Plan if missing

**Given** no Rescue Plan exists for the target currency
**When** the rescue process starts
**Then** create a new plan with:
- Code: "rescue-plan-{currency}"
- Name: "Rescue Plan ({currency})"
- Currency: matching the project currency
- Price: 0 (or matching original plan price)
**And** log "Created Rescue Plan: rescue-plan-{currency}"

## Tasks / Subtasks

- [x] Task 1: Create Rescue Plan Management Module (AC: #1, #2)
  - [x] 1.1: Create `src/rescue/plan-manager.js` module
  - [x] 1.2: Implement `findOrCreateRescuePlan(currency)` function that:
    - Queries Recurly API v3 for existing plan with code "rescue-plan-{currency}"
    - Returns plan object if found
    - Creates new plan if not found with correct structure
    - Logs plan creation event
    - Handles API errors with retry logic (NFR-R1, NFR-R2, NFR-R3)
  - [x] 1.3: Implement `getRescuePlanCode(currency)` helper to generate plan code
  - [x] 1.4: Implement `createRescuePlan(currency)` helper for plan creation
  - [x] 1.5: Export functions

- [x] Task 2: Recurly API Integration (AC: #1, #2)
  - [x] 2.1: Research Recurly API v3 plan endpoints:
    - GET /plans/{plan_code} to check existence
    - POST /plans to create new plan
    - Required fields for plan creation
    - Authentication headers
  - [x] 2.2: Implement API calls with proper error handling
  - [x] 2.3: Parse API responses correctly
  - [x] 2.4: Handle 404 (not found) vs 200 (exists) responses
  - [x] 2.5: Respect rate limits (NFR-P1, NFR-P2, NFR-P3)

- [x] Task 3: Error Handling & Retry Logic (AC: #2)
  - [x] 3.1: Implement retry with exponential backoff for API failures
  - [x] 3.2: Log each retry attempt with reason (NFR-R3)
  - [x] 3.3: Handle 429 rate limit errors specifically
  - [x] 3.4: Throw clear error after max retries exceeded
  - [x] 3.5: Test error scenarios thoroughly

- [x] Task 4: Write Tests (AC: #1, #2)
  - [x] 4.1: Create `test/plan-manager.test.js`
  - [x] 4.2: Test finding existing plan successfully
  - [x] 4.3: Test creating plan when not found
  - [x] 4.4: Test plan code generation for different currencies
  - [x] 4.5: Test API error handling and retries
  - [x] 4.6: Test rate limit handling
  - [x] 4.7: Mock Recurly API responses appropriately

## Dev Notes

### Technical Approach

This story creates the foundation for rescue operations by ensuring a valid Rescue Plan exists before processing clients. The plan manager should be reusable across different currencies and projects.

### Recurly API v3 - Plan Management

**Research Required:**
- Latest Recurly API v3 documentation for Plans resource
- Plan creation required fields and validation rules
- Currency handling in Recurly (ISO currency codes)
- Plan pricing structure (setup fees, unit amount, billing cycles)

**Expected API Endpoints:**
```
GET https://v3.recurly.com/plans/{plan_code}
POST https://v3.recurly.com/plans
```

**Expected Plan Structure:**
```json
{
  "code": "4weeks-subscription-eur",
  "name": "Rescue Plan (EUR)",
  "currencies": [
    {
      "currency": "EUR",
      "setup_fee": 0,
      "unit_amount": 0
    }
  ]
}
```
Note: Plan code is generated from RESCUE_PLAN_CODE env var + currency (e.g., `${RESCUE_PLAN_CODE}-eur`)

**Note:** Actual structure may vary - verify with latest Recurly API v3 docs.

### Implementation Pattern

```javascript
// src/rescue/plan-manager.js

const { recurlyRequest } = require('../api/recurly-client'); // Assuming client exists or needs creation

/**
 * Find or create a Rescue Plan for the given currency
 * @param {string} currency - ISO currency code (e.g., 'EUR', 'USD')
 * @returns {Promise<Object>} Plan object from Recurly API
 * @throws {Error} If plan cannot be found or created after retries
 */
async function findOrCreateRescuePlan(currency) {
  const planCode = getRescuePlanCode(currency);

  try {
    // Try to find existing plan
    const plan = await recurlyRequest('GET', `/plans/${planCode}`);
    console.log(`Found existing Rescue Plan: ${planCode}`);
    return plan;
  } catch (error) {
    if (error.statusCode === 404) {
      // Plan doesn't exist, create it
      console.log(`Rescue Plan not found, creating: ${planCode}`);
      return await createRescuePlan(currency);
    }
    // Other errors - let retry logic handle
    throw error;
  }
}

/**
 * Generate rescue plan code for currency
 * @param {string} currency - ISO currency code
 * @returns {string} Plan code (e.g., '4weeks-subscription-eur' from RESCUE_PLAN_CODE env var)
 */
function getRescuePlanCode() {
  const baseCode = process.env.RESCUE_PLAN_CODE || '4weeks-subscription';
  return `${baseCode}`;
}

/**
 * Create a new Rescue Plan via Recurly API
 * @param {string} currency - ISO currency code
 * @returns {Promise<Object>} Created plan object
 */
async function createRescuePlan(currency) {
  const planCode = getRescuePlanCode(currency);
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

module.exports = { findOrCreateRescuePlan, getRescuePlanCode, createRescuePlan };
```

### Recurly API Client Pattern

**Note:** This story may require creating a reusable Recurly API client if it doesn't exist yet. Consider:

```javascript
// src/api/recurly-client.js (if needed)

const https = require('https');
const { getApiKey } = require('../config/env'); // From Story 1.1

/**
 * Make authenticated request to Recurly API v3
 * Includes retry logic and rate limit handling
 */
async function recurlyRequest(method, path, data = null, retryCount = 0) {
  // Implementation with:
  // - Authentication header
  // - Retry with exponential backoff
  // - Rate limit handling
  // - Error parsing
}

module.exports = { recurlyRequest };
```

### Error Handling & Retry Strategy

Following NFR-R1, NFR-R2, NFR-R3:
- **Max retries:** 3 (configurable from .env: RETRY_COUNT=3)
- **Backoff base:** 2s (from .env: RETRY_BACKOFF_BASE=2)
- **Backoff max:** 30s (from .env: RETRY_BACKOFF_MAX=30)
- **Retry sequence:** 2s → 4s → 8s (up to 30s max)

**Retry Logic:**
```javascript
async function withRetry(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = Math.min(
          Math.pow(2, attempt) * 1000, // 2^attempt seconds
          30000 // max 30s
        );
        console.log(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms - ${error.message}`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
```

### Rate Limit Handling

Following NFR-P1, NFR-P2, NFR-P3:
- Monitor `X-RateLimit-Remaining` header
- If remaining < threshold (e.g., 10), add delay
- Handle 429 responses with `X-RateLimit-Reset` header
- Wait until reset time before retry

### Testing Strategy

```javascript
// test/plan-manager.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const { findOrCreateRescuePlan, getRescuePlanCode, createRescuePlan } = require('../src/rescue/plan-manager');

test('getRescuePlanCode() generates correct code for EUR', (t) => {
  // Uses RESCUE_PLAN_CODE from .env (default: '4weeks-subscription')
  assert.strictEqual(getRescuePlanCode('EUR'), '4weeks-subscription-eur');
});

test('getRescuePlanCode() handles lowercase input', (t) => {
  assert.strictEqual(getRescuePlanCode('usd'), 'rescue-plan-usd');
});

test('getRescuePlanCode() throws for invalid currency', (t) => {
  assert.throws(() => getRescuePlanCode(''), /Currency must be a non-empty string/);
  assert.throws(() => getRescuePlanCode(null), /Currency must be a non-empty string/);
});

test('findOrCreateRescuePlan() returns existing plan if found', async (t) => {
  // Mock API to return existing plan
  // Verify no creation API call made
});

test('findOrCreateRescuePlan() creates plan if not found (404)', async (t) => {
  // Mock API to return 404, then successful creation
  // Verify creation API called with correct data
  // Verify log message includes plan code
});

test('findOrCreateRescuePlan() retries on API errors', async (t) => {
  // Mock API to fail twice, succeed third time
  // Verify retry logic executed
  // Verify retry logs printed
});

test('createRescuePlan() creates plan with correct structure', async (t) => {
  // Mock API
  // Verify plan data includes: code, name, currencies with setup_fee=0, unit_amount=0
});
```

### File Structure After Story 3.1

```
RecurlyRescue/
├── rescue.js
├── src/
│   ├── config/
│   │   └── env.js                  # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js                 # Existing (Story 1.2)
│   │   ├── prompt.js               # Existing (Story 1.3)
│   │   └── help.js                 # Existing (Story 1.4)
│   ├── env/
│   │   └── environment.js          # Existing (Story 1.3)
│   ├── api/
│   │   └── recurly-client.js       # NEW or EXISTING: Reusable Recurly API client
│   └── rescue/
│       └── plan-manager.js         # NEW: Rescue Plan management
└── test/
    ├── env.test.js                 # Existing
    ├── args.test.js                # Existing
    ├── rescue.test.js              # Existing
    ├── environment.test.js         # Existing
    ├── prompt.test.js              # Existing
    ├── help.test.js                # Existing
    ├── recurly-client.test.js      # NEW or EXISTING
    └── plan-manager.test.js        # NEW
```

### Previous Story Learnings

**From Story 1.1 (Project Setup):**
- Load environment variables with dotenv
- Never log sensitive data (API keys)
- Validate required configuration exists

**From Story 1.2 (CLI Parsing):**
- Validate user input thoroughly
- Use clear error messages
- Add edge case tests proactively

**From Story 1.3 (Environment Management):**
- Use async/await for async operations
- Validate function parameters (throw errors for invalid values)
- Clean up resources in tests

**From Story 1.4 (Help Command):**
- Clear, comprehensive documentation
- Error handling in output functions
- Test both success and error paths

### Git Intelligence Summary

**Recent patterns from commits:**
- Modular structure: `src/<category>/<name>.js`
- Comprehensive testing: Unit + integration tests
- Code review before commit
- Parameter validation required
- JSDoc comments for public functions

**Code quality standards:**
- All tests must pass
- No unused imports
- Clear error messages
- Async/await patterns
- Proper resource cleanup

### Recurly API Integration Considerations

**Authentication:**
- Use API key from .env (RECURLY_SANDBOX_API_KEY or RECURLY_PRODUCTION_API_KEY)
- Send as Bearer token in Authorization header
- Format: `Authorization: Basic {base64(api_key)}`

**API Versioning:**
- Use Recurly API v3 explicitly
- Base URL: `https://v3.recurly.com`
- Content-Type: `application/json`
- Accept: `application/vnd.recurly.v2023-06-01+json` (or latest version)

**Error Response Structure:**
```json
{
  "error": {
    "type": "validation",
    "message": "Plan code already exists",
    "params": [...]
  }
}
```

### Currency Handling

**Supported currencies in this story:**
- EUR (primary use case from PRD)
- Any ISO currency code for future flexibility

**Currency normalization:**
- Always convert to uppercase for API calls
- Always convert to lowercase for plan codes
- Validate currency format (3-letter ISO code)

### Integration with Future Stories

**Story 3.2 (Plan Assignment):**
- Will use `findOrCreateRescuePlan()` before assigning to clients
- Plan object returned contains all data needed for subscription creation

**Story 3.3 (Dry-Run Mode):**
- May need to skip actual plan creation in dry-run
- But should still check for plan existence

### NFR Compliance Summary

This story implements:
- **NFR-I1:** Uses Recurly API v3
- **NFR-I5:** Handles response codes (200/201, 404, 429, 5xx)
- **NFR-R1:** Retry failed API calls (max 3 retries)
- **NFR-R2:** Exponential backoff (2s base, 30s max)
- **NFR-R3:** Log each retry attempt
- **NFR-P1, NFR-P2, NFR-P3:** Rate limit monitoring and handling

### References

- [Source: docs/planning-artifacts/epics.md#Story 3.1]
- [Source: docs/planning-artifacts/prd.md#FR5 - Check Rescue Plan exists]
- [Source: docs/planning-artifacts/prd.md#FR6 - Create Rescue Plan if needed]
- [Source: docs/planning-artifacts/prd.md#NFR-I1 - Recurly API v3]
- [Source: docs/planning-artifacts/prd.md#NFR-R1-R5 - Retry and error handling]
- [Source: docs/planning-artifacts/prd.md#NFR-P1-P3 - Rate limiting]
- [External: Recurly API v3 Plans documentation - https://developers.recurly.com/api/v2023-06-01/]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

- ✅ Created `src/rescue/plan-manager.js` with full implementation
- ✅ All functions implement client-based API calls leveraging existing `recurly-client.js`
- ✅ Error handling for 404 (plan not found) vs other API errors
- ✅ Comprehensive tests (34 tests) covering all scenarios
- ✅ Retry and rate limit logic delegated to existing `recurly-client.js`

### File List

- `src/rescue/plan-manager.js` (NEW)
- `test/plan-manager.test.js` (NEW)
