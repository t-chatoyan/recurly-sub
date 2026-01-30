# Story 2.1: Query Closed Accounts from Recurly

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **operator**,
I want **to retrieve all accounts closed by the dunning bot within a date range**,
So that **I can identify all clients needing rescue**.

## Acceptance Criteria

1. **AC1: Query Recurly API for closed accounts**
   - **Given** valid API credentials and --project is specified
   - **When** the script queries Recurly API v3
   - **Then** it retrieves all accounts with state "closed" by dunning
   - **And** filters to accounts closed between 16/11/2025 and 20/01/2026
   - **And** handles pagination correctly to retrieve ALL results
   - **And** respects rate limits by monitoring X-RateLimit-Remaining header

2. **AC2: Handle rate limiting**
   - **Given** API returns 429 (rate limit exceeded)
   - **When** processing the query
   - **Then** wait according to X-RateLimit-Reset header
   - **And** retry the request automatically

3. **AC3: Robust error handling with retries**
   - **Given** API returns error (4xx/5xx)
   - **When** processing the query
   - **Then** retry with exponential backoff (2s, 4s, 8s... up to 30s)
   - **And** after max retries, display error and exit

## Tasks / Subtasks

- [x] Task 1: Create Recurly API client module (AC: #1, #2, #3)
  - [x] 1.1: Create `src/api/recurly-client.js` module
  - [x] 1.2: Implement authentication with API key from environment
  - [x] 1.3: Implement rate limit monitoring (X-RateLimit-Remaining, X-RateLimit-Reset)
  - [x] 1.4: Implement exponential backoff retry logic (2s base, 30s max, 3 retries default)
  - [x] 1.5: Implement 429 handling with X-RateLimit-Reset wait
  - [x] 1.6: Export client creation function

- [x] Task 2: Create account query module (AC: #1)
  - [x] 2.1: Create `src/api/accounts.js` module
  - [x] 2.2: Implement `queryClosedAccounts(client, options)` function
  - [x] 2.3: Implement date range filtering (16/11/2025 - 20/01/2026)
  - [x] 2.4: Implement pagination handling (cursor/offset pattern)
  - [x] 2.5: Filter by state "closed" and dunning reason
  - [x] 2.6: Return array of account objects

- [x] Task 3: Integrate with rescue.js (AC: #1)
  - [x] 3.1: Import Recurly client and accounts module
  - [x] 3.2: Initialize client after environment setup
  - [x] 3.3: Query accounts and display count
  - [x] 3.4: Store results for next processing step

- [x] Task 4: Write comprehensive tests (AC: #1, #2, #3)
  - [x] 4.1: Create `test/recurly-client.test.js` for client module
  - [x] 4.2: Test rate limit detection and waiting
  - [x] 4.3: Test exponential backoff retry logic
  - [x] 4.4: Test 429 handling
  - [x] 4.5: Create `test/accounts.test.js` for query module
  - [x] 4.6: Test pagination handling
  - [x] 4.7: Test date filtering
  - [x] 4.8: Test closed account filtering

## Dev Notes

### Critical Context from Epic 1

**Epic 1 Learnings - MUST FOLLOW:**

1. **From Story 1.1 (Project Setup):**
   - Use clear error messages for missing configuration
   - Never log sensitive data (API keys)
   - Load .env file with dotenv package
   - ✅ Pattern établi: `src/config/env.js` pour configuration

2. **From Story 1.2 (CLI Parsing):**
   - Use KNOWN_ARGS pattern for validation
   - Validate user input thoroughly (trim, check empty)
   - Remove unused imports during code review
   - Add edge case tests proactively
   - ✅ Pattern établi: `src/cli/args.js` pour arguments CLI

3. **From Story 1.3 (Environment Management):**
   - Use async/await for interactive prompts
   - Production confirmation prevents accidental executions
   - Validate function parameters (throw errors for invalid values)
   - Clean up timeouts in async tests
   - Test concurrency: Use --test-concurrency=1 for tests that share .env file
   - ✅ Pattern établi: `src/env/environment.js` pour gestion environnement

4. **From Story 1.4 (Help Command):**
   - JSDoc comments for function documentation
   - Error handling with try/catch for I/O operations
   - Comprehensive unit tests for all code paths
   - Integration tests for CLI behavior
   - ✅ 99 tests passent actuellement - ne pas régresser

### Git Intelligence Summary

**Recent patterns (commit e7b28b2):**
- Module structure: `src/<category>/<name>.js`
- Test structure: `test/<name>.test.js`
- Co-authoring commits avec Claude
- Code review systématique avant merge
- Test coverage exhaustif requis

**File patterns established:**
```
src/
  ├── config/env.js       # Configuration loading
  ├── cli/
  │   ├── args.js         # CLI parsing
  │   ├── help.js         # Help display
  │   └── prompt.js       # User prompts
  └── env/environment.js  # Environment management

test/
  ├── env.test.js
  ├── args.test.js
  ├── help.test.js
  └── rescue.test.js
```

**Code quality standards établis:**
- All tests must pass before commit
- Parameter validation required for public functions
- Unused imports removed
- JSDoc documentation for all exported functions
- Error handling with descriptive messages

### Technical Implementation

#### Recurly API v3 Specifics

**Authentication:**
- Header: `Authorization: Basic {base64(API_KEY:)}`
- API Key from environment (RECURLY_SANDBOX_API_KEY ou RECURLY_PRODUCTION_API_KEY)

**Base URLs:**
- Sandbox: `https://v3.recurly.com` (assumption - verify in actual API docs)
- Production: `https://v3.recurly.com` (assumption - verify in actual API docs)

**Rate Limiting Headers:**
```
X-RateLimit-Limit: 2000        # Max requests per window
X-RateLimit-Remaining: 1998    # Requests left
X-RateLimit-Reset: 1642675200  # Unix timestamp when limit resets
```

**Pagination Pattern:**
- List endpoints return paginated results
- Response includes `has_more` boolean and `next` cursor
- Pattern: `/accounts?limit=200&cursor={cursor}`

**Account Query Endpoint:**
```
GET /accounts
Query params:
  - state: "closed"
  - closed_at[gte]: "2025-11-16T00:00:00Z"
  - closed_at[lte]: "2026-01-20T23:59:59Z"
  - limit: 200
  - cursor: {pagination_cursor}
```

#### Implementation Approach

**Module 1: Recurly Client (`src/api/recurly-client.js`)**

```javascript
/**
 * Recurly API v3 Client
 * Handles authentication, rate limiting, and retries
 */

const https = require('https');

/**
 * Create Recurly API client
 * @param {Object} config - Configuration object
 * @param {string} config.apiKey - Recurly API key
 * @param {boolean} config.isProduction - Production environment flag
 * @param {number} [config.maxRetries=3] - Max retry attempts
 * @param {number} [config.retryBackoffBase=2] - Retry backoff base in seconds
 * @param {number} [config.retryBackoffMax=30] - Max retry backoff in seconds
 * @returns {Object} Client instance with request method
 */
function createClient(config) {
  const { apiKey, isProduction, maxRetries = 3, retryBackoffBase = 2, retryBackoffMax = 30 } = config;

  if (!apiKey) {
    throw new Error('API key is required');
  }

  const baseURL = 'https://v3.recurly.com';
  const auth = Buffer.from(`${apiKey}:`).toString('base64');

  async function request(method, path, options = {}) {
    // Implementation with:
    // - Rate limit checking
    // - 429 handling with X-RateLimit-Reset wait
    // - Exponential backoff retry
    // - Error handling
  }

  return { request };
}

module.exports = { createClient };
```

**Module 2: Accounts Query (`src/api/accounts.js`)**

```javascript
/**
 * Accounts API Module
 * Query and filter Recurly accounts
 */

/**
 * Query closed accounts within date range
 * @param {Object} client - Recurly client instance
 * @param {Object} options - Query options
 * @param {Date} options.startDate - Start of date range (default: 2025-11-16)
 * @param {Date} options.endDate - End of date range (default: 2026-01-20)
 * @returns {Promise<Array>} Array of closed account objects
 */
async function queryClosedAccounts(client, options = {}) {
  const {
    startDate = new Date('2025-11-16T00:00:00Z'),
    endDate = new Date('2026-01-20T23:59:59Z')
  } = options;

  const accounts = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      state: 'closed',
      'closed_at[gte]': startDate.toISOString(),
      'closed_at[lte]': endDate.toISOString(),
      limit: 200
    });

    if (cursor) {
      params.append('cursor', cursor);
    }

    const response = await client.request('GET', `/accounts?${params}`);

    accounts.push(...response.data);
    hasMore = response.has_more;
    cursor = response.next;
  }

  return accounts;
}

module.exports = { queryClosedAccounts };
```

**Integration dans rescue.js:**

```javascript
// rescue.js (après environment setup)
const { createClient } = require('./src/api/recurly-client');
const { queryClosedAccounts } = require('./src/api/accounts');

// ... existing code ...

try {
  // After environment initialization
  const recurlyClient = createClient({
    apiKey: config.apiKey,
    isProduction: environment.isProduction
  });

  console.log('Querying closed accounts from Recurly...');
  const accounts = await queryClosedAccounts(recurlyClient);

  console.log(`Found ${accounts.length} accounts to rescue`);

  // TODO: Next stories will process these accounts

} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
```

#### Rate Limiting Strategy

**Monitoring:**
- Check `X-RateLimit-Remaining` after each request
- If remaining < 10, add delay before next request

**429 Handling:**
```javascript
if (response.statusCode === 429) {
  const resetTime = parseInt(response.headers['x-ratelimit-reset']);
  const waitMs = (resetTime * 1000) - Date.now();
  console.log(`Rate limit exceeded. Waiting ${Math.ceil(waitMs/1000)}s...`);
  await sleep(waitMs);
  // Retry request
}
```

**Exponential Backoff:**
```javascript
const delays = [2000, 4000, 8000, 16000, 30000]; // Cap at 30s
for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    return await makeRequest();
  } catch (error) {
    if (attempt === maxRetries - 1) throw error;
    const delay = Math.min(delays[attempt], retryBackoffMax * 1000);
    console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
    await sleep(delay);
  }
}
```

#### Error Handling Patterns

**Network Errors:**
```javascript
try {
  const response = await client.request('GET', '/accounts');
} catch (error) {
  if (error.code === 'ENOTFOUND') {
    throw new Error('Cannot reach Recurly API. Check network connection.');
  }
  if (error.code === 'ETIMEDOUT') {
    throw new Error('Request timed out. Recurly API may be slow or down.');
  }
  throw error; // Re-throw unknown errors
}
```

**API Errors:**
```javascript
if (response.statusCode >= 400) {
  if (response.statusCode === 401) {
    throw new Error('Invalid API key. Check your .env file.');
  }
  if (response.statusCode === 403) {
    throw new Error('API key lacks required permissions.');
  }
  if (response.statusCode === 404) {
    throw new Error('Endpoint not found. API version may have changed.');
  }
  throw new Error(`Recurly API error ${response.statusCode}: ${response.body}`);
}
```

### Testing Strategy

**Unit Tests for recurly-client.js:**
```javascript
// test/recurly-client.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { createClient } = require('../src/api/recurly-client');

test('createClient() requires API key', (t) => {
  assert.throws(() => createClient({}), /API key is required/);
});

test('createClient() returns client with request method', (t) => {
  const client = createClient({ apiKey: 'test-key' });
  assert.ok(typeof client.request === 'function');
});

// Mock HTTP responses for testing
test('request() handles 429 rate limit', async (t) => {
  // Mock 429 response with X-RateLimit-Reset header
  // Verify waits for reset time
  // Verify retries after wait
});

test('request() implements exponential backoff', async (t) => {
  // Mock multiple failures
  // Verify delays: 2s, 4s, 8s, etc.
});
```

**Integration Tests for accounts.js:**
```javascript
// test/accounts.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { queryClosedAccounts } = require('../src/api/accounts');

test('queryClosedAccounts() handles pagination', async (t) => {
  // Mock client with paginated responses
  // Verify all pages are fetched
});

test('queryClosedAccounts() filters by date range', async (t) => {
  // Verify correct query parameters sent
});

test('queryClosedAccounts() filters by closed state', async (t) => {
  // Verify state=closed parameter
});
```

### File Structure After Story 2.1

```
RecurlyRescue/
├── rescue.js                     # Updated: Recurly client integration
├── src/
│   ├── config/
│   │   └── env.js                # Existing (Story 1.1)
│   ├── cli/
│   │   ├── args.js               # Existing (Story 1.2)
│   │   ├── help.js               # Existing (Story 1.4)
│   │   └── prompt.js             # Existing (Story 1.3)
│   ├── env/
│   │   └── environment.js        # Existing (Story 1.3)
│   └── api/
│       ├── recurly-client.js     # NEW: Recurly API client
│       └── accounts.js           # NEW: Account queries
└── test/
    ├── env.test.js               # Existing
    ├── args.test.js              # Existing
    ├── help.test.js              # Existing
    ├── rescue.test.js            # Updated (new Recurly tests)
    ├── environment.test.js       # Existing
    ├── prompt.test.js            # Existing
    ├── recurly-client.test.js    # NEW
    └── accounts.test.js          # NEW
```

### Dependencies & Libraries

**Current dependencies:**
- `dotenv@17.2.3` - Environment variable loading ✅

**No additional dependencies needed for MVP:**
- Native Node.js `https` module for HTTP requests
- Native `Buffer` for base64 encoding
- Native `URLSearchParams` for query strings

**Alternative (if needed):**
- Consider `@recurly/recurly-client` official library (check if it exists)
- Or lightweight HTTP client like `node-fetch` or `axios`

**Recommendation:** Start with native `https` module to minimize dependencies. Only add library if native approach becomes too complex.

### Security Considerations

1. **API Key Protection:**
   - Never log full API keys
   - Log only last 4 characters for debugging: `***********{key.slice(-4)}`
   - Use environment-specific keys (sandbox vs production)

2. **Error Messages:**
   - Don't expose API keys in error messages
   - Don't log full request/response bodies with sensitive data
   - Sanitize error output before displaying

3. **Rate Limiting:**
   - Respect Recurly's rate limits to avoid account suspension
   - Implement conservative thresholds (e.g., pause if < 10 requests remaining)

### Performance Considerations

1. **Pagination:**
   - Use max `limit=200` per request to minimize round-trips
   - Process pages sequentially to avoid overwhelming API

2. **Parallel Requests:**
   - Don't implement parallel requests in Story 2.1
   - Keep it simple: sequential pagination
   - Future optimization if needed

3. **Memory:**
   - For large account lists (>1000), consider streaming approach
   - MVP: Load all into memory (acceptable for reasonable dataset size)

### NFR Compliance

**From Epic 2 NFRs:**

✅ **NFR-I1:** System must use Recurly API v3
- Implement: Use v3 base URL and v3 endpoints

✅ **NFR-I2:** System must implement pagination for list endpoints
- Implement: Cursor-based pagination with has_more/next pattern

✅ **NFR-I3:** System must handle pagination cursor/offset correctly
- Implement: Loop until has_more is false

✅ **NFR-I4:** System must parse and use rate limit headers
- Implement: Parse X-RateLimit-* headers and respect limits

✅ **NFR-P1:** System must respect Recurly API rate limits
- Implement: Monitor X-RateLimit-Remaining header

✅ **NFR-P2:** System must implement configurable delay between API calls
- Implement: Add delay if approaching limit threshold

✅ **NFR-P3:** System must handle 429 responses gracefully
- Implement: Wait for X-RateLimit-Reset and retry

**From Global NFRs:**

✅ **NFR-R1:** System must retry failed API calls up to configurable limit
- Implement: Default 3 retries, configurable via options

✅ **NFR-R2:** System must implement exponential backoff
- Implement: 2s base, 30s max delays

✅ **NFR-R3:** System must log each retry attempt
- Implement: Console.log retry attempts with numbers

### Edge Cases to Handle

1. **Empty Results:**
   - What if no accounts match criteria?
   - Display: "No closed accounts found in date range"

2. **API Downtime:**
   - What if Recurly API is completely down?
   - After max retries, exit with clear error message

3. **Invalid Date Range:**
   - What if startDate > endDate?
   - Validate in queryClosedAccounts()

4. **Malformed API Response:**
   - What if response doesn't have expected structure?
   - Validate response schema before processing

5. **Network Interruption:**
   - What if network drops mid-pagination?
   - Retry logic should handle this

### References

- [Source: docs/planning-artifacts/epics.md#Epic 2 - Client Discovery]
- [Source: docs/planning-artifacts/epics.md#Story 2.1 - Query Closed Accounts]
- [Source: docs/planning-artifacts/prd.md#FR1 - Query accounts]
- [Source: docs/planning-artifacts/prd.md#FR2 - Date filtering]
- [Source: docs/planning-artifacts/prd.md#NFR-I1-I5 - API integration]
- [Source: docs/planning-artifacts/prd.md#NFR-P1-P3 - Rate limiting]
- [Source: docs/planning-artifacts/prd.md#NFR-R1-R3 - Retry logic]
- [Existing: src/config/env.js - API key loading pattern]
- [Existing: src/env/environment.js - Environment detection]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 140 tests pass with `node --test --test-concurrency=1`
- Added `SKIP_API_CALLS=true` environment variable for CLI-only tests

### Completion Notes List

1. **Task 1 Complete:** Created `src/api/recurly-client.js` with:
   - Basic authentication (base64 encoded API key)
   - Rate limit monitoring via X-RateLimit-* headers
   - Exponential backoff retry (2s base, 30s max, configurable)
   - 429 handling with automatic wait and retry
   - Configurable: maxRetries, retryBackoffBase, retryBackoffMax, rateLimitThreshold

2. **Task 2 Complete:** Created `src/api/accounts.js` with:
   - `queryClosedAccounts(client, options)` - pagination, date filtering, state=closed
   - `getAccountById(client, accountId)` - single account retrieval (prepared for Story 2.3)
   - Validation for all parameters
   - Error handling with context

3. **Task 3 Complete:** Integrated with rescue.js:
   - Imports recurly-client and accounts modules
   - Initializes client with config from loadConfig()
   - Single client mode when --client-id provided
   - Batch mode otherwise
   - Added SKIP_API_CALLS for test compatibility

4. **Task 4 Complete:**
   - `test/recurly-client.test.js`: 15 tests for client validation, config, rate limit
   - `test/accounts.test.js`: 26 tests for pagination, validation, error handling
   - Updated `test/rescue.test.js` with SKIP_API_CALLS=true for CLI tests

### File List

**Created:**
- src/api/recurly-client.js
- src/api/accounts.js
- test/recurly-client.test.js
- test/accounts.test.js

**Modified:**
- rescue.js (Recurly client integration, SKIP_API_CALLS support)
- test/rescue.test.js (SKIP_API_CALLS for CLI-only tests)
- docs/implementation-artifacts/sprint-status.yaml (status: in-progress)
- docs/implementation-artifacts/2-1-query-closed-accounts-from-recurly.md (this file)

### Change Log

- 2026-01-20: Story 2.1 implemented - Recurly API client with rate limiting, retry logic, and account query functionality
