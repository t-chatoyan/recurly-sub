#!/usr/bin/env node

/**
 * Recurly Sandbox Test Data Seeder
 * CLI tool to generate test accounts in Recurly sandbox for testing the rescue script
 *
 * Usage: node seed.js --env=<sandbox|production> --project=<id> [options]
 */

const dotenv = require('dotenv');
const { loadConfig } = require('./src/config/env');
const { parseArgs, displayHelp, ALLOWED_CURRENCIES } = require('./src/seed/args');
const { getProjectConfig } = require('./src/config/projects');
const { createClient } = require('./src/api/recurly-client');
const { createAccount, deactivateAccount, addAccountNote } = require('./src/api/accounts');
const { randomAccountData, randomCurrency, randomDate } = require('./src/seed/random');
const { findOrCreateSeedPlan, getSeedPlanCode, getAllowedCurrencies } = require('./src/seed/plan-manager');
const { createSubscription } = require('./src/seed/subscription-manager');

/**
 * Calculate account counts per type based on ratio
 * @param {number} total - Total number of accounts
 * @param {Object} ratio - Ratio object { active, legit, dunning }
 * @returns {Object} Counts { active, legit, dunning }
 */
function calculateCounts(total, ratio) {
  // Calculate base counts (floor)
  const activeBase = Math.floor(total * ratio.active / 100);
  const legitBase = Math.floor(total * ratio.legit / 100);
  const dunningBase = Math.floor(total * ratio.dunning / 100);

  // Calculate remainder
  const assigned = activeBase + legitBase + dunningBase;
  let remainder = total - assigned;

  // Distribute remainder in priority order: active, legit, dunning
  const counts = {
    active: activeBase,
    legit: legitBase,
    dunning: dunningBase
  };

  // Distribute remainder
  if (remainder > 0 && ratio.active > 0) {
    counts.active++;
    remainder--;
  }
  if (remainder > 0 && ratio.legit > 0) {
    counts.legit++;
    remainder--;
  }
  if (remainder > 0 && ratio.dunning > 0) {
    counts.dunning++;
    remainder--;
  }

  return counts;
}

/**
 * Format date for logging
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main entry point
 */
async function main() {
  let options;

  try {
    // Parse and validate CLI arguments
    options = parseArgs(process.argv);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    console.error('Usage: node seed.js --env=<sandbox|production> --project=<id> [options]');
    process.exit(1);
  }

  // --help handling
  if (options.help) {
    displayHelp();
    process.exit(0);
  }

  // Load .env early
  dotenv.config({ quiet: true });

  try {
    // Load configuration
    const config = loadConfig(options.env);

    console.log(`Configuration loaded for ${config.envType} environment`);

    // Load project configuration
    const projectConfig = getProjectConfig(options.project);
    console.log(`Project: ${projectConfig.name} (${projectConfig.id})`);

    // Display options summary
    console.log(`Count: ${options.count} accounts`);
    console.log(`Currency: ${options.currency === 'random' ? 'random (multi-currency)' : options.currency}`);
    console.log(`Ratio: active=${options.ratio.active}% legit=${options.ratio.legit}% dunning=${options.ratio.dunning}%`);
    console.log(`Date range: ${formatDate(options.startDate)} to ${formatDate(options.endDate)}`);

    if (options.dryRun) {
      console.log('Mode: DRY-RUN (no changes will be made)');
    }

    // Calculate counts per type
    const counts = calculateCounts(options.count, options.ratio);
    console.log(`\nDistribution: ${counts.active} active, ${counts.legit} legit-closed, ${counts.dunning} dunning-closed`);

    // Resolve currencies for plan creation
    let currencies;
    if (options.currency === 'random') {
      currencies = getAllowedCurrencies();
    } else {
      currencies = [options.currency];
    }

    // Skip API calls in test mode
    if (process.env.SKIP_API_CALLS === 'true') {
      console.log('\nSeed script initialized. (API calls skipped in test mode)');
      return;
    }

    // Initialize Recurly API client
    const recurlyClient = createClient({
      apiKey: config.apiKey,
      apiBaseUrl: config.apiBaseUrl,
      projectConfig,
      maxRetries: config.retryCount,
      retryBackoffBase: config.retryBackoffBase,
      retryBackoffMax: config.retryBackoffMax
    });

    // Find or create seed plan
    console.log(`\nPreparing Seed Plan for currencies: ${currencies.join(', ')}...`);
    await findOrCreateSeedPlan(recurlyClient, currencies, {
      log: console.log,
      dryRun: options.dryRun
    });

    const planCode = getSeedPlanCode();
    console.log(`Using plan: ${planCode}`);

    // Dry-run summary mode
    if (options.dryRun) {
      console.log('\n=== DRY-RUN SUMMARY ===');
      console.log(`Would create ${options.count} accounts:`);
      console.log(`  - ${counts.active} active accounts (seed-active-*)`);
      console.log(`  - ${counts.legit} legit-closed accounts (seed-legit-*)`);
      console.log(`  - ${counts.dunning} dunning-closed accounts (seed-dunning-*)`);
      console.log(`Each account would have a subscription on plan ${planCode}`);
      console.log(`Closed accounts would have closed_at dates between ${formatDate(options.startDate)} and ${formatDate(options.endDate)}`);

      // Show sample payloads
      console.log('\n--- Sample Account Payload ---');
      const sampleCurrency = options.currency === 'random' ? randomCurrency(currencies) : options.currency;
      const sampleAccount = randomAccountData('seed-active');
      console.log(JSON.stringify(sampleAccount, null, 2));

      console.log('\n--- Sample Subscription Payload ---');
      console.log(JSON.stringify({
        plan_code: planCode,
        currency: sampleCurrency,
        collection_method: 'manual',
        account: { code: sampleAccount.code }
      }, null, 2));

      console.log('\n=== END DRY-RUN ===');
      process.exit(0);
    }

    // Seed accounts
    console.log('\n=== SEEDING ACCOUNTS ===');

    const results = {
      active: { success: 0, failed: 0 },
      legit: { success: 0, failed: 0 },
      dunning: { success: 0, failed: 0 }
    };

    // Process each type
    const typeConfigs = [
      { type: 'active', prefix: 'seed-active', count: counts.active, deactivate: false },
      { type: 'legit', prefix: 'seed-legit', count: counts.legit, deactivate: true },
      { type: 'dunning', prefix: 'seed-dunning', count: counts.dunning, deactivate: true }
    ];

    let totalProcessed = 0;
    const totalToProcess = options.count;

    for (const typeConfig of typeConfigs) {
      if (typeConfig.count === 0) continue;

      console.log(`\n--- Creating ${typeConfig.count} ${typeConfig.type} accounts ---`);

      for (let i = 0; i < typeConfig.count; i++) {
        totalProcessed++;
        const progress = `[${totalProcessed}/${totalToProcess}]`;

        // Determine currency for this account
        const accountCurrency = options.currency === 'random'
          ? randomCurrency(currencies)
          : options.currency;

        // Generate account data (currency is for subscription, not account)
        const accountData = randomAccountData(typeConfig.prefix);

        try {
          // Step 1: Create account
          const account = await createAccount(recurlyClient, accountData);
          const accountCode = account.code || accountData.code;

          // Step 2: Create subscription
          await createSubscription(recurlyClient, {
            accountCode,
            planCode,
            currency: accountCurrency
          });

          // Step 3: Deactivate if legit or dunning
          if (typeConfig.deactivate) {
            // Generate closed_at date for logging/notes
            const closedAt = randomDate(options.startDate, options.endDate);

            await deactivateAccount(recurlyClient, accountCode);

            // Add note with metadata
            const noteContent = `Seeded ${typeConfig.type} account. Type: ${typeConfig.type}. Simulated closed_at: ${closedAt.toISOString()}`;
            try {
              await addAccountNote(recurlyClient, accountCode, noteContent);
            } catch (noteError) {
              // Note creation is optional, don't fail the whole operation
              console.warn(`${progress} Warning: Could not add note to ${accountCode}: ${noteError.message}`);
            }

            console.log(`${progress} ✓ ${accountCode} - ${typeConfig.type.toUpperCase()} (${accountCurrency}) - closed_at: ${formatDate(closedAt)}`);
          } else {
            console.log(`${progress} ✓ ${accountCode} - ${typeConfig.type.toUpperCase()} (${accountCurrency})`);
          }

          results[typeConfig.type].success++;

          // Small delay to avoid rate limiting
          await sleep(100);

        } catch (error) {
          console.error(`${progress} ✗ ${accountData.code} - FAILED: ${error.message}`);
          results[typeConfig.type].failed++;
        }
      }
    }

    // Final summary
    console.log('\n=== SEEDING COMPLETE ===');
    console.log(`Active accounts:  ${results.active.success} success, ${results.active.failed} failed`);
    console.log(`Legit accounts:   ${results.legit.success} success, ${results.legit.failed} failed`);
    console.log(`Dunning accounts: ${results.dunning.success} success, ${results.dunning.failed} failed`);

    const totalSuccess = results.active.success + results.legit.success + results.dunning.success;
    const totalFailed = results.active.failed + results.legit.failed + results.dunning.failed;

    console.log(`\nTotal: ${totalSuccess} created, ${totalFailed} failed`);

    if (totalFailed > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

// Run main function
main().catch(err => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
