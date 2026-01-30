/**
 * Tests for Rescue Plan Manager Module
 * Tests plan code generation, plan finding, and plan creation
 */

const { test, describe, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const {
  validateCurrency,
  getRescuePlanCode,
  getRescuePlanName,
  getUnitAmountForCurrency,
  buildPlanPayload,
  getPlanByCode,
  createRescuePlan,
  findOrCreateRescuePlan,
  CURRENCY_UNIT_AMOUNTS
} = require('../src/rescue/plan-manager');
const { setDryRunMode, resetDryRunState } = require('../src/rescue/dry-run');

describe('validateCurrency', () => {
  test('returns trimmed currency for valid input', () => {
    assert.strictEqual(validateCurrency('EUR'), 'EUR');
    assert.strictEqual(validateCurrency('  USD  '), 'USD');
  });

  test('throws for null currency', () => {
    assert.throws(
      () => validateCurrency(null),
      /Currency must be a non-empty string/
    );
  });

  test('throws for undefined currency', () => {
    assert.throws(
      () => validateCurrency(undefined),
      /Currency must be a non-empty string/
    );
  });

  test('throws for empty string', () => {
    assert.throws(
      () => validateCurrency(''),
      /Currency must be a non-empty string/
    );
  });

  test('throws for whitespace-only string', () => {
    assert.throws(
      () => validateCurrency('   '),
      /Currency must be a non-empty string/
    );
  });

  test('throws for non-string types', () => {
    assert.throws(
      () => validateCurrency(123),
      /Currency must be a non-empty string/
    );
  });
});

describe('getRescuePlanCode', () => {
  test('generates correct code for EUR', () => {
    assert.strictEqual(getRescuePlanCode('EUR'), '4weeks-subscription');
  });

  test('generates correct code for USD', () => {
    assert.strictEqual(getRescuePlanCode('USD'), '4weeks-subscription');
  });

  test('handles lowercase input', () => {
    assert.strictEqual(getRescuePlanCode('usd'), '4weeks-subscription');
  });

  test('handles mixed case input', () => {
    assert.strictEqual(getRescuePlanCode('Eur'), '4weeks-subscription');
  });

  test('handles input with whitespace', () => {
    assert.strictEqual(getRescuePlanCode('  EUR  '), '4weeks-subscription');
  });

  test('throws for null currency', () => {
    assert.throws(
      () => getRescuePlanCode(null),
      /Currency must be a non-empty string/
    );
  });

  test('throws for undefined currency', () => {
    assert.throws(
      () => getRescuePlanCode(undefined),
      /Currency must be a non-empty string/
    );
  });

  test('throws for empty string', () => {
    assert.throws(
      () => getRescuePlanCode(''),
      /Currency must be a non-empty string/
    );
  });

  test('throws for whitespace-only string', () => {
    assert.throws(
      () => getRescuePlanCode('   '),
      /Currency must be a non-empty string/
    );
  });

  test('throws for non-string types', () => {
    assert.throws(
      () => getRescuePlanCode(123),
      /Currency must be a non-empty string/
    );
    assert.throws(
      () => getRescuePlanCode({}),
      /Currency must be a non-empty string/
    );
  });
});

describe('getUnitAmountForCurrency', () => {
  test('returns currency-specific amount for EUR', () => {
    assert.strictEqual(getUnitAmountForCurrency('EUR'), 24.95);
  });

  test('returns currency-specific amount for USD', () => {
    assert.strictEqual(getUnitAmountForCurrency('USD'), 29.99);
  });

  test('returns currency-specific amount for GBP', () => {
    assert.strictEqual(getUnitAmountForCurrency('GBP'), 24.95);
  });

  test('returns currency-specific amount for CAD', () => {
    assert.strictEqual(getUnitAmountForCurrency('CAD'), 29.99);
  });

  test('returns currency-specific amount for CHF', () => {
    assert.strictEqual(getUnitAmountForCurrency('CHF'), 24.95);
  });

  test('normalizes currency case', () => {
    assert.strictEqual(getUnitAmountForCurrency('eur'), 24.95);
    assert.strictEqual(getUnitAmountForCurrency('Usd'), 29.99);
  });

  test('uses override amount when provided', () => {
    assert.strictEqual(getUnitAmountForCurrency('EUR', 50.00), 50.00);
    assert.strictEqual(getUnitAmountForCurrency('USD', 100.00), 100.00);
  });

  test('returns default for unsupported currency', () => {
    assert.strictEqual(getUnitAmountForCurrency('JPY'), 29.90);
  });

  test('handles null override as no override', () => {
    assert.strictEqual(getUnitAmountForCurrency('EUR', null), 24.95);
  });
});

describe('getRescuePlanName', () => {
  test('generates correct name for EUR', () => {
    assert.strictEqual(getRescuePlanName('EUR'), 'Rescue Plan (EUR)');
  });

  test('generates correct name for USD', () => {
    assert.strictEqual(getRescuePlanName('USD'), 'Rescue Plan (USD)');
  });

  test('normalizes currency to uppercase', () => {
    assert.strictEqual(getRescuePlanName('eur'), 'Rescue Plan (EUR)');
  });

  test('trims whitespace from currency', () => {
    assert.strictEqual(getRescuePlanName('  EUR  '), 'Rescue Plan (EUR)');
  });

  test('throws for null currency', () => {
    assert.throws(
      () => getRescuePlanName(null),
      /Currency must be a non-empty string/
    );
  });

  test('throws for empty string', () => {
    assert.throws(
      () => getRescuePlanName(''),
      /Currency must be a non-empty string/
    );
  });
});

describe('buildPlanPayload', () => {
  test('builds correct payload structure', () => {
    const payload = buildPlanPayload('EUR');

    assert.strictEqual(payload.code, '4weeks-subscription');
    assert.strictEqual(payload.name, 'Rescue Plan (EUR)');
    assert.ok(Array.isArray(payload.currencies));
    assert.strictEqual(payload.currencies.length, 1);
    assert.strictEqual(payload.currencies[0].currency, 'EUR');
    assert.strictEqual(payload.currencies[0].setup_fee, 0);
    assert.strictEqual(payload.currencies[0].unit_amount, 24.95);
  });

  test('uses currency-specific unit amounts', () => {
    const eurPayload = buildPlanPayload('EUR');
    assert.strictEqual(eurPayload.currencies[0].unit_amount, 24.95);

    const usdPayload = buildPlanPayload('USD');
    assert.strictEqual(usdPayload.currencies[0].unit_amount, 29.99);

    const gbpPayload = buildPlanPayload('GBP');
    assert.strictEqual(gbpPayload.currencies[0].unit_amount, 24.95);

    const cadPayload = buildPlanPayload('CAD');
    assert.strictEqual(cadPayload.currencies[0].unit_amount, 29.99);

    const chfPayload = buildPlanPayload('CHF');
    assert.strictEqual(chfPayload.currencies[0].unit_amount, 24.95);
  });

  test('allows overriding unit amount', () => {
    const payload = buildPlanPayload('EUR', { unitAmount: 30.00 });
    assert.strictEqual(payload.currencies[0].unit_amount, 30.00);
  });

  test('normalizes currency to uppercase in currencies array', () => {
    const payload = buildPlanPayload('usd');

    assert.strictEqual(payload.currencies[0].currency, 'USD');
  });

  test('normalizes currency to lowercase in code', () => {
    const payload = buildPlanPayload('GBP');

    assert.strictEqual(payload.code, '4weeks-subscription');
  });

  test('trims whitespace from currency', () => {
    const payload = buildPlanPayload('  EUR  ');

    assert.strictEqual(payload.code, '4weeks-subscription');
    assert.strictEqual(payload.name, 'Rescue Plan (EUR)');
    assert.strictEqual(payload.currencies[0].currency, 'EUR');
  });

  test('throws for invalid currency', () => {
    assert.throws(
      () => buildPlanPayload(null),
      /Currency must be a non-empty string/
    );
  });
});

describe('getPlanByCode', () => {
  test('requires valid client', async () => {
    await assert.rejects(
      async () => getPlanByCode(null, '4weeks-subscription'),
      /Valid Recurly client is required/
    );

    await assert.rejects(
      async () => getPlanByCode({}, '4weeks-subscription'),
      /Valid Recurly client is required/
    );
  });

  test('returns plan when found (200)', async () => {
    const mockPlan = {
      code: '4weeks-subscription',
      name: 'Rescue Plan (EUR)',
      id: 'plan-123'
    };

    const mockClient = {
      request: mock.fn(async () => ({ data: mockPlan, statusCode: 200 }))
    };

    const result = await getPlanByCode(mockClient, '4weeks-subscription');

    assert.deepStrictEqual(result, mockPlan);
    assert.strictEqual(mockClient.request.mock.calls.length, 1);
    assert.strictEqual(mockClient.request.mock.calls[0].arguments[0], 'GET');
    assert.strictEqual(mockClient.request.mock.calls[0].arguments[1], '/plans/4weeks-subscription');
  });

  test('returns null when not found (404)', async () => {
    const error404 = new Error('Not found');
    error404.statusCode = 404;

    const mockClient = {
      request: mock.fn(async () => { throw error404; })
    };

    const result = await getPlanByCode(mockClient, '4weeks-subscription');

    assert.strictEqual(result, null);
  });

  test('throws for other errors', async () => {
    const error500 = new Error('Server error');
    error500.statusCode = 500;

    const mockClient = {
      request: mock.fn(async () => { throw error500; })
    };

    await assert.rejects(
      async () => getPlanByCode(mockClient, '4weeks-subscription'),
      /Server error/
    );
  });

  test('throws for 429 rate limit error', async () => {
    const error429 = new Error('Rate limited');
    error429.statusCode = 429;

    const mockClient = {
      request: mock.fn(async () => { throw error429; })
    };

    await assert.rejects(
      async () => getPlanByCode(mockClient, '4weeks-subscription'),
      /Rate limited/
    );
  });

  test('encodes plan code in URL', async () => {
    const mockClient = {
      request: mock.fn(async () => ({ data: { code: 'test' }, statusCode: 200 }))
    };

    await getPlanByCode(mockClient, 'plan-with-special/chars');

    assert.strictEqual(
      mockClient.request.mock.calls[0].arguments[1],
      '/plans/plan-with-special%2Fchars'
    );
  });
});

describe('createRescuePlan', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = mock.fn();
    resetDryRunState();
  });

  afterEach(() => {
    resetDryRunState();
  });

  test('requires valid client', async () => {
    await assert.rejects(
      async () => createRescuePlan(null, 'EUR'),
      /Valid Recurly client is required/
    );
  });

  test('creates plan with correct payload', async () => {
    const mockPlan = {
      code: '4weeks-subscription',
      name: 'Rescue Plan (EUR)',
      id: 'plan-123'
    };

    const mockClient = {
      request: mock.fn(async () => ({ data: mockPlan, statusCode: 201 }))
    };

    const result = await createRescuePlan(mockClient, 'EUR', { log: logSpy });

    assert.deepStrictEqual(result, mockPlan);
    assert.strictEqual(mockClient.request.mock.calls.length, 1);
    assert.strictEqual(mockClient.request.mock.calls[0].arguments[0], 'POST');
    assert.strictEqual(mockClient.request.mock.calls[0].arguments[1], '/plans');

    const sentPayload = mockClient.request.mock.calls[0].arguments[2].body;
    assert.strictEqual(sentPayload.code, '4weeks-subscription');
    assert.strictEqual(sentPayload.name, 'Rescue Plan (EUR)');
    assert.strictEqual(sentPayload.currencies[0].currency, 'EUR');
    assert.strictEqual(sentPayload.currencies[0].unit_amount, 24.95);
    assert.strictEqual(sentPayload.currencies[0].setup_fee, 0);
  });

  test('logs plan creation', async () => {
    const mockClient = {
      request: mock.fn(async () => ({ data: { code: '4weeks-subscription' }, statusCode: 201 }))
    };

    await createRescuePlan(mockClient, 'EUR', { log: logSpy });

    assert.ok(logSpy.mock.calls.some(call =>
      call.arguments[0].includes('Created Rescue Plan: 4weeks-subscription')
    ));
  });

  test('throws with context on API error', async () => {
    const mockClient = {
      request: mock.fn(async () => { throw new Error('API error'); })
    };

    await assert.rejects(
      async () => createRescuePlan(mockClient, 'EUR', { log: logSpy }),
      /Failed to create Rescue Plan 4weeks-subscription: API error/
    );
  });

  test('handles 422 conflict when plan already exists (race condition)', async () => {
    const error422 = new Error('Code has already been taken');
    error422.statusCode = 422;

    const mockExistingPlan = {
      code: '4weeks-subscription',
      name: 'Rescue Plan (EUR)',
      id: 'plan-existing'
    };

    let callCount = 0;
    const mockClient = {
      request: mock.fn(async (method) => {
        callCount++;
        if (callCount === 1 && method === 'POST') {
          throw error422;
        }
        // GET call to fetch existing plan
        return { data: mockExistingPlan, statusCode: 200 };
      })
    };

    const result = await createRescuePlan(mockClient, 'EUR', { log: logSpy });

    assert.deepStrictEqual(result, mockExistingPlan);
    assert.ok(logSpy.mock.calls.some(call =>
      call.arguments[0].includes('already exists')
    ));
  });

  test('returns minimal plan when 422 conflict and GET also fails', async () => {
    const error422 = new Error('Code has already been taken');
    error422.statusCode = 422;

    const error404 = new Error('Not found');
    error404.statusCode = 404;

    let callCount = 0;
    const mockClient = {
      request: mock.fn(async (method) => {
        callCount++;
        if (callCount === 1 && method === 'POST') {
          throw error422;
        }
        // GET call fails with 404 (eventual consistency issue)
        throw error404;
      })
    };

    const result = await createRescuePlan(mockClient, 'EUR', { log: logSpy });

    // Should return minimal plan object since we know it exists
    assert.strictEqual(result.code, '4weeks-subscription');
    assert.strictEqual(result.name, 'Rescue Plan (EUR)');
    assert.strictEqual(result.state, 'active');
    assert.ok(logSpy.mock.calls.some(call =>
      call.arguments[0].includes('already exists')
    ));
  });

  test('throws for 429 rate limit error', async () => {
    const error429 = new Error('Rate limited');
    error429.statusCode = 429;

    const mockClient = {
      request: mock.fn(async () => { throw error429; })
    };

    await assert.rejects(
      async () => createRescuePlan(mockClient, 'EUR', { log: logSpy }),
      /Failed to create Rescue Plan 4weeks-subscription: Rate limited/
    );
  });

  test('returns mock plan in dry-run mode (skips API)', async () => {
    setDryRunMode(true);

    const mockClient = {
      request: mock.fn(async () => { throw new Error('Should not be called'); })
    };

    const result = await createRescuePlan(mockClient, 'EUR', { log: logSpy });

    // Verify API was NOT called
    assert.strictEqual(mockClient.request.mock.calls.length, 0);

    // Verify mock plan structure
    assert.strictEqual(result.code, '4weeks-subscription');
    assert.strictEqual(result.currency, 'EUR');
    assert.strictEqual(result.__dryRun, true);

    // Verify dry-run message was logged
    assert.ok(logSpy.mock.calls.some(call =>
      call.arguments[0].includes('[DRY-RUN]') &&
      call.arguments[0].includes('Would create Rescue Plan: 4weeks-subscription')
    ));
  });

  test('dry-run mode respects currency normalization', async () => {
    setDryRunMode(true);

    const mockClient = { request: mock.fn() };

    const result = await createRescuePlan(mockClient, 'usd', { log: logSpy });

    assert.strictEqual(result.code, '4weeks-subscription');
    assert.strictEqual(result.currency, 'USD');
    assert.strictEqual(result.__dryRun, true);
  });
});

describe('findOrCreateRescuePlan', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = mock.fn();
    resetDryRunState();
  });

  afterEach(() => {
    resetDryRunState();
  });

  test('requires valid client', async () => {
    await assert.rejects(
      async () => findOrCreateRescuePlan(null, 'EUR'),
      /Valid Recurly client is required/
    );

    await assert.rejects(
      async () => findOrCreateRescuePlan({}, 'EUR'),
      /Valid Recurly client is required/
    );
  });

  test('requires valid currency', async () => {
    const mockClient = { request: mock.fn() };

    await assert.rejects(
      async () => findOrCreateRescuePlan(mockClient, null),
      /Currency must be a non-empty string/
    );

    await assert.rejects(
      async () => findOrCreateRescuePlan(mockClient, ''),
      /Currency must be a non-empty string/
    );

    await assert.rejects(
      async () => findOrCreateRescuePlan(mockClient, '   '),
      /Currency must be a non-empty string/
    );
  });

  test('returns existing plan if found', async () => {
    const mockPlan = {
      code: '4weeks-subscription',
      name: 'Rescue Plan (EUR)',
      id: 'plan-123'
    };

    const mockClient = {
      request: mock.fn(async () => ({ data: mockPlan, statusCode: 200 }))
    };

    const result = await findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy });

    assert.deepStrictEqual(result, mockPlan);
    assert.strictEqual(mockClient.request.mock.calls.length, 1);
    assert.strictEqual(mockClient.request.mock.calls[0].arguments[0], 'GET');
  });

  test('logs when existing plan found', async () => {
    const mockPlan = { code: '4weeks-subscription' };

    const mockClient = {
      request: mock.fn(async () => ({ data: mockPlan, statusCode: 200 }))
    };

    await findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy });

    assert.ok(logSpy.mock.calls.some(call =>
      call.arguments[0].includes('Found existing Rescue Plan: 4weeks-subscription')
    ));
  });

  test('creates plan if not found', async () => {
    const error404 = new Error('Not found');
    error404.statusCode = 404;

    const mockCreatedPlan = {
      code: '4weeks-subscription',
      name: 'Rescue Plan (EUR)',
      id: 'plan-new'
    };

    let callCount = 0;
    const mockClient = {
      request: mock.fn(async (method) => {
        callCount++;
        if (callCount === 1) {
          // First call: GET to check if plan exists
          throw error404;
        }
        // Second call: POST to create plan
        return { data: mockCreatedPlan, statusCode: 201 };
      })
    };

    const result = await findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy });

    assert.deepStrictEqual(result, mockCreatedPlan);
    assert.strictEqual(mockClient.request.mock.calls.length, 2);
    assert.strictEqual(mockClient.request.mock.calls[0].arguments[0], 'GET');
    assert.strictEqual(mockClient.request.mock.calls[1].arguments[0], 'POST');
  });

  test('logs when creating new plan', async () => {
    const error404 = new Error('Not found');
    error404.statusCode = 404;

    let callCount = 0;
    const mockClient = {
      request: mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw error404;
        }
        return { data: { code: '4weeks-subscription' }, statusCode: 201 };
      })
    };

    await findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy });

    assert.ok(logSpy.mock.calls.some(call =>
      call.arguments[0].includes('Rescue Plan not found, creating: 4weeks-subscription')
    ));
    assert.ok(logSpy.mock.calls.some(call =>
      call.arguments[0].includes('Created Rescue Plan: 4weeks-subscription')
    ));
  });

  test('throws on API error during plan check', async () => {
    const error500 = new Error('Server error');
    error500.statusCode = 500;

    const mockClient = {
      request: mock.fn(async () => { throw error500; })
    };

    await assert.rejects(
      async () => findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy }),
      /Server error/
    );
  });

  test('throws on API error during plan creation', async () => {
    const error404 = new Error('Not found');
    error404.statusCode = 404;

    const error500 = new Error('Server error');
    error500.statusCode = 500;

    let callCount = 0;
    const mockClient = {
      request: mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw error404;
        }
        throw error500;
      })
    };

    await assert.rejects(
      async () => findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy }),
      /Failed to create Rescue Plan 4weeks-subscription: Server error/
    );
  });

  test('handles different currencies', async () => {
    const mockPlan = { code: '4weeks-subscription' };

    const mockClient = {
      request: mock.fn(async () => ({ data: mockPlan, statusCode: 200 }))
    };

    await findOrCreateRescuePlan(mockClient, 'USD', { log: logSpy });

    assert.strictEqual(
      mockClient.request.mock.calls[0].arguments[1],
      '/plans/4weeks-subscription'
    );
  });

  test('handles 429 rate limit during plan check', async () => {
    const error429 = new Error('Rate limited');
    error429.statusCode = 429;

    const mockClient = {
      request: mock.fn(async () => { throw error429; })
    };

    await assert.rejects(
      async () => findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy }),
      /Rate limited/
    );
  });

  test('handles race condition gracefully', async () => {
    // Simulates: Plan not found, then 422 on create (another process created it), then GET succeeds
    const error404 = new Error('Not found');
    error404.statusCode = 404;

    const error422 = new Error('Code has already been taken');
    error422.statusCode = 422;

    const mockExistingPlan = {
      code: '4weeks-subscription',
      name: 'Rescue Plan (EUR)',
      id: 'plan-concurrent'
    };

    let callCount = 0;
    const mockClient = {
      request: mock.fn(async (method) => {
        callCount++;
        if (callCount === 1) {
          // First GET: plan not found
          throw error404;
        }
        if (callCount === 2) {
          // POST: another process created it first
          throw error422;
        }
        // Third GET: fetch the existing plan
        return { data: mockExistingPlan, statusCode: 200 };
      })
    };

    const result = await findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy });

    assert.deepStrictEqual(result, mockExistingPlan);
  });

  test('dry-run mode still performs GET to check existing plan', async () => {
    setDryRunMode(true);

    const mockExistingPlan = {
      code: '4weeks-subscription',
      name: 'Rescue Plan (EUR)',
      id: 'plan-123'
    };

    const mockClient = {
      request: mock.fn(async () => ({ data: mockExistingPlan, statusCode: 200 }))
    };

    const result = await findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy });

    // Should return the real plan (GET is allowed in dry-run)
    assert.deepStrictEqual(result, mockExistingPlan);
    assert.strictEqual(mockClient.request.mock.calls.length, 1);
    assert.strictEqual(mockClient.request.mock.calls[0].arguments[0], 'GET');
  });

  test('dry-run mode returns mock when plan not found (skips create)', async () => {
    setDryRunMode(true);

    const error404 = new Error('Not found');
    error404.statusCode = 404;

    const mockClient = {
      request: mock.fn(async () => { throw error404; })
    };

    const result = await findOrCreateRescuePlan(mockClient, 'EUR', { log: logSpy });

    // Should return mock plan (POST was skipped)
    assert.strictEqual(result.__dryRun, true);
    assert.strictEqual(result.code, '4weeks-subscription');

    // Only GET was called (no POST)
    assert.strictEqual(mockClient.request.mock.calls.length, 1);
    assert.strictEqual(mockClient.request.mock.calls[0].arguments[0], 'GET');

    // Verify dry-run message was logged
    assert.ok(logSpy.mock.calls.some(call =>
      call.arguments[0].includes('[DRY-RUN]') &&
      call.arguments[0].includes('Would create')
    ));
  });
});
