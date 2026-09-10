# Session Mode save regression — 10 September 2026

## Cause and fix

The live `cloud.firestore` release matched this repository. An active tutor
could read a run, but valid navigation, assessment and note saves exceeded
Firestore's 1,000-expression security-rule evaluation limit. The SDK surfaced
this as `permission-denied`. Both sessions were affected; uploading another
playbook could temporarily hide the problem by creating a fresh run.

The live-run validators now bind document maps and event keys once, use default
map lookups for optional navigation fields, and evaluate only the relevant state
transition. Tutor-only access, field limits, immutable run identity, revision
increments and event validation remain enforced. No playbook or progress data
needs to be changed or deleted.

## Regression checks

Run ordinary unit tests with `npm test`. Before publishing changes to these
validators, also run the real Rules engine suite (Node 22.18+ or Node 24):

```text
npm run firestore:rules:test -- <absolute-path-to-firebase-tools-15.28.1-package>
```

Use an existing Firebase CLI login or Application Default Credentials with
permission to test rules in `project-202-tracker`. Do not paste credentials into
scripts. The package path is the directory containing firebase-tools' own
`package.json`, not the CLI executable.

This suite submits synthetic requests to the non-persistent Firebase Rules test
API. It does not publish rules or read/write Firestore documents. It covers both
sessions, each action in running/paused states, complete payloads, long histories,
malformed saves, student/inactive/anonymous access, and terminal-run restrictions.
It uses the application's actual live-run payload builder. The REST evaluator
auto-converts RFC3339 strings to timestamps, so fixture timestamps are prefixed
to retain the string field type actually written by the Firestore SDK.

To reproduce the failure against an older local rules file, append
`--rules <old-rules-file>`. Mocked Firestore unit tests alone cannot detect the
real evaluator's expression limit.

## Deployment and recovery

Deploy **Firestore rules**, not just GitHub Pages. Verify the released source
matches the local file on the production `cloud.firestore` release for the
default database. Never widen access to make a failing save pass.

After propagation, use **Retry** in each affected Session Mode workspace. Pending
device actions remain ordered and retry with their original action identifiers.
No JSON re-upload, cache clearing or session reset is required for this fix.
