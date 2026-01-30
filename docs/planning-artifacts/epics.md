---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
inputDocuments:
  - docs/planning-artifacts/prd.md
epicCount: 5
storyCount: 18
frCount: 29
nfrCount: 17
---

# Recurly Rescue Script - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Recurly Rescue Script, decomposing the requirements from the PRD into implementable stories.

## Requirements Inventory

### Functional Requirements

**Client Identification**
- FR1: Operator can query Recurly API to retrieve all accounts closed by dunning bot
- FR2: Operator can filter accounts by date range (16/11/25 → 20/01/26)
- FR3: Operator can target a specific Recurly project via CLI argument
- FR4: Operator can target a single client by ID for testing purposes

**Rescue Plan Management**
- FR5: System can check if a Rescue Plan exists for the target currency
- FR6: System can create a Rescue Plan with correct currency if it doesn't exist
- FR7: System can assign Rescue Plan with 1-day free trial to a client account
- FR8: System can verify Recurly API confirms the plan assignment

**Execution Control**
- FR9: Operator can run in dry-run mode (simulation without real changes)
- FR10: Operator can set confirmation intervals (pause every N clients)
- FR11: Operator can run in continuous mode without pauses
- FR12: System requests explicit confirmation before executing in production environment

**State Management**
- FR13: System can persist execution state to enable crash recovery
- FR14: System can resume execution from exact point of interruption
- FR15: System tracks which clients have been processed vs pending

**Observability & Logging**
- FR16: System displays real-time progress bar with percentage and counter
- FR17: System logs each client action with checkbox (✓/✗), details, and clickable Recurly URL
- FR18: System displays final execution statistics summary in terminal
- FR19: System generates JSON output file with before/after state for each client

**Rollback**
- FR20: Operator can trigger rollback mode from a previous execution JSON file
- FR21: System can restore previous state for each client from backup data
- FR22: System generates rollback results file with same format as rescue results

**Configuration & Validation**
- FR23: System reads API credentials from .env file
- FR24: System validates presence of required CLI arguments (--env, --project)
- FR25: System detects and rejects invalid argument combinations
- FR26: Operator can display help with usage examples via --help

**Environment Management**
- FR27: Operator can target sandbox environment for testing
- FR28: Operator can target production environment for real execution
- FR29: System prevents accidental mixing of sandbox and production operations

### NonFunctional Requirements

**Performance & Rate Limiting**
- NFR-P1: System must respect Recurly API rate limits by monitoring `X-RateLimit-Remaining` header
- NFR-P2: System must implement configurable delay between API calls if approaching rate limit threshold
- NFR-P3: System must handle 429 (Too Many Requests) responses gracefully with automatic retry

**Reliability & Error Handling**
- NFR-R1: System must retry failed API calls up to configurable limit (default: 3 retries)
- NFR-R2: System must implement exponential backoff between retries (2s base, 30s max)
- NFR-R3: System must log each retry attempt with reason and attempt number
- NFR-R4: System must mark client as FAILED after exhausting all retries and continue to next client
- NFR-R5: System must not crash on individual client failures - isolate errors per client

**Security**
- NFR-S1: API credentials must only be loaded from `.env` file, never hardcoded
- NFR-S2: `.env` file must not be committed to version control (`.gitignore`)
- NFR-S3: System must validate API key presence before any API call
- NFR-S4: System must not log or display API keys in terminal output or files

**Integration (Recurly API v3)**
- NFR-I1: System must use Recurly API v3
- NFR-I2: System must implement pagination for list endpoints (accounts, subscriptions)
- NFR-I3: System must handle pagination cursor/offset correctly to retrieve all results
- NFR-I4: System must parse and use rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- NFR-I5: System must handle API response codes appropriately (200/201, 400, 401, 404, 429, 5xx)

### Additional Requirements

**From PRD - Technical Context:**
- JavaScript/Node.js implementation
- CLI tool with argument parsing
- `.env` configuration with optional defaults (RETRY_COUNT=3, RETRY_BACKOFF_BASE=2, RETRY_BACKOFF_MAX=30)
- JSON output file format as specified in PRD
- Terminal output with progress bar and Unicode checkboxes (✓/✗)
- Clickable URLs in terminal output

**Infrastructure:**
- Local execution only (no deployment required)
- No database required (file-based state persistence)
- Single-user operation (no concurrency requirements)

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 2 | Query Recurly API for closed accounts |
| FR2 | Epic 2 | Filter by date range |
| FR3 | Epic 2 | Target specific project |
| FR4 | Epic 2 | Target single client for testing |
| FR5 | Epic 3 | Check Rescue Plan exists |
| FR6 | Epic 3 | Create Rescue Plan if needed |
| FR7 | Epic 3 | Assign Rescue Plan with trial |
| FR8 | Epic 3 | Verify API confirmation |
| FR9 | Epic 3 | Dry-run mode |
| FR10 | Epic 3 | Confirmation intervals |
| FR11 | Epic 3 | Continuous mode |
| FR12 | Epic 3 | Production confirmation |
| FR13 | Epic 4 | Persist execution state |
| FR14 | Epic 4 | Resume from interruption |
| FR15 | Epic 4 | Track processed clients |
| FR16 | Epic 4 | Progress bar display |
| FR17 | Epic 4 | Client action logging |
| FR18 | Epic 4 | Final statistics |
| FR19 | Epic 4 | JSON output file |
| FR20 | Epic 5 | Trigger rollback mode |
| FR21 | Epic 5 | Restore previous state |
| FR22 | Epic 5 | Generate rollback results |
| FR23 | Epic 1 | Read .env credentials |
| FR24 | Epic 1 | Validate required arguments |
| FR25 | Epic 1 | Detect invalid combinations |
| FR26 | Epic 1 | Display help |
| FR27 | Epic 1 | Target sandbox |
| FR28 | Epic 1 | Target production |
| FR29 | Epic 1 | Prevent environment mixing |

## Epic List

### Epic 1: Foundation & CLI Setup

**Goal:** L'opérateur peut configurer et lancer le script avec les bons paramètres.

**User Outcome:** Le script démarre, valide la config, et affiche l'aide si besoin.

**FRs couverts:** FR23, FR24, FR25, FR26, FR27, FR28, FR29

**NFRs intégrés:** NFR-S1, NFR-S2, NFR-S3, NFR-S4 (sécurité credentials)

---

### Epic 2: Client Discovery

**Goal:** L'opérateur peut identifier tous les clients impactés par le bug dunning.

**User Outcome:** Liste complète des clients à rescuer, avec possibilité de cibler un client spécifique pour test.

**FRs couverts:** FR1, FR2, FR3, FR4

**NFRs intégrés:** NFR-I1, NFR-I2, NFR-I3, NFR-I4, NFR-P1, NFR-P2, NFR-P3 (API, pagination, rate limiting)

---

### Epic 3: Rescue Execution

**Goal:** L'opérateur peut exécuter le rescue sur les clients identifiés.

**User Outcome:** Clients rescués avec Rescue Plan assigné, dry-run disponible, confirmations contrôlées.

**FRs couverts:** FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12

**NFRs intégrés:** NFR-R1, NFR-R2, NFR-R3, NFR-R4, NFR-R5, NFR-I5 (retry, error handling)

---

### Epic 4: State Management & Monitoring

**Goal:** L'opérateur peut suivre la progression et reprendre après interruption.

**User Outcome:** Progress bar en temps réel, logs détaillés, state persistant, reprise exacte.

**FRs couverts:** FR13, FR14, FR15, FR16, FR17, FR18, FR19

---

### Epic 5: Rollback Operations

**Goal:** L'opérateur peut annuler les opérations de rescue si nécessaire.

**User Outcome:** Restauration de l'état précédent pour tous les clients depuis le fichier JSON.

**FRs couverts:** FR20, FR21, FR22

---

## Epic 1: Foundation & CLI Setup

### Story 1.1: Project Setup & Config Loading

**As a** operator,
**I want** the script to load API credentials from a .env file,
**So that** I can securely configure the tool without hardcoding secrets.

**Acceptance Criteria:**

**Given** a .env file exists with RECURLY_SANDBOX_API_KEY and/or RECURLY_PRODUCTION_API_KEY
**When** the script starts
**Then** it loads the appropriate API key based on the --env argument
**And** validates the key is not empty
**And** never logs or displays the API key value

**Given** no .env file exists or required key is missing
**When** the script starts
**Then** it displays a clear error message indicating which variable is missing
**And** exits with non-zero status code

---

### Story 1.2: CLI Argument Parsing & Validation

**As a** operator,
**I want** the script to parse and validate command-line arguments,
**So that** I can control execution behavior and catch errors early.

**Acceptance Criteria:**

**Given** the operator runs the script
**When** --env is missing
**Then** display "Missing required argument: --env" and exit

**Given** the operator runs the script
**When** --project is missing
**Then** display "Missing required argument: --project" and exit

**Given** --dry-run and --rollback are both provided
**When** validating arguments
**Then** display "Cannot combine --dry-run with --rollback" and exit

**Given** --confirm-every and --no-confirm are both provided
**When** validating arguments
**Then** display "Cannot use both --confirm-every and no-confirm" and exit

---

### Story 1.3: Environment Management

**As a** operator,
**I want** to target sandbox or production environments explicitly,
**So that** I can test safely before running on real data.

**Acceptance Criteria:**

**Given** --env=sandbox is provided
**When** the script initializes
**Then** it uses RECURLY_SANDBOX_API_KEY
**And** connects to Recurly sandbox API

**Given** --env=production is provided
**When** the script initializes
**Then** it uses RECURLY_PRODUCTION_API_KEY
**And** displays a confirmation prompt: "You are about to run in PRODUCTION. Continue? (y/n)"
**And** only proceeds if user confirms with 'y'

**Given** --env has invalid value (not sandbox or production)
**When** validating arguments
**Then** display "Invalid --env value. Must be 'sandbox' or 'production'" and exit

---

### Story 1.4: Help Command

**As a** operator,
**I want** to display usage help,
**So that** I can understand available options without reading documentation.

**Acceptance Criteria:**

**Given** --help is provided
**When** the script starts
**Then** it displays formatted help with:
- Script description
- Required arguments (--env, --project)
- Optional arguments (--dry-run, --client-id, --confirm-every, --no-confirm, --rollback)
- Usage examples
**And** exits with status code 0

---

## Epic 2: Client Discovery

### Story 2.1: Query Closed Accounts from Recurly

**As a** operator,
**I want** to retrieve all accounts closed by the dunning bot within a date range,
**So that** I can identify all clients needing rescue.

**Acceptance Criteria:**

**Given** valid API credentials and --project is specified
**When** the script queries Recurly API v3
**Then** it retrieves all accounts with state "closed" by dunning
**And** filters to accounts closed between 16/11/2025 and 20/01/2026
**And** handles pagination correctly to retrieve ALL results
**And** respects rate limits by monitoring X-RateLimit-Remaining header

**Given** API returns 429 (rate limit exceeded)
**When** processing the query
**Then** wait according to X-RateLimit-Reset header
**And** retry the request automatically

**Given** API returns error (4xx/5xx)
**When** processing the query
**Then** retry with exponential backoff (2s, 4s, 8s... up to 30s)
**And** after max retries, display error and exit

---

### Story 2.2: Project Targeting

**As a** operator,
**I want** to target a specific Recurly project,
**So that** I can run the rescue on the correct project (EUR or multi-currency).

**Acceptance Criteria:**

**Given** --project=eur is provided
**When** the script connects to Recurly
**Then** it uses the correct project/site identifier for EUR project

**Given** --project=multi is provided
**When** the script connects to Recurly
**Then** it uses the correct project/site identifier for multi-currency project

**Given** an invalid --project value is provided
**When** validating arguments
**Then** display available project identifiers and exit

---

### Story 2.3: Single Client Targeting

**As a** operator,
**I want** to target a single client by ID for testing,
**So that** I can validate the rescue process on one account before batch execution.

**Acceptance Criteria:**

**Given** --client-id=abc123 is provided
**When** the script runs
**Then** it only processes the specified client
**And** skips the full account query
**And** displays detailed output for that single client

**Given** --client-id with an invalid/non-existent ID
**When** the script runs
**Then** display "Client not found: abc123" and exit with error

---

## Epic 3: Rescue Execution

### Story 3.1: Rescue Plan Management

**As a** operator,
**I want** the system to check and create the Rescue Plan if needed,
**So that** I can assign it to affected clients.

**Acceptance Criteria:**

**Given** the rescue process starts for a project with currency EUR
**When** checking for Rescue Plan
**Then** query Recurly API for plan with code from getRescuePlanCode('EUR') (uses RESCUE_PLAN_CODE from .env)
**And** if exists, use it for assignments

**Given** no Rescue Plan exists for the target currency
**When** the rescue process starts
**Then** create a new plan with:
- Code: "rescue-plan-{currency}"
- Name: "Rescue Plan ({currency})"
- Currency: matching the project currency
- Price: 0 (or matching original plan price)
**And** log "Created Rescue Plan: rescue-plan-{currency}"

---

### Story 3.2: Plan Assignment with Trial

**As a** operator,
**I want** to assign the Rescue Plan with a 1-day free trial to each client,
**So that** they are re-enrolled in the subscription cycle.

**Acceptance Criteria:**

**Given** a client account is identified for rescue
**When** assigning the Rescue Plan
**Then** create a subscription with:
- Plan: rescue-plan-{currency}
- Trial: 1 day free
- Currency: matching client's original currency
**And** verify Recurly API returns 201 (created)
**And** log "✓ {client_id} - RESCUED - {recurly_url}"

**Given** API returns error during assignment
**When** processing a client
**Then** retry with exponential backoff (NFR-R1, NFR-R2)
**And** log each retry attempt (NFR-R3)
**And** after max retries, mark as FAILED and continue to next client (NFR-R4, NFR-R5)
**And** log "✗ {client_id} - FAILED ({error_reason})"

---

### Story 3.3: Dry-Run Mode

**As a** operator,
**I want** to simulate the rescue without making real changes,
**So that** I can verify the process before executing.

**Acceptance Criteria:**

**Given** --dry-run is provided
**When** the script runs
**Then** it queries and identifies all clients
**And** displays what WOULD be done for each client
**And** does NOT make any API calls that modify data
**And** displays summary: "DRY-RUN: {N} clients would be rescued"

**Given** --dry-run mode completes
**When** displaying results
**Then** clearly indicate "[DRY-RUN]" in all output
**And** do NOT generate the rescue-results JSON file

---

### Story 3.4: Execution Control

**As a** operator,
**I want** to control the execution pace with confirmations,
**So that** I can monitor progress and stop if needed.

**Acceptance Criteria:**

**Given** --confirm-every=50 is provided
**When** processing clients
**Then** pause after every 50 clients
**And** display "Processed 50/1000. Continue? (y/n)"
**And** if 'y', continue processing
**And** if 'n', stop gracefully and save state

**Given** --no-confirm is provided
**When** processing clients
**Then** run continuously without pauses
**And** process all clients in sequence

**Given** neither --confirm-every nor --no-confirm is provided
**When** processing clients
**Then** default to --confirm-every=100

---

## Epic 4: State Management & Monitoring

### Story 4.1: Progress Display

**As a** operator,
**I want** to see real-time progress with a visual progress bar,
**So that** I can monitor execution and estimate remaining time.

**Acceptance Criteria:**

**Given** the rescue process is running
**When** clients are being processed
**Then** display a progress bar with:
- Visual bar (e.g., [████████░░░░░░░░] 50%)
- Counter: "125/250 clients"
- Current client ID being processed
**And** update in real-time without scrolling

**Given** processing completes
**When** displaying final state
**Then** clear the progress bar
**And** display final summary statistics

---

### Story 4.2: Action Logging

**As a** operator,
**I want** detailed logs for each client action,
**So that** I can audit the process and troubleshoot issues.

**Acceptance Criteria:**

**Given** a client is successfully rescued
**When** logging the action
**Then** display: "✓ {client_id} - RESCUED - https://app.recurly.com/..."
**And** include clickable URL to Recurly account

**Given** a client rescue fails
**When** logging the action
**Then** display: "✗ {client_id} - FAILED ({error_reason})"
**And** include error details for debugging

**Given** --dry-run mode is active
**When** logging actions
**Then** prefix all entries with "[DRY-RUN]"
**And** indicate what WOULD happen without making changes

---

### Story 4.3: State Persistence & Recovery

**As a** operator,
**I want** the execution state to be persisted,
**So that** I can resume after interruption without re-processing clients.

**Acceptance Criteria:**

**Given** the rescue process is running
**When** each client is processed
**Then** update state file (rescue-state-{timestamp}.json) with:
- List of processed client IDs
- List of pending client IDs
- Current position/index
- Timestamp of last update

**Given** the script crashes or is interrupted
**When** restarting with --resume flag
**Then** detect the latest state file
**And** resume from exact point of interruption
**And** display "Resuming from client {N}/{total}"

**Given** a state file is corrupted or invalid
**When** attempting to resume
**Then** display clear error message
**And** suggest running fresh execution

---

### Story 4.4: Output Generation

**As a** operator,
**I want** a JSON output file with complete before/after state,
**So that** I can audit changes and enable rollback.

**Acceptance Criteria:**

**Given** the rescue process completes (not dry-run)
**When** generating output file
**Then** create rescue-results-{timestamp}.json with:
```json
{
  "execution": {
    "timestamp": "ISO8601",
    "environment": "sandbox|production",
    "project": "eur|multi",
    "mode": "rescue"
  },
  "summary": {
    "total": 250,
    "rescued": 245,
    "failed": 5
  },
  "clients": [
    {
      "id": "abc123",
      "status": "RESCUED|FAILED",
      "before": { "state": "closed", "subscriptions": [...] },
      "after": { "state": "active", "subscription_id": "xyz789" },
      "error": null
    }
  ]
}
```

**Given** final statistics summary
**When** execution completes
**Then** display:
- Total clients processed
- Successful rescues count
- Failed rescues count
- Output file path

---

## Epic 5: Rollback Operations

### Story 5.1: Rollback Mode Activation

**As a** operator,
**I want** to trigger rollback mode from a previous execution JSON file,
**So that** I can undo rescue operations if needed.

**Acceptance Criteria:**

**Given** --rollback=rescue-results-2026-01-15.json is provided
**When** the script starts
**Then** validate the JSON file exists and is valid
**And** parse the execution metadata
**And** display rollback summary: "{N} clients to rollback"
**And** prompt for confirmation before proceeding

**Given** --rollback with invalid or missing file
**When** validating arguments
**Then** display "Rollback file not found or invalid: {path}"
**And** exit with error

**Given** --rollback with --dry-run
**When** validating arguments
**Then** display "Cannot combine --rollback with --dry-run"
**And** exit with error

---

### Story 5.2: State Restoration

**As a** operator,
**I want** each client's previous state to be restored from the backup data,
**So that** clients return to their pre-rescue state.

**Acceptance Criteria:**

**Given** a client entry in the rollback file with status "RESCUED"
**When** performing rollback
**Then** cancel the rescue subscription via Recurly API
**And** restore the account to "closed" state if it was closed before
**And** log "✓ {client_id} - ROLLED BACK"

**Given** a client entry with status "FAILED"
**When** performing rollback
**Then** skip the client (nothing to rollback)
**And** log "⊘ {client_id} - SKIPPED (was not rescued)"

**Given** API error during rollback
**When** processing a client
**Then** retry with exponential backoff
**And** after max retries, mark as FAILED and continue
**And** log "✗ {client_id} - ROLLBACK FAILED ({error})"

---

### Story 5.3: Rollback Results Generation

**As a** operator,
**I want** a rollback results file with the same format as rescue results,
**So that** I can audit rollback operations and verify completion.

**Acceptance Criteria:**

**Given** rollback process completes
**When** generating output file
**Then** create rollback-results-{timestamp}.json with:
```json
{
  "execution": {
    "timestamp": "ISO8601",
    "environment": "sandbox|production",
    "project": "eur|multi",
    "mode": "rollback",
    "source_file": "rescue-results-2026-01-15.json"
  },
  "summary": {
    "total": 245,
    "rolled_back": 240,
    "skipped": 5,
    "failed": 0
  },
  "clients": [
    {
      "id": "abc123",
      "status": "ROLLED_BACK|SKIPPED|FAILED",
      "before": { "state": "active", "subscription_id": "xyz789" },
      "after": { "state": "closed", "subscriptions": [] },
      "error": null
    }
  ]
}
```

**Given** final rollback statistics
**When** rollback completes
**Then** display:
- Total clients in source file
- Successfully rolled back count
- Skipped count (were not rescued)
- Failed count
- Output file path

