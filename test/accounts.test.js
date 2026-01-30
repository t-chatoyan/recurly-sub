/**
 * Tests for Accounts API Module
 * Tests pagination, date filtering, and account retrieval
 */

const { test, describe, mock } = require('node:test');
const assert = require('node:assert');
const { queryClosedAccounts, getAccountById } = require('../src/api/accounts');

// Helper to create mock client
function createMockClient(responses) {
  let callIndex = 0;
  return {
    request: async (method, path) => {
      if (typeof responses === 'function') {
        return responses(method, path);
      }
      const response = responses[callIndex] || responses[responses.length - 1];
      callIndex++;
      return response;
    }
  };
}

describe('queryClosedAccounts', () => {
  describe('validation', () => {
    test('requires valid client', async () => {
      await assert.rejects(
        async () => queryClosedAccounts(null),
        /Valid Recurly client is required/
      );

      await assert.rejects(
        async () => queryClosedAccounts({}),
        /Valid Recurly client is required/
      );

      await assert.rejects(
        async () => queryClosedAccounts({ request: 'not a function' }),
        /Valid Recurly client is required/
      );
    });

    test('validates startDate is a Date object', async () => {
      const mockClient = createMockClient([]);

      await assert.rejects(
        async () => queryClosedAccounts(mockClient, { startDate: 'invalid' }),
        /Invalid startDate: must be a valid Date object/
      );

      await assert.rejects(
        async () => queryClosedAccounts(mockClient, { startDate: new Date('invalid') }),
        /Invalid startDate: must be a valid Date object/
      );
    });

    test('validates endDate is a Date object', async () => {
      const mockClient = createMockClient([]);

      await assert.rejects(
        async () => queryClosedAccounts(mockClient, { endDate: 'invalid' }),
        /Invalid endDate: must be a valid Date object/
      );
    });

    test('validates startDate is before endDate', async () => {
      const mockClient = createMockClient([]);

      await assert.rejects(
        async () => queryClosedAccounts(mockClient, {
          startDate: new Date('2026-01-20'),
          endDate: new Date('2025-11-16')
        }),
        /Invalid date range: startDate must be before endDate/
      );
    });

    test('validates limit is between 1 and 200', async () => {
      const mockClient = createMockClient([]);

      await assert.rejects(
        async () => queryClosedAccounts(mockClient, { limit: 0 }),
        /Invalid limit: must be a number between 1 and 200/
      );

      await assert.rejects(
        async () => queryClosedAccounts(mockClient, { limit: 201 }),
        /Invalid limit: must be a number between 1 and 200/
      );

      await assert.rejects(
        async () => queryClosedAccounts(mockClient, { limit: 'invalid' }),
        /Invalid limit: must be a number between 1 and 200/
      );
    });
  });

  describe('pagination', () => {
    test('handles single page response', async () => {
      // Note: Implementation filters client-side for state=closed and closed_at in range
      const mockData = [
        { id: 'account-1', state: 'closed', closed_at: '2025-12-01T10:00:00Z' },
        { id: 'account-2', state: 'closed', closed_at: '2025-12-15T10:00:00Z' }
      ];

      const mockClient = createMockClient([
        {
          data: {
            data: mockData,
            has_more: false,
            next: null
          }
        }
      ]);

      const accounts = await queryClosedAccounts(mockClient);

      assert.strictEqual(accounts.length, 2);
      assert.strictEqual(accounts[0].id, 'account-1');
      assert.strictEqual(accounts[1].id, 'account-2');
    });

    test('handles multiple pages', async () => {
      // Note: Implementation filters client-side for state=closed and closed_at in range
      const mockClient = createMockClient([
        {
          data: {
            data: [{ id: 'account-1', state: 'closed', closed_at: '2025-12-01T10:00:00Z' }],
            has_more: true,
            next: 'cursor-1'
          }
        },
        {
          data: {
            data: [{ id: 'account-2', state: 'closed', closed_at: '2025-12-05T10:00:00Z' }],
            has_more: true,
            next: 'cursor-2'
          }
        },
        {
          data: {
            data: [{ id: 'account-3', state: 'closed', closed_at: '2025-12-10T10:00:00Z' }],
            has_more: false,
            next: null
          }
        }
      ]);

      const accounts = await queryClosedAccounts(mockClient);

      assert.strictEqual(accounts.length, 3);
      assert.strictEqual(accounts[0].id, 'account-1');
      assert.strictEqual(accounts[1].id, 'account-2');
      assert.strictEqual(accounts[2].id, 'account-3');
    });

    test('passes cursor in subsequent requests', async () => {
      const requests = [];

      const mockClient = {
        request: async (method, path) => {
          requests.push({ method, path });

          if (requests.length === 1) {
            return {
              data: {
                data: [{ id: 'account-1', state: 'closed', closed_at: '2025-12-01T10:00:00Z' }],
                has_more: true,
                next: 'test-cursor-123'
              }
            };
          }

          return {
            data: {
              data: [{ id: 'account-2', state: 'closed', closed_at: '2025-12-15T10:00:00Z' }],
              has_more: false,
              next: null
            }
          };
        }
      };

      await queryClosedAccounts(mockClient);

      assert.strictEqual(requests.length, 2);
      assert.ok(!requests[0].path.includes('cursor'));
      assert.ok(requests[1].path.includes('cursor=test-cursor-123'));
    });

    test('handles empty response', async () => {
      const mockClient = createMockClient([
        {
          data: {
            data: [],
            has_more: false,
            next: null
          }
        }
      ]);

      const accounts = await queryClosedAccounts(mockClient);

      assert.strictEqual(accounts.length, 0);
    });
  });

  describe('query parameters', () => {
    // Note: Recurly API v3 does not support state= or filter[closed_at] parameters
    // Implementation uses begin_time/end_time and filters client-side
    test('includes begin_time and end_time parameters', async () => {
      let capturedPath = '';

      const mockClient = {
        request: async (method, path) => {
          capturedPath = path;
          return { data: { data: [], has_more: false } };
        }
      };

      await queryClosedAccounts(mockClient);

      assert.ok(capturedPath.includes('begin_time='), 'Should include begin_time parameter');
      assert.ok(capturedPath.includes('end_time='), 'Should include end_time parameter');
    });

    test('includes sort and order parameters', async () => {
      let capturedPath = '';

      const mockClient = {
        request: async (method, path) => {
          capturedPath = path;
          return { data: { data: [], has_more: false } };
        }
      };

      const startDate = new Date('2025-11-16T00:00:00Z');
      const endDate = new Date('2026-01-20T23:59:59Z');

      await queryClosedAccounts(mockClient, { startDate, endDate });

      assert.ok(capturedPath.includes('sort=updated_at'), 'Should sort by updated_at');
      assert.ok(capturedPath.includes('order=asc'), 'Should order ascending');
    });

    test('uses custom limit', async () => {
      let capturedPath = '';

      const mockClient = {
        request: async (method, path) => {
          capturedPath = path;
          return { data: { data: [], has_more: false } };
        }
      };

      await queryClosedAccounts(mockClient, { limit: 50 });

      assert.ok(capturedPath.includes('limit=50'));
    });

    test('uses default limit of 200', async () => {
      let capturedPath = '';

      const mockClient = {
        request: async (method, path) => {
          capturedPath = path;
          return { data: { data: [], has_more: false } };
        }
      };

      await queryClosedAccounts(mockClient);

      assert.ok(capturedPath.includes('limit=200'));
    });
  });

  describe('error handling', () => {
    test('propagates API errors with context', async () => {
      const mockClient = {
        request: async () => {
          throw new Error('API connection failed');
        }
      };

      await assert.rejects(
        async () => queryClosedAccounts(mockClient),
        /Failed to query accounts.*API connection failed/
      );
    });
  });

  describe('response format handling', () => {
    // NOTE: Recurly API v3 should always return { data: [...], has_more: bool }
    // This test ensures graceful handling if the format changes or is inconsistent
    // Note: Implementation filters client-side for state=closed and closed_at in range
    test('handles legacy/edge case: data array directly (defensive)', async () => {
      const mockClient = createMockClient([
        {
          data: [
            { id: 'account-1', state: 'closed', closed_at: '2025-12-01T10:00:00Z' }
          ]
        }
      ]);

      const accounts = await queryClosedAccounts(mockClient);

      assert.strictEqual(accounts.length, 1);
      assert.strictEqual(accounts[0].id, 'account-1');
    });

    test('handles data in data property', async () => {
      const mockClient = createMockClient([
        {
          data: {
            data: [{ id: 'account-1', state: 'closed', closed_at: '2025-12-01T10:00:00Z' }],
            has_more: false
          }
        }
      ]);

      const accounts = await queryClosedAccounts(mockClient);

      assert.strictEqual(accounts.length, 1);
    });

    test('filters out non-closed accounts client-side', async () => {
      const mockClient = createMockClient([
        {
          data: {
            data: [
              { id: 'account-1', state: 'closed', closed_at: '2025-12-01T10:00:00Z' },
              { id: 'account-2', state: 'active', closed_at: null },
              { id: 'account-3', state: 'closed', closed_at: '2025-12-15T10:00:00Z' }
            ],
            has_more: false
          }
        }
      ]);

      const accounts = await queryClosedAccounts(mockClient);

      assert.strictEqual(accounts.length, 2);
      assert.ok(accounts.every(a => a.state === 'closed'));
    });

    test('filters out accounts with closed_at outside date range', async () => {
      const mockClient = createMockClient([
        {
          data: {
            data: [
              { id: 'account-1', state: 'closed', closed_at: '2025-12-01T10:00:00Z' },  // in range
              { id: 'account-2', state: 'closed', closed_at: '2024-01-01T10:00:00Z' },  // before range
              { id: 'account-3', state: 'closed', closed_at: '2027-01-01T10:00:00Z' }   // after range
            ],
            has_more: false
          }
        }
      ]);

      const accounts = await queryClosedAccounts(mockClient);

      assert.strictEqual(accounts.length, 1);
      assert.strictEqual(accounts[0].id, 'account-1');
    });
  });

  describe('onProgress callback', () => {
    test('calls onProgress with start event', async () => {
      const events = [];
      const mockClient = createMockClient([
        { data: { data: [], has_more: false } }
      ]);

      await queryClosedAccounts(mockClient, {
        onProgress: (event) => events.push(event)
      });

      const startEvent = events.find(e => e.type === 'start');
      assert.ok(startEvent, 'Should have start event');
      assert.ok(startEvent.startDate instanceof Date);
      assert.ok(startEvent.endDate instanceof Date);
    });

    test('calls onProgress with page events', async () => {
      const events = [];
      const mockClient = createMockClient([
        { data: { data: [{ id: 'a1', state: 'closed', closed_at: '2025-12-01T10:00:00Z' }], has_more: true, next: 'c1' } },
        { data: { data: [{ id: 'a2', state: 'closed', closed_at: '2025-12-15T10:00:00Z' }], has_more: false } }
      ]);

      await queryClosedAccounts(mockClient, {
        onProgress: (event) => events.push(event)
      });

      const pageEvents = events.filter(e => e.type === 'page');
      assert.strictEqual(pageEvents.length, 2);
      assert.strictEqual(pageEvents[0].page, 1);
      assert.strictEqual(pageEvents[1].page, 2);
    });

    test('calls onProgress with complete event', async () => {
      const events = [];
      const mockClient = createMockClient([
        { data: { data: [
          { id: 'a1', state: 'closed', closed_at: '2025-12-01T10:00:00Z' },
          { id: 'a2', state: 'closed', closed_at: '2025-12-15T10:00:00Z' }
        ], has_more: false } }
      ]);

      await queryClosedAccounts(mockClient, {
        onProgress: (event) => events.push(event)
      });

      const completeEvent = events.find(e => e.type === 'complete');
      assert.ok(completeEvent, 'Should have complete event');
      assert.strictEqual(completeEvent.total, 2);
    });

    test('works without onProgress callback', async () => {
      const mockClient = createMockClient([
        { data: { data: [], has_more: false } }
      ]);

      // Should not throw
      const accounts = await queryClosedAccounts(mockClient);
      assert.strictEqual(accounts.length, 0);
    });
  });
});

describe('getAccountById', () => {
  describe('validation', () => {
    test('requires valid client', async () => {
      await assert.rejects(
        async () => getAccountById(null, 'account-id'),
        /Valid Recurly client is required/
      );

      await assert.rejects(
        async () => getAccountById({}, 'account-id'),
        /Valid Recurly client is required/
      );
    });

    test('requires account ID', async () => {
      const mockClient = createMockClient([]);

      await assert.rejects(
        async () => getAccountById(mockClient, null),
        /Account ID is required/
      );

      await assert.rejects(
        async () => getAccountById(mockClient, ''),
        /Account ID is required/
      );

      await assert.rejects(
        async () => getAccountById(mockClient, '   '),
        /Account ID is required/
      );
    });

    test('requires string account ID', async () => {
      const mockClient = createMockClient([]);

      await assert.rejects(
        async () => getAccountById(mockClient, 123),
        /Account ID is required and must be a non-empty string/
      );
    });
  });

  describe('successful retrieval', () => {
    test('returns account for valid ID', async () => {
      const mockAccount = {
        id: 'test-account-123',
        code: 'ABC123',
        state: 'closed',
        closed_at: '2025-12-01T10:00:00Z',
        email: 'test@example.com'
      };

      const mockClient = {
        request: async (method, path) => ({
          data: mockAccount
        })
      };

      const account = await getAccountById(mockClient, 'test-account-123');

      assert.strictEqual(account.id, 'test-account-123');
      assert.strictEqual(account.state, 'closed');
      assert.strictEqual(account.email, 'test@example.com');
    });

    test('trims whitespace from account ID', async () => {
      let capturedPath = '';

      const mockClient = {
        request: async (method, path) => {
          capturedPath = path;
          return { data: { id: 'test-id' } };
        }
      };

      await getAccountById(mockClient, '  test-id  ');

      // Account codes get code- prefix, trimmed of whitespace
      assert.ok(capturedPath.includes('/accounts/code-test-id'));
      assert.ok(!capturedPath.includes('%20'));
    });

    test('URL encodes special characters in account ID', async () => {
      let capturedPath = '';

      const mockClient = {
        request: async (method, path) => {
          capturedPath = path;
          return { data: { id: 'test/id' } };
        }
      };

      await getAccountById(mockClient, 'test/id');

      // Should be URL encoded - forward slash becomes %2F
      assert.ok(capturedPath.includes('%2F'), 'Forward slash should be URL encoded as %2F');
    });
  });

  describe('error handling', () => {
    test('throws "Client not found" for 404', async () => {
      const mockClient = {
        request: async () => {
          const error = new Error('Not found');
          error.statusCode = 404;
          throw error;
        }
      };

      await assert.rejects(
        async () => getAccountById(mockClient, 'invalid-id'),
        /Client not found: invalid-id/
      );
    });

    test('propagates non-404 errors', async () => {
      const mockClient = {
        request: async () => {
          const error = new Error('Server error');
          error.statusCode = 500;
          throw error;
        }
      };

      await assert.rejects(
        async () => getAccountById(mockClient, 'test-id'),
        /Server error/
      );
    });

    test('propagates network errors', async () => {
      const mockClient = {
        request: async () => {
          throw new Error('Network connection failed');
        }
      };

      await assert.rejects(
        async () => getAccountById(mockClient, 'test-id'),
        /Network connection failed/
      );
    });
  });
});
