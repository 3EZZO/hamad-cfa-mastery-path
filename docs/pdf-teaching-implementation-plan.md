# Hamad CFA: PDF teaching and selective student sharing

Prepared: 15 October 2026 (Asia/Riyadh)

Status: implementation specification, revised for the owner-approved Firestore-only storage approach. The owner chose the free Firebase Spark plan and approved replacing Cloud Storage with protected raw binary chunk documents. `docs/pdf-teaching-rollout.md` records the current implementation and rollout steps. Publication and production actions follow the latest explicit owner instructions; merging remains with the owner.

## 1. Product objective

Give the tutor a second way to teach inside the app: open a branded summary during a scheduled session, explain it to Hamad, and optionally share that PDF with Hamad's account. PDF teaching can complement the existing guided Session Mode or run independently when no playbook exists.

The tutor is the primary user of this feature. The student receives only explicitly shared materials. Both users must be approved, active project members. Uploading, opening or teaching a PDF does not automatically share it.

### Agreed behavior

- Preserve the existing Guided Session experience and add **Teach from PDF** within the tutor's session workspace.
- Allow any PDF to be used in any session; curriculum mapping is optional metadata.
- Allow switching between guided teaching and PDF teaching in the same session without losing position, drafts or elapsed session time.
- Provide private tutor notes and a comfortable reader with page navigation, zoom and full-screen presentation.
- Let the tutor share a selected PDF with Hamad through the app, and later withdraw that access.
- Give Hamad an independent reader; his page, zoom and reading position do not follow the tutor automatically.
- Display accurate **Shared** and **Opened** status. Opening is not evidence of understanding or mastery.

### Version-one scope

1. Tutor material collection with upload, validation, versioning and search by title/reading number.
2. PDF-only teaching and use of a PDF alongside an existing guided session.
3. Page previous/next, page input, fit width, fit page, zoom, full screen, selectable text and in-document text search.
4. Remember page/zoom separately for each user and immutable PDF version.
5. Private tutor notes associated with the teaching session and material.
6. Explicit share/revoke/re-share, a student materials destination, and opened receipts.
7. Server-enforced access controls, local emulator tests, browser QA and deployment instructions.

A simple presenter pointer is a useful enhancement after these essentials pass. Permanent highlights, freehand drawing, synchronized presentation, offline PDF downloads, AI explanations, cross-document semantic search and automatic module mapping are later phases. Do not let these extensions delay the core workflow.

## 2. Repository facts and constraints

Read `CLAUDE.md`, then its referenced `GEMINI.md`, before implementation. `CLAUDE.md` supplies the Claude-specific branch rules. Reinspect the working tree because this plan records one point in time.

| Area | Current implementation | Consequence |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, custom CSS | Extend this app and use its tokens/components. |
| Production hosting | GitHub Pages, `vite.pages.config.mjs`, `.github/workflows/deploy-pages.yml` | Files copied into the public build would be public. Private PDFs must stay outside it. |
| Identity/data | Named Firebase app in `src/lib/cloud.ts`; Auth and Firestore | Reuse the existing app and membership model. Do not create a second login. |
| Membership | `programs/project-202/members/{uid}` with `active` and `role` | Signing in alone does not grant access. |
| PDF persistence | Existing Firebase Auth and Firestore on the free Spark plan | Store bounded immutable binary chunks in Firestore; no Cloud Storage bucket. |
| Production environment | Workflow already supplies the four required Firebase variables | No new bucket variable, CORS, paid service or billing activation is required. |
| Tutor entry | `App.tsx` renders `TutorSessionWorkspace` in a tutor-only full-screen shell | Put teaching surfaces inside this existing shell. |
| Session content gate | `TutorSessionWorkspace.tsx` gates guided content on a private playbook | Put PDF selection above this gate. Playbook loading/failure must not block PDF teaching. |
| Guided state | `LiveSessionConsole`, `LiveSessionRunner`, timer hooks, private journals | Surface switching must preserve component-local drafts and existing persistence semantics. |
| Student destinations | `DashboardView.tsx` and `PlanView.tsx` | Add a Today materials card and a Plan > Session materials section. |
| Routing | `hashRoute.ts` accepts one alphanumeric/hyphen segment after the tab | Extend parsers deliberately; nested paths are not automatically supported. |
| Curriculum | `src/data/readings.json` contains official 2027 modules | These 2026 supplementary PDFs need a separate material catalog, not entries masquerading as official modules. |
| Public-build checks | `scripts/verify-private-tutor-content.mjs` | Expand it to detect these private PDF assets and metadata leaks. |

Use npm scripts. Preserve the owner's unfinished files and untracked documents. Do not stash, reset, discard or switch away from a dirty checkout. If an isolated worktree is needed, use `claude/pdf-teaching-materials` without moving existing work. Read the private source PDFs from the original repository when necessary; do not put them in Git to transfer them into a worktree.

## 3. Source assets

Use the completed branded files in `output/pdf/`. There are **11 PDFs, 33 pages, 2,058,226 bytes in total**. Preserve their PDF content and branding.

| Reading | Title | Pages | File under `output/pdf/` |
|---|---|---:|---|
| 01 | Rates and Returns | 3 | `hamad-cfa-reading-01-rates-and-returns.pdf` |
| 02 | The Time Value of Money in Finance | 3 | `hamad-cfa-reading-02-time-value-of-money-in-finance.pdf` |
| 03 | Statistical Measures of Asset Returns | 4 | `hamad-cfa-reading-03-statistical-measures-of-asset-returns.pdf` |
| 04 | Probability Trees and Conditional Expectations | 2 | `hamad-cfa-reading-04-probability-trees-and-conditional-expectations.pdf` |
| 05 | Portfolio Mathematics | 2 | `hamad-cfa-reading-05-portfolio-mathematics.pdf` |
| 06 | Common Probability Distributions | 3 | `hamad-cfa-reading-06-common-probability-distributions.pdf` |
| 07 | Estimation and Inference | 3 | `hamad-cfa-reading-07-estimation-and-inference.pdf` |
| 08 | Hypothesis Testing | 4 | `hamad-cfa-reading-08-hypothesis-testing.pdf` |
| 09 | Parametric and Non-Parametric Tests of Independence | 2 | `hamad-cfa-reading-09-parametric-and-non-parametric-tests-of-independence.pdf` |
| 10 | Simple Linear Regression | 4 | `hamad-cfa-reading-10-simple-linear-regression.pdf` |
| 11 | Introduction to Big Data Techniques | 3 | `hamad-cfa-reading-11-introduction-to-big-data-techniques.pdf` |

Reading 8 uses 595 x 842 point pages; the others use 612 x 792. Render using each PDF page's intrinsic viewport. Do not hard-code one paper size or rasterize the source files.

Before coding, add a narrowly scoped ignore rule for `output/pdf/` and private import manifests/previews if absent. This preserves the files locally. No PDF, encoded PDF, thumbnail of real content or extracted private text may enter `public/`, `src/`, a public bundle, a committed test fixture or the app-shell precache.

Compute SHA-256 and page count during import. File names help propose labels; the validated file and its immutable version identify the material. Do not execute the old regeneration script as part of this feature.

## 4. Tutor experience

### Entry and material collection

In Session Mode, retain the existing session selector. Add a compact surface selector: **Guided Session** / **Teach from PDF**. Show the PDF option even if the selected session has no playbook or its guided content is unavailable.

The PDF surface begins with the tutor's collection. Each row/card shows reading number, title, edition, page count, availability, and the selected recipient's sharing state. Actions are **Open for teaching** and **Share with Hamad**. A tutor-only **Add PDFs** action supports multiple files and displays progress/results per file.

Do not conflate reading numbers with scheduled session numbers. The tutor can select Reading 10 while teaching Session 2. Optional topic/module tags can improve search later.

### Teaching reader

Use the available laptop space, with a collapsible toolbar and note panel. The document is the visual focus. The toolbar contains material title, page controls, zoom/fit controls, full screen, notes, share state, and return to Guided Session/material selection.

- Default to fit width or fit page based on available viewport; allow manual override.
- Text remains selectable, and search jumps to matches without changing the source PDF.
- Remember the tutor's position per material version and the selected material for each session.
- Switching PDFs preserves each PDF's last page and zoom.
- Full-screen presentation hides private notes and administration controls by default. Explicitly reopening notes exits clean presentation or makes their visibility unmistakable.
- Handle fullscreen rejection with a usable expanded in-app layout.
- Use existing theme tokens for the surrounding UI. Preserve the PDF's intended light paper colors in dark mode.
- Show bounded, useful loading/error/retry states for unavailable files, failed renders and revoked sessions.

### Private notes

Notes are private to the owning active tutor and associated with session/material. Save with a short debounce and visible unsaved/saved/error status. Scope pending writes by owner, session and version so a late save cannot land on the newly selected session. Keep notes out of the shared tracker, student grants, PDF bytes, student receipts and shared session-log text.

### Sharing

**Share with Hamad** opens a small panel with the selected PDF/version, recipient, current session association and optional short message. The final action is **Send to Hamad**. This is a deliberate in-app publication action, not email, SMS or a new public URL.

Resolve the recipient through the existing `listActiveStudentMembers()` service. If there is one active student, preselect them; if there are several, require a choice. Never hard-code an email, UID or the tutor's UID as the recipient. If there are none, explain the missing active student and keep the PDF usable for teaching.

- A successful share creates/activates a grant for that exact version and shows **Shared**.
- Repeating the same active share is idempotent; it does not duplicate cards or reset opened status.
- **Remove Hamad's access** revokes that version's grant after a clear confirmation.
- Re-sharing a revoked version starts a new share revision so old receipts cannot count as a new opening.
- Uploading a replacement PDF creates a new version. Existing student grants stay on their original version until the tutor explicitly shares the replacement.
- Retrying after a network failure must safely converge on one result.

## 5. Student experience

Add **Session materials** under Plan as the permanent destination. Add a compact **Materials from your tutor** card on Today showing recent/new active shares and linking to the same destination. These are resources, not automatically required tasks in the Today queue.

Each item shows title, reading number where present, edition, page count, shared date, associated sessions and tutor message. The student opens a read-only reader with independent page/zoom/search state. The student cannot browse the tutor collection, grant access, upload versions or view tutor notes.

Record **Opened** only after the authorized PDF loads and a page successfully renders. A list view, preload, failed request or permission error must not create an opened receipt. It records an app event, not comprehension or verified reading completion.

On revoke, account change or membership loss, clear the reader and private in-memory data. If access changes while the browser is offline, clear the student reader when authorization cannot be re-established; offline PDF access is outside v1. Revocation blocks future app access and clears cooperative clients when detected; it cannot recall bytes a person already received or captured.

Student actions never advance guided stages, change test results, mark mastery or approve session tasks.

## 6. Session lifecycle and timer design

This is the most sensitive frontend integration. `LiveSessionConsole.tsx` currently owns the guided clock. `LiveSessionRunner.tsx` has component-local evidence drafts, dialogs, scroll position and global shortcuts. Merely hiding an existing runner is insufficient.

Introduce a session-level teaching host/controller above the two surfaces. It owns the visible surface and one canonical session clock. Preserve the existing guided run as an associated child with its current playbook/version/hash identity, events, journal and closeout behavior. Do not manufacture a playbook, route, question or assessment to support PDF-only teaching.

### Required transitions

| Event | Required result |
|---|---|
| Open PDF-only session | Works without playbook fetch/preflight success; clock starts only on an explicit Start action. |
| Guided -> PDF -> Guided, same session | One clock continues with its current running/paused state; guided draft, route, evidence and position survive. |
| Start Guided Session after beginning in PDF mode | Attach the guided run to the existing host clock without resetting elapsed time or changing its running/paused state. |
| Change PDF, same session | Clock continues; each document retains its own reader position. |
| Change scheduled session | Pause the old session, preserve its state, restore the new session safely paused. |
| Exit Session Mode / hide page / suspend laptop | Preserve the existing pause and checkpoint behavior. |
| Reload or recover | Restore only recorded elapsed time and resume paused; never count absence as teaching time. |
| Finish PDF-only teaching | Save private teaching history and notes; any shared log or task completion requires its own explicit tutor action. |
| Enter rehearsal | Isolated local/test state; no real grants, receipts, student progress or production writes. |

Reuse the clock arithmetic/recovery in `sessionClock.ts` and the lifecycle protections in `useSessionTimer.ts`. Preserve the 15-second suspension-gap behavior and bounded elapsed time. Move ownership rather than creating a second ticking timer. The current guided start handler calls `timer.start()`; adapt it so first starting guided content after PDF teaching cannot reset the host clock. If the guided run stores a timer snapshot, it must be a checkpoint of the host clock, not a second authority. Document the migration/reconciliation rule and prove it with tests before changing persistence.

Maintain the guided subtree or lift its volatile state. While PDF is visible, gate guided global shortcuts, desk timers, focus effects and portals. A PDF arrow key must not advance a hidden deck; a hidden candidate/answer dialog must not remain visible. Preserve Teach, Ask and Answer together when returning to Guided Session.

Existing run IDs and saved evidence remain compatible. Use a separate tutor-owned teaching-session envelope for PDF-only history and host recovery. Do not enlarge the strict shared tracker schema just to store reader state or notes. `applyLiveSessionCloseout` performs guided completion effects; do not invoke it from PDF open/share/end actions.

## 7. Firestore binary storage and data model

The owner explicitly approved this change from the original Cloud Storage proposal to stay on Firebase's free Spark plan. Reuse the existing named Firebase app, Auth and Firestore. No bucket, Cloudflare Worker, CORS configuration, new identity provider or billing activation is needed.

Store raw `Bytes` values, not base64 strings, in immutable chunk documents. A chunk is at most **900 KiB**, each file at most **5 MiB / 100 pages**, with at most **six chunks**. These bounds leave room below Firestore's 1 MiB document and 10 MiB request limits. [Firestore limits](https://firebase.google.com/docs/firestore/quotas)

| Path under `programs/project-202` | Purpose | Access |
|---|---|---|
| `teachingMaterials/{materialId}` | Tutor catalog and current version pointer | Active tutors only |
| `teachingMaterialVersions/{versionId}` | Immutable ready-version manifest | Active tutors only |
| `teachingMaterialVersions/{versionId}/chunks/{index}` | Immutable raw PDF bytes, numeric index `0` to `5` | Direct get by active tutor, or entitled active student; no listing |
| `materialRecipients/{uid}/grants/{versionId}` | Exact-version grant and copied student-safe metadata | Tutors manage; recipient reads own active grants |
| `materialRecipients/{uid}/receipts/{versionId}` | Opened receipt for current share revision | Entitled recipient reads/writes bounded receipt; tutor reads |
| `materialReaderStates/{uid}/versions/{versionId}` | Page/zoom preferences | Owner only with current entitlement |
| `tutorTeachingSessions/{uid}/runs/{runId}` | Host clock, selection and private teaching history | Owning active tutor only |
| `tutorTeachingSessions/{uid}/runs/{runId}/notes/{versionId}` | Private tutor notes with compare-and-set revision | Owning active tutor only |

Use path-safe immutable version IDs, `<materialId>-<full-sha256>`. Never accept arbitrary document paths from a file name or share URL.

- **Material:** ID, title, topic, reading number, `sourceEdition: 2026`, current version, optional verified module links, creator and timestamps.
- **Version:** version/material IDs, full hash, byte size, `chunkCount`, page count, PDF content type, student-facing title/reading/edition, creator and timestamp. It has no `storagePath` or download URL.
- **Chunk:** `versionId`, numeric `index`, and raw `Bytes`. Every nonfinal chunk has exactly 921,600 bytes; the last has exactly the remaining bytes.
- **Grant:** pinned version/material IDs, recipient UID, status, share revision, bounded session associations/message, copied manifest fields including hash/size/chunk count, sharing tutor and timestamps.
- **Receipt:** version, current share revision, first/last opened server timestamps. First opening remains immutable within a revision and resets only after re-sharing. A delayed callback must supply the revision actually rendered.
- **Reader state:** bounded page/zoom, fit mode and update timestamp. It survives re-sharing but is available only with current entitlement. Tutors do not read student preferences.
- **Teaching envelope/notes:** owner/session-scoped clock checkpoint, selected surface/version, optional guided-run reference, bounded history/notes and optimistic revision. Rehearsal does not write these records.

### Atomic publication and download

1. Validate the file shape, PDF parseability, size and page count locally; reject protected/unrenderable files. Compute SHA-256 and proposed labels.
2. Identical content resolves to an existing ready version. A replacement creates a new immutable version; old grants stay pinned.
3. In one Firestore transaction, create all binary chunks and the immutable manifest, then create/update the catalog pointer. No grant is created by importing.
4. Rules require every expected chunk to exist after the write and forbid adding chunks to an already published manifest. A rejected transaction leaves no partial file.
5. Stop/cancel prevents queued publications and transactions that have not committed. An in-flight atomic commit may finish; show its actual outcome and allow idempotent retry rather than promising it was undone.
6. Download each exact chunk through an authenticated server read. Verify indices, individual lengths, total size and full SHA-256 before rendering. Do not fall back to cached bytes when server authorization fails.
7. Keep bytes/text/thumbnails in memory only. Do not enable persistent Firestore/offline PDF caching. Clear cooperative readers and user-scoped caches on account changes, membership loss or revoked access.

## 8. Server-enforced permissions

Extend the existing default-deny `firestore.rules`; no Storage rules are used. UI capabilities do not replace rule checks.

- Require an authenticated active member with a recognized tutor/student role.
- Catalogs and manifests remain tutor-only. Chunk direct gets require an active tutor, or an active student with an active matching own-version grant. Deny arbitrary collection/group listing and all chunk updates/deletes.
- New chunks can be created only by an active tutor in the same atomic publication as their new manifest. Validate IDs, complete chunk count, exact byte lengths/types, file/page bounds, MIME, creator and timestamps. Prove a six-chunk maximum upload stays within per-operation and per-request rule access limits.
- New/reactivated grants require an active student recipient and copied metadata matching the immutable manifest. An active tutor may still revoke after the recipient becomes inactive.
- Active duplicate sends do not reset revision/opened status. Revoked-to-active increments revision; replacement files do not silently move grants.
- Students cannot write grants, broaden access, read another recipient's documents, or read private tutor state.
- Student list queries target only their own namespace and `status == active`; test actual queries because rules are not filters.
- Receipt writes require the revision actually rendered and the current active grant revision; delayed old callbacks cannot count a newer share as opened. Reader-state writes require ownership and entitlement, not a student grant for a tutor.
- Keep field allowlists, bounds, server timestamp checks and compare-and-set revisions. Preserve unrelated tracker, practice, payment, playbook and membership rules.
- Cancel obsolete loads and clear the reader on query removals, authorization errors, offline loss, logout and UID change. Revocation cannot recall bytes a recipient already retained.

Firestore rules cannot parse PDF content or recompute SHA-256. File inspection and hash verification protect the workflow and reader; approved tutors remain the publishers. Test rules with direct malicious-shaped SDK writes as well as the normal service.

## 9. Reader implementation and performance

Use a maintained compatible `pdfjs-dist` release and its worker, with text-layer support. Verify current package engine requirements and Vite integration before choosing the pinned release. PDF.js distinguishes core, display and viewer layers; reuse suitable viewer components rather than building text selection from canvas pixels. [PDF.js architecture](https://mozilla.github.io/pdf.js/getting_started/)

- Lazy-load reader code and the worker. Fetch only the selected authorized PDF.
- Configure the worker through the bundler so GitHub Pages' non-root `BASE_PATH` works. Self-host worker/assets; no external viewer receiving private URLs.
- Render one page at a time or virtualize visible pages. Bound device-pixel-ratio rendering to avoid excessive canvas memory.
- Cancel obsolete render tasks, destroy PDF loading/document handles, and revoke any temporary object URLs during close, rapid switching, logout and account change.
- Preserve the page's real aspect ratio and support mixed page dimensions.
- Scope fetches and caches by UID + version + authorization context; late requests must not repopulate a reader after logout/revoke/switch.
- Keep PDF bytes, extracted text and thumbnails in memory only in v1. Persist reader preferences/notes under their own protected schemas, not PDF content in the app-shell cache.
- Reader keyboard handlers run only when the reader is active and appropriate focus is present. Do not intercept typing in search/page input/notes or conflict with guided shortcuts.
- Provide accessible control labels, visible focus, keyboard page changes, search result announcements, and comfortable mobile touch targets.
- Use a read-only student configuration. Do not imply that hiding download/print buttons prevents recipients from retaining content.

## 10. Routing and file-level implementation map

Preserve `#live/session-03`. Keep the tutor's current surface in scoped workspace state rather than inventing nested hashes. For students, add `#plan/materials` and a tested single-segment document form such as `#plan/material-<versionId>`; validate IDs and resolve access before reading. Refresh/back/forward must work with the installed PWA and GitHub Pages base path.

Suggested new modules:

| File/area | Responsibility |
|---|---|
| `src/features/teachingMaterials/materialTypes.ts` | Material/version/grant/receipt schemas and validators |
| `src/lib/cloudTeachingMaterials.ts` | Catalog, manifests, grants, receipts and owner state services |
| `src/lib/cloudTeachingMaterials.ts` (binary persistence methods) | Bounded atomic publication and authenticated chunk downloads |
| `src/features/teachingMaterials/PdfReader.tsx` | Shared accessible reader and resource cleanup |
| `src/features/teachingMaterials/TutorMaterialLibrary.tsx` | Tutor collection and import UI |
| `src/features/teachingMaterials/PdfTeachingWorkspace.tsx` | Tutor document, private notes and share controls |
| `src/features/teachingMaterials/ShareMaterialDialog.tsx` | Recipient/session/message and grant lifecycle |
| `src/features/teachingMaterials/StudentSessionMaterials.tsx` | Active student shares and reader entry |
| `src/features/teachingMaterials/teachingMaterials.css` | Scoped styling using existing brand tokens |
| Session teaching host/controller near `liveSession/` | Surface ownership, canonical clock and guided-state retention |
| `firestore.rules` and emulator test files | Protected object access and executable permission tests |

Existing integration files likely include `App.tsx`, `lazyViews.ts`, `TutorSessionWorkspace.tsx`, `LiveSessionConsole.tsx`, `LiveSessionRunner.tsx`, `useSessionTimer.ts`, `sessionClock.ts`, `permissions.ts`, `PlanView.tsx`, `DashboardView.tsx`, `hashRoute.ts`, `cloud.ts`, `firestore.rules`, `firebase.json`, `.gitignore`, the private-build verifier and deployment docs/workflow environment.

Keep changes focused. New material storage should not turn `cloud.ts` or `App.tsx` into large monoliths. Preserve current public interfaces where practical; document any intentional migration.

## 11. Implementation sequence and completion gates

### Phase A: inventory, isolation and contracts

- Read repository rules, inspect Git state and choose a safe local branch/worktree.
- Verify all 11 local PDFs and produce a private import inventory; add ignore protections.
- Define typed schemas, deterministic IDs, sharing transitions, route grammar and the canonical timer/recovery contract.
- Add complete local Auth/Firestore emulator support using a dedicated `demo-` project ID and synthetic users. Assert all emulator endpoints are active; fail closed rather than falling back to live Firebase.

Gate: data model, lifecycle and local test environment are concrete. No production writes.

### Phase B: permissions and persistence

- Implement Firestore metadata/binary services and narrowly scoped rules.
- Add executable positive/negative permission tests and synthetic fixtures.
- Implement atomic binary publication and idempotent grant transitions.
- Prove real SDK byte retrieval works for authorized synthetic users and is denied otherwise.

Gate: unauthorized direct reads/list queries/writes fail; revoked and wrong-version downloads fail; duplicate share/retry is safe.

### Phase C: reader and tutor collection

- Implement and lazy-load the shared reader.
- Add tutor library/import states and PDF selection.
- Verify the real local branded PDFs in a local-only preview with no production upload; use synthetic PDFs in committed automated tests.

Gate: all 11 documents render with correct page counts, selectable text, mixed page sizes, fit/zoom and error recovery. No private content enters the public build.

### Phase D: session teaching integration

- Add PDF mode above the playbook gate.
- Introduce the host clock and preserve guided draft/route/evidence state.
- Implement private notes, scope-safe persistence, pause/recovery and rehearsal isolation.
- Keep existing guided closeout semantics intact; PDF-only finish saves private history.

Gate: guided/PDF switching works without duplicate timing, hidden shortcuts or lost state, including a session with no playbook.

### Phase E: sharing and student delivery

- Add deliberate share/revoke/re-share and recipient resolution.
- Add Plan > Session materials, Today entry, independent reader state and opened receipts.
- Test in two isolated browser contexts using synthetic approved accounts.

Gate: the tutor can teach privately, share one version, see its opened receipt, and revoke it; the student never gains access to other PDFs or tutor state.

### Phase F: final verification and rollout package

- Complete the automated/browser checks below.
- Prepare the verified Firestore rules deployment command, free-plan limits, private import instructions and rollback notes.
- Report implementation state separately from production readiness. Stop before live setup/publication until explicitly instructed.

Gate: reviewable local implementation, verification evidence and exact remaining deployment dependencies.

## 12. Verification matrix

Use synthetic records and PDFs for automated tests. The local app currently connects to real Firebase unless explicitly redirected; do not use real student accounts as test fixtures.

### Permission tests

1. Anonymous and authenticated non-members cannot list metadata, download bytes, write grants or receipts.
2. Inactive members and unknown roles are denied.
3. Active tutor can upload/read/manage feature metadata, but existing unrelated restrictions remain intact.
4. Student without a grant cannot get a known object path or metadata.
5. An active grant unlocks exactly its recipient and immutable version.
6. Another student's grant and a grant for another version do not authorize access.
7. Student cannot edit grant status, recipient, version, metadata or session/message fields.
8. Student can list their own active shares with the actual client query; an unrestricted cross-user query fails.
9. Revocation denies future downloads and closes the cooperative active reader; old revision receipts cannot mark a re-share opened.
10. Private tutor notes/history and other users' reader state remain unreadable to students.
11. Malformed/oversized files, wrong MIME/chunk shape and immutable chunk overwrite/delete are rejected by intended rules.
12. Shared metadata matches an immutable manifest. Atomic publication requires every chunk, including middle chunks, and exact byte lengths; missing/invalid chunks reject the entire transaction.

### Lifecycle and integration tests

- PDF teaching opens with missing, slow or failed guided content.
- Guided -> PDF -> Guided preserves local evidence draft, route, position, one clock and running/paused state.
- Starting guided content for the first time after PDF teaching preserves the existing host clock and elapsed time.
- Hidden guided shortcuts, portals and desk timers do not react while PDF is active.
- Session switch, browser hiding, laptop suspension, reload and logout respect pause/recovery rules.
- Late fetch/render/note writes cannot affect another account, document or session.
- PDF-only end/open/share does not invoke guided assessment/closeout or mark mastery/tasks complete.
- Rehearsal generates no real share, receipt, note or student-state write.
- Duplicate sends/retries create one active share; replacement versions do not move old grants.
- Failed transactions leave no partial chunks/manifest/pointer. Canceling queued work prevents publication; an already committing transaction reports its actual outcome and retry converges safely.
- Opened receipt requires successful rendering; two users retain independent page/zoom.
- Legacy routes and bookmarks continue to work; invalid material routes fail safely.

### Browser QA

Use the actual PDF worker and browser rendering, not just mocked DOM tests. Verify tutor laptop at 1366 x 768, a larger desktop, and student mobile around 390 x 844. Test keyboard/focus, text search/selection, zoom, fit modes, full screen/Escape, scrolling, note visibility, rapid switching, render errors and two-account sharing/revocation. Include light/dark app themes and a non-root Pages base path. Validate all 11 local documents, especially Reading 8's A4 size and formula-heavy pages.

### Final repository checks

Run focused tests first, then the required final order:

```text
npm run typecheck
npm run test
npm run build:pages
git diff --check
```

Run the new emulator permission suite explicitly; include any new test script in the handoff. Review the production build for real PDFs, filenames/metadata that should remain private, embedded base64 bytes, extracted text, thumbnails and app-shell precache entries. Synthetic test fixtures must also stay out of production output.

Report verification as **performed by Claude**, **reported by the owner**, **static reasoning**, and **still unverified**, per `CLAUDE.md`. Do not claim browser behavior or production authorization based solely on component mocks or text-matching rules tests.

## 13. Production setup and rollout boundary

Follow the owner's latest explicit authorization. The current handoff includes approval to finish the Firestore migration, verify it, commit, push and open a PR; the owner merges. Rules publication uses the repository's verified `npm run firestore:rules:deploy` wrapper only after the implementation and tests are ready. Never enable billing, merge, upload real PDFs or send materials to Hamad automatically.

1. Finish local verification, record evidence/limitations and review the complete intended diff.
2. Commit only feature code/docs, excluding private assets, local environments, scratch files and unrelated owner documents. Push the feature branch and open the reviewable PR.
3. Deploy Firestore rules only under explicit production authorization and verify the production release target through the wrapper. Do not replace the rules deployment with a generic unverified command.
4. The owner reviews/merges; the normal GitHub Pages workflow publishes the app. PR creation or local build success is not a production frontend deployment.
5. The tutor imports the 11 PDFs with Add PDFs, initially private, checks labels/counts, then explicitly shares chosen versions.

No Storage bucket, Storage rules, CORS, billing activation or new build variable is needed. All 11 current PDFs fit within a single binary chunk each. Catalog/manifest/grant/receipt/state/rule checks also use reads; do not promise that one chunk read is the total quota cost of opening a document. Stay within existing free-plan quotas and make errors/retry visible. See `docs/pdf-teaching-rollout.md` for the current operator instructions.

Rollback can revert frontend code and redeploy earlier rules, but removing entry points alone does not revoke access. Revoke affected grants with a separately authorized operator action when needed. Preserve original source files, guided data and private history.

## 14. Definition of done

- All 11 existing branded PDFs can be imported privately and taught from without re-authoring them.
- A tutor can run PDF-only teaching without a playbook and switch back to guided teaching without losing state or duplicating time.
- Private notes remain tutor-only and presentation mode hides them by default.
- Selected, version-specific sharing works through approved accounts; Hamad sees only active shares for his UID.
- Student reader position is independent; opened receipts are accurate and revision-aware.
- Revocation and account changes are enforced in rules and handled in the UI.
- Existing session, practice, tracker, payment, navigation and rehearsal behavior remains compatible.
- Relevant permission, lifecycle and browser tests pass; any remaining live-environment checks are explicit.
- No private document content is committed or shipped as a public asset.
- Production prerequisites and commands are documented; no unauthorized deployment or real sharing has occurred.

## 15. Claude Code execution prompt

Use the companion file `docs/claude-pdf-teaching-prompt.md`. It explicitly authorizes the local implementation described here, including necessary local rules/configuration/dependency work, and preserves the repository's separate publication/production gates.
