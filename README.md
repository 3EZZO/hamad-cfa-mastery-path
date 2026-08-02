# PROJECT 202

**Hamad's CFA Level I Mastery System** is a mobile-first study tracker for a 29-week private coaching program running from 9 August 2026 through the 27 February 2027 CFA Level I exam appointment.

Created by Mohamed Ali, CFA.

The application is isolated from the surrounding HN3 projects. It has its own dependencies, TypeScript configuration, tests, and production builds.

## Program design

- All 102 learning modules in the official public 2027 CFA Level I topic outline, taught once in published order
- 68 consecutively numbered tutoring sessions
- 19 standard weeks with a Wednesday midweek session and a Saturday weekend session
- 10 intensive weeks that add a Monday session
- Session 01 begins with Quantitative Methods Module 1, `Returns of Financial Assets and Instruments`
- Curriculum coverage in Sessions 01-44, integration in Sessions 45-48, seven mock-and-repair cycles in Sessions 49-66, and taper/exam preparation in Sessions 67-68
- Weekly completion checklists, evidence gates, independent work, and question targets
- Tutor-session, practice, mock, mistake, and note logs
- Ten-topic mastery board and internal coaching targets
- JSON backup export and import

No proprietary CFA Institute curriculum prose, question text, or third-party study material is included. The registered candidate's current 2027 Learning Ecosystem and official errata remain authoritative.

## Student experience

The Home view focuses on the next required action. Quick logging supports practice, tutoring sessions, and mistakes without forcing the student through the full data model. Deeper roadmap, curriculum, mock, mastery, evidence, and backup tools remain available through grouped navigation and progressive disclosure.

## Important data limitation

Progress is saved only in the current browser's `localStorage`. It does not automatically sync between the tutor's and student's devices or between hosting domains. Export a JSON backup regularly and import it on another device or a newly deployed URL when needed.

The app can later be connected to an authenticated database without changing the canonical plan.

## Canonical data

- `src/data/plan.json` is the source of truth for all 29 weeks and 68 sessions. Each week includes its phase, dates, outcomes, session schedule, independent work, question target, mastery gate, and mock milestone.
- `src/data/readings.json` contains the 102-module official 2027 outline catalog and its session assignments.
- `src/data/program.json` contains the exam appointment, cadence, Practical Skills Module, and administrative milestone metadata.
- `scripts/build-2027-data.py` reproducibly generates the plan and reading data.

When updating the schedule, preserve these invariants:

1. Exactly 29 consecutive Sunday-to-Saturday weeks, beginning 9 August 2026 and ending 27 February 2027.
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

Tests protect calendar boundaries, cadence, session numbering, curriculum order and completeness, reading-to-session mappings, mock progression, and backup normalization.

## Deployment

GitHub Pages is the recommended permanent host because this is a static, browser-only tracker. `npm run build:pages` creates the repository-subpath-aware artifact in `dist-pages/`, and `.github/workflows/deploy-pages.yml` tests, builds, and deploys it automatically after a push to `main`.

Follow `DEPLOY_GITHUB_PAGES.md` for the one-time repository and Pages setup. The existing `npm run build` command remains available for the separate OpenAI Sites/Cloudflare-compatible artifact.

## Score-target disclaimer

Mock and mastery targets are internal coaching evidence. They are not an official CFA Institute passing score, result prediction, or guarantee.
