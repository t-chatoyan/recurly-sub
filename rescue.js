#!/usr/bin/env node

/**
 * Recurly Rescue Script
 * CLI tool to recover subscriptions closed by dunning bot via Recurly API v3
 *
 * Usage: node rescue.js --env=<sandbox|production> --project=<id> [options]
 */

const dotenv = require('dotenv');
const { loadConfig } = require('./src/config/env');
const { parseArgs } = require('./src/cli/args');
const { initEnvironment } = require('./src/env/environment');
const { confirmProduction, confirmRollback } = require('./src/cli/prompt');
const { displayHelp } = require('./src/cli/help');
const { getProjectConfig } = require('./src/config/projects');
const { createClient } = require('./src/api/recurly-client');
const { queryClosedAccounts, getAccountById, hasBillingInfo, reopenAccount } = require('./src/api/accounts');
const { createStateManager, findLatestStateFile, loadStateFile } = require('./src/state/state-manager');
const { createResultsWriter, displayStatistics, displayRollbackStatistics } = require('./src/output/results-writer');
const { loadRollbackFile, calculateRollbackSummary, validateEnvironmentMatch, validateProjectMatch } = require('./src/rollback/rollback-loader');
const { displayRollbackSummary } = require('./src/rollback/rollback-display');
const { createRollbackExecutor } = require('./src/rollback/rollback-executor');
const { createLogger } = require('./src/ui/logger');
const { createProgressBar } = require('./src/ui/progress');
const { findOrCreateMultiCurrencyRescuePlan, findOrCreateRescuePlan, RESCUE_PLAN_CODE, getRescuePlanCode, getUnitAmountForCurrency, CURRENCY_UNIT_AMOUNTS } = require('./src/rescue/plan-manager');
const { rescueClient, getSubscriptionInvoices, getAccountInvoices, getAccountLineItems } = require('./src/rescue/subscription-manager');
const { createExecutionController, getConfirmationInterval, displayConfirmationInfo } = require('./src/rescue/execution-control');
const { setDryRunMode } = require('./src/rescue/dry-run');

/** Account IDs to exclude from resubscribe (edit this array as needed) */
const EXCLUDE_ACCOUNT_IDS = [
  "cus_prod_254774_UvygY68z",
  "cus_prod_255016_3ZxVcdYe",
  "cus_prod_255350_jOZkJw3q",

  "cus_prod_256299_xmjcTUBD",
  "cus_prod_257021_Od4mpEjP",
  "cus_prod_257059_DcLNhgD6",
  "cus_prod_257222_atGnKQza",
  "cus_prod_257257_cBykppCT",
  "cus_prod_257312_Y7jGIYKG",
  "cus_prod_257515_HMH2Cpj4",
  "cus_prod_16479_UQTpK9LW",
  "cus_prod_258275_ZQP7F07s",
  "cus_prod_258553_4YgLBvS1",
  "cus_prod_257230_CBDqQDkk",
  "cus_prod_258182_Mb8D1KDt",
  "cus_prod_259854_EfSszWCN",
  "cus_prod_260304_jzn5eXjq",
  "cus_prod_261538_zg7vxcvn",
  "cus_prod_261599_KC8o4Li0",
  "cus_prod_261815_HBJ4BuWR",
  "cus_prod_261867_bu6XZJ2G",
  "cus_prod_261888_gCB914Gx",
  "cus_prod_262300_4XR5DQQA",
  "cus_prod_262315_9GL6FkWm",
  "cus_prod_262526_bi16uPu2",
  "cus_prod_263141_Bgn5KHau",
  "cus_prod_263173_u6FBWsEc",
  "cus_prod_263204_ZnqT0LWC",
  "cus_prod_264228_PnDCPCxU",
  "cus_prod_264694_8wCOUfzx",
  "cus_prod_264694_8wCOUfzx",
  "cus_prod_265541_lUWL871N",
  "cus_prod_265747_pTYYHSPE",
  "cus_prod_265956_9tI3xRh7",
  "cus_prod_266254_Y5WvH024",
  "cus_prod_266254_Y5WvH024",
  "cus_prod_266384_ljlyjjkA",
  "cus_prod_266782_09i1t1QI",
  "cus_prod_266858_yxlJ52RG",
  "cus_prod_267073_Id43U0yX",

];

/**
 * Main entry point
 * Parses arguments, loads configuration, and initializes the rescue process
 */
async function main() {
  let options;

  try {
    // Parse and validate CLI arguments (Story 1.2)
    options = parseArgs(process.argv);
  } catch (error) {
    // Handle argument parsing errors with user-friendly messages
    console.error(`ERROR: ${error.message}`);
    console.error('Usage: node rescue.js --env=<sandbox|production> --project=<id> [options]');
    process.exit(1);
  }

  // --help handling (Story 1.4)
  if (options.help) {
    displayHelp();
    process.exit(0);
  }

  // Load .env early for test flags like SKIP_API_CALLS
  dotenv.config({ quiet: true });

  // --rollback handling (Story 5.1)
  let rollbackData = null;
  let rollbackSummary = null;

  if (options.rollback) {
    if (process.env.SKIP_API_CALLS === 'true') {
      console.log(`Mode: ROLLBACK from ${options.rollback}`);
      console.log('Rescue script initialized. (API calls skipped in test mode)');
      return;
    }

    try {
      // Load and validate rollback file
      console.log(`Loading rollback file: ${options.rollback}`);
      rollbackData = loadRollbackFile(options.rollback);

      // Validate environment match
      validateEnvironmentMatch(rollbackData, options.env);

      // Validate project match
      validateProjectMatch(rollbackData, options.project);

      // Calculate and display summary
      rollbackSummary = calculateRollbackSummary(rollbackData);
      displayRollbackSummary(rollbackSummary);

      // Handle zero clients case
      if (rollbackSummary.toRollback === 0) {
        console.log('No clients to rollback. All clients in the file were FAILED or SKIPPED.');
        process.exit(0);
      }

      // Prompt for confirmation
      const confirmed = await confirmRollback(rollbackSummary);
      if (!confirmed) {
        console.log('Rollback cancelled by user.');
        process.exit(0);
      }

      console.log('Proceeding with rollback...');

      // Execute rollback (Story 5.2)
      try {
        // Load configuration
        const config = loadConfig(options.env);

        // Initialize Recurly API client
        const projectConfig = getProjectConfig(options.project);
        const recurlyClient = createClient({
          apiKey: config.apiKey,
          apiBaseUrl: config.apiBaseUrl,
          projectConfig,
          maxRetries: config.retryCount,
          retryBackoffBase: config.retryBackoffBase,
          retryBackoffMax: config.retryBackoffMax
        });

        // Initialize logger for rollback
        const logger = createLogger({
          dryRun: false, // Rollback doesn't have dry-run mode
          project: options.project
        });

        // Initialize state manager for crash recovery
        const stateManager = createStateManager({
          project: options.project,
          environment: options.env,
          mode: 'rollback',
          stateDir: '.'
        });

        // Combine clients to process (rollback + skip)
        const allClients = [
          ...rollbackSummary.clients.rollback,
          ...rollbackSummary.clients.skip
        ];

        // Initialize state manager with clients
        stateManager.initialize(allClients.map(c => ({ id: c.id })));
        console.log(`State file created: ${stateManager.getStateFilePath()}`);

        // Create progress bar (Story 4.1)
        const progressBar = createProgressBar(allClients.length);

        // Create rollback executor
        const executor = createRollbackExecutor({
          recurlyClient,
          logger,
          stateManager,
          project: options.project
        });

        // Process all clients
        const results = await executor.processAllClients(allClients, {
          onProgress: ({ current, total, clientId }) => {
            progressBar.update(current, clientId);
          }
        });

        // Calculate stats from results for progress bar completion
        const rollbackSuccessful = results.filter(r => r.status !== 'FAILED').length;
        const rollbackFailed = results.filter(r => r.status === 'FAILED').length;
        progressBar.complete({ successful: rollbackSuccessful, failed: rollbackFailed });

        // Initialize results writer for rollback mode (Story 5.3)
        const rollbackResultsWriter = createResultsWriter({
          project: options.project,
          environment: options.env,
          mode: 'rollback',
          sourceFile: options.rollback,
          outputDir: '.'
        });

        // Add all results to the writer
        for (const result of results) {
          rollbackResultsWriter.addClientResult(result);
        }

        // Finalize and write output file
        const finalResult = rollbackResultsWriter.finalize();

        // Display rollback statistics
        displayRollbackStatistics(finalResult.summary, finalResult.filePath);

        // Clean up state file on success (no failures)
        if (finalResult.summary.failed === 0) {
          stateManager.cleanup();
          console.log('State file cleaned up (all operations successful).');
        } else {
          console.log(`State file preserved at: ${stateManager.getStateFilePath()}`);
          console.log(`${finalResult.summary.failed} client(s) failed. You can investigate and retry.`);
        }

        process.exit(finalResult.summary.failed > 0 ? 1 : 0);

      } catch (rollbackError) {
        console.error(`ERROR during rollback execution: ${rollbackError.message}`);
        process.exit(1);
      }

    } catch (error) {
      console.error(`ERROR: ${error.message}`);
      process.exit(1);
    }
  }

  try {
    // Load configuration using validated envType
    const config = loadConfig(options.env);

    // Initialize environment configuration (Story 1.3)
    const environment = initEnvironment(options.env, config.apiBaseUrl);

    // Production confirmation prompt (FR29: prevent accidental production execution)
    if (environment.isProduction) {
      const confirmed = await confirmProduction();
      if (!confirmed) {
        console.log('Operation cancelled by user.');
        process.exit(0);
      }
    }

    // Config loaded successfully - NFR-S4: Never log API key value
    console.log(`Configuration loaded for ${config.envType} environment`);
    console.log(`Retry settings: count=${config.retryCount}, backoff=${config.retryBackoffBase}s-${config.retryBackoffMax}s`);

    // Display environment info (Story 1.3)
    console.log(`Environment: ${environment.name} (API: ${environment.apiBaseUrl})`);

    // Load project configuration (Story 2.2)
    const projectConfig = getProjectConfig(options.project);

    // Initialize dry-run mode if requested
    if (options.dryRun) {
      setDryRunMode(true);
    }

    // Display parsed options summary (without sensitive data)
    console.log(`Project: ${projectConfig.name} (${projectConfig.id})`);
    if (options.dryRun) {
      console.log('Mode: DRY-RUN (no changes will be made)');
    }
    if (options.rollback) {
      console.log(`Mode: ROLLBACK from ${options.rollback}`);
    }
    if (options.clientId) {
      console.log(`Target: Single client ${options.clientId}`);
    }
    if (options.noConfirm) {
      console.log('Confirmation: Disabled (continuous mode)');
    } else if (options.confirmEvery) {
      console.log(`Confirmation: Every ${options.confirmEvery} clients`);
    }
    if (options.resume) {
      console.log('Resume: Will attempt to resume from state file');
    }
    if (options.limit) {
      console.log(`Limit: Maximum ${options.limit} clients${options.random ? ' (random)' : ''}`);
    }

    // Skip API calls in test mode (for CLI-only tests)
    // Set SKIP_API_CALLS=true in tests that only verify CLI behavior
    if (process.env.SKIP_API_CALLS === 'true') {
      console.log('Rescue script initialized. (API calls skipped in test mode)');
      return;
    }

    // Initialize Recurly API client (Story 2.1 + 2.2)
    const recurlyClient = createClient({
      apiKey: config.apiKey,
      apiBaseUrl: config.apiBaseUrl,
      projectConfig,
      maxRetries: config.retryCount,
      retryBackoffBase: config.retryBackoffBase,
      retryBackoffMax: config.retryBackoffMax
    });

    // State management variables (Story 4.3)
    let accounts;
    let stateManager;
    let resumeIndex = 0;
    let totalForProgress = 0;  // Track total count for progress bar (different from accounts.length during resume)

    // Handle --resume flag: attempt to load state file (Story 4.3 AC2)
    if (options.resume) {
      console.log('Looking for state file to resume from...');
      const stateFilePath = findLatestStateFile(options.project, '.');

      if (!stateFilePath) {
        console.error('ERROR: No state file found to resume from.');
        console.error('Run without --resume to start fresh execution.');
        process.exit(1);
      }

      try {
        const loadedState = loadStateFile(stateFilePath);

        // Validate environment matches (Story 4.3 AC3 - different environment)
        if (loadedState.metadata.environment !== options.env) {
          console.error(`ERROR: State file is for '${loadedState.metadata.environment}' environment`);
          console.error(`       but you specified --env=${options.env}`);
          console.error('State file may be from a different execution context.');
          process.exit(1);
        }

        // Validate project matches (Story 4.3 Task 4.2)
        if (loadedState.metadata.project !== options.project) {
          console.error(`ERROR: State file is for project '${loadedState.metadata.project}'`);
          console.error(`       but you specified --project=${options.project}`);
          process.exit(1);
        }

        // Create state manager and resume from loaded state
        stateManager = createStateManager({
          project: options.project,
          environment: options.env,
          mode: options.rollback ? 'rollback' : 'rescue',
          stateDir: '.'
        });
        stateManager.resumeFrom(loadedState, stateFilePath);

        // Get pending accounts to resume processing
        const pendingIds = stateManager.getPendingAccounts();
        resumeIndex = stateManager.getProcessedCount();
        const totalCount = stateManager.getTotalCount();

        console.log(`Resuming from client ${resumeIndex + 1}/${totalCount}`);
        console.log(`${pendingIds.length} clients remaining to process`);

        // Convert pending IDs back to account objects for processing
        // Note: pendingIds are account codes, so set code property
        accounts = pendingIds.map(id => ({ id, code: id }));
        totalForProgress = totalCount;  // Use original total for progress bar

      } catch (error) {
        // Handle corrupted state file (Story 4.3 AC3)
        console.error(`ERROR: ${error.message}`);
        console.error('State file may be corrupted. Run without --resume to start fresh.');
        process.exit(1);
      }
    } else {
      // Fresh execution - query accounts based on mode (Story 2.1 + 2.3)
      if (options.clientId) {
        // Single client mode (Story 2.3)
        console.log(`Single client mode: ${options.clientId}`);
        const account = await getAccountById(recurlyClient, options.clientId);

        console.log('Account details:');
        console.log(`  Code: ${account.code}`);
        console.log(`  State: ${account.state}`);
        console.log(`  Closed at: ${account.closed_at || 'N/A'}`);
        if (account.email) {
          console.log(`  Email: ${account.email}`);
        }

        // DEBUG DUMP: Show all subscriptions, invoices, and activities for this account
        console.log('\n=== DEBUG DUMP FOR DUNNING ANALYSIS ===');

        // Subscriptions
        try {
          const subsResponse = await recurlyClient.request(
            'GET',
            `/accounts/code-${encodeURIComponent(account.code)}/subscriptions?limit=20`
          );
          const subs = subsResponse.data?.data || [];
          console.log(`\nSubscriptions (aaaaaaaaaaa):`, subs);
          console.log(`\nSubscriptions (${subs.length}):`);
          subs.forEach(sub => {
            console.log(`  - ${sub.uuid}`);
            console.log(`    state: ${sub.state}`);
            console.log(`    plan: ${sub.plan?.code || sub.plan}`);
            console.log(`    expiration_reason: ${sub.expiration_reason}`);
            console.log(`    canceled_at: ${sub.canceled_at}`);
            console.log(`    expired_at: ${sub.expired_at}`);
            console.log(`    ALL FIELDS: ${JSON.stringify(sub).substring(0, 500)}...`);
          });
        } catch (e) {
          console.log(`Subscriptions: Error - ${e.message}`);
        }

        // Invoices
        try {
          const invResponse = await recurlyClient.request(
            'GET',
            `/accounts/code-${encodeURIComponent(account.code)}/invoices?limit=20`
          );
          const invoices = invResponse.data?.data || [];
          console.log(`\nInvoices (${invoices.length}):`);
          invoices.forEach(inv => {
            console.log(`  - #${inv.number}: state=${inv.state}, origin=${inv.origin}, type=${inv.type}`);
            console.log(`    collection_method: ${inv.collection_method}`);
            console.log(`    dunning_campaign_id: ${inv.dunning_campaign_id}`);
            console.log(`    dunning_events_sent: ${inv.dunning_events_sent}`);
          });
        } catch (e) {
          console.log(`Invoices: Error - ${e.message}`);
        }

        // Line Items (charges/credits)
        try {
          const lineResponse = await recurlyClient.request(
            'GET',
            `/accounts/code-${encodeURIComponent(account.code)}/line_items?limit=20`
          );
          const lines = lineResponse.data?.data || [];
          console.log(`\nLine Items (${lines.length}):`);
          lines.slice(0, 5).forEach(line => {
            console.log(`  - ${line.description}: ${line.type}, state=${line.state}, amount=${line.amount}`);
          });
        } catch (e) {
          console.log(`Line Items: Error - ${e.message}`);
        }

        // Transactions
        try {
          const txResponse = await recurlyClient.request(
            'GET',
            `/accounts/code-${encodeURIComponent(account.code)}/transactions?limit=20`
          );
          const txs = txResponse.data?.data || [];
          console.log(`\nTransactions (${txs.length}):`);
          txs.forEach(tx => {
            console.log(`  - ${tx.type}: status=${tx.status}, amount=${tx.amount}, created=${tx.created_at}`);
            console.log(`    message: ${tx.status_message || tx.gateway_message || 'N/A'}`);
          });
        } catch (e) {
          console.log(`Transactions: Error - ${e.message}`);
        }

        console.log('\n=== END DEBUG DUMP ===\n');

        // Warn if account is not closed (Finding 3)
        if (account.state !== 'closed') {
          console.warn(`  WARNING: Account is not closed (state: ${account.state})`);
        }

        accounts = [account];
      } else {
        // Batch mode - query all closed accounts (Story 2.1)
        console.log('Querying closed accounts from Recurly...');
        const queryOptions = {
          onProgress: ({ type, startDate, endDate, page, count, total, message }) => {
            if (type === 'start') {
              console.log(`  Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
            } else if (type === 'page') {
              console.log(`  Page ${page}: ${count} accounts (total: ${total})`);
            } else if (type === 'warning') {
              console.warn(`  Warning: ${message}`);
            } else if (type === 'complete') {
              console.log(`Query complete: ${total} closed accounts found`);
            }
          }
        };
        // Pass date range if provided via CLI
        if (options.startDate) {
          queryOptions.startDate = options.startDate;
        }
        if (options.endDate) {
          queryOptions.endDate = options.endDate;
        }
        // Pass limit to stop pagination early (unless random, then we need all accounts first)
        if (options.limit && !options.random) {
          queryOptions.maxResults = options.limit;
        }
        accounts = await queryClosedAccounts(recurlyClient, queryOptions);

        // Shuffle if --random specified
        if (options.random) {
          console.log('Randomizing client order...');
          for (let i = accounts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [accounts[i], accounts[j]] = [accounts[j], accounts[i]];
          }
        }

        // Apply limit if specified
        if (options.limit && accounts.length > options.limit) {
          console.log(`Limiting to ${options.limit} of ${accounts.length} accounts${options.random ? ' (random selection)' : ''}`);
          accounts = accounts.slice(0, options.limit);
        }
      }

      // Filter out excluded account IDs (no resubscribe for these)
      if (EXCLUDE_ACCOUNT_IDS.length > 0) {
        const excludeSet = new Set(EXCLUDE_ACCOUNT_IDS.map(id => String(id).trim().toLowerCase()));
        const beforeExclude = accounts.length;
        accounts = accounts.filter(a => {
          const code = (a.code || a.id || '').toString().trim();
          const id = (a.id || a.code || '').toString().trim();
          const inExclude = excludeSet.has(code.toLowerCase()) || excludeSet.has(id.toLowerCase());
          return !inExclude;
        });
        const excluded = beforeExclude - accounts.length;
        if (excluded > 0) {
          console.log(`Excluded ${excluded} account(s)`);
        }
        if (accounts.length === 0) {
          console.log('No accounts remaining after exclusions.');
          process.exit(0);
        }
      }

      // Initialize state manager for new execution (Story 4.3 AC1)
      stateManager = createStateManager({
        project: options.project,
        environment: options.env,
        mode: 'rescue',
        stateDir: '.'
      });
      stateManager.initialize(accounts);
      console.log(`State file created: ${stateManager.getStateFilePath()}`);
      totalForProgress = accounts.length;  // Fresh execution: total equals accounts found
    }

    console.log(`Found ${accounts.length} account(s) to process`);

    // Initialize results writer (Story 4.4)
    const resultsWriter = createResultsWriter({
      project: options.project,
      environment: options.env,
      mode: options.rollback ? 'rollback' : 'rescue',
      dryRun: options.dryRun,
      outputDir: '.'
    });

    // Determine currency for subscriptions (Story 3.1)
    // Use project-specific currency, or default to EUR for multi-currency projects
    const subscriptionCurrency = projectConfig.currency || 'EUR';

    // Initialize logger for rescue operations (Story 4.2)
    const logger = createLogger({
      dryRun: options.dryRun,
      project: options.project
    });

    // Find or create rescue plan (Story 3.1)
    // Use project-specific currency if defined, otherwise multi-currency
    let priceDisplay;
    if (options.price !== null && options.price !== undefined) {
      priceDisplay = options.price;
    } else if (projectConfig.currency) {
      // Show currency-specific default
      const defaultPrice = getUnitAmountForCurrency(projectConfig.currency);
      console.log('defaultPrice::::::::::::', defaultPrice);
      priceDisplay = `default (${defaultPrice})`;
    } else {
      // Multi-currency: show currency-specific defaults
      const defaults = Object.entries(CURRENCY_UNIT_AMOUNTS)
        .map(([curr, price]) => `${curr}: ${price}`)
        .join(', ');
      priceDisplay = `currency-specific defaults (${defaults})`;
    }
    const trialDisplay = options.noTrial ? 'charge immediately' : '1 day trial';

    let rescuePlanCode;
    if (projectConfig.currency) {
      // Single currency project (e.g., EUR)
      console.log(`Preparing Rescue Plan (${projectConfig.currency}, price: ${priceDisplay}, ${trialDisplay})...`);
      const planOptions = {};
      // Only include unitAmount if explicitly provided
      if (options.price !== null && options.price !== undefined) {
        planOptions.unitAmount = options.price;
      }
      console.log('planOptions::::::::::::', planOptions);
      await findOrCreateRescuePlan(recurlyClient, projectConfig.currency, planOptions);
      rescuePlanCode = getRescuePlanCode(projectConfig.currency);
    } else {
      // Multi-currency project
      console.log(`Preparing Rescue Plan (multi-currency, price: ${priceDisplay}, ${trialDisplay})...`);
      const planOptions = {};
      // Only include unitAmount if explicitly provided
      if (options.price !== null && options.price !== undefined) {
        planOptions.unitAmount = options.price;
      }
      console.log('planOptions123123::::::::::::', planOptions);
      console.log('recurlyClient::::::::::::', recurlyClient);
      await findOrCreateMultiCurrencyRescuePlan(recurlyClient, planOptions);
      rescuePlanCode = RESCUE_PLAN_CODE;
    }

    // Initialize progress bar (Story 4.1 AC1)
    // Use totalForProgress to show correct total during resume (HIGH-2, MEDIUM-2 fix)
    const progressBar = createProgressBar(totalForProgress, { dryRun: options.dryRun });

    // Initialize execution controller for confirmation handling (Story 3.4)
    const confirmationInterval = getConfirmationInterval(options);
    displayConfirmationInfo(confirmationInterval, accounts.length);

    const executionController = createExecutionController({
      interval: confirmationInterval,
      totalCount: accounts.length
    });

    // Process accounts with rescue logic
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let stoppedByUser = false;

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      // Use account.code for API operations (subscription creation uses account code, not internal ID)
      const accountId = account.code || account.id;
      
      // Skip accounts without a valid identifier
      if (!accountId) {
        console.warn(`⚠ Skipping account at index ${i}: missing code and id`);
        continue;
      }

      // Update progress bar (Story 4.1 AC1)
      // Use resumeIndex to show correct position during resume (HIGH-2 fix)
      progressBar.update(resumeIndex + i + 1, accountId);

      // Reopen account if closed/inactive
      if (account.state === 'closed' || account.state === 'inactive') {
        try {
          console.log(`↻ ${accountId} - Reopening closed account...`);
          // Use internal ID (account.id) for reopen API call, not account code
          const internalId = account.id;
          await reopenAccount(recurlyClient, internalId, true);
          console.log(`✓ ${accountId} - Account reopened`);
        } catch (reopenError) {
          console.log(`✗ ${accountId} - Failed to reopen: ${reopenError.message}`);
          failedCount++;
          resultsWriter.addClientResult({
            id: accountId,
            status: 'FAILED',
            error: `Failed to reopen account: ${reopenError.message}`
          });
          stateManager.markProcessed(accountId, {
            status: 'failed',
            error: reopenError.message
          });
          continue;
        }
      }

      // Check for valid billing info (required for automatic collection)
      const hasBilling = await hasBillingInfo(recurlyClient, accountId);
      if (!hasBilling) {
        skippedCount++;
        console.log(`⊘ ${accountId} - SKIPPED (no valid billing info)`);
        resultsWriter.addClientResult({
          id: accountId,
          status: 'SKIPPED',
          reason: 'No valid billing info for automatic collection'
        });
        stateManager.markProcessed(accountId, {
          status: 'skipped',
          reason: 'no_billing_info'
        });
        continue;
      }

      // Capture before state for results (including existing invoices/line_items)
      const rescueStartTime = new Date().toISOString();
      const beforeInvoices = await getAccountInvoices(recurlyClient, accountId);
      const beforeLineItems = await getAccountLineItems(recurlyClient, accountId);
      const beforeState = {
        state: account.state,
        closed_at: account.closed_at,
        subscriptions: account.subscriptions || [],
        invoices: beforeInvoices,
        line_items: beforeLineItems
      };

      // Execute rescue operation (Story 3.2)
      const trialDays = options.noTrial ? 0 : 1;
      const result = await rescueClient(
        recurlyClient,
        accountId,
        rescuePlanCode,
        subscriptionCurrency,
        {
          trialDays,
          logger,
          project: options.project
        }
      );

      // Record result and update state
      if (result.status === 'RESCUED') {
        successCount++;
        const subscription = result.subscription;
        const subscriptionId = subscription?.uuid || subscription?.id;

        // Capture after state: complete snapshot after rescue
        const afterInvoices = await getAccountInvoices(recurlyClient, accountId);
        const afterLineItems = await getAccountLineItems(recurlyClient, accountId);

        resultsWriter.addClientResult({
          id: accountId,
          status: 'RESCUED',
          before: beforeState,
          after: {
            state: 'active',
            subscription_id: subscriptionId,
            subscriptions: [{ id: subscriptionId }], // New subscription added
            invoices: afterInvoices,
            line_items: afterLineItems
          }
        });
        stateManager.markProcessed(accountId, {
          status: 'rescued',
          subscriptionId
        });
      } else if (result.status === 'REQUIRES_3DS') {
        // 3DS required - needs manual intervention
        failedCount++;
        resultsWriter.addClientResult({
          id: accountId,
          status: 'REQUIRES_3DS',
          before: beforeState,
          error: result.error,
          declineCode: result.declineCode,
          declineReason: 'Customer must authenticate via 3D Secure'
        });
        stateManager.markProcessed(accountId, {
          status: 'requires_3ds',
          error: 'Manual intervention required - 3DS authentication needed'
        });
      } else {
        failedCount++;
        resultsWriter.addClientResult({
          id: accountId,
          status: 'FAILED',
          before: beforeState,
          error: result.error,
          declineCode: result.declineCode,
          declineReason: result.declineReason
        });
        stateManager.markProcessed(accountId, {
          status: 'failed',
          error: result.error
        });
      }

      // Update execution controller and check for confirmation pause (Story 3.4)
      executionController.recordResult(result.status === 'RESCUED');

      const shouldContinue = await executionController.checkPause(i);
      if (!shouldContinue) {
        stoppedByUser = true;
        break;
      }
    }

    // Display completion summary (Story 4.1 AC2)
    progressBar.complete({ successful: successCount, failed: failedCount, skipped: skippedCount });

    // Finalize results and write output file (Story 4.4)
    if (!stoppedByUser) {
      const finalResult = resultsWriter.finalize();
      displayStatistics(finalResult.summary, finalResult.filePath, options.dryRun);

      // Generate URLs file for manual checking
      const fs = require('fs');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const urlsFileName = `rescue-urls-${options.project}-${timestamp}.txt`;
      const baseUrl = config.baseUrl;
      const urls = accounts.map(acc => `${baseUrl}/accounts/${acc.code}`).join('\n');
      fs.writeFileSync(urlsFileName, urls);
      console.log(`Client URLs file: ${urlsFileName}`);

      // Clean up state file on full success (Story 4.3)
      if (!options.dryRun && finalResult.summary.failed === 0) {
        stateManager.cleanup();
        console.log('State file cleaned up (all operations successful).');
      } else if (finalResult.summary.failed > 0) {
        console.log(`State file preserved at: ${stateManager.getStateFilePath()}`);
        console.log(`${finalResult.summary.failed} client(s) failed. Use --resume to retry.`);
      }

      process.exit(finalResult.summary.failed > 0 ? 1 : 0);
    } else {
      // User stopped execution - state is already preserved by execution controller
      console.log(`State file preserved at: ${stateManager.getStateFilePath()}`);
      process.exit(0);
    }

  } catch (error) {
    // Handle config errors with user-friendly messages
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

// Run main function
main().catch(err => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
