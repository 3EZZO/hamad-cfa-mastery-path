# UI refinement — September 2026

## Scope and baseline

Preserve the production React 19 / TypeScript / custom CSS / Vite-to-GitHub-Pages architecture, Firebase authentication, tutor/student guards, all Firestore rules, schemas and synchronization logic. No runtime dependencies or teaching content will be added by this pass.

Baseline verified 10 September: 195 application tests, TypeScript check, and 118 real Firestore Rules evaluator cases passed. Rules evaluation is non-persistent; it did not write Firestore documents.

### Brief clarifications

- Private playbook **data** is protected. The UI implementation is a public JavaScript asset loaded lazily behind the existing authentication/role guards; it is not itself a secret.
- An isolated rehearsal sandbox is a requested new capability, unlike the existing read-only library and pre-session record cleanup.
- The brief requests P1–P7 but does not explicitly number its bullets. The following grouping preserves their order.
- The source contains generic teaching fallback sentences for absent fields; omitting these cleanly is included in P2, without changing uploaded content.
- No authored dark-theme branch was found. Browser/OS/extension forcing is a hypothesis, not a verified cause of the user's dark screenshots.
- Reading size currently affects body text, not all labels/controls. P6 will correct that mismatch.

## Ordered change sets and review gates

| Group | Scope | Status |
| --- | --- | --- |
| P1 | Consolidate controls; reduce chrome; expose full titles | Implemented locally; awaiting visual gate |
| P2 | Shared count glossary, destination naming and task subtitles | Pending |
| P3 | Styled confirmations/prompts; preserve existing decisions | Pending |
| P4 | Inline recovery/sync guidance and prominent retry | Pending |
| P5 | Explicit memory-only full-workflow rehearsal | Pending |
| P6 | Actual theme diagnosis, proportional reading sizes, laptop/mobile adaptation | Pending |
| P7 | Contrast, dialogs/focus, accessible controls and announcements | Pending |

Each group must pass the complete app and rule test suites and a visual review at mobile, laptop and desktop sizes before the next group. Actual laptop resolution, Windows scaling and browser zoom have been requested. No connected browser was available at baseline. Safari testing also requires an available Safari environment; no cross-browser visual claim has been made.

## P1 — before / after and rationale

### Session Mode

- **Before:** persistent stage-navigation strip, separate workspace menu and shortcut button competed with the clocks, deck controls and teaching content.
- **After:** stage jumping, search/queue/pacing/reading controls, keyboard-help access, preflight and existing playbook actions live in one **Session tools** disclosure. The direct **References**, timer, sync and Finish controls remain available. Next/Space and all data callbacks are unchanged.
- Removed the dedicated stage row from the laptop grid; preserved independently scrolling Teach/Ask/Answer panels.
- Deck titles wrap fully. The teaching objective has an explicit disclosure, keeping its full supplied text accessible instead of clipping it.
- Existing workspace actions are embedded, not duplicated or removed. Non-running launch/closeout screens keep their existing workspace menu.

### Study Plan

- **Before:** programme statistics, explanatory note and phase filter consumed three blocks before the weeks.
- **After:** one **Plan overview & filters** disclosure; the active phase and number of visible weeks remain on its summary. The week list and all scheduling behaviour are unchanged.

### Tutor Admin

- **Before:** launch checks, schedule-change form/history and destructive recovery controls were all persistent.
- **After:** pending approvals remain first; secondary controls share a **Schedule, readiness & recovery** disclosure with a changed-date count. Existing safeguards and actions are untouched.

### Validation

- Added interaction tests for the consolidated controls, stage navigation, direct References action and Teach → Ask → Answer sequence.
- Added a full-title/objective-disclosure rendering test; updated the layout contract to assert the removed row.
- Post-change checks: **199/199 application tests**, TypeScript, production Pages build, public-build private-content audit, and **118/118 non-persistent rule-engine tests** all passed.
- Browser diagnostics: Chrome is installed and running, but the ChatGPT extension and native messaging host are missing. Browser runtime discovery returned no connected browsers. Reinstall the Browser plugin through its UI and enable its Chrome connection; do not repair the host manually or bypass the requested browser surface.
- Visual review: **not yet performed — Chrome is not connected.**
- Deployment: **not performed — visual review gate is outstanding.**

## Protected boundaries

No changes in this change set to Firestore rules, cloud client, sync queues, permission guards, playbook schema, private JSON files or user records. Do not clear storage, re-import playbooks or reset live sessions to review these UI changes.
