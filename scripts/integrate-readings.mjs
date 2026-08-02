import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCatalogPath = path.resolve(
  projectRoot,
  "..",
  "tmp",
  "project_202_readings.json",
);
const catalogPath = path.resolve(process.argv[2] ?? defaultCatalogPath);
const planPath = path.join(projectRoot, "src", "data", "plan.json");
const outputPath = path.join(projectRoot, "src", "data", "readings.json");

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));

if (!Array.isArray(catalog.sources) || !Array.isArray(catalog.readings)) {
  throw new Error("Reading catalog must contain sources[] and readings[].");
}

const sessions = plan.flatMap((week) => [
  week.session1,
  week.session2,
  week.session3,
]);
const sessionByNumber = new Map(sessions.map((session) => [session.number, session]));
const readingIds = new Set();

for (const session of sessions) session.readings = [];

for (const reading of catalog.readings) {
  if (readingIds.has(reading.id)) throw new Error(`Duplicate reading id: ${reading.id}`);
  readingIds.add(reading.id);
  if (!Array.isArray(reading.sessionNumbers) || reading.sessionNumbers.length === 0) {
    throw new Error(`Reading ${reading.id} has no session assignment.`);
  }
  for (const sessionNumber of reading.sessionNumbers) {
    const session = sessionByNumber.get(sessionNumber);
    if (!session) {
      throw new Error(`Reading ${reading.id} references unknown Session ${sessionNumber}.`);
    }
    session.readings.push(reading.id);
  }
}

for (const reading of catalog.readings) {
  if (reading.primaryEquivalent && !readingIds.has(reading.primaryEquivalent)) {
    throw new Error(
      `Reading ${reading.id} has unknown primaryEquivalent ${reading.primaryEquivalent}.`,
    );
  }
}

fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log(
  `Integrated ${catalog.readings.length} readings across ${sessions.length} numbered sessions.`,
);
