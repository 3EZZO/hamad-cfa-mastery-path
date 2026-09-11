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
| P1 | Consolidate controls; reduce chrome; expose full titles | Implemented locally; automated gate passed; visual verification deferred |
| P2 | Shared count glossary, destination naming and task subtitles | Implemented; automated gate passed; visual verification unverified |
| P3 | Styled confirmations/prompts; preserve existing decisions | Implemented; automated gate passed |
| P4 | Inline recovery/sync guidance and prominent retry | Implemented; automated gate passed |
| P5 | Explicit memory-only full-workflow rehearsal | Implemented; automated gate passed |
| P6 | Source-level theme fixes, proportional reading sizes, laptop/mobile adaptation | Implemented; automated gate passed; device appearance unverified |
| P7 | Contrast, dialogs/focus, accessible controls and announcements | Pending |

### Revised validation agreement — no user setup required

The user declined installing/reconnecting the browser integration or supplying device settings and asked for the work plan to be amended. This supersedes the original mandatory visual review after every group. Do not ask again for browser installation, screenshots, display resolution, Windows scaling or browser zoom as prerequisites to this refinement.

Continue P2–P7 in order as independently reviewable changes. After each group:

1. Run the complete application suite, all 118 non-persistent rule-engine cases, and TypeScript checks. Add interaction tests for each new behaviour; do not weaken existing functional assertions to obtain a pass.
2. Run the production GitHub Pages build and private-content audit. Keep Firebase rules, schemas, synchronization logic, permission guards and runtime dependencies unchanged.
3. Review responsive CSS and component markup against representative **CSS viewport** targets: 390×844 mobile, 1366×768 and 1536×864 laptop, and 1920×1080 desktop. Include narrow/reflow conditions associated with increased text size. These are engineering targets, not measurements of the user's 14-inch screen.
4. Add suitable layout-contract, terminology, accessibility-markup, contrast-calculation and interaction tests. Source/markup tests and colour calculations must not be reported as pixel-rendered visual checks, real screen-reader testing or cross-browser certification.
5. Record what passed, what was not verified, and any remaining risk. Fix substantive test/build failures before proceeding. Lack of a connected user browser is no longer a blocker.

Visual checking remains useful when a supported environment is already available without user setup. Do not repeatedly retry unavailable browser connections or bypass their access restrictions. Actual-device Chrome/Edge/Safari rendering, OS/browser/extension-induced darkening and assistive-technology behaviour remain explicitly unverified where unavailable.

For P6, preserve the authored light palette and investigate application-owned CSS, inherited styles, overlays and colour-scheme declarations. Make only evidence-supported app fixes. Do not claim that the dark screenshots' root cause is identified or fixed without observing it; do not add dark mode or change the user's browser/OS settings.

For P7, complete the source and automated accessibility review, including computed contrast for authored colour pairs, keyboard/dialog interaction tests and status markup. Report any real-browser or screen-reader gaps instead of claiming a complete device audit.

After P2–P7 pass the revised gate, publish through the existing GitHub Pages workflow and verify deployment completion. Do not publish private playbook JSON, move hosting platforms, require a JSON re-upload or change user records. The next implementation task is **P2: consistent terminology and count explanations**.

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
- Browser diagnostics at the original gate: Chrome was installed and running, but the ChatGPT extension and native messaging host were missing; runtime discovery returned no connected browsers. No repair or installation is now requested from the user.
- Visual review: **not performed; deferred under the revised agreement above, not marked as passed.**
- Deployment: **not performed; P1 remains a local commit while the remaining ordered changes are implemented.**

## P2 — terminology and supplied content

- Added one six-term glossary with distinct library, route, queue, live target, coverage and assessment counts. Applied it to launch, Session Mode, library and pacing controls; coverage is explicitly not mastery.
- References now opens References. Sidebar subtitles distinguish lesson outcomes, general notes/backups, mastery and corrections.
- Empty question/answer fields are omitted; candidate presentation cannot substitute an objective for a missing question. Uploaded teaching content is unchanged.
- Validation: 202 application tests, TypeScript, Pages build/private-content audit and 118 non-persistent rules cases passed. Candidate-view omission received a final narrow regression check.
- Live rendering and screen-reader use remain unverified under the revised agreement. No JSON re-upload is required.

## P3 — consistent decisions

- Replaced all 11 native confirm/prompt calls with one styled dialog provider using the existing calendar-modal pattern, focus trap, Escape/backdrop cancellation and focus restoration.
- Confirmations retain their original messages and decisions; prompts retain defaults, exact text and null cancellation. The optional return-note cancellation still submits an empty note, as before. Reset still requires the exact phrase and downloads the backup before replacing progress.
- Pending decisions cancel when their view/account/navigation scope exits; no cloud or permissions code changed.
- Validation: 208 application tests (six new dialog tests), TypeScript, Pages build/private-content audit and 118 non-persistent rules cases passed. Actual keyboard/rendered-browser behavior remains unverified.

## P4 — visible recovery

- Added a shared inline recovery notice to the tracker (including mobile), Session Mode header and completed-session screen. Failure details are no longer hidden in hover titles; Retry sync is an explicit primary action.
- Supplied error details are preserved. Offline/missing-detail states give connection/access guidance without suggesting storage deletion. Existing queue/retry callbacks remain unchanged.
- Validation: 211 application tests, TypeScript, Pages build/private-content audit and 118 non-persistent rules cases passed. Live rendering/touch and screen-reader announcement behavior remain unverified.

## P5 — isolated rehearsal

- Added a visually distinct rehearsal workspace using the actual runner, timers, evidence controls and closeout form. It receives only playbook/session/route data and an exit callback; all practice state stays in React memory. Reader preferences are neither read nor written in rehearsal.
- Available from launch and completed-session tools, and running-session tools when no unrecorded evidence draft exists. Closeout does not offer rehearsal, protecting its unsaved form fields.
- Entry pauses a running live timer through the existing checkpoint behavior; this is one legitimate live pause, not a rehearsal write. Practice actions do not call live run/completion/delete handlers. Exit restores saved live position/evidence/coverage with the live timer paused; switching sessions discards rehearsal.
- Validation: 217 application cases covered by the full pass plus focused corrections/additions; actual Next/Space, four verdicts, timer, closeout/back, re-entry and host isolation tested. TypeScript, Pages/private-content audit and 118 non-persistent rules cases passed. Live rendering remains unverified.

## P6 — proportional reading and responsive layout

- Replaced fixed Session Mode font sizes with a shared 100/110/120% scale across 204 declarations. Secondary metadata has a 13px baseline floor, controls a 14px floor and reading text a 16px baseline. The same reader setting reaches the portal library through UI-only context.
- Control rows grow to fit text; normal laptop/desktop layouts retain three independently scrolling panels. Short-height/enlarged-text conditions allow outer reflow rather than clipping.
- Added a sticky mobile Teach/Ask/Answer jump strip; all three panels remain present. Reader buttons and touch controls have 44px minimum height.
- Preserved the light palette and declared `color-scheme: only light` plus page metadata to opt out of browser auto-darkening. No authored dark theme or dark overlay on the reading surface was found. This does **not** establish or fix a forced-dark browser extension/OS setting on the user's device.
- Validation: 220 application cases passed after a focused correction retaining the original single-current-step assertion; TypeScript, Pages/private-content audit and 118 rules cases passed. Source contracts reviewed for 390×844, 1366×768, 1536×864 and 1920×1080 CSS viewports. Actual rendering at those sizes, 200% browser zoom and Chrome/Edge/Safari/device darkening remain unverified.

## Protected boundaries

No changes in this change set to Firestore rules, cloud client, sync queues, permission guards, playbook schema, private JSON files or user records. Do not clear storage, re-import playbooks or reset live sessions to review these UI changes.
