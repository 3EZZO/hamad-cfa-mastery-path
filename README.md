# PROJECT 202

**Hamad's CFA Level I Mastery System** is a mobile-first, browser-local study tracker for the 29-week coaching program running from 9 August 2026 through Hamad's 27 February 2027 exam appointment.

Created by Mohamed Ali, CFA.

The application is intentionally isolated from the surrounding HN3 projects. It has its own dependencies, TypeScript configuration, tests, and vinext production output.

## What is included

- Command Center with exam countdown, weekly actions, and a transparent evidence index
- Canonical 29-week roadmap with Sessions 01–87
- Two required tutor sessions every week, plus a flex or required assessment session according to the phase
- Weekly completion checklists and evidence gates
- Tutor session, practice, mock, error-vault, and note logs
- Ten-topic mastery board
- Seven-mock score campaign with internal coaching targets
- JSON export and import
- Browser `localStorage` persistence
- Audited reading crosswalk for four attached Schweser sources, with aligned/supplement/legacy status and source-page references

No proprietary question text or copied reading content is included.

## Important data limitation

Progress is saved **only in the browser currently being used**. It does not automatically sync between the tutor's and student's devices. Export a JSON backup after tutor sessions and import that file on another device when needed.

The app can later be connected to an authenticated database without changing the canonical plan.

## Canonical data

- `src/data/plan.json` is the source of truth for all 29 weeks. Each week includes phase, dates, outcomes, Sessions 01–87, independent work, question target, mastery gate, and mock milestone.
- `src/data/program.json` contains appointment, exam-window, PSM, and administrative milestone metadata.
- `src/data/readings.json` is the centralized audited catalog: 77 raw entries, 57 canonical readings after duplicate resolution, 91 raw session assignments, and 67 canonical assignments. Session `readings` arrays contain catalog entry IDs only.

The attached-source crosswalk is complete, but curriculum coverage is not. Attached readings are assigned to 39 of 87 sessions. Corporate Issuers Sessions 16–18, Fixed Income Sessions 34–39, and Derivatives Sessions 40–42 are explicitly flagged as requiring 2027 Learning Ecosystem sources that are not currently attached. Sessions 01–03 and 55–87 intentionally introduce no new attached readings because they are diagnostic, integration, repair, mock, or taper sessions.

The twenty 2024 Book 3 duplicate entries preserve `primaryEquivalent` links to their 2025 Book 2 counterparts. Do not count those duplicates as additional curriculum coverage. Catalog topic `Portfolio Construction` is normalized to the tracker label `Portfolio Management`.

To re-import a newly audited catalog and repopulate the canonical plan mappings:

```powershell
npm run readings:integrate
```

The script defaults to `../tmp/project_202_readings.json`; an alternate catalog path can be passed directly to `scripts/integrate-readings.mjs`.

When updating the schedule, preserve these invariants:

1. Exactly 29 consecutive Sunday-to-Saturday weeks.
2. Week 1 begins 9 August 2026.
3. Week 29 ends on 27 February 2027.
4. Exactly three consecutively numbered sessions per week, Sessions 01–87.
5. Sessions 1 and 2 are required. Session 3 is flex except in diagnostic, coverage-gate, deep-repair, and mock weeks.
6. Full-length mocks are independent tasks; numbered tutor sessions prepare, debrief, and repair them.

## Local development

Requirements: Node.js 20 or newer and npm.

```powershell
npm install
npm run dev -- --hostname 0.0.0.0 --port 5174
```

Open `http://localhost:5174`.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run preview -- --hostname 0.0.0.0 --port 4174
```

Tests protect calendar boundaries, week ordering, session numbering, required/flex rules, bidirectional reading assignments, duplicate-to-primary mappings, canonical counts, missing-source ranges, topic aliases, mock progression, and backup normalization.

## Production deployment

The tracker uses vinext's App Router build so the production artifact contains the server entrypoint required by OpenAI Sites. `npm run build` also copies `.openai/hosting.json` into the ignored `dist` artifact and verifies `dist/server/index.js` before succeeding.

The UI still behaves as a single-page tracker: its sections use in-page tabs and all progress remains browser-local.

## Score-target disclaimer

Mock and mastery targets are internal coaching evidence. They are not an official CFA Institute passing score, result prediction, or guarantee.
