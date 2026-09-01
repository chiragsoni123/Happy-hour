/** Unit tests cover the pure financial/domain layer (no React Native runtime needed). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: {
        module: 'commonjs',
        target: 'es2020',
        strict: true,
        esModuleInterop: true,
        types: ['jest', 'node'],
        baseUrl: '.',
        paths: { '@/*': ['src/*'] },
      } }],
  },
};
