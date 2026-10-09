import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests run in node. DOM-based tests opt in with
    // `// @vitest-environment jsdom` at the top of the file.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      enabled: false,
    },
  },
});
