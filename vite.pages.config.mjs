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
    // Vendor code changes far less often than the app. Keeping each library
    // family in its own hashed chunk lets the service worker and the browser
    // keep serving them from cache across app releases. Groups capture their
    // dependencies recursively, so priorities decide ownership of shared
    // modules (React must not end up inside the chart chunk).
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: "vendor-firebase",
              test: /node_modules[\\/](firebase|@firebase)[\\/]/,
              priority: 20,
            },
            {
              name: "vendor-charts",
              test: /node_modules[\\/](recharts|react-qr-code)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
    // Budget: the app's own main chunk should stay well under this once the
    // vendor groups above are split out. A warning here is a regression.
    chunkSizeWarningLimit: 600,
  },
});
