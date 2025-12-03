/* eslint-disable */
const { readFileSync } = require("fs");

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, "utf-8")
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: "@ai-capabilities-suite/mcp-filesystem",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest", swcJestConfig],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
  coverageDirectory: "test-output/jest/coverage",
  // Transform node_modules that use modern syntax
  transformIgnorePatterns: ["node_modules/(?!(fast-glob|chokidar|lunr)/)"],
  // Timeout and resource management
  testTimeout: 60000, // 60 seconds per test
  maxWorkers: 1, // Run tests serially to prevent resource exhaustion
  // Force exit after tests complete to prevent hanging
  forceExit: true,
  // Detect open handles that might cause hanging
  detectOpenHandles: false,
  // Bail after first failure to save time
  bail: false,
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Coverage configuration
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/**/*.test.ts",
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 75,
      functions: 80,
      statements: 80,
    },
  },
  coverageReporters: ["text", "lcov", "json-summary", "html"],
};
