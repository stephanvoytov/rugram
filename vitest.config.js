import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/terminal/test-jest.js'],
    testTimeout: 30000,
    globals: true,
  },
});
