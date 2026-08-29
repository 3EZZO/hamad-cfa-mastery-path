import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EXPECTED_MANIFEST_ID = "hamad-cfa-mastery-session-01";
const EXPECTED_SESSION_NUMBER = 1;
const EXPECTED_DEFAULT_ROUTE = "route-150";
const EXPECTED_SOURCE_COUNTS = Object.freeze({
  chunks: 15,
  stages: 15,
  cards: 422,
});
const EXPECTED_ROUTES = Object.freeze([
  ["route-120", 120],
  ["route-150", 150],
  ["route-180", 180],
]);
const EXPECTED_STAGE_IDS = Object.freeze([
  "s01-stage-01",
  "s01-stage-02",
  "s01-stage-03",
  "s01-stage-04",
  "s01-stage-05",
  "s01-stage-06",
  "s01-stage-07",
  "s01-stage-08",
  "s01-stage-09",
]);
const EXPECTED_ACTIVE_CARD_IDS = Object.freeze([
  "launch-session-contract",
  "launch-calculator-preflight",
  "topic-r01",
  "r01-guided",
  "r01-independent",
  "topic-r02",
  "r02-demonstration",
  "r02-independent",
  "topic-r03",
  "r03-demonstration",
  "r03-independent",
  "topic-r04",
  "r04-demonstration",
  "r04-independent",
  "topic-r05",
  "r05-demonstration",
  "r05-independent",
  "topic-r06",
  "r06-demonstration",
  "r06-independent",
  "topic-r07",
  "r07-guided",
  "r07-independent",
  "r07-challenge",
  "topic-r08",
  "r08-guided",
  "r08-independent",
  "r08-challenge",
  "topic-r14",
  "r14-guided",
  "r14-independent",
  "topic-r09",
  "r09-independent",
  "topic-r10",
  "r10-independent",
  "topic-r11",
  "r11-guided",
  "r11-independent",
  "topic-r12",
  "r12-guided",
  "r12-independent",
  "topic-r13",
  "r13-guided",
  "r13-independent",
  "topic-tvm-01",
  "tvm-01-independent-03",
  "topic-tvm-02",
  "tvm-02-independent-03",
  "topic-tvm-03",
  "tvm-03-independent-03",
  "topic-tvm-04",
  "tvm-04-independent-03",
  "topic-tvm-05",
  "tvm-05-independent-03",
  "topic-tvm-06",
  "tvm-06-guided-02",
  "tvm-06-independent-03",
  "topic-tvm-07",
  "tvm-07-independent-03",
  "topic-tvm-08",
  "tvm-08-independent-03",
  "topic-tvm-09",
  "tvm-09-independent-03",
  "oral-14",
  "oral-16",
  "topic-tvm-10",
  "tvm-10-independent-03",
  "topic-tvm-11",
  "tvm-11-independent-03",
  "topic-tvm-12",
  "tvm-12-independent-03",
  "topic-tvm-13",
  "tvm-13-independent-03",
  "topic-tvm-14",
  "tvm-14-independent-03",
  "defense-08",
  "topic-s01",
  "s01-guided",
  "s01-independent",
  "topic-s02",
  "s02-guided",
  "s02-independent",
  "topic-s03",
  "s03-guided",
  "s03-independent",
  "topic-s04",
  "s04-guided",
  "s04-independent",
  "topic-s05",
  "s05-guided",
  "s05-independent",
  "topic-s06",
  "s06-guided",
  "s06-independent",
  "topic-s07",
  "s07-guided",
  "s07-independent",
  "topic-s08",
  "s08-independent",
  "topic-s09",
  "s09-independent",
  "topic-s10",
  "s10-independent",
  "topic-s11",
  "s11-independent",
  "sprint-01",
  "sprint-02",
  "sprint-03",
  "sprint-04",
  "sprint-05",
  "sprint-06",
  "sprint-07",
  "sprint-08",
  "close-step-01",
  "close-step-02",
  "close-step-03",
  "close-step-04",
  "close-step-05",
  "close-step-06",
  "close-delayed-retest",
]);

const BANNED_PHRASES = Object.freeze([
  {
    code: "GENERIC_ITEM_HANDOFF",
    label: "generic “Give Hamad this … item” handoff",
    pattern:
      /\bgive hamad this\s+(?:guided|independent|demonstration|challenge)?\s*item\b/i,
  },
  {
    code: "GENERIC_DECISION_PREDICTION",
    label: "generic decision-and-prediction instruction",
    pattern: /\brequire the decision and prediction before calculation\b/i,
  },
  {
    code: "GENERIC_READ_EXACTLY",
    label: "generic “Read the question exactly” instruction",
    pattern: /\bread the question exactly\b/i,
  },
  {
    code: "GENERIC_HIDE_FORMULAS",
    label: "generic “Ask without displaying formulas” instruction",
    pattern: /\bask without displaying formulas\b/i,
  },
  {
    code: "PLACEHOLDER_CONCEPT_TESTED",
    label: "unfinished “Concept tested” placeholder",
    pattern: /\bconcept tested\b/i,
  },
  {
    code: "PLACEHOLDER_COMMON_TRAP",
    label: "unfinished “Common trap Tutor probe” placeholder",
    pattern: /\bcommon trap\s+tutor probe\b/i,
  },
]);

const DUPLICATE_SAY_LIMIT = 2;
const CALCULATION_PROMPT =
  /\b(calculate|compute|find|infer|determine|solve|closest to|how much|what is the value|what is the price)\b/i;
const RESULT_CONTEXT =
  /(?:%|percentage points?|basis points?|USD|SAR|EUR|GBP|per (?:year|period|unit)|years?|months?|days?|units?|squared|return|rate|yield|premium|value|price|mean|median|mode|range|MAD|variance|deviation|covariance|correlation|coefficient|ratio|HPR|MWR|TWR|PV|FV|PMT|N\s*=|I\/Y|\bs\s*=)/i;
const PERCENTAGE_RESULT =
  /\b(return|rate|yield|premium|annualized|annualised|HPR|MWR|TWR)\b/i;
const CURRENCY_RESULT =
  /\b(price|present value|future value|value|payment|cost|amount|proceeds|balance)\b/i;

function usage() {
  console.log(`Usage:
  node scripts/validate-session01-playbook-quality.mjs <playbook.json> [options]

Options:
  --strict                     Exit non-zero when errors are found (default)
  --advisory                   Report errors but always exit zero
  --expect-version <version>   Require an exact manifest version
  --help                       Show this help
`);
}

function parseArguments(argv) {
  let filePath = "";
  let mode = "strict";
  let expectedVersion = "";

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") return { help: true };
    if (value === "--strict") {
      mode = "strict";
    } else if (value === "--advisory") {
      mode = "advisory";
    } else if (value === "--expect-version") {
      expectedVersion = argv[index + 1] ?? "";
      index += 1;
      if (!expectedVersion)
        throw new Error("--expect-version requires a value");
    } else if (value?.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    } else if (!filePath) {
      filePath = value ?? "";
    } else {
      throw new Error(`Unexpected positional argument: ${value}`);
    }
  }

  if (!filePath) throw new Error("A playbook JSON path is required");
  return { help: false, filePath, mode, expectedVersion };
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalValue(value[key])])
    );
  }
  return value;
}

function sha256Canonical(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)), "utf8")
    .digest("hex");
}

function normalizedText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .replace(/[“”‘’]/g, "'")
    .replace(/[^a-z0-9%+/'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function listPreview(values, maximum = 10) {
  const shown = values.slice(0, maximum).join(", ");
  return values.length > maximum
    ? `${shown}, … (+${values.length - maximum} more)`
    : shown;
}

function sameOrderedValues(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function cardTextFields(card) {
  return {
    body: card.body,
    say: Array.isArray(card.say) ? card.say.join(" ") : "",
    prompt: card.prompt,
    answer: card.answer,
    rationale: card.rationale,
  };
}

function finalQuestionClause(prompt) {
  const clauses = String(prompt ?? "")
    .split(/[.?!]\s+/)
    .map(value => value.trim())
    .filter(Boolean);
  return clauses.at(-1) ?? String(prompt ?? "");
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`Argument error: ${error.message}\n`);
    usage();
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    usage();
    return;
  }

  const resolvedPath = path.resolve(options.filePath);
  let playbook;
  try {
    playbook = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    console.error(
      `Could not read valid JSON from ${resolvedPath}: ${error.message}`
    );
    process.exitCode = 2;
    return;
  }

  const errors = [];
  const warnings = [];
  const addError = (code, message) => errors.push({ code, message });
  const addWarning = (code, message) => warnings.push({ code, message });

  const manifest = playbook?.manifest ?? {};
  const chunks = Array.isArray(playbook?.chunks) ? playbook.chunks : [];
  const stages = chunks.flatMap(chunk =>
    Array.isArray(chunk?.stages) ? chunk.stages : []
  );
  const cards = stages.flatMap(stage =>
    Array.isArray(stage?.cards) ? stage.cards : []
  );
  const stageById = new Map(stages.map(stage => [stage.id, stage]));
  const cardLocations = new Map();

  for (const stage of stages) {
    for (const card of stage.cards ?? []) {
      if (cardLocations.has(card.id)) {
        addError(
          "DUPLICATE_SOURCE_CARD_ID",
          `Card ID ${card.id} occurs in more than one source location.`
        );
      } else {
        cardLocations.set(card.id, { stage, card });
      }
    }
  }

  if (manifest.id !== EXPECTED_MANIFEST_ID) {
    addError(
      "MANIFEST_ID_CHANGED",
      `Expected manifest ID ${EXPECTED_MANIFEST_ID}; found ${manifest.id ?? "missing"}.`
    );
  }
  if (manifest.sessionNumber !== EXPECTED_SESSION_NUMBER) {
    addError(
      "SESSION_NUMBER_CHANGED",
      `Expected session number 1; found ${manifest.sessionNumber ?? "missing"}.`
    );
  }
  if (manifest.defaultRouteId !== EXPECTED_DEFAULT_ROUTE) {
    addError(
      "DEFAULT_ROUTE_CHANGED",
      `Expected default route ${EXPECTED_DEFAULT_ROUTE}; found ${manifest.defaultRouteId ?? "missing"}.`
    );
  }
  if (options.expectedVersion && manifest.version !== options.expectedVersion) {
    addError(
      "VERSION_MISMATCH",
      `Expected version ${options.expectedVersion}; found ${manifest.version ?? "missing"}.`
    );
  }

  for (const [name, actual] of [
    ["chunks", chunks.length],
    ["stages", stages.length],
    ["cards", cards.length],
  ]) {
    if (actual !== EXPECTED_SOURCE_COUNTS[name]) {
      addError(
        "SOURCE_COUNT_CHANGED",
        `Expected ${EXPECTED_SOURCE_COUNTS[name]} source ${name}; found ${actual}.`
      );
    }
  }

  const actualChunkIds = [...chunks]
    .sort((left, right) => left.order - right.order)
    .map(chunk => chunk.id);
  if (!sameOrderedValues(manifest.chunkIds ?? [], actualChunkIds)) {
    addError(
      "CHUNK_ORDER_CHANGED",
      "Manifest chunkIds no longer match source chunks in order."
    );
  }

  const routes = Array.isArray(manifest.routes) ? manifest.routes : [];
  const expectedRouteIds = EXPECTED_ROUTES.map(([id]) => id);
  const actualRouteIds = routes.map(route => route.id);
  if (!sameOrderedValues(actualRouteIds, expectedRouteIds)) {
    addError(
      "ROUTE_IDS_CHANGED",
      `Expected routes ${expectedRouteIds.join(", ")}; found ${actualRouteIds.join(", ") || "none"}.`
    );
  }

  const activeSequences = new Map();
  for (const [expectedRouteId, expectedMinutes] of EXPECTED_ROUTES) {
    const route = routes.find(candidate => candidate.id === expectedRouteId);
    if (!route) continue;
    if (route.totalMinutes !== expectedMinutes) {
      addError(
        "ROUTE_DURATION_CHANGED",
        `${expectedRouteId} should be ${expectedMinutes} minutes; found ${route.totalMinutes}.`
      );
    }
    if (!sameOrderedValues(route.stageIds ?? [], EXPECTED_STAGE_IDS)) {
      addError(
        "ROUTE_STAGE_IDS_CHANGED",
        `${expectedRouteId} stage IDs or ordering changed.`
      );
    }

    const selectedIds = [];
    for (const stageId of route.stageIds ?? []) {
      const stage = stageById.get(stageId);
      if (!stage) {
        addError(
          "MISSING_ROUTE_STAGE",
          `${expectedRouteId} references missing stage ${stageId}.`
        );
        continue;
      }
      const stageSelections = route.cardIdsByStage?.[stageId];
      if (!Array.isArray(stageSelections)) {
        addError(
          "MISSING_CARD_SELECTION",
          `${expectedRouteId} has no explicit card selection for ${stageId}.`
        );
        continue;
      }
      const sourceIds = new Set((stage.cards ?? []).map(card => card.id));
      for (const cardId of stageSelections) {
        if (!sourceIds.has(cardId)) {
          addError(
            "UNKNOWN_ACTIVE_CARD",
            `${expectedRouteId}/${stageId} selects missing card ${cardId}.`
          );
        }
        selectedIds.push(cardId);
      }
    }
    activeSequences.set(expectedRouteId, selectedIds);
    if (!sameOrderedValues(selectedIds, EXPECTED_ACTIVE_CARD_IDS)) {
      const missing = EXPECTED_ACTIVE_CARD_IDS.filter(
        cardId => !selectedIds.includes(cardId)
      );
      const added = selectedIds.filter(
        cardId => !EXPECTED_ACTIVE_CARD_IDS.includes(cardId)
      );
      addError(
        "ACTIVE_CARD_IDS_CHANGED",
        `${expectedRouteId} must preserve the 120-card sequence. Missing: ${listPreview(missing) || "none"}; added: ${listPreview(added) || "none"}.`
      );
    }
    if (new Set(selectedIds).size !== selectedIds.length) {
      addError(
        "DUPLICATE_ACTIVE_CARD",
        `${expectedRouteId} contains a repeated active card ID.`
      );
    }
  }

  const baselineSequence = activeSequences.get(EXPECTED_DEFAULT_ROUTE) ?? [];
  for (const [routeId, sequence] of activeSequences) {
    if (!sameOrderedValues(sequence, baselineSequence)) {
      addError(
        "ROUTE_CONTENT_DIVERGENCE",
        `${routeId} no longer uses the same active deck sequence as ${EXPECTED_DEFAULT_ROUTE}.`
      );
    }
  }

  const activeCards = baselineSequence.flatMap(cardId => {
    const located = cardLocations.get(cardId);
    return located ? [located.card] : [];
  });
  const bannedMatches = new Map(
    BANNED_PHRASES.map(rule => [rule.code, { rule, matches: [] }])
  );
  const sayGroups = new Map();
  const bareAnswers = [];
  const thinNumericAnswers = [];
  const numericContextWarnings = [];

  for (const card of activeCards) {
    const fields = cardTextFields(card);
    for (const { code, pattern } of BANNED_PHRASES) {
      for (const [field, text] of Object.entries(fields)) {
        if (pattern.test(String(text ?? ""))) {
          bannedMatches.get(code).matches.push(`${card.id}.${field}`);
        }
      }
    }

    const say = normalizedText(fields.say);
    if (say) {
      const group = sayGroups.get(say) ?? [];
      group.push(card.id);
      sayGroups.set(say, group);
    }

    const answer = String(card.answer ?? "").trim();
    if (
      /^(?:(?:choice|option)\s+)?[ABC](?:\s+is\s+correct)?\.?$/i.test(answer)
    ) {
      bareAnswers.push(card.id);
    }

    const prompt = String(card.prompt ?? "");
    const requestedResult = finalQuestionClause(prompt);
    if (
      CALCULATION_PROMPT.test(prompt) &&
      /\d/.test(prompt) &&
      /\d/.test(answer)
    ) {
      const words = answer.split(/\s+/).filter(Boolean);
      if (words.length < 5 && !RESULT_CONTEXT.test(answer)) {
        thinNumericAnswers.push(card.id);
      }
      if (!RESULT_CONTEXT.test(answer)) {
        numericContextWarnings.push(
          `${card.id}: numeric result lacks a recognizable measure or unit`
        );
      }
      if (
        PERCENTAGE_RESULT.test(requestedResult) &&
        !/(?:%|percentage points?|basis points?|decimal|ratio)/i.test(answer)
      ) {
        numericContextWarnings.push(
          `${card.id}: return/rate result lacks a percentage or explicit decimal basis`
        );
      }
      const currency = prompt.match(/\b(USD|SAR|EUR|GBP)\b/i)?.[1];
      if (
        currency &&
        CURRENCY_RESULT.test(requestedResult) &&
        !PERCENTAGE_RESULT.test(requestedResult) &&
        !new RegExp(`\\b${currency}\\b`, "i").test(answer)
      ) {
        numericContextWarnings.push(
          `${card.id}: requested ${currency.toUpperCase()} value lacks the currency label`
        );
      }
      if (
        /\bvariance\b/i.test(prompt) &&
        !/(?:squared|\^2|²|variance)/i.test(answer)
      ) {
        numericContextWarnings.push(
          `${card.id}: variance answer does not identify squared units`
        );
      }
    }
  }

  for (const { rule, matches } of bannedMatches.values()) {
    if (matches.length) {
      addError(
        rule.code,
        `${rule.label} appears ${matches.length} time(s): ${listPreview(matches)}.`
      );
    }
  }
  if (bareAnswers.length) {
    addError(
      "BARE_MCQ_ANSWER",
      `MCQ answers must explain the result, not only name a letter: ${listPreview(bareAnswers)}.`
    );
  }
  if (thinNumericAnswers.length) {
    addError(
      "THIN_NUMERIC_ANSWER",
      `Numeric answers need a measure/unit and interpretation: ${listPreview(thinNumericAnswers)}.`
    );
  }

  for (const [say, cardIds] of sayGroups) {
    if (cardIds.length > DUPLICATE_SAY_LIMIT) {
      addError(
        "DUPLICATE_SAY_SCRIPT",
        `One normalized teaching script is reused by ${cardIds.length} active cards (${listPreview(cardIds)}): “${say.slice(0, 120)}${say.length > 120 ? "…" : ""}”`
      );
    }
  }
  for (const warning of [...new Set(numericContextWarnings)]) {
    addWarning("NUMERIC_CONTEXT_REVIEW", warning);
  }

  for (const chunk of chunks) {
    const expectedHash = sha256Canonical({
      schemaVersion: chunk.schemaVersion,
      id: chunk.id,
      order: chunk.order,
      kind: chunk.kind,
      title: chunk.title,
      stages: chunk.stages,
    });
    if (chunk.contentHash !== expectedHash) {
      addError(
        "CHUNK_HASH_MISMATCH",
        `${chunk.id} contentHash is stale; expected ${expectedHash}.`
      );
    }
  }
  const orderedChunkHashes = [...chunks]
    .sort((left, right) => left.order - right.order)
    .map(chunk => chunk.contentHash);
  const expectedManifestHash = sha256Canonical({
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    sessionNumber: manifest.sessionNumber,
    title: manifest.title,
    version: manifest.version,
    defaultRouteId: manifest.defaultRouteId,
    routes: manifest.routes,
    chunkIds: manifest.chunkIds,
    chunkHashes: orderedChunkHashes,
  });
  if (manifest.contentHash !== expectedManifestHash) {
    addError(
      "MANIFEST_HASH_MISMATCH",
      `Manifest contentHash is stale; expected ${expectedManifestHash}.`
    );
  }

  console.log("Session 01 private playbook quality validation");
  console.log(`File: ${resolvedPath}`);
  console.log(`Mode: ${options.mode}`);
  console.log(`Version: ${manifest.version ?? "missing"}`);
  console.log(
    `Source: ${chunks.length} chunks · ${stages.length} stages · ${cards.length} cards`
  );
  console.log(
    `Active route: ${baselineSequence.length} decks · ${new Set(baselineSequence).size} unique IDs`
  );
  console.log("");

  if (!errors.length && !warnings.length) {
    console.log(
      "PASS: structure, integrity, and active-deck language checks passed."
    );
  } else {
    for (const error of errors) {
      console.log(`ERROR [${error.code}] ${error.message}`);
    }
    for (const warning of warnings) {
      console.log(`WARN  [${warning.code}] ${warning.message}`);
    }
    console.log("");
    console.log(
      `Summary: ${errors.length} error group(s), ${warnings.length} warning(s).`
    );
  }

  if (options.mode === "advisory") {
    console.log("Advisory mode: diagnostics do not change the exit code.");
    return;
  }
  if (errors.length) process.exitCode = 1;
}

main();
