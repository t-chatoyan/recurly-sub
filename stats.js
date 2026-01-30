#!/usr/bin/env node

/**
 * Rescue Statistics Viewer
 * Analyzes rescued clients by querying Recurly API for current status
 *
 * Usage: node stats.js --env=<sandbox|production> --project=<id> <rescue-results.json>
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { loadConfig } = require('./src/config/env');
const { getProjectConfig } = require('./src/config/projects');
const { createClient } = require('./src/api/recurly-client');

// Load environment
dotenv.config({ quiet: true });

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m'
};

/**
 * Draw a horizontal bar
 */
function drawBar(value, total, width, bgColor) {
  if (total === 0) return colors.gray + '░'.repeat(width) + colors.reset;
  const filled = Math.round((value / total) * width);
  const empty = width - filled;
  return bgColor + ' '.repeat(filled) + colors.reset + colors.gray + '░'.repeat(empty) + colors.reset;
}

/**
 * Format percentage
 */
function formatPercent(value, total) {
  if (total === 0) return '0.0%';
  return ((value / total) * 100).toFixed(1) + '%';
}

/**
 * Get account status from Recurly
 * @param {Object} client - Recurly client
 * @param {string} accountCode - Account code
 * @param {string} rescueDate - ISO date string of when rescue was performed
 */
async function getAccountStatus(client, accountCode, rescueDate) {
  const rescueTime = new Date(rescueDate).getTime();

  try {
    // Get account info
    const accountResponse = await client.request(
      'GET',
      `/accounts/code-${encodeURIComponent(accountCode)}`
    );
    const account = accountResponse.data;

    // Get recent transactions (sorted by date desc = most recent first)
    const txResponse = await client.request(
      'GET',
      `/accounts/code-${encodeURIComponent(accountCode)}/transactions?limit=20&sort=created_at&order=desc`
    );
    const transactions = txResponse.data?.data || [];

    // Get invoices (sorted by date desc = most recent first)
    const invResponse = await client.request(
      'GET',
      `/accounts/code-${encodeURIComponent(accountCode)}/invoices?limit=10&sort=created_at&order=desc`
    );
    const invoices = invResponse.data?.data || [];

    // Find successful payment AFTER the rescue date
    const successfulTxAfterRescue = transactions.find(tx => {
      const txTime = new Date(tx.created_at).getTime();
      return tx.type === 'purchase' && tx.status === 'success' && txTime > rescueTime;
    });

    // Get the LATEST invoice (most recent)
    const latestInvoice = invoices[0];
    const latestInvoiceState = latestInvoice?.state;

    // Check if latest invoice is paid or closed (success states)
    const latestInvoicePaid = latestInvoiceState === 'paid' || latestInvoiceState === 'closed';

    // Check if latest invoice is failed or past_due (problem states)
    const latestInvoiceFailed = latestInvoiceState === 'failed' || latestInvoiceState === 'past_due';

    // Determine status based on CURRENT state (latest invoice)
    let status;
    if (account.state === 'closed' || account.state === 'inactive') {
      status = 'CLOSED';
    } else if (latestInvoicePaid) {
      // Latest invoice is paid - client is good
      status = 'PAID';
    } else if (latestInvoiceFailed) {
      // Latest invoice is failed/past_due - client has payment issues
      status = 'PAST_DUE';
    } else if (latestInvoiceState === 'pending' || latestInvoiceState === 'processing') {
      // Invoice is being processed
      status = 'PENDING';
    } else {
      status = 'UNKNOWN';
    }

    return {
      accountCode,
      accountState: account.state,
      status,
      lastPayment: successfulTxAfterRescue ? {
        amount: successfulTxAfterRescue.amount,
        date: successfulTxAfterRescue.created_at
      } : null,
      latestInvoiceState
    };
  } catch (error) {
    return {
      accountCode,
      status: 'ERROR',
      error: error.message
    };
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    env: null,
    project: null,
    file: null,
    help: false
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--env=')) {
      options.env = arg.split('=')[1];
    } else if (arg.startsWith('--project=')) {
      options.project = arg.split('=')[1];
    } else if (!arg.startsWith('--')) {
      options.file = arg;
    }
  }

  return options;
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs(process.argv);

  if (options.help || !options.file) {
    console.log('Usage: node stats.js --env=<sandbox|production> --project=<id> <rescue-results.json>');
    console.log('\nAnalyzes rescued clients by querying Recurly API for current payment status.');
    console.log('\nOptions:');
    console.log('  --env=<sandbox|production>  Target environment (required)');
    console.log('  --project=<id>              Project identifier (required)');
    console.log('  <file>                      Path to rescue-results JSON file');
    process.exit(options.help ? 0 : 1);
  }

  if (!options.env) {
    console.error('Error: --env is required');
    process.exit(1);
  }

  if (!options.project) {
    console.error('Error: --project is required');
    process.exit(1);
  }

  const filePath = options.file;

  // Check file exists
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Read and parse JSON
  let data;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(content);
  } catch (error) {
    console.error(`Error: Failed to parse JSON: ${error.message}`);
    process.exit(1);
  }

  // Initialize Recurly client
  console.log(`Loading configuration for ${options.env}...`);
  const config = loadConfig(options.env);
  const projectConfig = getProjectConfig(options.project);
  const recurlyClient = createClient({
    apiKey: config.apiKey,
    apiBaseUrl: config.apiBaseUrl,
    projectConfig,
    maxRetries: config.retryCount,
    retryBackoffBase: config.retryBackoffBase,
    retryBackoffMax: config.retryBackoffMax
  });

  // Extract rescued clients
  const { execution, clients } = data;
  const rescuedClients = clients?.filter(c => c.status === 'RESCUED') || [];
  const rescueDate = execution?.timestamp || new Date().toISOString();

  console.log(`\nFound ${rescuedClients.length} rescued clients to analyze...`);
  console.log(`Rescue date: ${new Date(rescueDate).toLocaleString()}\n`);

  if (rescuedClients.length === 0) {
    console.log('No rescued clients found in file.');
    process.exit(0);
  }

  // Query each client
  const results = {
    PAID: [],
    PAST_DUE: [],
    CLOSED: [],
    PENDING: [],
    UNKNOWN: [],
    ERROR: []
  };

  let processed = 0;
  for (const client of rescuedClients) {
    processed++;
    process.stdout.write(`\rAnalyzing clients... ${processed}/${rescuedClients.length}`);

    const status = await getAccountStatus(recurlyClient, client.id, rescueDate);
    results[status.status].push(status);
  }

  console.log('\n');

  // Calculate totals
  const total = rescuedClients.length;
  const paid = results.PAID.length;
  const pastDue = results.PAST_DUE.length;
  const closed = results.CLOSED.length;
  const pending = results.PENDING.length;
  const unknown = results.UNKNOWN.length;
  const errors = results.ERROR.length;

  // Display header
  console.log(colors.bright + colors.cyan);
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           RESCUED CLIENTS STATUS REPORT                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝' + colors.reset);

  // File info
  console.log('\n' + colors.gray + '  File: ' + path.basename(filePath) + colors.reset);
  if (execution) {
    console.log(colors.gray + `  Rescue Date: ${new Date(execution.timestamp).toLocaleString()}` + colors.reset);
    console.log(colors.gray + `  Environment: ${execution.environment}` + colors.reset);
    console.log(colors.gray + `  Project: ${execution.project}` + colors.reset);
  }

  // Summary box
  console.log('\n' + colors.bright + '  Rescued Clients Analyzed' + colors.reset);
  console.log('  ┌────────────────────────────────────────────────────┐');
  console.log(`  │  Total: ${colors.bright}${total.toString().padEnd(43)}${colors.reset}│`);
  console.log('  └────────────────────────────────────────────────────┘');

  // Detailed stats with bars
  const barWidth = 30;

  console.log('\n' + colors.bright + '  Current Status Breakdown' + colors.reset);
  console.log('  ' + '─'.repeat(60));

  // PAID (success)
  const paidBar = drawBar(paid, total, barWidth, colors.bgGreen);
  console.log(`  ${colors.green}✓ PAID${colors.reset}        ${paidBar} ${paid.toString().padStart(4)} (${formatPercent(paid, total).padStart(6)})`);

  // PAST_DUE
  const pastDueBar = drawBar(pastDue, total, barWidth, colors.bgYellow);
  console.log(`  ${colors.yellow}⏳ PAST DUE${colors.reset}   ${pastDueBar} ${pastDue.toString().padStart(4)} (${formatPercent(pastDue, total).padStart(6)})`);

  // CLOSED
  const closedBar = drawBar(closed, total, barWidth, colors.bgRed);
  console.log(`  ${colors.red}✗ CLOSED${colors.reset}     ${closedBar} ${closed.toString().padStart(4)} (${formatPercent(closed, total).padStart(6)})`);

  // UNKNOWN
  if (unknown > 0) {
    const unknownBar = drawBar(unknown, total, barWidth, colors.bgBlue);
    console.log(`  ${colors.blue}? UNKNOWN${colors.reset}    ${unknownBar} ${unknown.toString().padStart(4)} (${formatPercent(unknown, total).padStart(6)})`);
  }

  // ERRORS
  if (errors > 0) {
    const errorBar = drawBar(errors, total, barWidth, colors.bgMagenta);
    console.log(`  ${colors.magenta}⚠ ERROR${colors.reset}      ${errorBar} ${errors.toString().padStart(4)} (${formatPercent(errors, total).padStart(6)})`);
  }

  console.log('  ' + '─'.repeat(60));

  // Pie chart visualization
  console.log('\n' + colors.bright + '  Distribution Chart' + colors.reset);
  console.log('  ' + '─'.repeat(50));

  const chartWidth = 40;
  let bar = '  │';
  const segments = [
    { value: paid, bgColor: colors.bgGreen },
    { value: pastDue, bgColor: colors.bgYellow },
    { value: closed, bgColor: colors.bgRed },
    { value: unknown, bgColor: colors.bgBlue },
    { value: errors, bgColor: colors.bgMagenta }
  ];

  segments.forEach(seg => {
    const chars = total > 0 ? Math.round((seg.value / total) * chartWidth) : 0;
    bar += seg.bgColor + ' '.repeat(chars) + colors.reset;
  });
  bar += '│';
  console.log(bar);
  console.log('  ' + '─'.repeat(50));

  // Legend
  console.log('\n  Legend:');
  console.log(`  ${colors.bgGreen}  ${colors.reset} ${colors.green}PAID${colors.reset} - Payment successful after rescue`);
  console.log(`  ${colors.bgYellow}  ${colors.reset} ${colors.yellow}PAST DUE${colors.reset} - Has unpaid/failed invoices`);
  console.log(`  ${colors.bgRed}  ${colors.reset} ${colors.red}CLOSED${colors.reset} - Account closed/inactive`);

  // Success rate
  const successRate = total > 0 ? ((paid / total) * 100).toFixed(1) : 0;
  console.log('\n  ┌────────────────────────────────────────────────────┐');
  if (successRate >= 70) {
    console.log(`  │  ${colors.green}${colors.bright}PAYMENT SUCCESS RATE: ${successRate}%${colors.reset}                      │`);
  } else if (successRate >= 40) {
    console.log(`  │  ${colors.yellow}${colors.bright}PAYMENT SUCCESS RATE: ${successRate}%${colors.reset}                      │`);
  } else {
    console.log(`  │  ${colors.red}${colors.bright}PAYMENT SUCCESS RATE: ${successRate}%${colors.reset}                       │`);
  }
  console.log('  └────────────────────────────────────────────────────┘');

  // List PAST_DUE clients
  if (pastDue > 0) {
    console.log('\n' + colors.bright + colors.yellow + '  Past Due Clients:' + colors.reset);
    console.log('  ' + '─'.repeat(50));
    results.PAST_DUE.slice(0, 20).forEach(c => {
      console.log(`  ${colors.yellow}•${colors.reset} ${c.accountCode}`);
    });
    if (pastDue > 20) {
      console.log(`  ${colors.gray}... and ${pastDue - 20} more${colors.reset}`);
    }
  }

  // List CLOSED clients
  if (closed > 0) {
    console.log('\n' + colors.bright + colors.red + '  Closed Clients:' + colors.reset);
    console.log('  ' + '─'.repeat(50));
    results.CLOSED.slice(0, 20).forEach(c => {
      console.log(`  ${colors.red}•${colors.reset} ${c.accountCode} (${c.accountState})`);
    });
    if (closed > 20) {
      console.log(`  ${colors.gray}... and ${closed - 20} more${colors.reset}`);
    }
  }

  // Generate URLs file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseUrl = config.baseUrl;

  // Generate separate URL files
  if (pastDue > 0) {
    const pastDueUrls = results.PAST_DUE.map(c => `${baseUrl}/${c.accountCode}`).join('\n');
    const pastDueFile = `stats-past-due-${options.project}-${timestamp}.txt`;
    fs.writeFileSync(pastDueFile, pastDueUrls);
    console.log(`\n  ${colors.yellow}Past Due URLs:${colors.reset} ${pastDueFile}`);
  }

  if (closed > 0) {
    const closedUrls = results.CLOSED.map(c => `${baseUrl}/${c.accountCode}`).join('\n');
    const closedFile = `stats-closed-${options.project}-${timestamp}.txt`;
    fs.writeFileSync(closedFile, closedUrls);
    console.log(`  ${colors.red}Closed URLs:${colors.reset} ${closedFile}`);
  }

  if (paid > 0) {
    const paidUrls = results.PAID.map(c => `${baseUrl}/${c.accountCode}`).join('\n');
    const paidFile = `stats-paid-${options.project}-${timestamp}.txt`;
    fs.writeFileSync(paidFile, paidUrls);
    console.log(`  ${colors.green}Paid URLs:${colors.reset} ${paidFile}`);
  }

  console.log('\n');
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
