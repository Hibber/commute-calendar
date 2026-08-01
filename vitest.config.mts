import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path alias from tsconfig.json.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // Only the pure libraries are covered. Anything reaching for Postgres or
    // Clerk is left to the route-level checks in the PR description.
    include: ['src/**/*.test.ts'],
  },
});
