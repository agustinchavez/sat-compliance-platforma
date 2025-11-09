# Multi-Tenant Context Manager - Integration Tests

Comprehensive test suite for the Multi-Tenant Context Manager system.

## Test Coverage

### 1. RLS Isolation Tests (`rls-isolation.test.ts`)
Tests Row-Level Security policies and cross-organization data isolation.

**What's Tested:**
- Chart of accounts RLS filtering
- Journal entries RLS filtering
- Tax periods RLS filtering
- WhatsApp conversations and messages RLS filtering
- Shared catalog tables (read-only access)
- Nested resources (journal_entry_lines, whatsapp_messages)

**Key Scenarios:**
- Users can only see their organization's data
- Insert/update/delete operations are organization-scoped
- Cross-org access attempts are blocked
- Shared catalogs are readable by all authenticated users

### 2. Scoped Client Tests (`scoped-client.test.ts`)
Tests database scoping utilities and automatic query filtering.

**What's Tested:**
- `getScopedClient()` - Returns Supabase client with RLS
- `verifyResourceOwnership()` - Validates resource belongs to org
- `getResourceOrganizationId()` - Extracts org ID from resource
- `countOrganizationResources()` - Counts resources in current org

**Key Scenarios:**
- Scoped client requires organization context
- Resource ownership validation
- Cross-org resource access detection
- Nested resource validation

### 3. Middleware Tests (`middleware.test.ts`)
Tests tenant context middleware and validation functions.

**What's Tested:**
- `requireOrganization()` - Enforces org context
- `extractTenantContext()` - Extracts context from session
- `requireResourceAccess()` - Validates resource access
- `withTenantContext()` - HOF for injecting tenant context
- `withTenantValidation()` - HOF for validating org context

**Key Scenarios:**
- Organization context validation in API routes
- Server action wrapping with tenant validation
- Error handling for missing/invalid context
- Multi-parameter function wrapping

### 4. Cache Tests (`cache.test.ts`)
Tests organization data caching and performance.

**What's Tested:**
- `getCachedOrganization()` - Retrieve from cache
- `setCachedOrganization()` - Store in cache
- `invalidateOrganizationCache()` - Clear cache
- `getOrganizationCacheStats()` - Cache statistics

**Performance Tests:**
- Cache read performance (< 5ms)
- Cache write performance (< 10ms)
- Concurrent cache operations
- TTL expiration behavior

**Key Scenarios:**
- Cache hit/miss behavior
- Cache expiration after TTL
- Cache invalidation
- Custom TTL values

### 5. Isolation Tests (`isolation.test.ts`)
Tests cross-tenant protection and data leakage prevention.

**What's Tested:**
- `isResourceInOrganization()` - Check resource ownership
- `validateResourceInOrganization()` - Enforce ownership
- `preventDataLeakage()` - Strip sensitive fields
- `sanitizeForOrganization()` - Filter cross-org data

**Key Scenarios:**
- Resource ownership validation
- Cross-organization access detection
- Data sanitization (removing organization_id)
- Security violation logging
- Edge cases (invalid IDs, missing fields)

## Running Tests

### Run All Tests
```bash
npm run test
```

### Run Specific Test Suite
```bash
npm run test -- rls-isolation.test.ts
npm run test -- scoped-client.test.ts
npm run test -- middleware.test.ts
npm run test -- cache.test.ts
npm run test -- isolation.test.ts
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

## Test Setup

### Prerequisites

1. **Environment Variables**: Ensure `.env.local` is configured:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
REDIS_URL=your_redis_url
```

2. **Test Database**: Tests use the actual Supabase database. Consider using a separate test project.

3. **Redis**: Tests require Redis for caching tests.

### Test Utilities (`test-utils.ts`)

Helper functions for creating test data:

- `createTestOrganization(name)` - Create test organization
- `createTestUser(orgId, email, role)` - Create test user
- `createTestResource(table, orgId, data)` - Create test resource
- `cleanupTestOrganization(orgId)` - Delete test org and related data
- `cleanupTestAuthUser(authId)` - Delete test auth user

## Important Notes

### 1. User Session Setup
Many tests have `TODO` comments for proper user session setup. Currently, tests use admin client which bypasses RLS. To fully test RLS policies, you need to:

1. Create authenticated Supabase client with specific user session
2. Set proper JWT tokens in client
3. Verify RLS policies filter queries correctly

### 2. Test Data Cleanup
Tests create real data in the database. The `afterAll` hooks clean up test data, but if tests fail, you may need to manually clean up:

```sql
-- Find test organizations
SELECT * FROM organizations WHERE name LIKE '%Test%';

-- Delete test organization (cascades to users)
DELETE FROM organizations WHERE id = 'test-org-id';
```

### 3. Performance Tests
Performance tests measure cache operations. Results may vary based on:
- Network latency to Redis
- Redis server load
- Test machine performance

Expected benchmarks:
- Cache read: < 5ms
- Cache write: < 10ms
- Organization context extraction (cache hit): 1-2ms
- Organization context extraction (cache miss): 20-30ms

### 4. Mocking Strategy
Tests use Jest mocks for:
- `getCurrentOrganization()` - Mock organization context
- `getOrganizationId()` - Mock organization ID
- `validateResourceInOrganization()` - Mock validation

This allows testing in isolation without requiring full auth setup.

## Writing New Tests

### Test Template
```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { createTestOrganization, cleanupTestOrganization } from './test-utils'

describe('Feature Name', () => {
  let testOrg

  beforeAll(async () => {
    testOrg = await createTestOrganization('Test Org')
  })

  afterAll(async () => {
    await cleanupTestOrganization(testOrg.id)
  })

  it('should do something', async () => {
    // Test implementation
    expect(true).toBe(true)
  })
})
```

### Best Practices

1. **Clean Up**: Always clean up test data in `afterAll` hooks
2. **Isolation**: Each test should be independent
3. **Descriptive Names**: Use clear, descriptive test names
4. **Edge Cases**: Test both happy path and error scenarios
5. **Performance**: Include performance assertions where relevant
6. **Mocking**: Mock external dependencies appropriately

## Troubleshooting

### Tests Fail with "Organization context is missing"
- Ensure mocks are set up correctly
- Check that `beforeEach` clears mocks
- Verify mock return values

### Tests Timeout
- Increase Jest timeout: `jest.setTimeout(10000)`
- Check database connection
- Verify Redis is running

### RLS Tests Don't Filter Correctly
- Tests may be using admin client (bypasses RLS)
- Need to set up proper user session with JWT
- Verify RLS policies are enabled in database

### Cache Tests Fail
- Ensure Redis is running
- Check REDIS_URL environment variable
- Verify network connectivity to Redis

## Future Improvements

1. **User Session Setup**: Implement proper authenticated client for RLS testing
2. **E2E Tests**: Add end-to-end tests with real user workflows
3. **Load Testing**: Add tests for high-concurrency scenarios
4. **Security Auditing**: Automated security vulnerability scanning
5. **Integration with CI/CD**: Run tests automatically on commit
6. **Test Coverage Goals**: Aim for >90% code coverage

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supabase Testing Guide](https://supabase.com/docs/guides/testing)
- [Multi-Tenant Testing Strategies](https://martinfowler.com/articles/multi-tenant-testing.html)
