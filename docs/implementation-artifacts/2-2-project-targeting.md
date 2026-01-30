# Story 2.2: Project Targeting

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **operator**,
I want **to target a specific Recurly project**,
So that **I can run the rescue on the correct project (EUR or multi-currency)**.

## Acceptance Criteria

1. **AC1: Target EUR project**
   - **Given** `--project=eur` is provided
   - **When** the script connects to Recurly
   - **Then** it uses the correct project/site identifier for EUR project

2. **AC2: Target multi-currency project**
   - **Given** `--project=multi` is provided
   - **When** the script connects to Recurly
   - **Then** it uses the correct project/site identifier for multi-currency project

3. **AC3: Validate project identifier**
   - **Given** an invalid `--project` value is provided
   - **When** validating arguments
   - **Then** display available project identifiers and exit

## Tasks / Subtasks

- [ ] Task 1: Create project configuration module (AC: #1, #2, #3)
  - [ ] 1.1: Create `src/config/projects.js` module
  - [ ] 1.2: Define PROJECT_IDENTIFIERS constant with EUR and multi-currency configs
  - [ ] 1.3: Implement `getProjectConfig(projectId)` function
  - [ ] 1.4: Validate project ID and throw error if invalid
  - [ ] 1.5: Export function and constants

- [ ] Task 2: Update CLI validation (AC: #3)
  - [ ] 2.1: Update `src/cli/args.js` to validate --project value
  - [ ] 2.2: Check against allowed project identifiers
  - [ ] 2.3: Display helpful error with available options

- [ ] Task 3: Integrate with Recurly client (AC: #1, #2)
  - [ ] 3.1: Update `src/api/recurly-client.js` to accept project config
  - [ ] 3.2: Use project site identifier in API requests
  - [ ] 3.3: Update rescue.js to pass project config to client

- [ ] Task 4: Write tests (AC: #1, #2, #3)
  - [ ] 4.1: Create `test/projects.test.js`
  - [ ] 4.2: Test getProjectConfig() for valid IDs
  - [ ] 4.3: Test getProjectConfig() throws for invalid IDs
  - [ ] 4.4: Update args.test.js with project validation tests
  - [ ] 4.5: Update integration tests with project targeting

## Dev Notes

### Critical Context from Previous Stories

**From Story 2.1 (Query Closed Accounts):**
- Recurly API client structure established
- Rate limiting and retry logic in place
- `src/api/recurly-client.js` exists and working
- Pattern: Pass config to client at creation

**From Epic 1:**
- CLI argument validation pattern: `src/cli/args.js`
- Clear error messages for invalid input
- JSDoc documentation required
- Comprehensive test coverage expected

### Technical Implementation

**Project Configuration Structure:**

```javascript
// src/config/projects.js

/**
 * Project Configuration Module
 * Defines Recurly project identifiers and their configurations
 */

const PROJECT_IDENTIFIERS = {
  eur: {
    id: 'eur',
    name: 'EUR Project',
    siteId: 'eur-project-site-id', // Replace with actual Recurly site ID
    currency: 'EUR',
    description: 'European project (EUR currency)'
  },
  multi: {
    id: 'multi',
    name: 'Multi-Currency Project',
    siteId: 'multi-currency-site-id', // Replace with actual Recurly site ID
    currency: null, // Supports multiple currencies
    description: 'Multi-currency project'
  }
};

/**
 * Get project configuration by ID
 * @param {string} projectId - Project identifier (eur, multi)
 * @returns {Object} Project configuration
 * @throws {Error} If project ID is invalid
 */
function getProjectConfig(projectId) {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const config = PROJECT_IDENTIFIERS[projectId.toLowerCase()];

  if (!config) {
    const validIds = Object.keys(PROJECT_IDENTIFIERS).join(', ');
    throw new Error(
      `Invalid project identifier: "${projectId}". ` +
      `Valid options: ${validIds}`
    );
  }

  return config;
}

/**
 * Get list of valid project identifiers
 * @returns {Array<string>} Array of valid project IDs
 */
function getValidProjectIds() {
  return Object.keys(PROJECT_IDENTIFIERS);
}

module.exports = {
  PROJECT_IDENTIFIERS,
  getProjectConfig,
  getValidProjectIds
};
```

**CLI Validation Update:**

```javascript
// src/cli/args.js (update validation)
const { getProjectConfig } = require('../config/projects');

function parseArgs(argv) {
  // ... existing parsing ...

  // Validate project identifier
  try {
    getProjectConfig(options.project);
  } catch (error) {
    throw new Error(error.message);
  }

  return options;
}
```

**Recurly Client Integration:**

```javascript
// src/api/recurly-client.js (update)
function createClient(config) {
  const { apiKey, isProduction, projectConfig } = config;

  // Use projectConfig.siteId in API requests
  // Add X-Recurly-Site header or use in URL path as needed

  return { request };
}

// rescue.js (update)
const projectConfig = getProjectConfig(options.project);
const recurlyClient = createClient({
  apiKey: config.apiKey,
  isProduction: environment.isProduction,
  projectConfig
});
```

### Testing Strategy

```javascript
// test/projects.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getProjectConfig, getValidProjectIds } = require('../src/config/projects');

test('getProjectConfig() returns EUR project config', (t) => {
  const config = getProjectConfig('eur');
  assert.strictEqual(config.id, 'eur');
  assert.strictEqual(config.currency, 'EUR');
  assert.ok(config.siteId);
});

test('getProjectConfig() returns multi-currency project config', (t) => {
  const config = getProjectConfig('multi');
  assert.strictEqual(config.id, 'multi');
  assert.strictEqual(config.currency, null);
});

test('getProjectConfig() is case-insensitive', (t) => {
  const config1 = getProjectConfig('EUR');
  const config2 = getProjectConfig('eur');
  assert.strictEqual(config1.id, config2.id);
});

test('getProjectConfig() throws for invalid project ID', (t) => {
  assert.throws(
    () => getProjectConfig('invalid'),
    /Invalid project identifier: "invalid"/
  );
  assert.throws(
    () => getProjectConfig(''),
    /Project ID is required/
  );
});

test('getValidProjectIds() returns all project IDs', (t) => {
  const ids = getValidProjectIds();
  assert.ok(Array.isArray(ids));
  assert.ok(ids.includes('eur'));
  assert.ok(ids.includes('multi'));
});
```

### Important Notes

**Recurly Site ID Configuration:**
- The actual Recurly site IDs need to be obtained from Recurly dashboard
- Each project/site has a unique identifier
- Site ID is used in API requests to target the correct project
- **TODO:** Replace placeholder site IDs with actual values from Recurly

**API Request Pattern:**
- Site targeting can be done via:
  1. URL path: `/sites/{site_id}/accounts`
  2. Header: `X-Recurly-Site: {site_id}`
- Need to verify Recurly API v3 documentation for correct approach

### File Structure After Story 2.2

```
RecurlyRescue/
├── src/
│   ├── config/
│   │   ├── env.js           # Existing
│   │   └── projects.js      # NEW: Project configurations
│   ├── cli/
│   │   └── args.js          # Updated: Project validation
│   └── api/
│       ├── recurly-client.js # Updated: Project config support
│       └── accounts.js       # Existing
└── test/
    ├── projects.test.js      # NEW
    └── args.test.js          # Updated
```

### References

- [Source: docs/planning-artifacts/epics.md#Story 2.2 - Project Targeting]
- [Source: docs/planning-artifacts/prd.md#FR3 - Target specific project]
- [Existing: src/cli/args.js - CLI validation pattern]
- [Existing: src/api/recurly-client.js - Client structure]
- [Related: Story 2.1 - Recurly client foundation]

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_To be filled by dev agent_

### Completion Notes List

_To be filled by dev agent_

### File List

**Expected to be created:**
- src/config/projects.js
- test/projects.test.js

**Expected to be modified:**
- src/cli/args.js (project validation)
- src/api/recurly-client.js (project config integration)
- rescue.js (pass project config to client)
- test/args.test.js (project validation tests)
- docs/implementation-artifacts/sprint-status.yaml (status update)
- docs/implementation-artifacts/2-2-project-targeting.md (completion tracking)
