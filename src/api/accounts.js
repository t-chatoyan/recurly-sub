/**
 * Accounts API Module
 * Query and filter Recurly accounts
 *
 * NFR Compliance:
 * - NFR-I2: Implements pagination for list endpoints
 * - NFR-I3: Handles pagination cursor correctly
 * - NFR-I4: Uses rate limit headers (via client)
 */

/**
 * Check if an account needs rescue (has expired subscription due to nonpayment)
 * and doesn't already have an active subscription
 * @param {Object} client - Recurly client instance
 * @param {string} accountCode - Account code to check
 * @returns {Promise<{needsRescue: boolean, hasActiveSubscription: boolean, expiredForNonpayment: boolean}>}
 */
async function checkIfNeedsRescue(client, accountCode) {
  const result = {
    needsRescue: false,
    hasActiveSubscription: false,
    expiredForNonpayment: false
  };

  if (!accountCode) return result;

  try {
    // Get ALL subscriptions (no state filter - API might not support it)
    const subsResponse = await client.request(
      'GET',
      `/accounts/code-${encodeURIComponent(accountCode)}/subscriptions?limit=100`
    );
    const allSubscriptions = subsResponse.data?.data || [];

    if (allSubscriptions.length === 0) {
      return result;
    }

    // Sort by created_at descending to get the most recent subscription
    const sortedSubscriptions = [...allSubscriptions].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA; // Descending order (newest first)
    });

    // Use only the last (most recent) subscription
    const lastSubscription = sortedSubscriptions[0];

    // DEBUG: Log first few accounts to see what we get
    if (!checkIfNeedsRescue._debugCount) {
      checkIfNeedsRescue._debugCount = 0;
    }
    if (checkIfNeedsRescue._debugCount < 5) {
      checkIfNeedsRescue._debugCount++;
      console.log(`[DEBUG] ${accountCode}: ${allSubscriptions.length} total subscriptions, checking last one`);
      console.log(`  - last subscription: state=${lastSubscription.state}, expiration_reason=${lastSubscription.expiration_reason}, created_at=${lastSubscription.created_at}`);
    }

    // Check only the last subscription
    // Check for active subscriptions (no rescue needed if already has one)
    if (lastSubscription.state === 'active' || lastSubscription.state === 'trial') {
      result.hasActiveSubscription = true;
    }

    // Check for expired due to nonpayment
    if (lastSubscription.state === 'expired' && lastSubscription.expiration_reason === 'nonpayment') {
      result.expiredForNonpayment = true;
    }

    // Needs rescue if: has expired subscription for nonpayment AND no active subscription
    result.needsRescue = result.expiredForNonpayment && !result.hasActiveSubscription;

    if (result.expiredForNonpayment && result.hasActiveSubscription) {
      console.log(`[SKIP] ${accountCode}: last subscription expired but also has active subscription`);
    }

    return result;
  } catch (error) {
    console.warn(`Warning: Could not check rescue status for ${accountCode}: ${error.message}`);
    return result;
  }
}

/**
 * @deprecated Use checkIfNeedsRescue instead
 * Check if an account was closed by the dunning process
 * Looks for subscriptions with expiration_reason=dunning or failed invoices
 * @param {Object} client - Recurly client instance
 * @param {string} accountCode - Account code to check
 * @returns {Promise<boolean>} True if closed by dunning
 */
async function checkIfClosedByDunning(client, accountCode) {
  const result = await checkIfNeedsRescue(client, accountCode);
  return result.expiredForNonpayment;
}

/**
 * Query closed accounts within date range
 *
 * Note: Recurly API v3 does not support filtering by 'state' or 'closed_at' directly.
 * This function queries accounts updated within the date range and filters client-side
 * for accounts with state='closed' and closed_at within the specified range.
 *
 * @param {Object} client - Recurly client instance
 * @param {Object} [options={}] - Query options
 * @param {Date} [options.startDate] - Start of date range (default: 2025-11-16)
 * @param {Date} [options.endDate] - End of date range (default: 2026-01-20)
 * @param {number} [options.pageSize=200] - Results per page (max 200)
 * @param {number} [options.maxResults] - Stop fetching after this many results (optional)
 * @param {Function} [options.onProgress] - Progress callback ({ type, page?, count?, fetched?, total? })
 * @returns {Promise<Array>} Array of closed account objects
 * @throws {Error} If client is invalid or date range is invalid
 */
async function queryClosedAccounts(client, options = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  const {
    startDate = new Date('2025-11-16T00:00:00Z'),
    endDate = new Date('2026-01-20T23:59:59Z'),
    pageSize = 200,
    maxResults = null,
    onProgress = null
  } = options;

  // Progress notification helper
  const notify = (data) => {
    if (typeof onProgress === 'function') {
      onProgress(data);
    }
  };

  // Validate date range
  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
    throw new Error('Invalid startDate: must be a valid Date object');
  }

  if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
    throw new Error('Invalid endDate: must be a valid Date object');
  }

  if (startDate > endDate) {
    throw new Error('Invalid date range: startDate must be before endDate');
  }

  // Validate pageSize
  if (typeof pageSize !== 'number' || pageSize < 1 || pageSize > 200) {
    throw new Error('Invalid pageSize: must be a number between 1 and 200');
  }

  const accounts = [];
  let cursor = null;
  let hasMore = true;
  let pageCount = 0;

  notify({ type: 'start', startDate, endDate });

  while (hasMore) {
    pageCount++;

    // Build query parameters
    // Note: Recurly API v3 does NOT support 'state' or 'filter[field]' parameters
    // for the list accounts endpoint. We must fetch accounts and filter client-side.
    // We use begin_time/end_time with sort=updated_at as a proxy since closing
    // an account updates it, then filter client-side for state=closed and closed_at in range.
    const params = new URLSearchParams({
      limit: pageSize.toString(),
      sort: 'updated_at',
      order: 'asc',
      begin_time: startDate.toISOString(),
      end_time: endDate.toISOString()
    });

    if (cursor) {
      params.append('cursor', cursor);
    }

    const path = `/accounts?${params.toString()}`;

    try {
      const response = await client.request('GET', path);

      // Handle response data
      const data = response.data;

      // Recurly API v3 returns data array directly or in a data property
      const accountsData = Array.isArray(data) ? data : (data?.data || []);

      // Filter client-side for accounts that may need rescue
      // Include: closed, inactive, AND active accounts (active accounts may have expired subscriptions)
      // The key filter is: has subscription expired for nonpayment AND no active subscription
      const candidateAccounts = accountsData.filter(account => {
        // Accept closed, inactive, and active states
        // Active accounts can have expired subscriptions from dunning
        if (account.state !== 'closed' && account.state !== 'inactive' && account.state !== 'active') {
          return false;
        }

        // If closed_at is set, filter by it (for closed/inactive accounts)
        if (account.closed_at) {
          const closedAt = new Date(account.closed_at);
          return closedAt >= startDate && closedAt <= endDate;
        }

        // For accounts without closed_at (including active accounts),
        // the updated_at filter from the API query already ensures they're in range
        return true;
      });

      // Log filtering stats
      const activeCount = accountsData.filter(a => a.state === 'active').length;
      const closedCount = accountsData.filter(a => a.state === 'closed' || a.state === 'inactive').length;
      console.log(`[QUERY] Page ${pageCount}: ${accountsData.length} accounts fetched (active: ${activeCount}, closed/inactive: ${closedCount}, candidates: ${candidateAccounts.length})`);

      // Further filter: only accounts that need rescue (expired subscription for nonpayment, no active subscription)
      const dunningAccounts = [];
      for (const account of candidateAccounts) {
        const rescueStatus = await checkIfNeedsRescue(client, account.code);
        if (rescueStatus.needsRescue) {
          dunningAccounts.push(account);
        }
      }
      console.log(`[QUERY] Page ${pageCount}: ${dunningAccounts.length}/${candidateAccounts.length} need rescue (expired for nonpayment, no active sub)`);

      accounts.push(...dunningAccounts);

      // Stop early if we've reached maxResults
      if (maxResults && accounts.length >= maxResults) {
        console.log(`[QUERY] Reached maxResults (${maxResults}), stopping pagination`);
        // Trim to exact limit (splice modifies in place)
        accounts.splice(maxResults);
        hasMore = false;
        break;
      }

      // Check for more pages
      hasMore = data?.has_more || false;
      cursor = data?.next || null;

      // Handle cursor that might be a URL - extract cursor param if needed
      if (cursor && cursor.includes('cursor=')) {
        try {
          const url = new URL(cursor, 'https://v3.recurly.com');
          cursor = url.searchParams.get('cursor');
        } catch {
          // Not a URL, might already be a cursor value - extract from query string format
          const match = cursor.match(/cursor=([^&]+)/);
          if (match) {
            cursor = match[1];
          }
        }
      }

      // Stop pagination if has_more is true but cursor is missing/empty
      if (hasMore && (!cursor || cursor.trim() === '')) {
        notify({ type: 'warning', message: 'Pagination stopped: has_more=true but no valid cursor returned' });
        hasMore = false;
      }

      notify({
        type: 'page',
        page: pageCount,
        count: dunningAccounts.length,
        fetched: accountsData.length,
        total: accounts.length
      });

      // Safety check to prevent infinite loops
      if (pageCount > 1000) {
        notify({ type: 'warning', message: 'Exceeded 1000 pages, stopping pagination' });
        break;
      }
    } catch (error) {
      // Add context to error
      error.message = `Failed to query accounts (page ${pageCount}): ${error.message}`;
      throw error;
    }
  }

  notify({ type: 'complete', total: accounts.length });

  return accounts;
}

/**
 * Get single account by ID
 * @param {Object} client - Recurly client instance
 * @param {string} accountId - Account ID to retrieve
 * @returns {Promise<Object>} Account object
 * @throws {Error} If account not found or API error
 */
async function getAccountById(client, accountId) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!accountId || typeof accountId !== 'string' || accountId.trim() === '') {
    throw new Error('Account ID is required and must be a non-empty string');
  }

  const cleanId = accountId.trim();

  // Recurly API v3 requires 'code-' prefix for account codes
  // Internal IDs (like 'yaxd9qiamjfg') work without prefix
  // If it looks like an account code (not internal ID format), add the prefix
  const isInternalId = /^[a-z0-9]{12,13}$/.test(cleanId);
  const pathId = isInternalId ? cleanId : `code-${cleanId}`;

  try {
    const response = await client.request('GET', `/accounts/${encodeURIComponent(pathId)}`);
    return response.data;
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error(`Client not found: ${cleanId}`);
    }
    throw error;
  }
}

/**
 * Create a new account in Recurly
 * @param {Object} client - Recurly client instance
 * @param {Object} payload - Account data { code, email, first_name, last_name }
 * @returns {Promise<Object>} Created account object
 * @throws {Error} If creation fails
 */
async function createAccount(client, payload) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!payload || !payload.code) {
    throw new Error('Account payload with code is required');
  }

  try {
    const response = await client.request('POST', '/accounts', { body: payload });
    return response.data;
  } catch (error) {
    // Create wrapped error to preserve original
    const wrappedError = new Error(`Failed to create account ${payload.code}: ${error.message}`);
    wrappedError.cause = error;
    wrappedError.statusCode = error.statusCode;
    throw wrappedError;
  }
}

/**
 * Deactivate (close) an account by account code
 * Uses DELETE /accounts/{account_id} where account_id can be code-<account_code>
 * @param {Object} client - Recurly client instance
 * @param {string} accountCode - Account code to deactivate
 * @returns {Promise<Object>} Deactivated account object
 * @throws {Error} If deactivation fails (except 422 already inactive)
 */
async function deactivateAccount(client, accountCode) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!accountCode || typeof accountCode !== 'string' || accountCode.trim() === '') {
    throw new Error('Account code is required and must be a non-empty string');
  }

  const cleanCode = accountCode.trim();
  // Use code-<account_code> format for path parameter
  const accountId = `code-${cleanCode}`;

  try {
    const response = await client.request('DELETE', `/accounts/${encodeURIComponent(accountId)}`);
    return response.data;
  } catch (error) {
    // Handle already inactive case gracefully (422 "already inactive")
    // Check multiple patterns for robustness against API message changes
    if (error.statusCode === 422) {
      const msg = (error.message || '').toLowerCase();
      const isAlreadyInactive = msg.includes('already') && msg.includes('inactive');
      if (isAlreadyInactive) {
        return { code: cleanCode, state: 'inactive', __alreadyInactive: true };
      }
    }
    // Create wrapped error to preserve original
    const wrappedError = new Error(`Failed to deactivate account ${cleanCode}: ${error.message}`);
    wrappedError.cause = error;
    wrappedError.statusCode = error.statusCode;
    throw wrappedError;
  }
}

/**
 * Add a note to an account
 * Useful for tagging seeded accounts with metadata (type, closed_at, etc.)
 * @param {Object} client - Recurly client instance
 * @param {string} accountCode - Account code
 * @param {string} note - Note content
 * @returns {Promise<Object>} Created note object
 * @throws {Error} If note creation fails
 */
async function addAccountNote(client, accountCode, note) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!accountCode || typeof accountCode !== 'string' || accountCode.trim() === '') {
    throw new Error('Account code is required and must be a non-empty string');
  }

  if (!note || typeof note !== 'string' || note.trim() === '') {
    throw new Error('Note content is required and must be a non-empty string');
  }

  const cleanCode = accountCode.trim();
  // Use code-<account_code> format for path parameter
  const accountId = `code-${cleanCode}`;

  try {
    const response = await client.request('POST', `/accounts/${encodeURIComponent(accountId)}/notes`, {
      body: { message: note.trim() }
    });
    return response.data;
  } catch (error) {
    // Create wrapped error to preserve original
    const wrappedError = new Error(`Failed to add note to account ${cleanCode}: ${error.message}`);
    wrappedError.cause = error;
    wrappedError.statusCode = error.statusCode;
    throw wrappedError;
  }
}

/**
 * Reopen a closed account
 * @param {Object} client - Recurly client instance
 * @param {string} accountId - Account ID or code to reopen
 * @param {boolean} [isInternalId=false] - True if accountId is Recurly's internal ID
 * @returns {Promise<Object>} Reopened account object
 * @throws {Error} If reopening fails
 */
async function reopenAccount(client, accountId, isInternalId = false) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!accountId || typeof accountId !== 'string' || accountId.trim() === '') {
    throw new Error('Account ID is required and must be a non-empty string');
  }

  const cleanId = accountId.trim();

  // Use internal ID directly, or add code- prefix for account codes
  const pathId = isInternalId ? cleanId : `code-${cleanId}`;

  console.log(`[DEBUG] reopenAccount: cleanId=${cleanId}, pathId=${pathId}, isInternalId=${isInternalId}`);

  try {
    const response = await client.request(
      'PUT',
      `/accounts/${encodeURIComponent(pathId)}/reactivate`
    );
    console.log(`[DEBUG] reopenAccount success:`, response.data?.state);
    return response.data;
  } catch (error) {
    console.log(`[DEBUG] reopenAccount error: statusCode=${error.statusCode}, message=${error.message}`);
    // 422 = already active - not an error
    if (error.statusCode === 422) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('active') || msg.includes('already')) {
        return { id: cleanId, state: 'active', __alreadyActive: true };
      }
    }
    const wrappedError = new Error(`Failed to reopen account ${cleanId}: ${error.message}`);
    wrappedError.cause = error;
    wrappedError.statusCode = error.statusCode;
    throw wrappedError;
  }
}

/**
 * Check if an account has valid billing info (credit card)
 * @param {Object} client - Recurly client instance
 * @param {string} accountCode - Account code to check
 * @returns {Promise<boolean>} True if account has valid billing info
 */
async function hasBillingInfo(client, accountCode) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Valid Recurly client is required');
  }

  if (!accountCode || typeof accountCode !== 'string' || accountCode.trim() === '') {
    return false;
  }

  const cleanCode = accountCode.trim();
  const accountId = `code-${cleanCode}`;

  try {
    const response = await client.request('GET', `/accounts/${encodeURIComponent(accountId)}/billing_info`);
    const billingInfo = response.data;

    console.log(`[DEBUG] hasBillingInfo for ${cleanCode}:`);
    console.log(`[DEBUG]   raw: ${JSON.stringify(billingInfo).substring(0, 500)}`);

    // Check if billing info exists and has valid payment method
    if (!billingInfo) {
      console.log(`[DEBUG]   result: false (no billing info)`);
      return false;
    }

    // Check for valid card (has card type and last four digits)
    const hasCard = billingInfo.card_type && billingInfo.last_four;
    console.log(`[DEBUG]   card_type=${billingInfo.card_type}, last_four=${billingInfo.last_four}, hasCard=${hasCard}`);

    // Or check for payment_method object
    const hasPaymentMethod = billingInfo.payment_method && billingInfo.payment_method.card_type;
    console.log(`[DEBUG]   payment_method=${JSON.stringify(billingInfo.payment_method)}, hasPaymentMethod=${hasPaymentMethod}`);

    const result = hasCard || hasPaymentMethod || false;
    console.log(`[DEBUG]   result: ${result}`);
    return result;
  } catch (error) {
    // 404 = no billing info
    if (error.statusCode === 404) {
      console.log(`[DEBUG] hasBillingInfo for ${cleanCode}: 404 - no billing info`);
      return false;
    }
    // Other errors - log but return false to skip gracefully
    console.warn(`Warning: Could not check billing info for ${cleanCode}: ${error.message}`);
    return false;
  }
}

module.exports = {
  queryClosedAccounts,
  getAccountById,
  createAccount,
  deactivateAccount,
  addAccountNote,
  reopenAccount,
  hasBillingInfo
};
