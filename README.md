# Hamad's CFA Level I Mastery Path

**Hamad's CFA Level I Mastery Path** is a mobile-first study tracker for a 26-week private coaching program running from 30 August 2026 through the 27 February 2027 CFA Level I exam appointment. The first tutor checkpoint is Saturday, 5 September 2026 at 09:00 Asia/Riyadh.

Created by Mohamed Ali, CFA.

The application is isolated from the surrounding HN3 projects. It has its own dependencies, TypeScript configuration, tests, and production builds.

## Program design

- All 102 learning modules in the official public 2027 CFA Level I topic outline, assigned once in published order as independent study
- 25 consecutively numbered Saturday tutor checkpoints at 09:00 Asia/Riyadh from 5 September 2026 through 20 February 2027: the opening Quant masterclass is 150 minutes and Sessions 02-25 are 120 minutes
- Week 26 is a protected independent taper and exam-execution week, with a separate checklist and no tutor session on the 27 February exam day
- Session 01 begins with direct Quantitative Methods instruction and moves through modelling, guided application, hard questioning, repair, and mastery checks; the obsolete prior-attempt diagnostic has been removed
- Curriculum coverage is assigned through Session 17, followed by integration, seven independent mock-and-repair cycles, and the final taper
- Weekly completion checklists, evidence gates, independent work, and question targets
- Tutor-session, confidence-rated practice, mock, mistake, and note logs
- Student session-completion requests with explicit tutor approval/return workflow
- Shared notes plus separately stored, tutor-only private coaching notes
- Ten-topic mastery board and internal coaching targets
- Tutor-only launch checks, a private live-teaching Session Mode, and safe schedule overrides
- Automatic coaching-risk signals derived from due work, practice evidence, mistakes, and mocks
- Weekly WhatsApp-ready summaries plus print-to-PDF progress reports
- Calendar import for all 25 timed tutor checkpoints and administrative milestones, including the separate 27 February exam appointment, with the fixed 09:00 Riyadh start time and selectable reminders
- Installable Hamad CFA Mastery web app with branded Android, maskable, and iPhone icons
- Repository-path-aware offline app shell; Firebase resumes synchronization when connectivity returns
- Authenticated Firestore synchronization between Mohamed and Hamad
- JSON backup export and import for migration and recovery

No proprietary CFA Institute curriculum prose, question text, answer key, or third-party study material is bundled into the public application. The registered candidate's current 2027 Learning Ecosystem and official errata remain authoritative. Mohamed's private teaching playbooks are generated separately, imported only while signed in as the tutor, and protected by Firestore rules.

## Student experience

The Home view focuses on the next required action. Quick logging supports practice and mistakes without forcing the student through the full data model. Hamad marks independent work directly and sends session completion to Mohamed for approval; only an approved session counts toward progress, reports, or risk signals. **Tutor Admin** is visible only to Mohamed and centralizes the approval queue, launch checklist, rescheduling, and protected reset controls. **Session Mode** is a separate tutor-only live classroom and private-playbook publisher: it keeps each explanation, likely question, and ready-to-speak answer visible together so Mohamed can teach from the tracker without opening the PDF.

## Tutor-only Session Mode

The public repository contains the Session Mode interface and typed content contract, but never the private lesson content. The private Session 01 source and generated JSON remain outside this public repository, under the parent HN3 workspace. Do not copy that JSON, the Tutor Bible PDF, answer keys, or source extracts into `src/`, `public/`, `dist/`, or `dist-pages/`.

The operating flow is:

1. From the parent HN3 workspace, generate and validate the private package on Mohamed's computer with `python scripts/export_hamad_session_01_private_playbook.py`. The default private artifact is `output/json/Hamad_CFA_Level_I_Session_01_Private_Playbook.json`.
2. Open the deployed tracker and sign in with Mohamed's allowlisted `tutor` account.
3. Open **Session Mode**. If Session 01 has not yet been published, choose **Choose private playbook JSON** and select the generated JSON.
4. The importer validates the complete package before publishing its manifest and versioned chunks to tutor-only Firestore paths. A failed or incomplete upload never activates a partial lesson.
5. Before travelling to the lesson, open Session Mode while online and choose **Prepare offline**. Confirm the interface reports **Offline copy ready** on the exact laptop or phone that will be used. This private IndexedDB copy is per tutor account and per device; it is not part of the PWA application shell and is never synchronized to Hamad.
6. On Saturday, 5 September 2026, complete the calculator/workspace preflight, select the recommended 150-minute route, and start at 09:00 Asia/Riyadh. Later checkpoints use their planned 120-minute route.
7. During teaching, use search and filters to reach a command desk quickly. Every desk keeps the explanation, realistic prompt, and spoken answer in view at the same time; evidence and repair actions are saved without turning timer ticks into database writes.
8. Complete the closeout in Session Mode. Detailed run evidence stays tutor-only; only the intended safe progress summary is copied into the shared tracker.

Offline preparation deliberately places private answers on the selected device. Use a device controlled by Mohamed, keep the operating-system account locked, and choose **Remove offline copy** after the session if the device will be shared or retired. The PDF remains an offline recovery reference, not a web asset.

## Runtime data and synchronization

When the four `VITE_FIREBASE_*` values are configured, the application synchronizes shared work at `programs/project-202/tracker/current`. Only authenticated users with an active `tutor` or `student` membership may access it. Private tutor notes use the separate `programs/project-202/tutorPrivate/notes` document, which Firestore rules deny to the student account even when the path is known. Rules also keep schedule, mastery, mock results, and session approvals tutor-controlled.

Session Mode uses separate tutor-only records:

- `programs/project-202/tutorPlaybooks/{playbookId}` stores the active manifest;
- `programs/project-202/tutorPlaybooks/{playbookId}/chunks/{chunkStorageId}` stores immutable, content-hashed, versioned lesson chunks; and
- `programs/project-202/tutorRuns/{runId}` stores private live-run actions and evidence.

Hamad cannot get or list any of these documents. Publishing and live-run writes require an active tutor membership in the deployed Firestore rules; hiding navigation in React is only an additional interface safeguard.

The public brand is **Hamad's CFA Level I Mastery Path**, and the repository plus GitHub Pages path use `hamad-cfa-mastery-path`. The Firebase project ID, Firestore document paths, browser storage keys, calendar event UIDs, package identifiers, and some asset filenames retain their internal legacy `project-202` values intentionally. Changing those remaining infrastructure identifiers would break authentication continuity, synchronized progress, installed-app scope, or calendar deduplication.

The browser retains local state for continuity, but Firestore is the cross-device copy shared by Mohamed and Hamad. JSON export remains the independent recovery format. A deployment without Firebase configuration displays a setup screen instead of opening an unsafe browser-only production tracker.

Cloud snapshots, pending sync records, and JSON imports pass through the same defensive normalizer before they reach the interface. It filters malformed evidence entries, bounds user-entered values, deduplicates record identities, and rejects any session-override map whose complete effective schedule violates program dates, cadence, strict ordering, weekly capacity, or the exam boundary.

Progress from an older hosting origin does not migrate automatically. Export JSON from the old tracker and perform the documented one-time import only after Firebase and GitHub Pages are configured. See [DEPLOY_GITHUB_PAGES.md](DEPLOY_GITHUB_PAGES.md#8-perform-the-one-time-data-migration).

## Canonical data

- `src/data/plan.json` is the source of truth for all 26 weeks and 25 tutor checkpoints. Each week includes its phase, dates, outcomes, checkpoint schedule when applicable, independent work, question target, mastery gate, and mock milestone.
- `src/data/readings.json` contains the 102-module official 2027 outline catalog and its session assignments.
- `src/data/program.json` contains the exam appointment, cadence, Practical Skills Module, and administrative milestone metadata.
- `scripts/build-2027-data.py` reproducibly generates the plan and reading data.
- `../scripts/export_hamad_session_01_private_playbook.py` converts the private Session 01 source into the validated, upload-ready JSON kept outside this repository at `../output/json/Hamad_CFA_Level_I_Session_01_Private_Playbook.json`.
- `firestore.rules` is the production authorization boundary for membership, shared tracker state, tutor-only notes, private playbook manifests/chunks, and private live runs.
- `firebase.json` points the Firebase CLI to the checked-in Firestore rules.
- `.env.example` lists the public Firebase Web App values required by local and Pages builds without containing credentials.

When updating the schedule, preserve these invariants:

1. Exactly 26 consecutive Sunday-to-Saturday weeks, beginning 30 August 2026 and ending 27 February 2027.
2. Exactly 25 consecutively numbered required tutor checkpoints, one in each of Weeks 1-25.
3. Canonical checkpoints are Saturdays at 09:00 Asia/Riyadh. Session 01 lasts 150 minutes; Sessions 02-25 last 120 minutes.
4. A tutor-approved exception may move one checkpoint only to the immediately preceding Friday at the same 09:00 time; it never cascades later sessions.
5. Week 26 has no tutor checkpoint, protects taper and logistics, and presents Saturday 27 February as a separate exam-day milestone and checklist.
6. All 102 official modules appear exactly once and in published order, beginning with Quantitative Methods Module 1.
7. Full-length mocks are independent tasks; numbered tutor checkpoints prepare, debrief, and repair them.

## Local development

Requirements: Node.js 20 or newer and npm.

```powershell
npm install
npm run dev -- --hostname 0.0.0.0 --port 5174
```

Open `http://localhost:5174`.

## Install on a phone or computer

The production GitHub Pages tracker is an installable Progressive Web App. It
opens in a standalone window with the Hamad CFA Mastery icon and caches the application
shell so the interface can reopen during a connection interruption. Firebase
Authentication and Firestore are intentionally never cached by the service
worker; the existing sync indicator continues to show whether shared progress is
current, queued, or offline. Session Mode's optional private playbook cache is a
separate tutor-authorized IndexedDB store created only when Mohamed selects
**Prepare offline**; it is not preloaded or included in the public service-worker cache.

- **Android / Chrome and desktop Chromium:** open the deployed tracker, choose
  **Install app** when Hamad CFA Mastery offers it, and confirm the browser prompt.
- **iPhone / iPad:** open the tracker in Safari, tap **Share**, choose **Add to
  Home Screen**, then tap **Add**. The in-app installation card shows these
  steps because iOS does not provide the same browser installation prompt.

Installation requires the HTTPS production URL (or `localhost` during local
development). After a deployment, refresh the installed app once while online
to allow the new service worker to update its cached shell.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run build:pages
```

Tests protect calendar boundaries, cadence, session numbering, curriculum order and completeness, reading-to-session mappings, mock progression, role capabilities, private playbook validation, Firestore rule contracts, backup normalization, and PWA registration helpers. The Pages build also fails unless its manifest, service worker, branded icon set, and installation metadata are present, and its privacy audit rejects known private Tutor Bible material from the static artifact.

Calendar export opens a settings dialog before download. The canonical checkpoint time is fixed at 09:00 `Asia/Riyadh`; only reminder lead times are configurable and stored in that browser. The resulting `.ics` file ends Session 01 at 11:30 from its 150-minute duration and Sessions 02-25 at 11:00 from their 120-minute durations. It follows any tutor-approved same-week Friday exception, embeds display reminders, and leaves deadlines as all-day events. It is a calendar import file, not an email invitation.

## Deployment

GitHub Pages is the permanent static host, and Firebase Spark provides Authentication and Firestore persistence. `npm run build:pages` creates the Pages-aware artifact in `dist-pages/`. `.github/workflows/deploy-pages.yml` reads the four public Firebase Web App values from GitHub repository variables, obtains the current base path from GitHub Pages, tests the project, builds it, and deploys after a push to `main`. The generated asset and PWA paths therefore adapt to a later repository rename or custom-domain root.

Follow [DEPLOY_GITHUB_PAGES.md](DEPLOY_GITHUB_PAGES.md) for the one-time Firebase project, Authentication users, UID membership allowlist, Firestore rules, authorized Pages domain, GitHub variables, deployment, private-playbook publishing, and legacy-data migration. Firestore rules are deployed separately with the Firebase CLI; the Pages workflow does not change backend authorization. For a release that introduces or changes Session Mode data, deploy rules first, push the tested static application second, and publish the private JSON from the signed-in tutor interface last.

Firebase Web App configuration is safe to ship to the browser, but Firebase Admin credentials are not. Never commit a service-account JSON file, private key, or server credential. Security depends on Authentication, the UID membership allowlist, and the deployed Firestore rules.

The existing `npm run build` command remains available for the separate OpenAI Sites/Cloudflare-compatible artifact.

## Score-target disclaimer

Mock and mastery targets are internal coaching evidence. They are not an official CFA Institute passing score, result prediction, or guarantee.
