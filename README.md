# PROJECT 202

**Hamad's CFA Level I Mastery System** is a mobile-first study tracker for a 28-week private coaching program running from 16 August 2026 through the 27 February 2027 CFA Level I exam appointment. The first tutor session is Wednesday, 19 August 2026.

Created by Mohamed Ali, CFA.

The application is isolated from the surrounding HN3 projects. It has its own dependencies, TypeScript configuration, tests, and production builds.

## Program design

- All 102 learning modules in the official public 2027 CFA Level I topic outline, taught once in published order
- 68 consecutively numbered tutoring sessions
- 16 standard weeks with a Wednesday midweek session and a Saturday weekend session
- 12 intensive weeks that add a Monday session
- Session 01 begins with Quantitative Methods Module 1, `Returns of Financial Assets and Instruments`
- Curriculum coverage in Sessions 01-44, integration in Sessions 45-48, seven mock-and-repair cycles in Sessions 49-66, and taper/exam preparation in Sessions 67-68
- Weekly completion checklists, evidence gates, independent work, and question targets
- Tutor-session, practice, mock, mistake, and note logs
- Ten-topic mastery board and internal coaching targets
- Tutor-only launch checks, structured Session 01 diagnostic, and safe schedule overrides
- Automatic coaching-risk signals derived from due work, practice evidence, mistakes, and mocks
- Weekly WhatsApp-ready summaries plus print-to-PDF progress reports
- One-click calendar export for all 68 sessions and administrative milestones
- Authenticated Firestore synchronization between Mohamed and Hamad
- JSON backup export and import for migration and recovery

No proprietary CFA Institute curriculum prose, question text, or third-party study material is included. The registered candidate's current 2027 Learning Ecosystem and official errata remain authoritative.

## Student experience

The Home view focuses on the next required action. Quick logging supports practice and mistakes without forcing the student through the full data model. Deeper roadmap, curriculum, mock, mastery, evidence, reporting, and backup tools remain available through grouped navigation and progressive disclosure. Firebase Authentication limits the shared tracker to the tutor and student accounts placed on the Project 202 membership allowlist, while the membership role controls which actions each account may perform. The Tutor Console is visible only to Mohamed and centralizes the launch checklist, Session 01 diagnostic, rescheduling, and protected reset controls.

## Runtime data and synchronization

When the four `VITE_FIREBASE_*` values are configured, the application synchronizes one shared document at `programs/project-202/tracker/current`. Only authenticated users with an active `tutor` or `student` document at `programs/project-202/members/{uid}` may access it. Firestore rules give the tutor administrative control while limiting the student to task completion, practice, mistake, and note evidence. They deny all other client paths and prevent the browser from changing the membership allowlist.

The browser retains local state for continuity, but Firestore is the cross-device copy shared by Mohamed and Hamad. JSON export remains the independent recovery format. A deployment without Firebase configuration displays a setup screen instead of opening an unsafe browser-only production tracker.

Cloud snapshots, pending sync records, and JSON imports pass through the same defensive normalizer before they reach the interface. It filters malformed evidence entries, bounds user-entered values, deduplicates record identities, and rejects any session-override map whose complete effective schedule violates program dates, cadence, strict ordering, weekly capacity, or the exam boundary.

Progress from an older hosting origin does not migrate automatically. Export JSON from the old tracker and perform the documented one-time import only after Firebase and GitHub Pages are configured. See [DEPLOY_GITHUB_PAGES.md](DEPLOY_GITHUB_PAGES.md#7-perform-the-one-time-data-migration).

## Canonical data

- `src/data/plan.json` is the source of truth for all 28 weeks and 68 sessions. Each week includes its phase, dates, outcomes, session schedule, independent work, question target, mastery gate, and mock milestone.
- `src/data/readings.json` contains the 102-module official 2027 outline catalog and its session assignments.
- `src/data/program.json` contains the exam appointment, cadence, Practical Skills Module, and administrative milestone metadata.
- `scripts/build-2027-data.py` reproducibly generates the plan and reading data.
- `firestore.rules` is the production authorization boundary for the membership documents and shared tracker document.
- `firebase.json` points the Firebase CLI to the checked-in Firestore rules.
- `.env.example` lists the public Firebase Web App values required by local and Pages builds without containing credentials.

When updating the schedule, preserve these invariants:

1. Exactly 28 consecutive Sunday-to-Saturday weeks, beginning 16 August 2026 and ending 27 February 2027.
2. Exactly 68 consecutively numbered required tutoring sessions.
3. Standard weeks use Wednesday and Saturday; designated intensive weeks add Monday.
4. The exam week uses Wednesday 24 February and Friday 26 February, with Saturday reserved for the exam.
5. All 102 official modules appear exactly once and in published order, beginning with Quantitative Methods Module 1.
6. Full-length mocks are independent tasks; numbered tutoring sessions prepare, debrief, and repair them.

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
npm run build:pages
```

Tests protect calendar boundaries, cadence, session numbering, curriculum order and completeness, reading-to-session mappings, mock progression, role capabilities, and backup normalization.

## Deployment

GitHub Pages is the permanent static host, and Firebase Spark provides Authentication and Firestore persistence. `npm run build:pages` creates the repository-subpath-aware artifact in `dist-pages/`. `.github/workflows/deploy-pages.yml` reads the four public Firebase Web App values from GitHub repository variables, tests the project, builds it, and deploys after a push to `main`.

Follow [DEPLOY_GITHUB_PAGES.md](DEPLOY_GITHUB_PAGES.md) for the one-time Firebase project, Authentication users, UID membership allowlist, Firestore rules, authorized Pages domain, GitHub variables, deployment, and legacy-data migration. Firestore rules are deployed separately with the Firebase CLI; the Pages workflow does not change backend authorization.

Firebase Web App configuration is safe to ship to the browser, but Firebase Admin credentials are not. Never commit a service-account JSON file, private key, or server credential. Security depends on Authentication, the UID membership allowlist, and the deployed Firestore rules.

The existing `npm run build` command remains available for the separate OpenAI Sites/Cloudflare-compatible artifact.

## Score-target disclaimer

Mock and mastery targets are internal coaching evidence. They are not an official CFA Institute passing score, result prediction, or guarantee.
