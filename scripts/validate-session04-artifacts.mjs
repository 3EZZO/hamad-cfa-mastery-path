import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertIndependentPracticeQuestions,
  parsePracticeBankDraft,
  questionSimilarity,
} from "../src/lib/practiceContent.ts";
import { verifyTutorPlaybookPackageIntegrity } from "../src/lib/tutorContent.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, "..", "output", "json");
const playbookFile = path.join(
  output,
  "Hamad_CFA_Level_I_Session_04_Private_Playbook.json",
);
const practiceDir = path.join(output, "practice-session-04-expanded");

const draft = JSON.parse(fs.readFileSync(playbookFile, "utf8"));
const playbook = await verifyTutorPlaybookPackageIntegrity(draft);
if (playbook.manifest.id !== "hamad-cfa-mastery-session-04") {
  throw new Error("Unexpected Session 04 manifest identity.");
}
const stageDecks = playbook.chunks
  .filter((chunk) => chunk.kind === "stage")
  .flatMap((chunk) => chunk.stages)
  .flatMap((stage) => stage.cards);
const supporting = playbook.chunks
  .filter((chunk) => chunk.kind !== "stage")
  .flatMap((chunk) => chunk.stages)
  .flatMap((stage) => stage.cards);
if (stageDecks.length !== 120 || supporting.length < 100) {
  throw new Error(
    `Expected 120 teaching decks and at least 100 supporting entries; found ${stageDecks.length} and ${supporting.length}.`,
  );
}
const routeCounts = Object.fromEntries(
  playbook.manifest.routes.map((route) => [
    route.id,
    Object.values(route.cardIdsByStage).flat().length,
  ]),
);
for (const [routeId, expected] of [
  ["s04-core-120", 48],
  ["s04-standard-150", 60],
  ["s04-library-120-decks", 120],
]) {
  if (routeCounts[routeId] !== expected) {
    throw new Error(`${routeId} has ${routeCounts[routeId]} decks; expected ${expected}.`);
  }
}

const sessionPrompts = playbook.chunks
  .flatMap((chunk) => chunk.stages)
  .flatMap((stage) => stage.cards)
  .flatMap((card) => [card.prompt, ...card.ask])
  .filter(Boolean);
const files = fs
  .readdirSync(practiceDir)
  .filter((name) => /_M0(17|18|19|20|21|22|23|24|25|26)_Expanded_Practice\.json$/.test(name))
  .sort();
if (files.length !== 10) throw new Error(`Expected 10 practice banks; found ${files.length}.`);
const allQuestions = [];
const bankReports = [];
for (const file of files) {
  const bank = parsePracticeBankDraft(
    JSON.parse(fs.readFileSync(path.join(practiceDir, file), "utf8")),
  );
  if (bank.questions.length !== 50) {
    throw new Error(`${file} has ${bank.questions.length} questions; expected 50.`);
  }
  assertIndependentPracticeQuestions(bank, sessionPrompts);
  const maximumSessionSimilarity = Math.max(
    ...bank.questions.flatMap((question) =>
      sessionPrompts.map((prompt) => questionSimilarity(question.prompt, prompt)),
    ),
  );
  bankReports.push({ file, questions: bank.questions.length, maximumSessionSimilarity });
  allQuestions.push(...bank.questions);
}
if (allQuestions.length !== 500) throw new Error("Expected 500 practice questions.");
if (new Set(allQuestions.map((question) => question.id)).size !== 500) {
  throw new Error("Practice question IDs are not globally unique.");
}
if (new Set(allQuestions.map((question) => question.prompt)).size !== 500) {
  throw new Error("Practice prompts are not globally unique.");
}
let maximumCrossBankSimilarity = 0;
for (let left = 0; left < allQuestions.length; left += 1) {
  for (let right = left + 1; right < allQuestions.length; right += 1) {
    maximumCrossBankSimilarity = Math.max(
      maximumCrossBankSimilarity,
      questionSimilarity(allQuestions[left].prompt, allQuestions[right].prompt),
    );
  }
}
if (maximumCrossBankSimilarity >= 0.88) {
  throw new Error(
    `Practice near-duplicate threshold exceeded (${maximumCrossBankSimilarity.toFixed(3)}).`,
  );
}

const maximumPracticeToSessionSimilarity = Math.max(
  ...bankReports.map((item) => item.maximumSessionSimilarity),
);
const compatibilityFile = path.join(
  output,
  "Hamad_CFA_Level_I_Session_04_Compatibility_Report.json",
);
const compatibility = JSON.parse(fs.readFileSync(compatibilityFile, "utf8"));
fs.writeFileSync(
  compatibilityFile,
  `${JSON.stringify(
    {
      ...compatibility,
      result: "passed",
      validatedTeachingDecks: stageDecks.length,
      validatedSupportingEntries: supporting.length,
      validatedPracticeBanks: files.length,
      validatedPracticeQuestions: allQuestions.length,
      maximumPracticeToSessionSimilarity: Number(
        maximumPracticeToSessionSimilarity.toFixed(3),
      ),
      maximumCrossBankSimilarity: Number(maximumCrossBankSimilarity.toFixed(3)),
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    {
      manifestId: playbook.manifest.id,
      version: playbook.manifest.version,
      teachingDecks: stageDecks.length,
      supportingEntries: supporting.length,
      routeCounts,
      practiceBanks: files.length,
      practiceQuestions: allQuestions.length,
      maximumPracticeToSessionSimilarity,
      maximumCrossBankSimilarity,
    },
    null,
    2,
  ),
);
