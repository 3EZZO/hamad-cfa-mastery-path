# BA II Plus implementation and verification

Target: the standard BA II Plus, using TI's documented worksheets and physical
key layout. This is an independent implementation, not TI firmware emulation.
Professional-only NFV, MOD/MIRR, PB, DPB and DUR are outside this target.

## Controls and worksheets

| Area                  | Implemented behavior                                                                                | Evidence                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| TVM                   | N, I/Y, PV, PMT, FV; independent P/Y and C/Y; END/BGN; xP/Y; clear and recall                       | Existing TVM tests, conventional loan/investment round trips, key sequences                               |
| Cash flows            | CF0 and 24 Cnn/Fnn groups, insert/delete, NPV with separate I, IRR                                  | TI's edited cash-flow example: NPV 7,266.44 at 20%, IRR 52.71%                                            |
| Amortization          | P1/P2, BAL/PRN/INT, next interval, per-period rounding                                              | TI's mortgage example: first nine payments BAL 118,928.63, PRN -1,071.37, INT -5,490.80                   |
| Bonds                 | Price, yield, accrued interest; annual/semiannual, ACT and 30/360                                   | TI's 7% coupon/8% yield example PRI 98.56, AI 3.15; coupon dates and month ends                           |
| Depreciation          | SL, SYD, DB and DBX; partial first year, salvage and annual rounding                                | TI's fractional-year SL example and schedule invariants; DBX crossover test                               |
| Regional depreciation | SLF and DBF available with European formats                                                         | Owner-confirmed physical readings for SLF leap-year proration and DBF crossover, with and without salvage |
| Statistics            | 50 data pairs, frequency-weighted 1-V, LIN/Ln/EXP/PWR regressions, predictions and sums             | Known coefficients, weighted statistics and high-offset variance tests                                    |
| Other worksheets      | Percent change/compound growth, interest conversion, dates/day count, profit margin, breakeven      | Independent formula examples and end-to-end key sequences                                                 |
| Math                  | Chain/AOS, parentheses, percent, powers/roots, log/exp, trig/inverse/hyperbolic, factorial, nPr/nCr | TI arithmetic and combinatorics examples; DEG/RAD and precedence tests                                    |
| Memory/settings       | M0–M9, STO/RCL arithmetic, MEM, ANS, K, seeded random, ROUND, decimal/date/separator formats        | Key-sequence tests; date preservation during format changes and clearing                                  |
| Power/lifecycle       | ON/OFF, five-minute automatic power down, confirmed RESET, workbook retained while popup closes     | Reducer and component lifecycle tests; browser reopen check                                               |

## Usage changes from the earlier app calculator

- Enter worksheet values with **ENTER**, then browse with the arrows. Browsing
  without ENTER discards the unconfirmed entry.
- Select END/BGN through **2ND BGN**, then **2ND SET**. **2ND QUIT** returns to
  ordinary calculations.
- Store/recall memory using **STO/RCL**, then a digit from 0 through 9.
- NPV's discount rate **I** is independent of TVM's **I/Y**.
- Changing DEC changes display precision. **2ND ROUND** changes the stored
  number; amortization and depreciation also use the selected rounding.
- The physical backspace key and keyboard Backspace remove one entered digit.
  CE/C clears an entry; CLR WORK and CLR TVM clear their respective registers.
- Keyboard digits, arithmetic, parentheses, Backspace and Enter are supported.
  N/I/P/M/F address TVM registers; C selects CPT. Enter evaluates ordinary
  arithmetic and stores worksheet entries. Popup hosts keep their focus guards.

Workbook state is held in memory per host's stable React state setter. It is
retained across closing/reopening that host's calculator, isolated from another
host, and lost on page reload. The expanded worksheet workbook is not persisted
to Firebase or localStorage. Existing practice logging still saves displayed
values and TVM register snapshots through its existing persistence path.

## Verification categories

**Performed by Codex:** targeted numerical/reducer/component tests; native
Chrome keyboard arithmetic (12 + 3 = 15); keyboard input outside the scoped
calculator leaves its display unchanged; floating layout retains its workbook;
arrow-key movement/resizing; desktop and 390 × 844 mobile layout inspection;
mobile scroll area has no horizontal overflow; browser console without warnings
or errors during these checks. The browser fixture imports only calculator
components and synthetic numbers, without Firebase initialization.

The browser also reproduced the corrected SLF result of 1,436.07 and the EXP
regression example a=2, b=3, predicted Y=162 at X=4. A final input guard rejects
CPT on settings and input-only fields without changing their stored values.

The initial full-suite run found one legacy expectation that Backspace logged
CE/C. That integration test now verifies two-digit entry, single-digit deletion,
the edited display and the distinct backspace log entry.

**Reported by owner:** SLF on 15 March 2024, LIF=5, CST=10,000, SAL=1,000: DEP=1,436.07 in year 1 and 1,800.00 in year 2. DBF=200, LIF=5, M01=7, CST=10,000: with SAL=1,000, DEP=1,152.00 in year 4 and 728.00 in year 5; with SAL=0, DEP=1,440.00 in year 5. These focused readings supersede the earlier provisional DBF year-5 value. Hardware model revision was not recorded.

**Static reasoning:** formulas follow the TI guide's formula appendix where
provided. UTC calendar arithmetic avoids daylight-saving shifts. Grouped cash
flows are summed without expanding up to 239,976 individual periods. Workbook
isolation follows the existing host setters and does not change rehearsal or
student persistence.

**Still unverified:** exhaustive physical-device
key-sequence/error-code/rounding equivalence; actual touch-device ergonomics.
JavaScript binary arithmetic rounded to 13 significant digits approximates TI's
internal decimal precision, so last-digit differences can occur. Rate solvers
return a bracketed root or a calculation error; cash flows or TVM problems with
multiple roots do not have a guaranteed unique financial answer. The seeded
random generator is deterministic here and is not claimed to reproduce TI's
random sequence.

SLF uses actual days remaining in the starting calendar year, including leap-year length. DBF counts the initial partial calendar year as a whole year for the remaining life used at crossover. DBX retains fractional remaining life. The hardware cases distinguish these methods.

EXP follows TI's Y=a*b^X model, and nonlinear-model summaries use the transformed data specified in the guide. Bond yield solving allows overflowing trial prices to retain their sign while enforcing numeric range on final results. Decimal rounding shifts the decimal representation to avoid binary half-cent errors. The 30/360 date calculation follows the guide's 31st-day adjustments, including reverse-date inputs.

Final local checks on October 21, 2026:

- TypeScript: passed.
- Full Vitest suite: **855 tests passed, 137 files**, including 107 focused calculator tests.
- ESLint for changed calculator implementation and dedicated tests: passed.
- Prettier for the formatted calculator files and this document: passed.
- `build:pages`: passed, including PWA/Pages artifact verification and the
  private-content audit of 70 public files against 19 private teaching PDFs.
- The build emitted nonblocking warnings for the existing classic theme-init
  script and mixed static/dynamic imports of `cloud.ts`; neither file changed.
- Feature branch: `gemini/ba2plus-complete`. The delivery report records the
  published commit and PR; the owner merges manually.
- The isolated Vite development server started for these checks was stopped.

## Professional appearance update — October 21, 2026

The visual reference is the [TI BA II Plus Professional product photo](https://education.ti.com/en/products/calculators/financial/baii-plus-professional).
The interactive face uses a black moulded casing, red Professional wordmark,
recessed green-grey LCD, locally drawn SVG numerals, dark raised keys and silver
TVM key rims. The TI emblem path comes from the official education site's
[vector wordmark](https://education.ti.com/-/media/ti/education/images/global-images/logos/ti-logo-web-193x25.svg).
Worksheet guidance sits below the casing. Screen readers receive the original
display string and active modes instead of the decorative SVG segments.

This is an appearance update to the standard BA II Plus engine described above.
Professional-only features such as NFV, MIRR, payback and modified duration are
not added by the Professional styling. Touch pointers retain 44px key heights;
the face is consequently taller than the reference on those devices.

**Performed by Codex:** 22 focused component/theme/touch-contract tests passed;
TypeScript, targeted ESLint and Prettier passed; all 855 tests in 137 files
passed; the Pages build, PWA checks and private-content audit passed. The existing
theme-init script and mixed cloud import build warnings remain. In native Chrome
with synthetic fixtures and the app's styles, arithmetic, keyboard entry,
backspace, keyboard scoping and visible focus passed. Floating-window keyboard
movement/resizing and CF0=42 retention across closing/reopening passed. Light
and dark themes preserved the hardware colours. Same-origin iframe viewports
at 320 and 390 pixels had no horizontal overflow; the compact panel scrolled to
the lower keys, and 7 × 6 displayed 42.00 at 320 pixels.

**Reported by owner:** the owner is trying the separate local preview; no formal
acceptance of the final appearance has been recorded.

**Static reasoning:** calculation, worksheet, storage and logging implementations
are unchanged. Local SVG paths and CSS need no third-party runtime asset calls.

**Still unverified:** exact photographic/physical-dimension equivalence, actual
touch hardware ergonomics, and screen-reader speech on a real assistive device.
The source-contract tests cover touch styling; narrow browser viewports do not
emulate a physical touch device. Local verification does not deploy the update.

## CSS hardware realism refinement — October 21, 2026

The face now uses a measured 250 × 485 coordinate system. A single container
unit scales the casing, faceplate, legends, LCD and keypad together. The desktop
height/width ratio is 1.94, including inside the existing zoomed floating panel.
CSS adds separate key sockets, raised top facets and sidewalls, neutral plastic
grain, restrained lighting and a recessed glass overlay. Local SVG numerals use
taller segments with space for comma tails. Photographs are comparison references
only; the shipped calculator face has no photographic background or new assets.

Key feedback lasts 90ms for pointer and keyboard actions, with timer cleanup on
unmount. Logical 2ND/CPT modes remain in the display after the physical key rises.
The feedback does not change calculator values or consume the 2ND prefix. A new
regression test checks release while the second-function mode remains selected.
Reduced-motion preferences disable movement and transitions. Touch pointers use
44px-high keys and a wider keypad, with a taller body to avoid overlap; that touch
profile deliberately differs from the desktop proportions.

**Performed by Codex:** 23 focused component/theme/touch-contract tests, targeted
ESLint and Prettier, TypeScript, the full suite (856 tests in 137 files), and the
Pages/PWA/privacy build checks passed. Native Chrome with isolated synthetic
fixtures and app styles verified arithmetic, backspace, keyboard scoping/focus,
momentary keyboard feedback, floating movement/resizing and CF0=42 after reopen.
Measured floating-panel face ratios remained approximately 1.94 before/after
resizing. Error 1 text, blank power-off output, negative scientific output,
European 1.234,56, date 12-31-1990 and worksheet labels rendered. The European
value's ink bounds were inside its SVG viewport. Hardware colours stayed fixed
between light and dark themes. A comparison screenshot shows the CSS face beside
TI's reference photo at the same size.

Same-origin 320- and 390-pixel iframe viewports exercised the production touch
rules with their media condition enabled in the ignored verification fixture.
Keys measured 44px high, no horizontal overflow occurred, the compact panel
scrolled, and lower-row calculations displayed 42.00 and 72.00 respectively.
This checks the touch layout with a desktop pointer, not physical touch input.

**Reported by owner:** the owner accepted the previous Professional-style
appearance and requested this more realistic refinement in one PR. Acceptance
of this final refinement has not yet been reported.

**Static reasoning:** the calculation engine, worksheet behaviour, workbook
storage and logging payloads are unchanged. Only presentation feedback adds a
short-lived timer. Texture and shadows are static; key movement animates only
transforms. There are no new packages, persistence changes or runtime asset calls.

**Still unverified:** exact photographic equivalence, physical touch ergonomics,
screen-reader speech and Safari/Firefox rendering. The browser checks used
current Chrome with container-relative CSS units; the older-browser base-size
fallback was not exercised. Actual printed glyph shapes can vary with system
font rendering. The owner merges manually; this record is not deployment proof.

## Movable calculator in Practice - October 21, 2026

Practice now uses the same `FloatingCalculator` as module tests and PDF teaching.
On desktop, drag its title bar to move it and its corner to resize it; the two
handles also support arrow keys. The existing per-device geometry storage uses
a separate `practice` key, leaving module-test and teaching placements independent.
The former modal drawer/backdrop is removed, so questions remain interactive.
Calculator keyboard shortcuts are scoped to the panel; Escape inside closes
without logging a clear, and keys on question controls do not enter calculations.
Close receives initial focus after the panel's hidden placement measurement and
returns focus to the current calculator toggle. Opening a set with the tool
already open retains those behaviours. Narrow screens retain the shared scrollable
bottom panel rather than free movement/resizing.

**Performed by Codex:** 26 focused practice/floating tests passed, including three
new regressions for question interaction/keyboard isolation, persisted geometry,
and hub-to-set focus/Escape. Targeted ESLint, TypeScript, the full test suite
(859 tests in 137 files), and the Pages/PWA/private-content build checks passed.
Native Chrome using the actual PracticeCoach and synthetic data adapters verified
pointer dragging/resizing, arrow-key controls, 12 + 3 = 15, answer selection and
submission while open, outside-key isolation, Escape/Enter closing, focus return,
and the saved size/position on reopen. A 390 x 844 iframe exercised the real
compact breakpoint: no horizontal overflow, internal calculator scrolling and
Enter on Close worked. This is a desktop-browser layout check, not physical touch.

**Reported by owner:** the calculator already moves/resizes in module tests and
PDF teaching; the owner requested the same desktop controls in Practice. No
owner acceptance of this added integration has yet been reported.

**Static reasoning:** Practice reuses the existing panel and geometry model;
calculator calculations, worksheets and answer-log payloads are unchanged. The
existing role, rehearsal and offline/cloud persistence tests remain passing.
The shared panel gains an optional Close ref and a compact Close Enter guard.

**Still unverified:** physical touch hardware, real screen-reader speech,
Safari/Firefox, and production use after manual merge. Synthetic browser adapters
prevented reads/writes of real student records during verification.

## References and repeatable checks

- [TI BA II Plus guidebook](https://education.ti.com/html/eguides/financials/pdfs/EN/BA-II-PLUS_EN.pdf): worksheet chapters and formula appendix.
- [TI depreciation variables](https://education.ti.com/html/eguides/financials/baiiplus/en/Content/M_DepreciationWS/DPW_DepreciationVariables.HTML): method availability, inputs, clearing and rounding.
- [TI depreciation worked example](https://education.ti.com/en/customer-support/knowledge-base/financial-calculators/product-usage/11244).

```text
npm test -- src/lib/calculator.test.ts src/lib/calculatorWorksheets.test.ts src/lib/ba2Machine.test.ts src/features/practice/BA2Plus.test.tsx src/features/practice/floatingCalculator.test.tsx
npm run typecheck
npm test
npm run build:pages
```

Full-app final-check outcomes are recorded in the accompanying delivery report.
Local checks do not publish or deploy the app.
