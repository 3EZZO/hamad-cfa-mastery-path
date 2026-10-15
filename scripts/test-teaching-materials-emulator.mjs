// Runs the teaching-materials permission suite against local Firebase
// emulators (Auth, Firestore) with a `demo-` project, which has no
// live backend. It never logs in, never reads credentials and never deploys.
//
//   npm run test:materials:emulator
//
// The emulators need Java 21+. Put `java` on PATH, set JAVA_HOME, or unpack a
// JRE under the git-ignored tmp/tools/ folder.
import { existsSync, readdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

// Same pinned CLI release as the Firestore rules deployment wrapper.
const FIREBASE_TOOLS_VERSION = "15.28.1";
const PROJECT_ID = "demo-hamad-cfa";

function javaDirectory() {
  if (spawnSync("java", ["-version"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0) return null;
  if (process.env.JAVA_HOME && existsSync(path.join(process.env.JAVA_HOME, "bin"))) {
    return path.join(process.env.JAVA_HOME, "bin");
  }
  const tools = path.resolve("tmp", "tools");
  if (existsSync(tools)) {
    const runtime = readdirSync(tools).find(name => /^jdk-?2\d/.test(name) && existsSync(path.join(tools, name, "bin")));
    if (runtime) return path.join(tools, runtime, "bin");
  }
  throw new Error("Java 21+ is required for the Firebase emulators (PATH, JAVA_HOME or tmp/tools/jdk-21*).");
}

const javaBin = javaDirectory();
const env = { ...process.env };
// Never let an ambient credential or live project leak into the run.
delete env.GOOGLE_APPLICATION_CREDENTIALS;
delete env.FIREBASE_TOKEN;
// The Firebase CLI's DEBUG mode logs its entire child environment.
delete env.DEBUG;
env.GCLOUD_PROJECT = PROJECT_ID;
if (javaBin) env.PATH = `${javaBin}${path.delimiter}${env.PATH ?? ""}`;

const command = [
  "npx", "--yes", `firebase-tools@${FIREBASE_TOOLS_VERSION}`,
  "emulators:exec", "--only", "auth,firestore",
  "--project", PROJECT_ID,
  JSON.stringify("npx vitest run --config vitest.emulator.config.ts"),
].join(" ");

const child = spawn(command, { stdio: "inherit", shell: true, env });
child.on("exit", code => process.exit(code ?? 1));
