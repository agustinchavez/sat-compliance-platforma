/**
 * Jest Setup for Multi-Tenant Tests
 *
 * Runs before all tests to set up test environment
 */

// Extend Jest timeout for integration tests
jest.setTimeout(30000) // 30 seconds

// Set up environment variables for tests
process.env.NODE_ENV = 'test'

// Suppress console logs during tests (optional)
// Uncomment if you want cleaner test output
/*
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}
*/

// Mock environment variables if needed
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
}

if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379'
}

// Global test setup
beforeAll(() => {
  console.log('🧪 Starting Multi-Tenant Integration Tests')
})

// Global test cleanup
afterAll(() => {
  console.log('✅ Multi-Tenant Integration Tests Complete')
})
