/**
 * CLI Argument Parser Module
 * Parses and validates command-line arguments for the Recurly Rescue script
 *
 * Supported arguments:
 * --env=<sandbox|production>  (required) - Target environment
 * --project=<id>              (required) - Recurly project identifier (eur, multi)
 * --dry-run                   (optional) - Simulate without making changes
 * --rollback=<file>           (optional) - Path to rescue-results JSON for rollback
 * --confirm-every=<n>         (optional) - Pause every N clients (default: 100)
 * --no-confirm                (optional) - Run continuously without pauses
 * --client-id=<id>            (optional) - Target single client by ID
 * --help                      (optional) - Display usage help
 * --resume                    (optional) - Resume from state file
 * --start-date=<YYYY-MM-DD>   (optional) - Start of closed_at date range
 * --end-date=<YYYY-MM-DD>     (optional) - End of closed_at date range
 * --price=<amount>            (optional) - Price for rescue plan (default: 29.90)
 * --no-trial                  (optional) - Charge immediately without trial period
 * --limit=<n>                 (optional) - Maximum number of clients to process
 * --random                    (optional) - Randomize client selection (use with --limit)
 */

const { isValidProjectId, getValidProjectIds } = require('../config/projects');

// List of known arguments for validation
const KNOWN_ARGS = [
  '--env=',
  '--project=',
  '--dry-run',
  '--rollback=',
  '--confirm-every=',
  '--no-confirm',
  '--client-id=',
  '--help',
  '--resume',
  '--start-date=',
  '--end-date=',
  '--price=',
  '--no-trial',
  '--limit=',
  '--random'
];

/**
 * Check if an argument matches any known argument pattern
 * @param {string} arg - The argument to check
 * @returns {boolean} True if argument is known
 */
function isKnownArg(arg) {
  return KNOWN_ARGS.some(known => {
    if (known.endsWith('=')) {
      return arg.startsWith(known);
    }
    return arg === known;
  });
}

/**
 * Parse command-line arguments into structured options object
 * @param {string[]} argv - Process arguments (process.argv)
 * @returns {object} Parsed options object
 * @throws {Error} If required arguments are missing or conflicts detected
 */
function parseArgs(argv) {
  const args = argv.slice(2);

  // Initialize options with defaults
  const options = {
    env: null,
    project: null,
    dryRun: false,
    rollback: null,
    confirmEvery: null,
    noConfirm: false,
    clientId: null,
    help: false,
    resume: false,
    startDate: null,
    endDate: null,
    price: null,
    noTrial: false,
    limit: null,
    random: false
  };

  // Parse each argument
  for (const arg of args) {
    // [HIGH-1 FIX] Check for unknown arguments
    if (arg.startsWith('--') && !isKnownArg(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    if (arg.startsWith('--env=')) {
      options.env = arg.split('=')[1];
    } else if (arg.startsWith('--project=')) {
      options.project = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--rollback=')) {
      options.rollback = arg.split('=')[1];
    } else if (arg.startsWith('--confirm-every=')) {
      const value = arg.split('=')[1];
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid --confirm-every value: '${value}' is not a valid number`);
      }
      // [MEDIUM-1 FIX] Validate positive integer
      if (parsed <= 0) {
        throw new Error(`Invalid --confirm-every value: '${value}' must be a positive number`);
      }
      options.confirmEvery = parsed;
    } else if (arg === '--no-confirm') {
      options.noConfirm = true;
    } else if (arg.startsWith('--client-id=')) {
      const value = arg.split('=')[1];
      if (!value || value.trim() === '') {
        throw new Error('--client-id requires a non-empty value');
      }
      options.clientId = value.trim();
    } else if (arg === '--help') {
      options.help = true;
    } else if (arg === '--resume') {
      options.resume = true;
    } else if (arg.startsWith('--start-date=')) {
      const value = arg.split('=')[1];
      const parsed = new Date(value + 'T00:00:00Z');
      if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid --start-date value: '${value}' is not a valid date (use YYYY-MM-DD)`);
      }
      options.startDate = parsed;
    } else if (arg.startsWith('--end-date=')) {
      const value = arg.split('=')[1];
      const parsed = new Date(value + 'T23:59:59Z');
      if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid --end-date value: '${value}' is not a valid date (use YYYY-MM-DD)`);
      }
      options.endDate = parsed;
    } else if (arg.startsWith('--price=')) {
      const value = arg.split('=')[1];
      const parsed = parseFloat(value);
      if (isNaN(parsed)) {
        throw new Error(`Invalid --price value: '${value}' is not a valid number`);
      }
      if (parsed < 0) {
        throw new Error(`Invalid --price value: '${value}' must be a non-negative number`);
      }
      options.price = parsed;
    } else if (arg === '--no-trial') {
      options.noTrial = true;
    } else if (arg.startsWith('--limit=')) {
      const value = arg.split('=')[1];
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid --limit value: '${value}' is not a valid number`);
      }
      if (parsed <= 0) {
        throw new Error(`Invalid --limit value: '${value}' must be a positive number`);
      }
      options.limit = parsed;
    } else if (arg === '--random') {
      options.random = true;
    }
  }

  // If --help is requested, return early without validation (Story 1.4 will handle display)
  if (options.help) {
    return options;
  }

  // Validate required arguments (FR24)
  if (!options.env) {
    throw new Error('Missing required argument: --env');
  }

  if (options.env !== 'sandbox' && options.env !== 'production') {
    throw new Error("Invalid --env value. Must be 'sandbox' or 'production'");
  }

  // [MEDIUM-2 FIX] Trim and validate --project is not empty/whitespace
  if (!options.project || options.project.trim() === '') {
    throw new Error('Missing required argument: --project');
  }
  // Normalize project to lowercase for consistency (Finding 2)
  options.project = options.project.trim().toLowerCase();

  // [Story 2.2] Validate project identifier against allowed values
  if (!isValidProjectId(options.project)) {
    const validIds = getValidProjectIds().join(', ');
    throw new Error(`Invalid --project value: '${options.project}'. Valid options: ${validIds}`);
  }

  // Detect argument conflicts (FR25)
  if (options.dryRun && options.rollback) {
    throw new Error('Cannot combine --dry-run with --rollback');
  }

  if (options.confirmEvery !== null && options.noConfirm) {
    throw new Error('Cannot use both --confirm-every and --no-confirm');
  }

  // [HIGH-3 FIX] --resume conflicts with --client-id (resume is for batch operations)
  if (options.resume && options.clientId) {
    throw new Error('Cannot combine --resume with --client-id (resume is for batch operations)');
  }

  // [MEDIUM-3 FIX] --resume conflicts with --rollback (different modes)
  if (options.resume && options.rollback) {
    throw new Error('Cannot combine --resume with --rollback');
  }

  // Validate date range if both dates provided
  if (options.startDate && options.endDate && options.startDate > options.endDate) {
    throw new Error('Invalid date range: --start-date must be before --end-date');
  }

  // Apply defaults
  // Default --confirm-every to 100 when neither --confirm-every nor --no-confirm is provided
  if (options.confirmEvery === null && !options.noConfirm) {
    options.confirmEvery = 100;
  }

  return options;
}

module.exports = { parseArgs };
