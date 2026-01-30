/**
 * Seed CLI Argument Parser Module
 * Parses and validates command-line arguments for the Recurly Seed script
 *
 * Supported arguments:
 * --env=<sandbox|production>       (required) - Target environment
 * --project=<id>                   (required) - Recurly project identifier (eur, multi)
 * --count=<n>                      (optional) - Number of accounts to create (default: 100)
 * --currency=<EUR|random>          (optional) - Currency mode (default: project currency)
 * --start-date=<YYYY-MM-DD>        (optional) - Start of closed_at date range
 * --end-date=<YYYY-MM-DD>          (optional) - End of closed_at date range
 * --ratio=<active:legit:dunning>   (optional) - Distribution ratio (default: 40:30:30)
 * --dry-run                        (optional) - Simulate without making changes
 * --help                           (optional) - Display usage help
 */

const { isValidProjectId, getValidProjectIds, getProjectConfig } = require('../config/projects');

// List of known arguments for validation
const KNOWN_ARGS = [
  '--env=',
  '--project=',
  '--count=',
  '--currency=',
  '--start-date=',
  '--end-date=',
  '--ratio=',
  '--dry-run',
  '--help'
];

// Allowed currencies for random mode
const ALLOWED_CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP', 'CAD'];

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
 * Parse date string in YYYY-MM-DD format
 * @param {string} dateStr - Date string to parse
 * @param {string} argName - Argument name for error messages
 * @returns {Date} Parsed Date object
 * @throws {Error} If date format is invalid
 */
function parseDate(dateStr, argName) {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid ${argName} format: '${dateStr}'. Use YYYY-MM-DD`);
  }

  const date = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ${argName}: '${dateStr}' is not a valid date`);
  }

  return date;
}

/**
 * Parse ratio string in format active:legit:dunning
 * @param {string} ratioStr - Ratio string (e.g., "40:30:30")
 * @returns {Object} Parsed ratio { active, legit, dunning }
 * @throws {Error} If ratio format is invalid or doesn't sum to 100
 */
function parseRatio(ratioStr) {
  const parts = ratioStr.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid --ratio format: '${ratioStr}'. Use active:legit:dunning (e.g., 40:30:30)`);
  }

  const [activeStr, legitStr, dunningStr] = parts;
  const active = parseInt(activeStr, 10);
  const legit = parseInt(legitStr, 10);
  const dunning = parseInt(dunningStr, 10);

  if (isNaN(active) || isNaN(legit) || isNaN(dunning)) {
    throw new Error(`Invalid --ratio values: '${ratioStr}'. All values must be integers`);
  }

  if (active < 0 || legit < 0 || dunning < 0) {
    throw new Error(`Invalid --ratio values: '${ratioStr}'. All values must be non-negative`);
  }

  const sum = active + legit + dunning;
  if (sum !== 100) {
    throw new Error(`Invalid --ratio: values must sum to 100, got ${sum}`);
  }

  return { active, legit, dunning };
}

/**
 * Parse command-line arguments into structured options object
 * @param {string[]} argv - Process arguments (process.argv)
 * @returns {object} Parsed options object
 * @throws {Error} If required arguments are missing or validation fails
 */
function parseArgs(argv) {
  const args = argv.slice(2);

  // Initialize options with defaults
  const options = {
    env: null,
    project: null,
    count: 100,
    currency: null, // Will be resolved based on project
    startDate: null,
    endDate: null,
    ratio: { active: 40, legit: 30, dunning: 30 },
    dryRun: false,
    help: false
  };

  // Parse each argument
  for (const arg of args) {
    // Check for unknown arguments
    if (arg.startsWith('--') && !isKnownArg(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    if (arg.startsWith('--env=')) {
      options.env = arg.split('=')[1];
    } else if (arg.startsWith('--project=')) {
      options.project = arg.split('=')[1];
    } else if (arg.startsWith('--count=')) {
      const value = arg.split('=')[1];
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid --count value: '${value}' is not a valid number`);
      }
      if (parsed <= 0) {
        throw new Error(`Invalid --count value: '${value}' must be a positive number`);
      }
      options.count = parsed;
    } else if (arg.startsWith('--currency=')) {
      options.currency = arg.split('=')[1].toUpperCase();
    } else if (arg.startsWith('--start-date=')) {
      const value = arg.split('=')[1];
      options.startDate = parseDate(value, '--start-date');
    } else if (arg.startsWith('--end-date=')) {
      const value = arg.split('=')[1];
      options.endDate = parseDate(value, '--end-date');
    } else if (arg.startsWith('--ratio=')) {
      const value = arg.split('=')[1];
      options.ratio = parseRatio(value);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help') {
      options.help = true;
    }
  }

  // If --help is requested, return early without validation
  if (options.help) {
    return options;
  }

  // Validate required arguments
  if (!options.env) {
    throw new Error('Missing required argument: --env');
  }

  if (options.env !== 'sandbox' && options.env !== 'production') {
    throw new Error("Invalid --env value. Must be 'sandbox' or 'production'");
  }

  // SAFETY: Block production environment for seed script
  if (options.env === 'production') {
    throw new Error('Seed script cannot run against production environment. Use --env=sandbox');
  }

  // Trim and validate --project is not empty/whitespace
  if (!options.project || options.project.trim() === '') {
    throw new Error('Missing required argument: --project');
  }
  // Normalize project to lowercase for consistency
  options.project = options.project.trim().toLowerCase();

  // Validate project identifier against allowed values
  if (!isValidProjectId(options.project)) {
    const validIds = getValidProjectIds().join(', ');
    throw new Error(`Invalid --project value: '${options.project}'. Valid options: ${validIds}`);
  }

  // Validate currency based on project
  const projectConfig = getProjectConfig(options.project);

  if (options.currency === null) {
    // Default to project currency or EUR for multi-currency projects
    options.currency = projectConfig.currency || 'EUR';
  } else if (options.currency === 'RANDOM') {
    // Random currency mode
    if (projectConfig.currency !== null) {
      throw new Error(
        `Invalid --currency=random: project '${options.project}' has fixed currency '${projectConfig.currency}'. ` +
        `Random currency is only allowed for multi-currency projects.`
      );
    }
    options.currency = 'random';
  } else {
    // Specific currency provided
    if (!ALLOWED_CURRENCIES.includes(options.currency)) {
      throw new Error(
        `Invalid --currency value: '${options.currency}'. ` +
        `Valid options: ${ALLOWED_CURRENCIES.join(', ')}, random`
      );
    }
    // If project has fixed currency, validate it matches
    if (projectConfig.currency !== null && options.currency !== projectConfig.currency) {
      throw new Error(
        `Invalid --currency: project '${options.project}' requires '${projectConfig.currency}', ` +
        `got '${options.currency}'`
      );
    }
  }

  // Validate date range
  if (options.startDate && options.endDate) {
    if (options.startDate > options.endDate) {
      throw new Error('Invalid date range: --start-date must be before or equal to --end-date');
    }
  }

  // Set default dates if not provided (last 30 days)
  if (!options.startDate) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    options.startDate = thirtyDaysAgo;
  }

  if (!options.endDate) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    options.endDate = today;
  }

  return options;
}

/**
 * Display help message
 */
function displayHelp() {
  console.log(`
Recurly Sandbox Test Data Seeder

Usage: node seed.js --env=<sandbox|production> --project=<id> [options]

Required Arguments:
  --env=sandbox                    Target environment (production blocked for safety)
  --project=<id>                   Recurly project identifier (eur, multi)

Optional Arguments:
  --count=<n>                      Number of accounts to create (default: 100)
  --currency=<EUR|CHF|USD|GBP|CAD|random>  Currency mode (default: project currency)
                                       Use 'random' for multi-currency projects
  --start-date=<YYYY-MM-DD>        Start of closed_at date range (default: 30 days ago)
  --end-date=<YYYY-MM-DD>          End of closed_at date range (default: today)
  --ratio=<active:legit:dunning>   Distribution ratio (default: 40:30:30)
                                   Values must sum to 100
  --dry-run                        Simulate without making API calls
  --help                           Display this help message

Examples:
  node seed.js --env=sandbox --project=eur --count=10
  node seed.js --env=sandbox --project=multi --currency=random --count=50
  node seed.js --env=sandbox --project=eur --ratio=50:25:25 --dry-run

Account Types:
  - active:  Accounts with active subscriptions (not deactivated)
  - legit:   Accounts deactivated legitimately (voluntary churn)
  - dunning: Accounts deactivated by dunning (targets for rescue script)
`);
}

module.exports = {
  parseArgs,
  displayHelp,
  ALLOWED_CURRENCIES
};
