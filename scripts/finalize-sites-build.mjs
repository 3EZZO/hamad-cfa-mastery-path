import { access, copyFile, mkdir, rm } from "node:fs/promises";

await access("dist/server/index.js");
await rm("dist/server/vinext-handler.js", { force: true });
await mkdir("dist/.openai", { recursive: true });
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");

console.log(
  "Sites artifact verified: Worker fetch entrypoint and hosting metadata are present.",
);
