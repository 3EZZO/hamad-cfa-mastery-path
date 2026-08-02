import {
  access,
  copyFile,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

await access("dist/server/index.js");

// vinext exports a callable request handler. Sites runs a Cloudflare module
// worker, which requires a default object exposing a `fetch` method.
await rm("dist/server/vinext-handler.js", { force: true });
await rename("dist/server/index.js", "dist/server/vinext-handler.js");
await writeFile(
  "dist/server/index.js",
  `import handler from "./vinext-handler.js";
export * from "./vinext-handler.js";

const sitesHandler = {
  fetch(request, _environment, context) {
    return handler(request, context);
  },
};

export default sitesHandler;
`,
  "utf8",
);

await mkdir("dist/.openai", { recursive: true });
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");

console.log(
  "Sites artifact verified: Worker fetch entrypoint and hosting metadata are present.",
);
