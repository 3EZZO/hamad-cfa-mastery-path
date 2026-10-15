# Prompt for Claude Code

Copy the text below into Claude Code with this repository open. The storage design has been revised to owner-approved Firestore raw binary chunks; read the current rollout guide too.

```text
Implement the full version-one feature specified in:
docs/pdf-teaching-implementation-plan.md

Repository:
C:\Users\Administrator\OneDrive\Documents\HN3\hamad-cfa-project-202

Read CLAUDE.md and GEMINI.md, then read the entire implementation plan before editing. Recheck the actual repository state and adapt file names to the current code without changing the agreed user experience.

The goal is a tutor-first PDF teaching alternative/complement to Session Mode. I must be able to open the 11 branded PDFs during a session, teach Hamad from them, keep private tutor notes, and explicitly share selected PDF versions with his approved student account. Hamad should only see what I share. His reader is independent of mine.

This prompt is my explicit approval to execute this plan locally. It satisfies the initial plan-before-substantial-edits approval requirement in CLAUDE.md for this feature. State a short execution outline and then proceed; do not stop merely to ask me to approve the same plan again.

I explicitly authorize the local frontend/service implementation, intentional compatible dependency additions, necessary local Firestore rule changes, emulator configuration, tests, scoped deployment-configuration edits, ignore rules and documentation described in the plan. These are feature work, not incidental cleanup. Use synthetic accounts and records for testing.

Preserve all existing uncommitted work. Use a safe claude/pdf-teaching-materials branch/worktree without stashing, resetting or overwriting my changes. The real source PDFs are local under output/pdf/ in the repository above; protect them from Git and public builds. Do not regenerate them or copy them into public assets. If working in a separate worktree, read the private assets from the original checkout without committing them.

Implement all core phases, including server-enforced access, the reader, PDF-only teaching without a playbook, safe switching to/from Guided Session, one canonical session clock, private notes, selective share/revoke/re-share, student Session materials, and revision-aware opened receipts. Preserve guided evidence/drafts, current run IDs, rehearsal isolation and existing closeout behavior. Opening or sharing a PDF must not imply mastery or task completion.

Read docs/pdf-teaching-rollout.md for the current Firestore-only architecture. Use the existing Firebase app and active membership model. Store PDFs as immutable raw binary Firestore Bytes chunks (900 KiB/chunk, 5 MiB/file), published atomically with their manifest and catalog pointer. The owner deliberately approved this alternative to Cloud Storage to remain on the free Spark plan. Private byte reads require active membership and the exact active student/version grant. Do not use public URLs, client-only hiding, base64 strings, Cloud Storage, a new backend or a new authentication system. Verify against isolated Auth/Firestore emulators with a demo project ID; never fall back to live Firebase for tests.

Keep version-one scope focused. Defer permanent annotations, live page synchronization, offline PDF downloads and AI features. A presenter pointer is optional after the core requirements pass.

Run meaningful focused tests and actual browser QA as specified, then the repository checks in order: npm run typecheck, npm run test, npm run build:pages, and git diff --check. Run the new executable permission tests explicitly. Verify the GitHub Pages base path and that private assets do not enter the build. Use real local PDFs only in local-only preview; committed test fixtures must be synthetic.

Do not commit, push, create/update a PR, merge, deploy, enable billing, change live Firebase rules/auth/configuration, upload production PDFs, or send materials to Hamad's real account. Prepare those steps for review; each requires a separate explicit instruction. Do not run production-writing tests.

Continue through the authorized local work without unnecessary permission questions. Ask only when a material product choice or external access truly blocks progress, and complete independent work first. Maintain a concise implementation checklist and progress updates.

At completion, report changes, verification in CLAUDE.md's four categories, remaining setup/production gaps, Git/PR/deployment state, and any background processes left running. Include the exact documented steps needed to make the feature live. Do not describe local/emulator success as production deployment.
```
