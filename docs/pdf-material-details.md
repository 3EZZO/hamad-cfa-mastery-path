# PDF labels and topic groups

In Session Mode > Teach from PDF, the tutor can use **Edit details** on any
library item to correct its title, choose a CFA topic, and change or clear the
optional curriculum reading number. Put module numbers in the title. The upload
form also offers topic selection. Library and student Session materials group
PDFs by topic, with numeric ordering for readings and module titles.

Existing Economics filenames are recognized even when the original upload used
the old Quantitative Methods default. Explicit saved topic selections take
precedence over filename suggestions. Existing QM catalogue entries remain in
Quantitative Methods; unknown subjects appear under Supplementary until edited.

## Persistence and access

Editable labels live at
`programs/project-202/teachingMaterialDetails/{versionId}`. Each record contains
the version ID, title, optional reading number, topic, revision, updating tutor
and server timestamp. A compare-and-set revision prevents an old editor from
silently overwriting another tutor device's correction.

PDF manifests and binary chunks remain immutable. IDs, grants, share revisions,
receipts, private notes, reader positions and teaching history remain unchanged.
The tutor library overlays labels for display but retains its original source
manifest for sharing and byte verification. Student labels are resolved through
per-version listeners only for their own active grants. Missing detail records
fall back to the original labels, so pre-feature uploads can be corrected.
Revoked grants close their detail listener and continue to deny future byte reads.

Only active tutors can list or write detail records. A student may read a single
record only while holding an active grant for that exact version; no student
catalogue or label-list access is added. Fields, subject values, lengths and
monotonic revisions are checked in Firestore rules. Practice mode disables import,
sharing and editing. This adds one small detail record/read listener per version;
it does not duplicate PDF bytes.

## Release

Deploy the reviewed Firestore rules through the existing
`npm run firestore:rules:deploy` wrapper **before** publishing this frontend.
The frontend's new detail queries need those rules. Live rules deployment,
commit, push, PR creation and production publication each remain subject to the
repository's owner authorization gates. A local build does not update the live app.
The owner merges the reviewed PR manually through the usual GitHub Pages workflow.

There is no migration or automatic write to existing records. Once released,
the tutor can correct the already-uploaded PDFs directly without re-uploading or
re-sharing them. The student sees corrections through the active-share listeners.

## Verification

Run the focused details/library tests and the local Auth/Firestore emulator suite,
then `npm run typecheck`, `npm run test`, `npm run build:pages`, and
`git diff --check`. Emulator fixtures are synthetic and refuse a non-demo backend.
They cover legacy corrections, label subscriptions, unchanged PDF bytes and history,
sharing after correction, competing edits, revocation and direct unauthorized writes.
Native browser checks use a synthetic local harness, never real student records.

### Verification record (20 October 2026)

- Performed by Codex: focused details/library/rules checks; 723 tests in 122
  unit/component files; 30 real-SDK Auth/Firestore emulator checks; typecheck;
  production Pages build; PWA artifact checks; private-content audit against all
  15 local teaching PDFs; clean `git diff --check`.
- Performed by Codex in Chrome against synthetic local fixtures: original labels
  prefilled, title correction, reading number cleared, topic reassignment, failure
  retaining typed values, Escape cancellation, initial focus, practice controls
  disabled, and desktop/390px phone layout inspected. This used a component
  harness, not real production records. Browser viewport was reset afterwards.
- Reported by owner: existing Economics uploads contain incorrect titles and
  reading numbers; no owner verification of this fix has been reported yet.
- Static reasoning: immutable version/chunk rules and byte identifiers remain
  unchanged; sharing uses the original source manifest while readers display
  corrected labels. The non-Windows runner continues using PATH-resolved npx;
  only the Windows runner was executed here.
- Still unverified: real-account correction after release and production rollout.
  Existing build warnings about the classic theme-init script and mixed static/
  dynamic cloud imports remain; the build and audits passed.

Implementation branch: `gemini/material-details-topics`. The verification above
preceded publication. Release status is recorded in the associated pull request;
no migration or automatic edit to existing user records is part of this change.
The local preview was stopped and the temporary browser tab closed after QA.
