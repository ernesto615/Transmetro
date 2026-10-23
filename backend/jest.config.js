// Jest con TypeScript y módulos ES (el backend usa "type": "module").
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, diagnostics: false, tsconfig: 'tsconfig.jest.json' }] },
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testTimeout: 30000,
  collectCoverageFrom: ['src/services/**/*.ts', 'src/routes/**/*.ts', 'src/middleware/**/*.ts', 'src/lib/**/*.ts'],
};
