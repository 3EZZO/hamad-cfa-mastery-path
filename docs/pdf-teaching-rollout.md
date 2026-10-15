# PDF teaching: Firestore free-plan rollout

The owner approved replacing the original Cloud Storage implementation with
Firestore raw binary chunks, keeping the existing Firebase Spark plan. No
Cloud Storage bucket, CORS configuration, new build variable, Cloudflare service
or billing activation is required. The owner also approved committing, pushing
and opening a PR; the owner will merge. Live import/sharing remains deliberate
work in the tutor account, never an automatic migration.

## Feature

- Session Mode > Teach from PDF opens a private tutor library, including sessions
  without a playbook. Add PDFs validates them and imports them privately.
- The reader supports page navigation, fit/zoom, search, selectable text and
  full-screen presentation. Presentation hides private notes and share controls.
- One session clock serves Guided Session and PDF teaching. Switching surfaces
  preserves time/state; switching sessions pauses the old clock. Recovery is paused.
- Notes belong to the tutor, session and PDF version. Practice/rehearsal does not
  save notes, receipts or student progress and cannot share/import materials.
- Share with Hamad grants one immutable version to a selected active student.
  Remove access revokes it; re-sharing starts a new receipt revision.
- Students find active shares under Plan > Session materials and a Today card.
  Their page/zoom is independent. Opened requires a rendered page and never
  marks understanding, mastery or task completion.

## Persistence and access

All paths are under `programs/project-202/`:

| Path | Access |
|---|---|
| `teachingMaterials/{materialId}` | Active tutors |
| `teachingMaterialVersions/{versionId}` | Active tutors; immutable |
| `teachingMaterialVersions/{versionId}/chunks/{index}` | Direct get by active tutor or active student with matching active own-version grant |
| `materialRecipients/{uid}/grants/{versionId}` | Tutors manage; recipient reads own active grants |
| `materialRecipients/{uid}/receipts/{versionId}` | Entitled recipient reads/writes current-revision receipt; tutor reads |
| `materialReaderStates/{uid}/versions/{versionId}` | Owner only with entitlement |
| `tutorTeachingSessions/{uid}/runs/{runId}` and `notes/{versionId}` | Owning active tutor only |

A version ID is `<materialId>-<full-sha256>`. Each chunk has only version ID,
index and a Firestore `Bytes` field. Chunks are at most 900 KiB; each file is at
most 5 MiB / 100 pages / six chunks. All chunks, the immutable manifest and the
catalog pointer publish in one transaction. Rules require every expected chunk
and exact lengths, and deny later chunk/manifest updates, deletes and chunk lists.

Downloads use authenticated server reads and verify indices, lengths, total size
and SHA-256 before rendering. No tokenized URL, base64 text blob, public asset or
persistent offline PDF cache is used. Rules cannot parse PDFs or recompute their
hash; file inspection and client verification protect the workflow, with approved
tutors acting as publishers.

All 11 current branded PDFs fit in one chunk each and total about 2 MB. Catalog,
manifest, permission dependencies, subscriptions, receipts and preferences also
consume reads/writes; one chunk read is not the whole cost of a viewing session.
The feature uses the existing free-plan quotas, not unlimited storage or traffic.
See [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

## Publish and activate

1. Complete verification below and review the intended diff. Commit feature
   files only, push `claude/pdf-teaching-materials` and open a PR. Keep real PDFs,
   local environments/scratch files and unrelated owner handoff documents out of Git.
2. Under the owner's production authorization, publish rules through the existing
   verified wrapper only:

   ```text
   npm run firestore:rules:deploy
   ```

   The wrapper pins the Firebase CLI and verifies the production `cloud.firestore`
   release target for `project-202-tracker`. Retain its release verification. No
   Storage deployment is needed. Do not use real student records for smoke tests.
3. The owner reviews and merges the PR. The normal GitHub Pages workflow publishes
   the frontend. A local build or open PR does not establish production deployment.
4. In the tutor account, Session Mode > Teach from PDF > Add PDFs, select the 11
   files from local `output/pdf/`. Confirm titles, reading numbers and page counts,
   then upload privately. `npm run materials:inventory` prints local hashes/counts.
5. Open each material to check it. Share only chosen versions with Share with
   Hamad. Importing or opening does not grant student access.

## Verification

See [the verification record](pdf-teaching-verification.md) for executed checks,
native browser evidence, handoff reports and the remaining owner smoke checks.

Run focused tests, then the required final order:

```text
npm run typecheck
npm run test
npm run build:pages
git diff --check
```

Run `npm run test:materials:emulator` explicitly. It requires Java 21+ on PATH,
`JAVA_HOME`, or a JRE under ignored `tmp/tools/`. It starts only Auth/Firestore
emulators with `demo-hamad-cfa`; tests create synthetic accounts and binary PDFs.
It never uses real student records, production tests, Storage or ambient cloud
credentials. It checks actual SDK reads/writes and rule evaluation, including
six-chunk maximum publication, missing middle chunks, atomic rejection,
wrong-recipient/version access, revoked grants, stale receipt callbacks, private
notes, bounded owner preferences and immutable documents.

For a local browser build, use an ignored `.env.emulator.local` with a demo
project and `VITE_FIREBASE_EMULATOR_HOST=127.0.0.1`. The app redirects only demo
projects to loopback emulator endpoints and otherwise fails closed. Verify the
non-root Pages base path, actual PDF worker, desktop/mobile layout, text search,
selection, focus, full screen, private-note visibility, rapid switching, one clock
and two-account share/open/revoke. Keep browser evidence and live verification
separate from component mocks. Record unavailable checks honestly.

## Rollback and limits

- Reverting the frontend removes entry points but does not revoke byte access.
  Revoke affected grants through an authorized operator/tutor action if needed.
- Earlier rules can be redeployed from Git history after review. Binary versions
  are immutable and are not automatically deleted.
- A committing transaction may finish after Stop import; the UI reloads the
  library and identical retries converge rather than promising an in-flight
  commit was undone.
- No annotations, synchronized pages, offline PDFs or AI in v1.
- Search highlights whole text runs. Split-run matches navigate to the page but
  may not highlight every fragment.
- Browser full screen can be refused; the expanded in-app reader is the fallback.
- Revocation closes cooperative readers when detected. Going offline closes the
  student reader; bytes already received or captured cannot be recalled.
