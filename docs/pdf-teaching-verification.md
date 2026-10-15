# PDF teaching verification — 15 October 2026

Implementation: `claude/pdf-teaching-materials`, based on `25c357a`.
Architecture and operator instructions: [rollout guide](pdf-teaching-rollout.md).

## Performed here (Codex)

- `npm run typecheck`: passed.
- `npm run test`: **718 tests in 121 files passed** after the final code changes.
- `npm run test:materials:emulator`: **25 cases passed**, using only synthetic
  accounts/PDFs and local Auth/Firestore emulators for `demo-hamad-cfa`.
- The emulator cases cover authenticated byte reads, active membership, exact
  recipient/version grants, revoked access, forged grants, stale opened callbacks,
  independent bounded preferences and private tutor records. They also exercise
  atomic publication, missing middle chunks, immutable bytes, malformed metadata,
  corruption rejection and a six-chunk 5 MiB round trip through the actual SDK.
- Focused regressions cover slow note saves, owner changes, teaching clock
  adoption/recovery, hidden guided controls, older version retention, reader
  geometry/search and malformed/password-protected PDF loading.
- `npm run materials:inventory`: all **11 files, 33 pages, 2,058,226 bytes**
  validated locally; the ignored inventory includes SHA-256 and page dimensions.
- All 11 local PDFs were published/read back through the authenticated service
  in the loopback emulator, with matching SHA-256. No real account or production
  document was used for this check.
- `npm run build:pages` with `BASE_PATH=/hamad-cfa-mastery-path/`: passed, including
  the PWA/precache check and the private-content audit against all 11 source PDFs.
- `git diff --check`: passed before staging/publication.

## Native browser checks performed here

Chrome used isolated synthetic tutor/student sign-ins on loopback origins, with
the app explicitly connected to Auth/Firestore emulators.

- PDF teaching opened despite the missing guided playbook setup screen.
- The real PDF worker rendered Readings 1, 2 and 8 with selectable text; Reading
  8 used its taller A4 dimensions. Page navigation, fit width/page, search results
  and native full-screen presentation worked.
- Presentation hid private notes and share controls. Exiting restored the reader.
- A private note saved. Guided/PDF surface switching retained page 2, zoom and
  the note. The host clock retained its elapsed time; page hiding paused it.
- A tutor with 11 private materials shared only Reading 1. The student list
  contained only that PDF, and opened it on page 1 independently of the tutor.
- The tutor received an Opened receipt after the student's page rendered.
  Revocation closed the student's active reader and removed the list entry.
  Re-sharing reset the current opening status without automatically reopening it.
- Desktop tutor and mobile student layouts were inspected at 1366 × 768 and
  390 × 844 respectively, including the surrounding app controls.
- A separate compiled emulator preview at `/hamad-cfa-mastery-path/` restored
  the paused teaching clock and rendered Reading 8 through the bundled worker.
  No console errors were reported in that preview. Temporary viewport overrides
  and test tabs were cleared afterwards.

## Reported in the owner's Claude handoff

Claude reported prior browser/emulator checks of the original Cloud Storage
implementation and an unchanged dependency audit with seven existing findings.
Those reports are historical context, not verification of the Firestore migration.
No new dependency audit or owner production acceptance is claimed here.

## Static reasoning

- Raw Firestore `Bytes`, exact chunk paths, immutable manifests and per-version
  grants preserve approved-account access without a bucket or new identity system.
- Existing guided closeout/progress effects remain separate from PDF open/share/end.
- The binary size cap, page bound and rule access design are intentionally limited
  to small teaching documents; this is not a general large-file storage service.
- Revocation cannot recall bytes already delivered or retained by a recipient.

## Still unverified / owner acceptance

- The Chrome extension blocked automated file selection because file-URL access
  is disabled. The authenticated publication service was exercised instead; native
  Add PDFs selection should receive an owner smoke check. No browser permission
  was changed to bypass this restriction.
- Exhaustive visual inspection of every page of all 11 PDFs was not repeated.
  All source files/pages were parsed and fingerprinted; native visual checks used
  representative Letter/A4 readings and formula-heavy content.
- A real guided playbook plus PDF in the same browser run was not imported during
  this continuation. Its clock/draft/surface integration has automated regression
  coverage; the native switch check used the missing-playbook guided surface.
- Production frontend deployment and real-account import/sharing require the
  owner's merge and deliberate tutor actions. Local success is not a live rollout.
- Deployment results and the exact published commit/PR are reported separately
  in the final handoff; do not infer them from this local verification record.
