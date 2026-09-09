# Session 2 integration — 9 September 2026

## Automated verification

The release passes TypeScript checking, the GitHub Pages production build,
the PWA artifact check, the private-content audit, and 194 tests.

New synthetic-fixture tests cover:

- The exact legacy Session 1 run ID and the distinct Session 2 ID.
- Canonical appointments on 12 and 19 September, respectively.
- Private-file identity and integrity checks before publication.
- Rejected uploads retaining the existing classroom.
- Slow Session 1 loads resolving into Session 1 after selecting Session 2.
- Separate UID/run device snapshots and pending Session 1 saves completing
  after switching to Session 2.
- A running clock pausing on a switch, preserving elapsed time and position,
  and remaining paused on return.
- A fresh Session 2 clock with zero elapsed time.
- Route readiness at 48 and 60 decks, missing-card rejection, and the
  120-deck library being excluded from live launch options.
- Searching all 120 library decks, showing Teach/Ask/Answer together, and
  closing the reference view without mutating its source.
- Session 2 closeout metadata and rehearsal cleanup preserving Session 1.

The private Session 2 package was separately validated against the real parser,
hash verifier, adapter, and preflight evaluator. Its content and hashes did not
change during this integration. That package is not included in this repository.

No browser screenshot/interaction QA or authenticated production write was
performed for this release. Component tests run in React's test renderer;
network and recovery stores are mocked. GitHub Actions verifies the deployed
build separately.

## Tutor's one-time activation

1. Refresh the online tracker; in an installed PWA, close and reopen it.
2. Open Session Mode and select **Session 02**.
3. Upload `Hamad_CFA_Level_I_Session_02_Private_Playbook.json` privately.
4. Confirm `s02-2026-09-09-v1`, the 48/60-deck live routes, and the full library
   of 120 decks under Session tools.
5. Prepare offline on the teaching device and run preflight.
6. Switch back to Session 01 to confirm your existing position, notes, and
   progress remain. Do not re-upload or clear Session 01.

Session 2's schedule remains 19 September at 09:00 Riyadh, 120 minutes.
Choosing its 150-minute teaching route changes the live timer, not the calendar.
