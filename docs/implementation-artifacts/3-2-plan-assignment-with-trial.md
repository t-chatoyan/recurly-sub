# Story 3.2: Plan Assignment with Trial

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **operator**,
I want **to assign the Rescue Plan with a 1-day free trial to each client**,
So that **they are re-enrolled in the subscription cycle**.

## Acceptance Criteria

### AC1: Assign Rescue Plan successfully

**Given** a client account is identified for rescue
**When** assigning the Rescue Plan
**Then** create a subscription with:
- Plan: rescue-plan-{currency}
- Trial: 1 day free
- Currency: matching client's original currency
**And** verify Recurly API returns 201 (created)
**And** log "✓ {client_id} - RESCUED - {recurly_url}"

### AC2: Handle assignment errors with retry

**Given** API returns error during assignment
**When** processing a client
**Then** retry with exponential backoff (NFR-R1, NFR-R2)
**And** log each retry attempt (NFR-R3)
**And** after max retries, mark as FAILED and continue to next client (NFR-R4, NFR-R5)
**And** log "✗ {client_id} - FAILED ({error_reason})"

## Tasks / Subtasks

- [x] Task 1: Create Subscription Assignment Module (AC: #1, #2)
  - [x] 1.1: Create `src/rescue/subscription-manager.js` module
  - [x] 1.2: Implement `assignRescuePlan(clientId, planCode, currency)` function that:
    - Creates subscription via Recurly API v3
    - Sets 1-day trial period
    - Validates API response (201 Created)
    - Returns subscription object with ID
    - Handles errors with retry logic
  - [x] 1.3: Implement `getSubscriptionPayload(clientId, planCode, currency, trialDays)` helper
  - [x] 1.4: Implement retry wrapper using exponential backoff
  - [x] 1.5: Export functions

- [x] Task 2: Recurly API Integration (AC: #1)
  - [x] 2.1: Research Recurly API v3 subscription endpoints:
    - POST /accounts/{account_code}/subscriptions
    - Required fields for subscription creation
    - Trial period configuration
    - Currency handling
  - [x] 2.2: Implement subscription creation API call
  - [x] 2.3: Parse subscription response (ID, state, trial dates)
  - [x] 2.4: Generate clickable Recurly URL for subscription
  - [x] 2.5: Handle rate limits and API errors

- [x] Task 3: Logging & Error Tracking (AC: #1, #2)
  - [x] 3.1: Implement success logging with ✓ checkbox and Recurly URL
  - [x] 3.2: Implement failure logging with ✗ checkbox and error reason
  - [x] 3.3: Log retry attempts with attempt number and reason
  - [x] 3.4: Format Recurly URL as clickable terminal link
  - [x] 3.5: Include client ID, status, and timestamp in all logs

- [x] Task 4: Error Handling (AC: #2)
  - [x] 4.1: Implement retry with exponential backoff (2s, 4s, 8s... max 30s)
  - [x] 4.2: Mark client as FAILED after max retries (NFR-R4)
  - [x] 4.3: Continue to next client without crashing (NFR-R5)
  - [x] 4.4: Distinguish retriable errors (network, 5xx) from non-retriable (4xx)
  - [x] 4.5: Handle 429 rate limit errors with proper wait

- [x] Task 5: Write Tests (AC: #1, #2)
  - [x] 5.1: Create `test/subscription-manager.test.js`
  - [x] 5.2: Test successful subscription assignment
  - [x] 5.3: Test subscription payload structure (plan, trial, currency)
  - [x] 5.4: Test Recurly URL generation
  - [x] 5.5: Test retry logic for API failures
  - [x] 5.6: Test FAILED marking after max retries
  - [x] 5.7: Test continue-on-failure behavior
  - [x] 5.8: Mock Recurly API responses

## Dev Notes

### Technical Approach

This story implements the core rescue operation: assigning the Rescue Plan to a client with a 1-day trial. It builds on Story 3.1 (plan management) and must handle failures gracefully to avoid blocking batch operations.

### Recurly API v3 - Subscription Creation

**Research Required:**
- Latest Recurly API v3 documentation for Subscriptions resource
- Trial period configuration (trial_ends_at vs trial_unit + trial_length)
- Account code vs account ID usage
- Subscription states and lifecycle

**Expected API Endpoint:**
```
POST https://v3.recurly.com/accounts/{account_code}/subscriptions
```

**Expected Request Payload:**
```json
{
  "plan_code": "4weeks-subscription-eur",
  "currency": "EUR",
  "trial_ends_at": "2026-01-21T00:00:00Z", // 1 day from now
  "account": {
    "code": "client-abc123"
  }
}
```
Note: plan_code is generated from RESCUE_PLAN_CODE env var (e.g., `${RESCUE_PLAN_CODE}-eur`)

**Expected Response (201 Created):**
```json
{
  "id": "sub_xyz789",
  "uuid": "...",
  "account": {
    "code": "client-abc123"
  },
  "plan": {
    "code": "4weeks-subscription-eur"
  },
  "state": "active",
  "trial_started_at": "2026-01-20T00:00:00Z",
  "trial_ends_at": "2026-01-21T00:00:00Z",
  "current_period_started_at": "2026-01-20T00:00:00Z",
  "current_period_ends_at": "2026-02-20T00:00:00Z"
}
```

**Note:** Actual structure may vary - verify with latest Recurly API v3 docs.

### Implementation Pattern

```javascript
// src/rescue/subscription-manager.js

const { recurlyRequest, buildRecurlyUrl } = require('../api/recurly-client');
const { withRetry } = require('../utils/retry'); // Or inline implementation

/**
 * Assign Rescue Plan to a client with 1-day trial
 * @param {string} clientId - Client account code
 * @param {string} planCode - Rescue plan code (from getRescuePlanCode(currency), uses RESCUE_PLAN_CODE from .env)
 * @param {string} currency - ISO currency code
 * @returns {Promise<Object>} Created subscription object
 * @throws {Error} If assignment fails after retries
 */
async function assignRescuePlan(clientId, planCode, currency) {
  const payload = getSubscriptionPayload(clientId, planCode, currency, 1);

  try {
    const subscription = await withRetry(async () => {
      return await recurlyRequest('POST', `/accounts/${clientId}/subscriptions`, payload);
    });

    // Success - log with checkmark
    const recurlyUrl = buildRecurlyUrl('subscription', subscription.uuid);
    console.log(`✓ ${clientId} - RESCUED - ${recurlyUrl}`);

    return subscription;
  } catch (error) {
    // Failed after retries - log with X mark
    console.error(`✗ ${clientId} - FAILED (${error.message})`);
    throw error; // Caller should handle and continue to next client
  }
}

/**
 * Build subscription creation payload
 * @param {string} clientId - Client account code
 * @param {string} planCode - Plan code
 * @param {string} currency - Currency code
 * @param {number} trialDays - Trial duration in days
 * @returns {Object} Subscription payload for Recurly API
 */
function getSubscriptionPayload(clientId, planCode, currency, trialDays) {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

  return {
    plan_code: planCode,
    currency: currency.toUpperCase(),
    trial_ends_at: trialEndsAt.toISOString(),
    account: {
      code: clientId
    }
  };
}

module.exports = { assignRescuePlan, getSubscriptionPayload };
```

### Retry Logic with Exponential Backoff

```javascript
// src/utils/retry.js (or inline in subscription-manager.js)

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts (default from .env RETRY_COUNT=3)
 * @param {number} baseDelay - Base delay in seconds (default from .env RETRY_BACKOFF_BASE=2)
 * @param {number} maxDelay - Maximum delay in seconds (default from .env RETRY_BACKOFF_MAX=30)
 * @returns {Promise<any>} Result of successful function call
 * @throws {Error} Last error if all retries exhausted
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 2, maxDelay = 30) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        // Calculate delay: 2^attempt * baseDelay, capped at maxDelay
        const delaySeconds = Math.min(
          Math.pow(2, attempt) * baseDelay,
          maxDelay
        );
        const delayMs = delaySeconds * 1000;

        console.log(`Retry attempt ${attempt}/${maxRetries} after ${delaySeconds}s - ${error.message}`);
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { withRetry };
```

### Recurly URL Generation

**Pattern for clickable terminal links:**
```javascript
// src/api/recurly-client.js (add helper)

/**
 * Build clickable Recurly URL for resource
 * @param {string} resourceType - 'subscription', 'account', 'plan'
 * @param {string} resourceId - UUID or code
 * @returns {string} Full Recurly URL
 */
function buildRecurlyUrl(resourceType, resourceId) {
  const baseUrl = 'https://app.recurly.com';
  // Adjust path based on resource type
  const paths = {
    subscription: `/subscriptions/${resourceId}`,
    account: `/accounts/${resourceId}`,
    plan: `/plans/${resourceId}`
  };
  return `${baseUrl}${paths[resourceType] || ''}`;
}
```

### Logging Standards

**Success format:**
```
✓ client-abc123 - RESCUED - https://app.recurly.com/subscriptions/xyz789
```

**Failure format:**
```
✗ client-abc123 - FAILED (API error: Invalid account state)
```

**Retry format:**
```
Retry attempt 1/3 after 2s - Connection timeout
Retry attempt 2/3 after 4s - Connection timeout
```

### Error Classification

**Retriable errors (retry with backoff):**
- Network errors (ECONNRESET, ETIMEDOUT)
- 5xx server errors
- 429 rate limit (use X-RateLimit-Reset header)

**Non-retriable errors (fail immediately):**
- 400 Bad Request (invalid payload)
- 401 Unauthorized (invalid API key)
- 404 Not Found (account doesn't exist)
- 422 Unprocessable Entity (business logic error)

### Testing Strategy

```javascript
// test/subscription-manager.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const { assignRescuePlan, getSubscriptionPayload } = require('../src/rescue/subscription-manager');

test('getSubscriptionPayload() creates correct structure', (t) => {
  const { getRescuePlanCode } = require('../src/rescue/plan-manager');
  const planCode = getRescuePlanCode('EUR');
  const payload = getSubscriptionPayload('client-123', planCode, 'EUR', 1);

  assert.strictEqual(payload.plan_code, planCode);
  assert.strictEqual(payload.currency, 'EUR');
  assert.strictEqual(payload.account.code, 'client-123');
  assert.ok(payload.trial_ends_at); // ISO date string

  // Verify trial is ~1 day from now
  const trialDate = new Date(payload.trial_ends_at);
  const now = new Date();
  const diffHours = (trialDate - now) / (1000 * 60 * 60);
  assert.ok(diffHours >= 23 && diffHours <= 25); // ~24 hours
});

test('getSubscriptionPayload() normalizes currency to uppercase', (t) => {
  const { getRescuePlanCode } = require('../src/rescue/plan-manager');
  const planCode = getRescuePlanCode('EUR');
  const payload = getSubscriptionPayload('client-123', planCode, 'eur', 1);
  assert.strictEqual(payload.currency, 'EUR');
});

test('assignRescuePlan() logs success with checkmark and URL', async (t) => {
  // Mock recurlyRequest to return successful subscription
  // Capture console.log output
  // Verify log contains: ✓, client ID, RESCUED, Recurly URL
});

test('assignRescuePlan() retries on API failure', async (t) => {
  // Mock recurlyRequest to fail twice, succeed third time
  // Verify retry logic executed
  // Verify success log after retries
});

test('assignRescuePlan() logs failure after max retries', async (t) => {
  // Mock recurlyRequest to always fail
  // Verify all retry attempts logged
  // Verify final error log with ✗ and error reason
  // Verify error is thrown
});

test('assignRescuePlan() handles 429 rate limit', async (t) => {
  // Mock API to return 429 with X-RateLimit-Reset header
  // Verify proper wait time before retry
});
```

### Integration with Story 3.1

**Usage pattern:**
```javascript
// In main rescue flow
const { findOrCreateRescuePlan } = require('./src/rescue/plan-manager'); // Story 3.1
const { assignRescuePlan } = require('./src/rescue/subscription-manager'); // Story 3.2

async function rescueClient(clientId, currency) {
  // Step 1: Ensure plan exists (Story 3.1)
  const plan = await findOrCreateRescuePlan(currency);

  // Step 2: Assign plan to client (Story 3.2)
  try {
    await assignRescuePlan(clientId, plan.code, currency);
    return { status: 'RESCUED', client: clientId };
  } catch (error) {
    // NFR-R5: Continue to next client without crashing
    return { status: 'FAILED', client: clientId, error: error.message };
  }
}
```

### File Structure After Story 3.2

```
RecurlyRescue/
├── rescue.js
├── src/
│   ├── config/
│   │   └── env.js                      # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js                     # Existing (Story 1.2)
│   │   ├── prompt.js                   # Existing (Story 1.3)
│   │   └── help.js                     # Existing (Story 1.4)
│   ├── env/
│   │   └── environment.js              # Existing (Story 1.3)
│   ├── api/
│   │   └── recurly-client.js           # Existing or updated (buildRecurlyUrl)
│   ├── utils/
│   │   └── retry.js                    # NEW: Retry logic (or inline)
│   └── rescue/
│       ├── plan-manager.js             # Existing (Story 3.1)
│       └── subscription-manager.js     # NEW: Subscription assignment
└── test/
    ├── env.test.js                     # Existing
    ├── args.test.js                    # Existing
    ├── rescue.test.js                  # Existing
    ├── environment.test.js             # Existing
    ├── prompt.test.js                  # Existing
    ├── help.test.js                    # Existing
    ├── recurly-client.test.js          # Existing or updated
    ├── plan-manager.test.js            # Existing (Story 3.1)
    ├── retry.test.js                   # NEW (if retry.js is separate)
    └── subscription-manager.test.js    # NEW
```

### Previous Story Learnings

**From Story 1.1 (Project Setup):**
- Load environment variables (RETRY_COUNT, RETRY_BACKOFF_BASE, RETRY_BACKOFF_MAX)
- Never log sensitive data
- Validate configuration exists

**From Story 1.2 (CLI Parsing):**
- Validate all inputs thoroughly
- Clear error messages for user
- Edge case testing

**From Story 1.3 (Environment Management):**
- Async/await patterns
- Parameter validation with clear errors
- Resource cleanup in tests

**From Story 1.4 (Help Command):**
- Comprehensive logging
- Error handling in all functions
- Test success and failure paths

**From Story 3.1 (Plan Management):**
- Recurly API client usage patterns
- Retry logic with exponential backoff
- Rate limit handling
- 404 vs other errors distinction

### Git Intelligence Summary

**Recent patterns:**
- Modular structure with clear separation
- Comprehensive unit and integration tests
- JSDoc comments for all public functions
- Parameter validation required
- Error handling in all async functions

**Code quality standards:**
- All tests must pass
- No unused imports
- Descriptive error messages
- Proper async/await usage
- Mock external APIs in tests

### NFR Compliance Summary

This story implements:
- **NFR-I1:** Uses Recurly API v3
- **NFR-I5:** Handles response codes (201, 4xx, 5xx, 429)
- **NFR-R1:** Retry failed API calls (max 3 retries)
- **NFR-R2:** Exponential backoff (2s base, 30s max)
- **NFR-R3:** Log each retry attempt with reason
- **NFR-R4:** Mark client as FAILED after max retries
- **NFR-R5:** Continue to next client without crashing
- **NFR-P1, NFR-P2, NFR-P3:** Rate limit handling

### Terminal Output Considerations

**Unicode support:**
- ✓ (U+2713) for success
- ✗ (U+2717) for failure
- Ensure terminal encoding supports Unicode

**Clickable URLs:**
- Most modern terminals (iTerm2, Windows Terminal, VS Code terminal) support clickable URLs
- Format: Plain URL in output will be auto-detected as clickable

### Integration with Future Stories

**Story 3.3 (Dry-Run Mode):**
- Will skip actual API call in `assignRescuePlan()`
- Should still log what WOULD happen: "[DRY-RUN] Would rescue client-123"

**Story 3.4 (Execution Control):**
- Will loop through clients calling `assignRescuePlan()` for each
- Will handle pause/continue based on confirmation intervals

**Story 4.1 (Progress Display):**
- Will update progress bar as each client is processed
- May need to suppress per-client logs during batch processing (or display separately)

**Story 4.2 (Action Logging):**
- May enhance logging format for structured log files
- Current console logging is user-facing, may need separate structured logging

**Story 4.4 (Output Generation):**
- Will collect results from `assignRescuePlan()` calls
- Will use subscription IDs and error messages for JSON output

### References

- [Source: docs/planning-artifacts/epics.md#Story 3.2]
- [Source: docs/planning-artifacts/prd.md#FR7 - Assign Rescue Plan with trial]
- [Source: docs/planning-artifacts/prd.md#FR8 - Verify API confirmation]
- [Source: docs/planning-artifacts/prd.md#FR17 - Client action logging]
- [Source: docs/planning-artifacts/prd.md#NFR-R1-R5 - Retry and error handling]
- [Source: docs/planning-artifacts/prd.md#NFR-I1, NFR-I5 - Recurly API integration]
- [Source: docs/implementation-artifacts/3-1-rescue-plan-management.md - Plan management integration]
- [External: Recurly API v3 Subscriptions documentation - https://developers.recurly.com/api/v2023-06-01/]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

- ✅ Created `src/rescue/subscription-manager.js` with full implementation
- ✅ Uses existing `logger.js` module for consistent logging (✓/✗ symbols)
- ✅ `rescueClient()` wrapper implements NFR-R5 (continue to next client)
- ✅ `isRetriableError()` classifies retriable vs non-retriable errors
- ✅ Comprehensive tests (33 tests) including integration scenarios
- ✅ Retry logic delegated to existing `recurly-client.js`

### File List

- `src/rescue/subscription-manager.js` (NEW)
- `test/subscription-manager.test.js` (NEW)
