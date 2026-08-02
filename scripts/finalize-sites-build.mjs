import { access, copyFile, mkdir } from "node:fs/promises";

await access("dist/server/index.js");
await mkdir("dist/.openai", { recursive: true });
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");

console.log("Sites artifact verified: dist/server/index.js and hosting metadata are present.");
