import { access, copyFile } from "node:fs/promises";

const indexPath = "dist-pages/index.html";
const fallbackPath = "dist-pages/404.html";

await access(indexPath);

// Pages has no rewrite configuration. This fallback keeps a future client-side
// route refresh usable while the current tracker remains a single-page app.
await copyFile(indexPath, fallbackPath);

console.log(
  "GitHub Pages artifact verified: static index and SPA fallback are present.",
);
