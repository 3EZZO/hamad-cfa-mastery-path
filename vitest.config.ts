import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Emulator permission suites need Firebase emulators; they run through
    // `npm run test:materials:emulator` (vitest.emulator.config.ts).
    exclude: [...configDefaults.exclude, "src/**/*.emulator.test.ts"],
  },
});
