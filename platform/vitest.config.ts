import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests self-skip when TEST_DATABASE_URL is absent.
    passWithNoTests: false,
  },
});
