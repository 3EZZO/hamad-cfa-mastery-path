# Hamad's CFA Level I Mastery Path

**Hamad's CFA Level I Mastery Path** is a mobile-first study tracker for a 26-week private coaching program running from 30 August 2026 through the 27 February 2027 CFA Level I exam appointment. The first tutor checkpoint is Saturday, 5 September 2026 at 09:00 Asia/Riyadh.

Created by Mohamed Ali, CFA.

The application is isolated from the surrounding HN3 projects. It has its own dependencies, TypeScript configuration, tests, and production builds.

## Program design

- All 102 learning modules in the official public 2027 CFA Level I topic outline, assigned once in published order as independent study
- 25 consecutively numbered, 120-minute tutor checkpoints: one every Saturday at 09:00 Asia/Riyadh from 5 September 2026 through 20 February 2027
- Week 26 is a protected independent taper and exam-execution week, with a separate checklist and no tutor session on the 27 February exam day
- Session 01 combines a structured prior-attempt diagnostic with testing and remediation of Quantitative Methods Modules M001-M004
- Curriculum coverage is assigned through Session 17, followed by integration, seven independent mock-and-repair cycles, and the final taper
- Weekly completion checklists, evidence gates, independent work, and question targets
- Tutor-session, confidence-rated practice, mock, mistake, and note logs
- Student session-completion requests with explicit tutor approval/return workflow
- Shared notes plus separately stored, tutor-only private coaching notes
- Ten-topic mastery board and internal coaching targets
- Tutor-only launch checks, structured Session 01 diagnostic, and safe schedule overrides
- Automatic coaching-risk signals derived from due work, practice evidence, mistakes, and mocks
- Weekly WhatsApp-ready summaries plus print-to-PDF progress reports
- Calendar import for all 25 timed tutor checkpoints and administrative milestones, including the separate 27 February exam appointment, with the fixed 09:00 Riyadh start time and selectable reminders
- Installable Hamad CFA Mastery web app with branded Android, maskable, and iPhone icons
- Repository-path-aware offline app shell; Firebase resumes synchronization when connectivity returns
- Authenticated Firestore synchronization between Mohamed and Hamad
- JSON backup export and import for migration and recovery

No proprietary CFA Institute curriculum prose, question text, or third-party study material is included. The registered candidate's current 2027 Learning Ecosystem and official errata remain authoritative.

## Student experience

The Home view focuses on the next required action. Quick logging supports practice and mistakes without forcing the student through the full data model. Hamad marks independent work directly and sends session completion to Mohamed for approval; only an approved session counts toward progress, reports, or risk signals. The Tutor Console is visible only to Mohamed and centralizes the approval queue, launch checklist, Session 01 diagnostic, rescheduling, and protected reset controls.

## Runtime data and synchronization

When the four `VITE_FIREBASE_*` values are configured, the application synchronizes shared work at `programs/project-202/tracker/current`. Only authenticated users with an active `tutor` or `student` membership may access it. Private tutor notes use the separate `programs/project-202/tutorPrivate/notes` document, which Firestore rules deny to the student account even when the path is known. Rules also keep schedule, mastery, mock results, diagnostics, and session approvals tutor-controlled.

The public brand is **Hamad's CFA Level I Mastery Path**, and the repository plus GitHub Pages path use `hamad-cfa-mastery-path`. The Firebase project ID, Firestore document paths, browser storage keys, calendar event UIDs, package identifiers, and some asset filenames retain their internal legacy `project-202` values intentionally. Changing those remaining infrastructure identifiers would break authentication continuity, synchronized progress, installed-app scope, or calendar deduplication.

The browser retains local state for continuity, but Firestore is the cross-device copy shared by Mohamed and Hamad. JSON export remains the independent recovery format. A deployment without Firebase configuration displays a setup screen instead of opening an unsafe browser-only production tracker.

Cloud snapshots, pending sync records, and JSON imports pass through the same defensive normalizer before they reach the interface. It filters malformed evidence entries, bounds user-entered values, deduplicates record identities, and rejects any session-override map whose complete effective schedule violates program dates, cadence, strict ordering, weekly capacity, or the exam boundary.

Progress from an older hosting origin does not migrate automatically. Export JSON from the old tracker and perform the documented one-time import only after Firebase and GitHub Pages are configured. See [DEPLOY_GITHUB_PAGES.md](DEPLOY_GITHUB_PAGES.md#7-perform-the-one-time-data-migration).

## Canonical data

- `src/data/plan.json` is the source of truth for all 26 weeks and 25 tutor checkpoints. Each week includes its phase, dates, outcomes, checkpoint schedule when applicable, independent work, question target, mastery gate, and mock milestone.
- `src/data/readings.json` contains the 102-module official 2027 outline catalog and its session assignments.
- `src/data/program.json` contains the exam appointment, cadence, Practical Skills Module, and administrative milestone metadata.
- `scripts/build-2027-data.py` reproducibly generates the plan and reading data.
- `firestore.rules` is the production authorization boundary for the membership documents and shared tracker document.
- `firebase.json` points the Firebase CLI to the checked-in Firestore rules.
- `.env.example` lists the public Firebase Web App values required by local and Pages builds without containing credentials.

When updating the schedule, preserve these invariants:

1. Exactly 26 consecutive Sunday-to-Saturday weeks, beginning 30 August 2026 and ending 27 February 2027.
2. Exactly 25 consecutively numbered required tutor checkpoints, one in each of Weeks 1-25.
3. Canonical checkpoints are Saturdays at 09:00 Asia/Riyadh and last 120 minutes.
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
current, queued, or offline.

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

Tests protect calendar boundaries, cadence, session numbering, curriculum order and completeness, reading-to-session mappings, mock progression, role capabilities, backup normalization, and PWA registration helpers. The Pages build also fails unless its manifest, service worker, branded icon set, and installation metadata are present.

Calendar export opens a settings dialog before download. The canonical checkpoint time is fixed at 09:00 `Asia/Riyadh`; only reminder lead times are configurable and stored in that browser. The resulting `.ics` file derives each 11:00 end time from the 120-minute duration, follows any tutor-approved same-week Friday exception, embeds display reminders, and leaves deadlines as all-day events. It is a calendar import file, not an email invitation.

## Deployment

GitHub Pages is the permanent static host, and Firebase Spark provides Authentication and Firestore persistence. `npm run build:pages` creates the Pages-aware artifact in `dist-pages/`. `.github/workflows/deploy-pages.yml` reads the four public Firebase Web App values from GitHub repository variables, obtains the current base path from GitHub Pages, tests the project, builds it, and deploys after a push to `main`. The generated asset and PWA paths therefore adapt to a later repository rename or custom-domain root.

Follow [DEPLOY_GITHUB_PAGES.md](DEPLOY_GITHUB_PAGES.md) for the one-time Firebase project, Authentication users, UID membership allowlist, Firestore rules, authorized Pages domain, GitHub variables, deployment, and legacy-data migration. Firestore rules are deployed separately with the Firebase CLI; the Pages workflow does not change backend authorization.

Firebase Web App configuration is safe to ship to the browser, but Firebase Admin credentials are not. Never commit a service-account JSON file, private key, or server credential. Security depends on Authentication, the UID membership allowlist, and the deployed Firestore rules.

The existing `npm run build` command remains available for the separate OpenAI Sites/Cloudflare-compatible artifact.

## Score-target disclaimer

Mock and mastery targets are internal coaching evidence. They are not an official CFA Institute passing score, result prediction, or guarantee.
