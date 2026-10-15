import { defineConfig } from "vitest/config";

/** Local emulator permission suites only; see scripts/test-teaching-materials-emulator.mjs. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.emulator.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
