# PDF Quick check: context, layout and reader controls

Fixes three problems reported from Teach from PDF (screenshot `screenshot2110.png`, kept local):

1. **Mismatched questions.** Questions were chosen from the session's planned modules, then the whole topic.
2. **An oversized overlay** that hid most of the PDF.
3. **Search and exhibit selection** that stayed active behind the quiz.

## Behaviour
- **Matching to the open PDF only:**
  - The open PDF's normalised title and topic are mapped through the existing owner-approved `MOCK_MODULES` → curriculum catalogue mapping, or an exact catalogue title. Example: Portfolio Mathematics → curriculum module 8.
  - PDF reading numbers are never treated as curriculum module numbers.
  - Known Economics upload-title variants have explicit aliases.
  - Unknown, conflicting or unsupported titles show an empty state. There is no session-wide or topic-wide fallback, and the PR does not add or change any question-bank content.
- **Header:** shows the PDF label and its curriculum module number(s) separately, plus the session score once questions have been answered.
- **Switching PDFs:** clears the current question and answer. Session results are kept.
- **Layout:**
  - At 900px and wider, a side panel of about 360–440px; the PDF stays visible beside it with no dark overlay.
  - Below 900px, a compact modal fixed to the viewport, at most 85dvh tall, with a scrollable body and a persistent header and footer.
- **Reader while a check is open:**
  - Opening cancels search and highlights and any unfinished exhibit selection. Late search results are discarded.
  - Kept: the current page, fit/custom zoom and a completed exhibit focus.
  - Conflicting reader controls and shortcuts are suspended, including the parent N and lesson-path keys.
  - In the compact modal, the reader and session toolbars are inert and the existing focus trap applies.
- **Closing:** Escape closes the check and returns focus to the PDF page.
- **Calculator:** while a check is open, it docks inside the question panel, then returns to its floating window. The worksheet state is kept.
- **Unchanged:** dependencies, Firebase rules, authentication, deployment configuration and question-bank content.

## Verification

### Performed (Codex, then Claude)
- Focused tests: `quickCheckMapping.test.ts`, `QuickCheck.test.tsx`, `PdfReader.test.tsx`, `teachingTools.test.ts`.
- `npm run typecheck`, `npm test`, `npm run build:pages`, targeted ESLint and `git diff --check`. Results are in the PR.
- Chrome on a local harness (`tmp/quick-check.*`, git-ignored). It uses the real `PdfTeachingWorkspace`, `PdfReader`, `QuickCheck` and calculator, with synthetic service adapters and a synthetic PDF.
  - **Mapping:** Portfolio Mathematics questions map to module 8. Switching to Fiscal Policy replaced the question and cleared its answer while keeping the score. An unmapped PDF showed the empty state.
  - **Reader state:** search and an unfinished selection were cleared. A completed exhibit focus and a custom zoom of 247% survived opening and closing.
  - **Calculator:** a CF0 entry survived docking.
  - **Focus and keyboard:** Escape returned focus to the PDF page. Keyboard activation of "Another question" reset the choice without double-counting.
  - **Layout:** at 320px and 390px there was no horizontal overflow; the modal footer stayed in view; internal scrolling and focus trapping worked. At 1024px the PDF sat beside an approximately 360px panel.
  - **Theme:** light and dark were checked on the desktop side panel (dark text tokens rgb(242,236,222) on rgb(18,28,48)).
  - **Presentation:** the expanded presentation fallback worked.

### Reported by the owner
- The original defects, in `screenshot2110.png`.

### Static reasoning
- The pool is memoised on banks, PDF title and topic. The panel is keyed to the PDF version, title and topic, so a PDF switch remounts it.
- `inert` is supported by React 19 (the repo uses 19.2).

### Not verified
- Physical touch, real screen-reader speech, Safari and Firefox, and native browser full screen.
- The owner's signed-in view.
- Coverage for each live PDF, which depends on the published Practice bank and the PDFs' library labels.
