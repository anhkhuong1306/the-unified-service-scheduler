import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.(spec|e2e-spec|concurrency-spec)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'apps/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    '!**/*.module.ts',
    '!**/main.ts',
    '!**/index.ts',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/', '<rootDir>/libs/'],
  moduleNameMapper: {
    '^@app/common(|/.*)$': '<rootDir>/libs/common/src/$1',
    '^@app/contracts(|/.*)$': '<rootDir>/libs/contracts/src/$1',
    '^@app/workshop(|/.*)$': '<rootDir>/libs/workshop/src/$1',
    '^@app/crm(|/.*)$': '<rootDir>/libs/crm/src/$1',
    '^@app/organization(|/.*)$': '<rootDir>/libs/organization/src/$1',
    '^@app/sso-mock(|/.*)$': '<rootDir>/libs/sso-mock/src/$1',
  },
};

export default config;
