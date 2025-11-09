/**
 * Jest Configuration for Multi-Tenant Tests
 *
 * Copy this to your project's jest.config.js and adjust paths as needed
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib/multi-tenant/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/lib/multi-tenant/__tests__/setup.ts'],
  collectCoverageFrom: [
    'lib/multi-tenant/**/*.ts',
    '!lib/multi-tenant/**/*.test.ts',
    '!lib/multi-tenant/__tests__/**',
    '!lib/multi-tenant/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
  maxWorkers: 1, // Run tests serially to avoid conflicts
}
