/**
 * CLI Prompt Module
 * Handles user interaction for confirmation prompts
 *
 * Security: FR29 - Production confirmation to prevent accidental execution
 */

const readline = require('readline');

/**
 * Prompt user to confirm production environment execution
 * Displays a warning and waits for user confirmation
 *
 * @returns {Promise<boolean>} True if user confirms with 'y', false otherwise
 */
async function confirmProduction() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n⚠️  WARNING: PRODUCTION ENVIRONMENT');
    rl.question('You are about to run in PRODUCTION. Continue? (y/n): ', (answer) => {
      rl.close();
      // Trim whitespace and check for 'y' (case insensitive)
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y');
    });
  });
}

/**
 * Prompt user to confirm rollback operation
 * Displays a summary and waits for user confirmation
 *
 * @param {Object} summary - Rollback summary from calculateRollbackSummary
 * @param {number} summary.toRollback - Number of clients to rollback
 * @returns {Promise<boolean>} True if user confirms with 'y', false otherwise
 */
async function confirmRollback(summary) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Defensive check for toRollback value
  const count = typeof summary?.toRollback === 'number' ? summary.toRollback : 0;

  return new Promise((resolve) => {
    const question = `You are about to rollback ${count} clients. Proceed? (y/n): `;

    rl.question(question, (answer) => {
      rl.close();
      // Trim whitespace and check for 'y' (case insensitive)
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y');
    });
  });
}

module.exports = { confirmProduction, confirmRollback };
