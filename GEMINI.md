# Hamad CFA Mastery Path - Gemini Facts

## Architecture & Tooling
- **Framework:** React 19 + TypeScript.
- **Build Systems:** Vite for GitHub Pages (production target), Vinext for alternate Sites path.
- **Database & Auth:** Firebase Authentication and Cloud Firestore.
- **Styling & UI:** Custom CSS (`styles.css`, `theme.css`), Lucide icons, Recharts.
- **Testing:** Vitest and React component tests (`react-test-renderer`).
- **Offline Capabilities:** PWA with offline behavior, caching practice and tutor states locally via IndexedDB.

## Principal Application Areas
- **Tracker:** 
  - `src/App.tsx` (Main shell, navigation, and tracker views)
  - `src/styles.css`, `src/theme.css`
  - `src/lib/cloud.ts`, `src/hooks/useTrackerSync.ts`, `src/lib/permissions.ts`, `firestore.rules` (Persistence, sync, auth)
- **Tutor Session Mode (Live Session):** 
  - `src/components/TutorSessionWorkspace.tsx`
  - `src/features/liveSession/`
  - `src/data/plan.ts`, `src/lib/tutorSessionCatalog.ts` (Schedule/catalog)
- **Student Practice:** 
  - `src/features/practice/PracticeCoach.tsx`
  - `src/features/practice/practiceCoach.css`
  - `src/lib/practiceEngine.ts`, `src/lib/practiceContent.ts`, `src/lib/practiceOffline.ts`

## Working Instructions & Guidelines
1. **Branching:** Work exclusively in a `gemini/<task-name>` branch (e.g. `gemini/onboarding`).
2. **Design Direction:** Preserve the existing professional visual direction. Use existing theme tokens, keep neutral surfaces, and maintain the compact laptop layout for Tutor Mode. Ensure mobile practice has comfortable touch targets.
3. **Session Mode Rules:** Teach, Ask, and Answer must remain available together. Preserve keyboard shortcuts, session-specific progress, and isolation of Rehearsal from saved student progress.
4. **Practice Rules:** Maintain offline saves, cloud sync, adaptive selection, and Exam mode behaviors. Do not introduce automatic advancement for ordinary practice.
5. **Data Privacy:** 
   - Never commit private tutor playbooks, PDF answers, real user records, `.env` files, or secrets.
   - Use synthetic fixtures for tests.
   - Do not replace Firestore rules with client-side checks or weaken privacy checks.
6. **Testing & Publication:**
   - Run `npm test` to verify Vitest tests.
   - Run `npm run build:pages` to verify the GitHub Pages deployment path (including TypeScript checks and privacy verification).
   - Only publish to a branch/PR and do not push directly to `main` unless explicitly requested.
