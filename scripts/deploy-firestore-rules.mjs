import { existsSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

// This exact version was verified on 31 August 2026 to PATCH the production
// `cloud.firestore` release for the default database. Do not float this value.
const FIREBASE_TOOLS_VERSION = "15.28.1";
const DEFAULT_PROJECT_ID = "project-202-tracker";
const RELEASE_TARGET =
  /\/releases\/cloud\.firestore(?:\/(?:\(default\)|%28default%29))?/g;

function verifyReleaseTarget(transcript) {
  // A firebase-debug.log can contain several historical deployments. The last
  // release URL is the target produced by the deployment being verified.
  const releaseTargets = transcript.match(RELEASE_TARGET) ?? [];
  const latestTarget = releaseTargets.at(-1);
  if (latestTarget && latestTarget !== "/releases/cloud.firestore") {
    throw new Error(
      `Firestore rules were published to ${latestTarget.slice("/releases/".length)}, not the ` +
        "production cloud.firestore release. Stop and investigate the CLI target.",
    );
  }
  if (!latestTarget) {
    throw new Error(
      "The Firebase deployment completed without confirming the production " +
        "cloud.firestore release target.",
    );
  }
}

function readDebugDelta(path, initialBytes) {
  if (!existsSync(path)) return "";
  const content = readFileSync(path);
  return content
    .subarray(Math.min(initialBytes, content.length))
    .toString("utf8");
}

async function runDeployment() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  if (projectId !== DEFAULT_PROJECT_ID) {
    throw new Error(
      `Refusing to deploy Firestore rules to unexpected project ${projectId}.`,
    );
  }

  const debugPath = resolve("firebase-debug.log");
  const initialDebugBytes = existsSync(debugPath) ? statSync(debugPath).size : 0;
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "--yes",
    `firebase-tools@${FIREBASE_TOOLS_VERSION}`,
    "deploy",
    "--only",
    "firestore:rules",
    "--project",
    projectId,
    "--non-interactive",
    "--debug",
  ];

  console.log(
    `Deploying Firestore rules with pinned firebase-tools ${FIREBASE_TOOLS_VERSION}...`,
  );

  let transcript = "";
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        transcript += text;
        (stream === child.stdout ? process.stdout : process.stderr).write(text);
      });
    }
    child.once("error", reject);
    child.once("close", resolveExit);
  });

  if (exitCode !== 0) {
    throw new Error(`Firebase rules deployment failed with exit code ${exitCode}.`);
  }

  transcript += `\n${readDebugDelta(debugPath, initialDebugBytes)}`;
  verifyReleaseTarget(transcript);
  console.log(
    "Verified: rules were released to the production cloud.firestore target.",
  );
}

const verifyLogIndex = process.argv.indexOf("--verify-log");
if (verifyLogIndex >= 0) {
  const logPath = process.argv[verifyLogIndex + 1];
  if (!logPath) throw new Error("--verify-log requires a file path.");
  verifyReleaseTarget(readFileSync(resolve(logPath), "utf8"));
  console.log("Verified Firestore production release target in deployment log.");
} else {
  await runDeployment();
}
