import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Static-client build for GitHub Pages.
 *
 * GitHub project sites are hosted below /<repository-name>/. The workflow
 * supplies that path through BASE_PATH; local builds default to the root.
 */
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
  },
});
