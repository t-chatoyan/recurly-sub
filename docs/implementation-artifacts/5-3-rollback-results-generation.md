# Story 5.3: Rollback Results Generation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **operator**,
I want **a rollback results file with the same format as rescue results**,
So that **I can audit rollback operations and verify completion**.

## Acceptance Criteria

1. **AC1: Generate rollback-results JSON file**
   - **Given** rollback process completes
   - **When** generating output file
   - **Then** create rollback-results-{timestamp}.json with:
     - Execution metadata (timestamp, environment, project, mode="rollback", source_file)
     - Summary (total, rolled_back, skipped, failed)
     - Client array with before/after state for each

2. **AC2: JSON file format matches PRD specification**
   - **Given** the output file schema
   - **When** generating the file
   - **Then** match exact structure from PRD:
     ```json
     {
       "execution": { "timestamp", "environment", "project", "mode": "rollback", "source_file" },
       "summary": { "total", "rolled_back", "skipped", "failed" },
       "clients": [{ "id", "status", "before", "after", "error" }]
     }
     ```

3. **AC3: Display final rollback statistics in terminal**
   - **Given** final rollback statistics
   - **When** rollback completes
   - **Then** display:
     - Total clients in source file
     - Successfully rolled back count
     - Skipped count (were not rescued)
     - Failed count
     - Output file path

4. **AC4: Include source file reference**
   - **Given** a rollback from rescue-results-2026-01-15.json
   - **When** generating rollback output
   - **Then** include source_file in execution metadata
   - **And** enable traceability between rescue and rollback

## Tasks / Subtasks

- [x] Task 1: Extend results-writer for rollback mode (AC: #1, #2, #4)
  - [x] 1.1: Add `mode: 'rollback'` support to createResultsWriter
  - [x] 1.2: Add `sourceFile` option for rollback traceability
  - [x] 1.3: Update summary to use rollback-specific counters
  - [x] 1.4: Implement file naming: `rollback-results-{project}-{timestamp}.json`
  - [x] 1.5: Handle ROLLED_BACK, SKIPPED, FAILED status values

- [x] Task 2: Create rollback statistics display (AC: #3)
  - [x] 2.1: Create `displayRollbackStatistics(summary, filePath)` function
  - [x] 2.2: Format output with rollback-specific labels
  - [x] 2.3: Show success rate for rolled back vs total eligible

- [x] Task 3: Integrate with rollback execution (AC: #1, #3)
  - [x] 3.1: Initialize results writer with rollback mode in rescue.js
  - [x] 3.2: Add client results from Story 5.2 executor
  - [x] 3.3: Call finalize() after rollback completes
  - [x] 3.4: Display statistics after file generation

- [x] Task 4: Write comprehensive tests (AC: #1, #2, #3, #4)
  - [x] 4.1: Test rollback-specific JSON schema
  - [x] 4.2: Test source_file inclusion
  - [x] 4.3: Test rollback summary calculation
  - [x] 4.4: Test rollback statistics display
  - [x] 4.5: Test file naming convention

## Dev Notes

### Technical Approach

This story extends the results-writer from Story 4.4 to support rollback mode output. The rollback results file has a similar structure to the rescue results but with rollback-specific metadata and summary counters.

**Key Differences from Rescue Results:**
- `mode: "rollback"` instead of `mode: "rescue"`
- `source_file` field in execution metadata
- Summary uses `rolled_back`, `skipped`, `failed` instead of `rescued`, `failed`
- Status values: `ROLLED_BACK`, `SKIPPED`, `FAILED`

### Rollback Output Schema (PRD Specification)

```json
{
  "execution": {
    "timestamp": "2026-01-20T14:30:00.000Z",
    "environment": "sandbox",
    "project": "eur",
    "mode": "rollback",
    "source_file": "rescue-results-eur-2026-01-15T10-30-00.json"
  },
  "summary": {
    "total": 250,
    "rolled_back": 240,
    "skipped": 5,
    "failed": 5
  },
  "clients": [
    {
      "id": "acc_abc123",
      "status": "ROLLED_BACK",
      "before": {
        "state": "active",
        "subscription_id": "sub_xyz789"
      },
      "after": {
        "state": "closed",
        "subscriptions": []
      },
      "error": null
    },
    {
      "id": "acc_def456",
      "status": "SKIPPED",
      "before": null,
      "after": null,
      "error": null,
      "reason": "Client was not rescued in original execution"
    },
    {
      "id": "acc_ghi789",
      "status": "FAILED",
      "before": {
        "state": "active",
        "subscription_id": "sub_pqr111"
      },
      "after": null,
      "error": "API error: subscription not found"
    }
  ]
}
```

### Extended Results Writer Implementation

```javascript
// src/output/results-writer.js - Extended for rollback

/**
 * Create results writer instance
 * @param {Object} options - Configuration options
 * @param {string} options.project - Project identifier
 * @param {string} options.environment - Environment (sandbox/production)
 * @param {string} [options.mode='rescue'] - Execution mode (rescue/rollback)
 * @param {string} [options.sourceFile] - Source file for rollback mode
 * @param {boolean} [options.dryRun=false] - Whether in dry-run mode
 * @param {string} [options.outputDir='.'] - Directory for output files
 * @returns {Object} Results writer instance
 */
function createResultsWriter(options) {
  const {
    project,
    environment,
    mode = 'rescue',
    sourceFile = null,
    dryRun = false,
    outputDir = '.'
  } = options;

  if (!project) throw new Error('Project is required for results writer');
  if (!environment) throw new Error('Environment is required for results writer');

  const isRollback = mode === 'rollback';

  // Initialize results structure
  const results = {
    execution: {
      timestamp: new Date().toISOString(),
      environment,
      project,
      mode
    },
    summary: isRollback
      ? { total: 0, rolled_back: 0, skipped: 0, failed: 0 }
      : { total: 0, rescued: 0, failed: 0 },
    clients: []
  };

  // Add source_file for rollback mode
  if (isRollback && sourceFile) {
    results.execution.source_file = sourceFile;
  }

  /**
   * Add client result to output
   * @param {Object} clientData - Client processing data
   */
  function addClientResult(clientData) {
    const { id, status, before, after, error, reason } = clientData;

    const clientEntry = {
      id,
      status,
      before: before || null,
      after: after || null,
      error: error || null
    };

    // Include reason for SKIPPED clients
    if (status === 'SKIPPED' && reason) {
      clientEntry.reason = reason;
    }

    results.clients.push(clientEntry);

    // Update summary based on mode
    results.summary.total++;

    if (isRollback) {
      if (status === 'ROLLED_BACK') {
        results.summary.rolled_back++;
      } else if (status === 'SKIPPED') {
        results.summary.skipped++;
      } else if (status === 'FAILED') {
        results.summary.failed++;
      }
    } else {
      // Rescue mode
      if (status === 'RESCUED') {
        results.summary.rescued++;
      } else if (status === 'FAILED') {
        results.summary.failed++;
      }
    }
  }

  /**
   * Finalize and write output file
   * @returns {Object} Result with filePath and summary
   */
  function finalize() {
    // Skip file generation in dry-run mode
    if (dryRun) {
      return {
        filePath: null,
        summary: results.summary,
        skipped: true,
        reason: 'dry-run mode'
      };
    }

    // Generate filename with timestamp
    const timestamp = results.execution.timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const prefix = isRollback ? 'rollback-results' : 'rescue-results';
    const filename = `${prefix}-${project}-${timestamp}.json`;
    const filePath = path.join(outputDir, filename);

    // Write file
    try {
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
    } catch (error) {
      throw new Error(`Failed to write results file: ${error.message}`);
    }

    return {
      filePath,
      summary: results.summary,
      skipped: false
    };
  }

  /**
   * Get current results (for testing/inspection)
   * @returns {Object} Current results object
   */
  function getResults() {
    return results;
  }

  return { addClientResult, finalize, getResults };
}
```

### Rollback Statistics Display

```javascript
// src/output/results-writer.js - Add displayRollbackStatistics

/**
 * Display final rollback statistics in terminal
 * @param {Object} summary - Rollback summary statistics
 * @param {number} summary.total - Total clients processed
 * @param {number} summary.rolled_back - Successfully rolled back count
 * @param {number} summary.skipped - Skipped count (not rescued)
 * @param {number} summary.failed - Failed count
 * @param {string} [filePath] - Path to output file
 */
function displayRollbackStatistics(summary, filePath = null) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('ROLLBACK SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total clients processed:   ${summary.total}`);
  console.log(`Successfully rolled back:  ${summary.rolled_back}`);
  console.log(`Skipped (not rescued):     ${summary.skipped}`);
  console.log(`Failed:                    ${summary.failed}`);

  // Calculate success rate (rolled_back / eligible)
  const eligible = summary.total - summary.skipped;
  if (eligible > 0) {
    const successRate = ((summary.rolled_back / eligible) * 100).toFixed(1);
    console.log(`Success rate:              ${successRate}%`);
  }

  console.log('───────────────────────────────────────────────────────────');

  if (filePath) {
    console.log(`Results file: ${filePath}`);
  }

  console.log('═══════════════════════════════════════════════════════════');
}

module.exports = {
  createResultsWriter,
  displayStatistics,
  displayRollbackStatistics
};
```

### Integration with rescue.js

```javascript
// rescue.js - Rollback results integration

const {
  createResultsWriter,
  displayStatistics,
  displayRollbackStatistics
} = require('./src/output/results-writer');

// ... in main() after rollback execution from Story 5.2 ...

if (options.rollback && rollbackSummary) {
  // ... rollback execution from Story 5.2 ...

  // Initialize results writer for rollback mode
  const rollbackResultsWriter = createResultsWriter({
    project: rollbackSummary.project,
    environment: rollbackSummary.environment,
    mode: 'rollback',
    sourceFile: path.basename(options.rollback), // Original rescue results file
    outputDir: '.'
  });

  // Process all clients (from Story 5.2 executor)
  const results = await executor.processAllClients(
    [...rollbackSummary.clients.rollback, ...rollbackSummary.clients.skip],
    {
      onProgress: ({ current, total, clientId }) => {
        progressBar.update(current, clientId);
      }
    }
  );

  progressBar.stop();

  // Add all results to the writer
  for (const result of results) {
    rollbackResultsWriter.addClientResult(result);
  }

  // Finalize and write output file
  const finalResult = rollbackResultsWriter.finalize();

  // Display rollback statistics
  displayRollbackStatistics(finalResult.summary, finalResult.filePath);

  // Clean up state file on success
  if (finalResult.summary.failed === 0) {
    stateManager.cleanup();
  }

  return;
}
```

### Client Result Schema for Rollback

**ROLLED_BACK Client:**
```json
{
  "id": "acc_abc123",
  "status": "ROLLED_BACK",
  "before": {
    "state": "active",
    "subscription_id": "sub_xyz789"
  },
  "after": {
    "state": "closed",
    "subscriptions": []
  },
  "error": null
}
```

**SKIPPED Client:**
```json
{
  "id": "acc_def456",
  "status": "SKIPPED",
  "before": null,
  "after": null,
  "error": null,
  "reason": "Client was not rescued in original execution"
}
```

**FAILED Client:**
```json
{
  "id": "acc_ghi789",
  "status": "FAILED",
  "before": {
    "state": "active",
    "subscription_id": "sub_pqr111"
  },
  "after": null,
  "error": "API error: subscription not found"
}
```

### File Structure After Story 5.3

```
RecurlyRescue/
├── rescue.js                       # Updated: Rollback results integration
├── src/
│   ├── config/                     # Existing
│   ├── cli/                        # Existing
│   ├── env/                        # Existing
│   ├── api/                        # Existing
│   ├── ui/                         # Existing
│   ├── state/                      # Existing
│   ├── output/
│   │   └── results-writer.js       # MODIFIED: Add rollback support
│   └── rollback/
│       ├── rollback-loader.js      # From Story 5.1
│       ├── rollback-display.js     # From Story 5.1
│       └── rollback-executor.js    # From Story 5.2
└── test/
    ├── ... existing tests ...
    └── results-writer.test.js      # UPDATED: Add rollback tests
```

### Testing Strategy

**Unit Tests for rollback mode in results-writer.js:**

```javascript
// test/results-writer.test.js - Additional rollback tests

test('createResultsWriter() handles rollback mode', (t) => {
  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    sourceFile: 'rescue-results-eur-2026-01-15.json',
    outputDir: TEST_DIR
  });

  const results = writer.getResults();
  assert.strictEqual(results.execution.mode, 'rollback');
  assert.strictEqual(results.execution.source_file, 'rescue-results-eur-2026-01-15.json');
});

test('addClientResult() updates rollback summary correctly', (t) => {
  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    outputDir: TEST_DIR
  });

  writer.addClientResult({ id: 'acc1', status: 'ROLLED_BACK', before: {}, after: {} });
  writer.addClientResult({ id: 'acc2', status: 'SKIPPED', before: null, after: null, reason: 'not rescued' });
  writer.addClientResult({ id: 'acc3', status: 'FAILED', before: {}, after: null, error: 'API error' });

  const results = writer.getResults();
  assert.strictEqual(results.summary.total, 3);
  assert.strictEqual(results.summary.rolled_back, 1);
  assert.strictEqual(results.summary.skipped, 1);
  assert.strictEqual(results.summary.failed, 1);
});

test('finalize() creates rollback-results filename', (t) => {
  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    outputDir: TEST_DIR
  });

  const result = writer.finalize();

  assert.ok(result.filePath.includes('rollback-results-eur-'));
  assert.ok(result.filePath.endsWith('.json'));
});

test('rollback JSON output matches PRD schema', (t) => {
  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    sourceFile: 'rescue-results-2026-01-15.json',
    outputDir: TEST_DIR
  });

  writer.addClientResult({
    id: 'acc_abc123',
    status: 'ROLLED_BACK',
    before: { state: 'active', subscription_id: 'sub_xyz789' },
    after: { state: 'closed', subscriptions: [] }
  });

  const result = writer.finalize();
  const content = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));

  // Verify PRD schema compliance
  assert.strictEqual(content.execution.mode, 'rollback');
  assert.strictEqual(content.execution.source_file, 'rescue-results-2026-01-15.json');
  assert.ok(content.summary.rolled_back !== undefined);
  assert.ok(content.summary.skipped !== undefined);
});

test('displayRollbackStatistics() shows correct labels', (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  displayRollbackStatistics(
    { total: 100, rolled_back: 90, skipped: 5, failed: 5 },
    '/path/to/rollback-results.json'
  );

  console.log = originalLog;

  const output = logs.join('\n');
  assert.ok(output.includes('ROLLBACK SUMMARY'));
  assert.ok(output.includes('Successfully rolled back:  90'));
  assert.ok(output.includes('Skipped (not rescued):     5'));
  assert.ok(output.includes('Failed:                    5'));
  assert.ok(output.includes('Success rate:              94.7%'));
  assert.ok(output.includes('/path/to/rollback-results.json'));
});

test('SKIPPED client includes reason field', (t) => {
  const writer = createResultsWriter({
    project: 'eur',
    environment: 'sandbox',
    mode: 'rollback',
    outputDir: TEST_DIR
  });

  writer.addClientResult({
    id: 'acc1',
    status: 'SKIPPED',
    before: null,
    after: null,
    reason: 'Client was not rescued in original execution'
  });

  const result = writer.finalize();
  const content = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));

  assert.strictEqual(content.clients[0].reason, 'Client was not rescued in original execution');
});
```

### Edge Cases to Handle

1. **Empty rollback:** All clients SKIPPED - generate file with 0 rolled_back
2. **All failed:** Rollback completely failed - generate file with all FAILED
3. **Source file path variations:** Handle absolute/relative paths
4. **Disk write failure:** Clear error message
5. **Success rate calculation:** Handle division by zero when all skipped

### Previous Story Learnings

**From Story 4.4 (Output Generation):**
- Factory function pattern with createResultsWriter
- File naming convention: `{type}-results-{project}-{timestamp}.json`
- displayStatistics pattern for terminal output
- Atomic file writes

**From Story 5.1 (Rollback Mode Activation):**
- Source file path available in options.rollback
- rollbackSummary has project and environment

**From Story 5.2 (State Restoration):**
- Results array with status: ROLLED_BACK, SKIPPED, FAILED
- Each result has before, after, error fields
- reason field for SKIPPED clients

### NFR Compliance

**FR22:** System generates rollback results file with same format as rescue results
- ✅ Same overall structure (execution, summary, clients)
- ✅ Rollback-specific metadata (mode, source_file)
- ✅ Rollback-specific summary counters
- ✅ Timestamp-based filename

**NFR-S4:** System must not log or display API keys
- ✅ Error sanitization (reuses existing pattern)
- ✅ No credentials in output file

### Dependencies

**From Previous Stories:**
- `src/output/results-writer.js` (Story 4.4) - Base implementation to extend
- `src/rollback/rollback-executor.js` (Story 5.2) - Provides results array
- `src/rollback/rollback-loader.js` (Story 5.1) - Provides source file info

**No new npm dependencies required.**

### Complete Epic 5 Flow

With Story 5.3 complete, the full rollback flow is:

1. **Story 5.1:** Load --rollback file → validate → display summary → confirm
2. **Story 5.2:** Process clients → cancel subscriptions → close accounts → collect results
3. **Story 5.3:** Generate rollback-results JSON → display statistics

**Example workflow:**
```bash
# Original rescue (Epic 3-4)
node rescue.js --env=sandbox --project=eur
# Creates: rescue-results-eur-2026-01-15T10-30-00.json

# Rollback (Epic 5)
node rescue.js --env=sandbox --project=eur --rollback=rescue-results-eur-2026-01-15T10-30-00.json
# Creates: rollback-results-eur-2026-01-20T14-30-00.json
```

### References

- [Source: docs/planning-artifacts/epics.md#Story 5.3 - Rollback Results Generation]
- [Source: docs/planning-artifacts/prd.md#FR22 - Generate rollback results]
- [Dependency: docs/implementation-artifacts/4-4-output-generation.md - Results writer base]
- [Dependency: docs/implementation-artifacts/5-1-rollback-mode-activation.md - Source file info]
- [Dependency: docs/implementation-artifacts/5-2-state-restoration.md - Results array]
- [Completes: Epic 5 - Rollback Operations]

## Change Log

- 2026-01-20: Ajout des tests rollback, validation stricte de `RECURLY_API_BASE_URL`, et support du mode rollback en test (`SKIP_API_CALLS`).

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- Tests: `npm test` (619 tests)

### Completion Notes List

- ✅ Tests rollback ajoutés pour le results-writer (schéma, source_file, résumé, affichage, nommage).
- ✅ Valeur `before` par défaut appliquée quand absente sans impacter les cas `SKIPPED`.
- ✅ Chargement anticipé du `.env` pour activer `SKIP_API_CALLS` en rollback.
- ✅ Validation d'URL API corrigée pour les chaînes vides.

### File List

**Created:**
- (none)

**Modified:**
- rescue.js
- src/config/env.js
- src/output/results-writer.js
- test/results-writer.test.js
- docs/implementation-artifacts/sprint-status.yaml
- docs/implementation-artifacts/5-3-rollback-results-generation.md
