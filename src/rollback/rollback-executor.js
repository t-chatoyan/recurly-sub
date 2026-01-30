/**
 * Rollback Executor Module
 * Processes clients for state restoration during rollback operations
 *
 * Features:
 * - Cancel rescue subscription for RESCUED clients
 * - Skip FAILED clients (nothing to rollback)
 * - Error handling with retry (uses recurly-client retry logic)
 * - Progress tracking and logging
 * - State manager integration for crash recovery
 */

const { buildRecurlyUrl, sanitizeErrorMessage } = require('../ui/logger');

/**
 * Create rollback executor instance
 * @param {Object} options - Configuration options
 * @param {Object} options.recurlyClient - Recurly API client from Story 2.1
 * @param {Object} options.logger - Logger instance from Story 4.2
 * @param {Object} [options.stateManager] - State manager from Story 4.3 (optional)
 * @param {string} options.project - Project identifier for URLs
 * @returns {Object} Rollback executor instance
 * @throws {Error} If required options are missing
 */
function createRollbackExecutor(options) {
  const { recurlyClient, logger, stateManager = null, project } = options;

  if (!recurlyClient) throw new Error('recurlyClient is required');
  if (!logger) throw new Error('logger is required');
  if (!project) throw new Error('project is required');

  /**
   * Process a single client for rollback
   * @param {Object} clientData - Client data from rollback file
   * @param {string} clientData.id - Client/account ID
   * @param {string} clientData.status - Original status (RESCUED, FAILED, SKIPPED)
   * @param {Object} [clientData.before] - State before rescue
   * @param {Object} [clientData.after] - State after rescue
   * @returns {Promise<Object>} Rollback result
   */
  async function processClient(clientData) {
    // Input validation
    if (!clientData || typeof clientData !== 'object') {
      throw new Error('clientData must be an object');
    }

    const { id, status, before, after } = clientData;

    if (!id) {
      throw new Error('clientData.id is required');
    }

    // Skip clients that were not rescued
    if (status !== 'RESCUED') {
      logger.logSkip(id, 'was not rescued');
      return {
        id,
        status: 'SKIPPED',
        before: after, // Current state is 'after' rescue
        after: null,
        error: null,
        reason: 'Client was not rescued in original execution'
      };
    }

    // Attempt to rollback RESCUED clients
    try {
      if (after?.invoices) {
        for (const inv of after.invoices) {
          console.log(`  - ${inv.invoice_number}: state=${inv.state}, total=${inv.total}, paid=${inv.paid}, balance=${inv.balance}`);
        }
      }

      // Step 1: Handle invoices FIRST (before terminating subscription)
      // Important: Terminating a subscription may auto-void pending invoices,
      // so we must process invoices while they still exist
      // Only process invoices that exist in after but not in before
      const beforeInvoiceIds = new Set((before?.invoices || []).map(inv => inv.invoice_id));
      const afterInvoices = after?.invoices || (after?.invoice ? [after.invoice] : []);

      // Find new invoices (in after but not in before)
      const newInvoices = afterInvoices.filter(inv => !beforeInvoiceIds.has(inv.invoice_id));

      for (const invoice of newInvoices) {
        if (!invoice?.invoice_number) continue;

        const invoiceRef = invoice.invoice_number;

        try {
          // Fetch current invoice state from Recurly (saved state may be outdated)
          const currentInvoice = await getInvoice(invoiceRef);
          if (!currentInvoice) {
            logger.logInfo(`${id} - Invoice ${invoiceRef} not found (may already be voided)`);
            continue;
          }

          const currentState = currentInvoice.state?.toLowerCase();
          const currentPaid = currentInvoice.paid || 0;

          if (currentState === 'pending' || currentState === 'processing' || currentState === 'past_due') {
            // Pending/processing invoices: mark as failed to cancel them
            await markInvoiceFailed(invoiceRef);
            logger.logInfo(`${id} - Marked invoice ${invoiceRef} as failed (was ${currentState})`);
          } else if (currentState === 'paid' && currentPaid > 0) {
            // Paid invoices: refund the credit card transaction
            const transactions = await getInvoiceTransactions(invoiceRef);
            for (const t of transactions) {
            }
            // Try different field combinations for finding payment
            const successfulPayment = transactions.find(t => {
              const isPayment = t.type === 'payment' || t.type === 'charge' || t.type === 'purchase';
              const isSuccess = t.status === 'success' || t.status === 'collected';
              const hasAmount = (t.amount > 0) || (t.total > 0);
              return isPayment && isSuccess && hasAmount;
            });

            if (successfulPayment) {
              const txId = successfulPayment.uuid || successfulPayment.id;
              await refundTransaction(txId);
              logger.logInfo(`${id} - Refunded transaction for invoice ${invoiceRef}`);
            } else {
              // No card transaction, fall back to credit refund
              const creditInvoice = await refundInvoice(invoiceRef);
              if (creditInvoice?.number) {
                await markInvoicePaid(creditInvoice.number);
              }
              logger.logInfo(`${id} - Created credit refund for invoice ${invoiceRef}`);
            }
          } else if (currentState === 'paid' && currentPaid === 0) {
            // Paid but 0€ (trial): nothing to do
            logger.logInfo(`${id} - Invoice ${invoiceRef} is 0€, no refund needed`);
          } else if (currentState === 'voided' || currentState === 'failed') {
            // Already voided/failed: nothing to do
            logger.logInfo(`${id} - Invoice ${invoiceRef} already ${currentState}`);
          } else {
            logger.logInfo(`${id} - Invoice ${invoiceRef} state=${currentState}, skipping`);
          }
        } catch (invoiceError) {
          // Log but don't fail the rollback if invoice operation fails
          logger.logInfo(`${id} - Warning: Could not process invoice ${invoiceRef}: ${invoiceError.message}`);
        }
      }

      // Step 2: Handle subscription AFTER invoices are processed
      if (after?.subscription_id) {
        const hadNoSubscriptions = !before?.subscriptions?.length;
        if (hadNoSubscriptions) {
          // Client had no subscriptions before rescue - terminate completely
          await terminateSubscription(after.subscription_id);
        } else {
          // Client had subscriptions before - just cancel
          await cancelSubscription(after.subscription_id);
        }
      } else {
        throw new Error('No subscription_id in rollback data');
      }

      // Step 3: Close the account if needed (restore to original state)
      // Only if original state was 'closed'
      if (before?.state === 'closed') {
        await closeAccount(id);
      } else {
      }

      // Log success
      logRollbackSuccess(id);

      // Update state manager
      if (stateManager) {
        stateManager.markProcessed(id, { status: 'rolled_back' });
      }

      return {
        id,
        status: 'ROLLED_BACK',
        before: after, // State before rollback (which is after rescue)
        after: before, // State after rollback (which is original state)
        error: null
      };

    } catch (error) {
      // Handle "already canceled" or "not found" as success
      if (isAlreadyRolledBackError(error)) {
        logger.logInfo(`${id} - Already rolled back or subscription not found`);

        if (stateManager) {
          stateManager.markProcessed(id, { status: 'rolled_back', note: 'already_done' });
        }

        return {
          id,
          status: 'ROLLED_BACK',
          before: after,
          after: before,
          error: null,
          note: 'Already rolled back or subscription not found'
        };
      }

      // Sanitize error message before logging/storing
      const sanitizedError = sanitizeErrorMessage(error.message);

      // Log failure
      logger.logFailure(id, `ROLLBACK FAILED: ${sanitizedError}`);

      // Update state manager
      if (stateManager) {
        stateManager.markProcessed(id, { status: 'failed', error: sanitizedError });
      }

      return {
        id,
        status: 'FAILED',
        before: after,
        after: null,
        error: sanitizedError
      };
    }
  }

  /**
   * Check if error indicates the resource was already rolled back
   * @param {Error} error - Error to check
   * @returns {boolean} True if already rolled back
   */
  function isAlreadyRolledBackError(error) {
    // 404 Not Found - subscription or account doesn't exist
    if (error.statusCode === 404) return true;

    // Check for specific error messages
    const alreadyDonePatterns = [
      /already.*cancel/i,
      /subscription.*not.*found/i,
      /account.*not.*found/i,
      /already.*closed/i
    ];

    return alreadyDonePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Format subscription ID for API calls
   * Recurly API requires 'uuid-' prefix for UUID format IDs
   * @param {string} subscriptionId - Raw subscription ID
   * @returns {string} Formatted ID for API calls
   */
  function formatSubscriptionIdForApi(subscriptionId) {
    // If already prefixed, return as-is
    if (subscriptionId.startsWith('uuid-')) {
      return subscriptionId;
    }
    // UUID format: 32 hex characters (no dashes in Recurly's format)
    // e.g., 7d5019579ce2dbe77a06a944689bb952
    if (/^[a-f0-9]{32}$/i.test(subscriptionId)) {
      return `uuid-${subscriptionId}`;
    }
    // Otherwise assume it's a regular ID (e.g., e28zov4fw0v2)
    return subscriptionId;
  }

  /**
   * Cancel a subscription via Recurly API
   * @param {string} subscriptionId - Subscription ID to cancel
   * @returns {Promise<Object>} API response data
   * @throws {Error} If cancellation fails
   */
  async function cancelSubscription(subscriptionId) {
    if (!subscriptionId) {
      throw new Error('No subscription ID to cancel');
    }

    const formattedId = formatSubscriptionIdForApi(subscriptionId);

    // Recurly API: Cancel subscription immediately
    // PUT /subscriptions/{subscription_id}/cancel
    // This cancels the subscription (not terminate, which would delete it)
    const response = await recurlyClient.request(
      'PUT',
      `/subscriptions/${encodeURIComponent(formattedId)}/cancel`
    );

    return response.data;
  }

  /**
   * Terminate (delete) a subscription via Recurly API
   * Use this when client had no subscriptions before rescue
   * @param {string} subscriptionId - Subscription ID to terminate
   * @returns {Promise<Object>} API response data
   * @throws {Error} If termination fails
   */
  async function terminateSubscription(subscriptionId) {
    if (!subscriptionId) {
      throw new Error('No subscription ID to terminate');
    }

    const formattedId = formatSubscriptionIdForApi(subscriptionId);

    // Recurly API: Terminate subscription immediately
    // DELETE /subscriptions/{subscription_id}
    // This completely removes the subscription (vs cancel which keeps it)
    const response = await recurlyClient.request(
      'DELETE',
      `/subscriptions/${encodeURIComponent(formattedId)}`
    );

    return response.data;
  }

  /**
   * Close an account via Recurly API
   * @param {string} accountId - Account ID to close
   * @returns {Promise<Object>} API response data
   * @throws {Error} If closing fails
   */
  async function closeAccount(accountId) {
    if (!accountId) {
      throw new Error('No account ID to close');
    }

    // Recurly API: Close (deactivate) account
    // DELETE /accounts/{account_id}
    // This sets the account state to 'closed'
    const response = await recurlyClient.request(
      'DELETE',
      `/accounts/${encodeURIComponent(accountId)}`
    );

    return response.data;
  }

  /**
   * Apply account credits to open invoices
   * This collects the account and applies any available credits
   * @param {string} accountCode - Account code
   * @returns {Promise<Object|null>} Collection result or null
   */
  async function applyAccountCredits(accountCode) {
    if (!accountCode) {
      return null;
    }

    try {
      // PUT /accounts/{account_id}/collect applies credits to open invoices
      const response = await recurlyClient.request(
        'PUT',
        `/accounts/code-${encodeURIComponent(accountCode)}/collect`
      );
      return response.data;
    } catch (error) {
      // 422 = nothing to collect or no credits to apply - not an error
      if (error.statusCode === 422 || error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get invoice details from Recurly API
   * @param {string} invoiceNumber - Invoice number (e.g., "1364")
   * @returns {Promise<Object|null>} Invoice object or null if not found
   */
  async function getInvoice(invoiceNumber) {
    if (!invoiceNumber) {
      return null;
    }

    const invoiceRef = `number-${invoiceNumber}`;
    try {
      const response = await recurlyClient.request(
        'GET',
        `/invoices/${encodeURIComponent(invoiceRef)}`
      );
      return response.data;
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get transactions for an invoice
   * @param {string} invoiceNumber - Invoice number (e.g., "1364")
   * @returns {Promise<Array>} List of transactions
   */
  async function getInvoiceTransactions(invoiceNumber) {
    if (!invoiceNumber) {
      return [];
    }

    const invoiceRef = `number-${invoiceNumber}`;
    try {
      // First get the invoice to find linked transactions
      const invoiceResponse = await recurlyClient.request(
        'GET',
        `/invoices/${encodeURIComponent(invoiceRef)}?expand=transactions`
      );
      const invoice = invoiceResponse.data;

      // Transactions might be embedded or need separate fetch
      if (invoice?.transactions?.data) {
        return invoice.transactions.data;
      }
      if (Array.isArray(invoice?.transactions)) {
        return invoice.transactions;
      }

      // Fallback: fetch transactions separately
      const txResponse = await recurlyClient.request(
        'GET',
        `/invoices/${encodeURIComponent(invoiceRef)}/transactions`
      );
      return txResponse.data?.data || txResponse.data || [];
    } catch (error) {
      if (error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Refund a transaction (credit card refund)
   * @param {string} transactionId - Transaction UUID
   * @returns {Promise<Object|null>} Refund transaction or null
   */
  async function refundTransaction(transactionId) {
    if (!transactionId) {
      return null;
    }

    // Format transaction ID for API
    let formattedId = transactionId;
    if (/^[a-f0-9]{32}$/i.test(transactionId)) {
      formattedId = `uuid-${transactionId}`;
    }

    try {
      const response = await recurlyClient.request(
        'POST',
        `/transactions/${encodeURIComponent(formattedId)}/refund`
      );
      return response.data;
    } catch (error) {
      // 422 = already refunded or can't be refunded
      if (error.statusCode === 422) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Mark an invoice as paid via Recurly API
   * Use this to close credit invoices after refund
   * @param {string} invoiceNumber - Invoice number (e.g., "1364")
   * @returns {Promise<Object|null>} API response data or null
   * @throws {Error} If marking fails
   */
  async function markInvoicePaid(invoiceNumber) {
    if (!invoiceNumber) {
      return null;
    }

    const invoiceRef = `number-${invoiceNumber}`;
    try {
      const response = await recurlyClient.request(
        'PUT',
        `/invoices/${encodeURIComponent(invoiceRef)}/mark_paid`
      );
      return response.data;
    } catch (error) {
      // 422 = already paid or can't be marked - not critical
      if (error.statusCode === 422) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Mark an invoice as failed via Recurly API
   * Use this for pending invoices that should be cancelled
   * @param {string} invoiceNumber - Invoice number (e.g., "1364")
   * @returns {Promise<Object|null>} API response data or null
   * @throws {Error} If marking fails
   */
  async function markInvoiceFailed(invoiceNumber) {
    if (!invoiceNumber) {
      return null;
    }

    // Recurly API: Mark invoice as failed
    // PUT /invoices/{invoice_id}/mark_failed
    // Invoice lookup by number requires "number-" prefix (e.g., "number-1364")
    const invoiceRef = `number-${invoiceNumber}`;
    const response = await recurlyClient.request(
      'PUT',
      `/invoices/${encodeURIComponent(invoiceRef)}/mark_failed`
    );

    return response.data;
  }

  /**
   * Refund an invoice via Recurly API
   * Only refunds if invoice has a refundable amount > 0
   * @param {string} invoiceNumber - Invoice number (e.g., "1364")
   * @returns {Promise<Object|null>} API response data or null if nothing to refund
   * @throws {Error} If refund fails
   */
  async function refundInvoice(invoiceNumber) {
    if (!invoiceNumber) {
      return null;
    }

    // Recurly API: Refund invoice
    // POST /invoices/{invoice_id}/refund
    // Invoice lookup by number requires "number-" prefix (e.g., "number-1364")
    // type=amount without amount = full refund of refundable amount
    // refund_method=all_credit for manual collection invoices
    const invoiceRef = `number-${invoiceNumber}`;
    try {
      const response = await recurlyClient.request(
        'POST',
        `/invoices/${encodeURIComponent(invoiceRef)}/refund`,
        {
          body: {
            type: 'amount',
            refund_method: 'all_credit'
          }
        }
      );
      return response.data;
    } catch (error) {
      // 422 = nothing to refund (e.g., 0€ invoice) - treat as success
      if (error.statusCode === 422) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Log successful rollback with Recurly URL
   * @param {string} clientId - Client ID
   */
  function logRollbackSuccess(clientId) {
    const url = buildRecurlyUrl(project, 'accounts', clientId);
    logger.logInfo(`${clientId} - ROLLED BACK - ${url}`);
  }

  /**
   * Process all clients from rollback summary
   * @param {Array} clients - Array of clients to process
   * @param {Object} [options={}] - Processing options
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<Array>} Array of results
   */
  async function processAllClients(clients, options = {}) {
    const { onProgress } = options;
    const results = [];

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];

      // Report progress
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: clients.length,
          clientId: client.id
        });
      }

      // Process client
      const result = await processClient(client);
      results.push(result);
    }

    return results;
  }

  /**
   * Calculate rollback summary from results
   * @param {Array} results - Array of rollback results
   * @returns {Object} Summary statistics
   */
  function calculateResultsSummary(results) {
    return {
      total: results.length,
      rolled_back: results.filter(r => r.status === 'ROLLED_BACK').length,
      skipped: results.filter(r => r.status === 'SKIPPED').length,
      failed: results.filter(r => r.status === 'FAILED').length
    };
  }

  return {
    processClient,
    processAllClients,
    cancelSubscription,
    terminateSubscription,
    markInvoiceFailed,
    refundInvoice,
    closeAccount,
    calculateResultsSummary
  };
}

module.exports = { createRollbackExecutor };
