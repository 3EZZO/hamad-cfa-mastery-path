// @ts-check
import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Lint for the tracker source. Advisory for now: `npm run lint` is not part
 * of the build, and the rule set starts at "recommended" so the first run
 * reports rather than blocks. Tighten once the existing findings are worked
 * through.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "dist-pages/**", "node_modules/**", "public/**", "scripts/**", "tmp/**", "verification/**", ".next/**", ".wrangler/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // Session Mode and the practice engine use `any` for calculator logs
      // and third-party payloads; keep these as warnings for the first pass.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react-hooks/exhaustive-deps": "warn",
      // `role` is also an ordinary prop on our own components (tutor/student).
      "jsx-a11y/aria-role": ["error", { ignoreNonDOM: true }],
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "src/testFixtures/**"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-non-null-asserted-optional-chain": "off" },
  },
  {
    files: ["public/service-worker.js", "public/theme-init.js", "*.config.{js,mjs,ts}"],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.browser, ...globals.node } },
  },
);
