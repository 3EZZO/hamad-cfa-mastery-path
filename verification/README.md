# Visual verification

- `project-202-desktop.png`: 1440 × 1000 desktop roadmap viewport with audited-reading coverage.
- `project-202-mobile.png`: 390 × 844 mobile roadmap viewport with audited-reading coverage.

Both captures are produced from the static production preview.

## Unified workspace — September 2026

- `mastery-session-laptop.png`: 1366 × 768, three simultaneously visible teaching panels.
- `mastery-tracker-laptop.png`: 1366 × 768, simplified home workspace and tutor shortcut.
- `mastery-session-mobile.png`: 390 × 844, stacked teaching panels and fixed Next action.
- `mastery-tracker-mobile.png`: 390 × 844, touch navigation and compact dashboard.

These new screenshots use the real React components with **synthetic** teaching
decks, mocked tutor/student state, and external requests blocked. They contain no
private playbook or student records and are not a live Firebase sync test.

Browser interaction checks passed at 1366 × 768, 1536 × 864, 768 × 1024,
390 × 844, and 320 × 740:

- No horizontal page overflow; bounded laptop reading area.
- Teach, Ask, and Answer visible; Next/Space preserves the sequence.
- Phone Next scrolls to the relevant panel.
- Search/no-results, input typing, and disclosure keyboard handling.
- Reading-size selection persists after reload.
- Evidence drawer opens at the evidence step and closes back to Answer.
- Candidate presentation contains the question, not the tutor's model answer.
- Tools menu actions remain accessible; Escape dismisses it.
- Student mode has no tutor Session Mode shortcut or import capability.
- No browser runtime errors during these interactions.
