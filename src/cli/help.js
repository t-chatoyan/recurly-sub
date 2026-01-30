/**
 * Help Display Module
 * Provides comprehensive help text for the Recurly Rescue Script CLI
 */

/**
 * Display comprehensive help message
 * Shows usage, arguments, examples, and notes for the CLI tool
 *
 * @returns {void}
 *
 * @note The caller should exit with code 0 after calling this function
 */
function displayHelp() {
  try {
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
  --start-date=<YYYY-MM-DD>      Start of closed_at date range filter
  --end-date=<YYYY-MM-DD>        End of closed_at date range filter

EXAMPLES:
  # Test in sandbox with dry-run
  node rescue.js --env=sandbox --project=eur --dry-run

  # Query specific date range (useful for seeded test data)
  node rescue.js --env=sandbox --project=multi --start-date=2026-01-01 --end-date=2026-01-21

  # Rescue single client for testing
  node rescue.js --env=sandbox --project=eur --client-id=abc123

  # Full rescue with confirmations every 50 clients
  node rescue.js --env=production --project=eur --confirm-every=50

  # Continuous mode without pauses
  node rescue.js --env=production --project=eur --no-confirm

  # Resume from last interrupted execution
  node rescue.js --env=production --project=eur --resume

  # Rollback previous execution
  node rescue.js --env=production --rollback=./rescue-results-eur-2026-01-20.json

NOTES:
  - Requires .env file with RECURLY_SANDBOX_API_KEY and/or RECURLY_PRODUCTION_API_KEY
  - Optional: set RECURLY_API_BASE_URL (e.g., https://v3.eu.recurly.com for EU accounts)
  - Production mode requires explicit confirmation before execution
  - All actions are logged with timestamps and Recurly URLs
  - State is persisted automatically for crash recovery
`.trim());
  } catch (error) {
    // Fail gracefully if we can't display help (e.g., stdout closed)
    process.exit(1);
  }
}

module.exports = { displayHelp };
