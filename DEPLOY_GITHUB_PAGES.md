# Hamad CFA Mastery: GitHub Pages and Firebase deployment

GitHub Pages is the permanent static host for **Hamad's CFA Level I Mastery Path**. Firebase Spark supplies the two capabilities a static host cannot provide: authenticated access and synchronized Firestore data for Mohamed and Hamad.

This setup uses no server credential in the browser. The Firebase Web App configuration is public by design; access is enforced by Firebase Authentication and `firestore.rules`.

The public name is independent from the infrastructure identifiers. The GitHub repository is `hamad-cfa-mastery-path`, while the existing `project-202-tracker` Firebase project ID, `programs/project-202/...` Firestore paths, package identity, storage keys, and calendar UIDs remain unchanged. Keeping those internal identifiers preserves authentication, synchronized progress, offline preferences, and stable calendar updates without displaying the former brand in the tracker.

## 1. Create the Firebase Spark project

1. Open the [Firebase console](https://console.firebase.google.com/) and create a project. Keep it on the no-cost **Spark** plan; Google Analytics is optional.
2. In **Project settings > General > Your apps**, add a Web App named `Hamad CFA Mastery Tracker`. If the existing app still has its former nickname, you may edit that nickname without changing its App ID.
3. Copy these four values from the Web App configuration:

   | Firebase configuration field | Project environment variable |
   | --- | --- |
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

Do not copy a service-account JSON file, private key, Firebase Admin credential, or any other server secret into this repository.

## 2. Configure Authentication

1. In **Build > Authentication > Sign-in method**, enable **Google** and **Email/Password**. Google is the easiest day-to-day option; Email/Password is the fallback.
2. For Email/Password access, create Mohamed's and Hamad's accounts in **Authentication > Users**. For Google access, each person signs in once after the first Pages deployment; the account will be created but Firestore will correctly deny tracker access until its UID is allowlisted in step 3. Record each account's immutable Firebase **UID**.
3. In **Authentication > Settings > Authorized domains**, add the GitHub Pages hostname:

   `YOUR-ACCOUNT.github.io`

   Add only the hostname, without `https://` or the repository path. If a custom domain is introduced later, add that hostname as well. To test Authentication with the preview command below, temporarily authorize `127.0.0.1` too; remove it after verification if local sign-in is no longer needed.
4. Do not add a public sign-up screen. Creating or signing into an Authentication account alone does not grant tracker access; Firestore membership is also required.

If Email/Password is used, choose long, unique passwords and store them in a password manager. Password-reset and verification messages are sent by Firebase, not by this repository.

## 3. Create Firestore and the membership allowlist

1. In **Build > Firestore Database**, create the database in Production mode. Choose the intended region carefully because the location cannot be changed later.
2. In the Firestore console, create the parent document `programs/project-202`. A simple field such as `name = Hamad's CFA Level I Mastery Path` is sufficient. Keep the document ID `project-202` so existing rules and synchronized data continue to work.
3. Under that document, create the `members` subcollection. Use the Firebase Authentication UID as each document ID:

   - `programs/project-202/members/MOHAMED_UID`
     - `active`: Boolean `true`
     - `role`: String `tutor`
   - `programs/project-202/members/HAMAD_UID`
     - `active`: Boolean `true`
     - `role`: String `student`

The client reads only its own membership record so the interface can apply the correct role. It cannot create, list, edit, or delete membership documents. To revoke access, change that member's `active` field to `false` in the Firebase console and disable the Authentication account.

The synchronized tracker document is `programs/project-202/tracker/current`. The tutor account creates it through the first cloud save, confirmed import, or pre-launch reset. The student account cannot initialize or administratively replace the shared document.

## 4. Deploy the Firestore rules

From this project directory, authenticate the Firebase CLI and deploy only the checked-in rules:

```powershell
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

The rules intentionally allow:

- a signed-in user to read only their own membership document;
- either active role to read `tracker/current`;
- the tutor role to create and administer the complete shared tracker state and approve session completion;
- the student role to update independent/evidence completion, session approval requests, confidence-rated practice, mistakes, and shared notes;
- only the tutor role to read or write `programs/project-202/tutorPrivate/notes`;
- no client to list or edit the membership allowlist;
- no client access to any other Firestore path;
- no client deletion of the tracker document.

Repeat the deploy command after every intentional change to `firestore.rules`. Rules are not deployed by the GitHub Pages workflow. For this release, deploy the backward-compatible rules before publishing the new Pages build so the new session-approval fields and private-note path are authorized when the client becomes live.

When a release changes both rules and the web client, deploy the rules first, then deploy Pages. The weekly-plan rules require `scheduleVersion = weekly-saturday-v1` on the next write. Sign in as Mohamed first after the Pages deployment so the tutor account can publish the migrated or reset baseline before Hamad uses the updated tracker.

## 5. Configure and verify locally

Copy the example file to an ignored local file and enter the four Web App values:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Then test the repository-path build:

```powershell
$env:BASE_PATH = "/hamad-cfa-mastery-path/"
npm ci
npm test
npm run build:pages
Remove-Item Env:BASE_PATH

# Mount the artifact exactly as GitHub Pages will mount it. Vite's preview
# server does not remount files copied from public/ below the configured base.
$previewRoot = Join-Path $env:TEMP "project-202-pages-preview"
$previewApp = Join-Path $previewRoot "hamad-cfa-mastery-path"
New-Item -ItemType Directory -Force -Path $previewApp | Out-Null
Copy-Item -Path "dist-pages\*" -Destination $previewApp -Recurse -Force
python -m http.server 4175 --bind 127.0.0.1 --directory $previewRoot
```

Open `http://127.0.0.1:4175/hamad-cfa-mastery-path/`, sign in, and confirm that an unlisted test account receives no Firestore access. Delete or disable the test account afterward.

This repository-path mount also verifies the PWA files. Browser installation
normally requires HTTPS; GitHub Pages supplies HTTPS automatically. Service
workers are also allowed on localhost/127.0.0.1 for local verification. In
Chrome DevTools, check **Application > Manifest** for the Hamad CFA Mastery icon set
and **Application > Service workers** for the scoped worker.

## 6. Configure GitHub and deploy Pages

1. Create an empty GitHub repository named `hamad-cfa-mastery-path`.
2. In **Settings > Secrets and variables > Actions > Variables**, create these four repository variables with the Web App values:

   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`

   These are repository **variables**, not GitHub secrets. The workflow fails early if any one is missing.
3. In **Settings > Pages**, set **Source** to **GitHub Actions**.
4. Connect and push the existing branch:

   ```powershell
   git remote add origin https://github.com/YOUR-ACCOUNT/hamad-cfa-mastery-path.git
   git push -u origin main
   ```

5. In the **Actions** tab, wait for **Deploy tracker to GitHub Pages** to complete. For the suggested repository name, the URL is:

   `https://YOUR-ACCOUNT.github.io/hamad-cfa-mastery-path/`

Every later push to `main` tests, builds, and redeploys the static tracker. It does not redeploy Firestore rules.

The workflow runs `actions/configure-pages` before the Vite build and uses the base path returned by GitHub Pages. This keeps scripts, styles, the manifest, and the service worker correctly scoped after a later repository rename or when a custom domain changes the site to the domain root.

### If the repository/Pages name changes again later

1. In the GitHub repository, open **Settings > General > Repository name** and enter the chosen slug.
2. Update the local remote URL with `git remote set-url origin https://github.com/3EZZO/NEW-REPOSITORY-NAME.git`. Do not rename the Firebase project or any Firestore document.
3. Update `PROJECT_202_TRACKER_URL` in `src/lib/calendarExport.ts`, the path-specific PWA test, and the examples in this guide.
4. Run the **Deploy tracker to GitHub Pages** workflow again, or push the next tested commit to `main`.
5. In **Settings > Pages**, confirm the new published address. The workflow derives the new repository base path automatically.
6. Open the new URL, sign in as Mohamed, wait for **Synced**, and verify the same progress. Firebase Authentication needs no change when the hostname remains `3ezzo.github.io`.
7. Re-share the new URL, update bookmarks, reinstall the PWA from the new address, and import a newly generated calendar so its event links use the new URL.

For a separately purchased custom domain, add it in **Settings > Pages > Custom domain**, create the DNS records GitHub shows, wait for verification, enable **Enforce HTTPS**, and add the exact custom hostname under **Firebase Authentication > Settings > Authorized domains**. No Firebase data-path migration is required.

After the first PWA deployment, open the Pages URL online once before installing.
On Android or desktop Chromium, use the Hamad CFA Mastery **Install app** card. On
iPhone or iPad, use Safari's **Share > Add to Home Screen** flow. The service
worker caches only the hosted application shell; Firebase Authentication and
Firestore requests remain network-controlled and resume through the tracker's
existing synchronization queue when connectivity returns.

## 7. Perform the one-time data migration

Data belongs to a browser origin, so the old hosted tracker and the new GitHub Pages tracker do not share `localStorage`.

1. Before changing deployments, open the current tracker and use **Export JSON**. Keep the downloaded backup unchanged.
2. Complete the Firebase and GitHub Pages setup before either user records new work on the Pages URL.
3. Open the Pages URL in Mohamed's browser and sign in with the allowlisted tutor account.
4. Use **Import JSON** once and select the backup from step 1. Confirm the replacement prompt.
5. Wait for the tracker to report that cloud data is saved or synchronized. Refresh the page and verify that the imported progress remains.
6. Sign in from a second browser with Hamad's allowlisted account and verify that the same progress appears.
7. Keep the migration backup offline until both accounts have been verified. Continue periodic JSON exports as recovery snapshots.

Do not import the same legacy backup independently from both accounts. The first verified import becomes the shared cloud baseline.

### Weekly-plan reset for the August 2026 launch

The previous build used a materially different 68-session schedule. The new client marks the fixed Saturday plan as `weekly-saturday-v1`. When it reads an older snapshot, it keeps independent evidence such as practice, mistakes, mocks, shared notes, and topic mastery, but clears schedule-bound task completion, session logs, approvals, diagnostics, and overrides so old session IDs cannot be mistaken for new checkpoints.

No genuine course work has begun for this launch, so use the clean authoritative path:

1. Deploy the revised `firestore.rules` before the Pages build.
2. Deploy Pages, then open the updated URL as Mohamed; do not ask Hamad to open it yet.
3. Wait for **Synced**, open **Tutor Console**, and select **Export and reset**.
4. Enter `RESET HAMAD MASTERY` exactly. The tracker downloads a JSON recovery copy before replacing the shared state.
5. Wait for **Synced** again, refresh, and confirm Session 01 is Saturday 29 August 2026 and the plan shows 26 checkpoints.
6. Only then ask Hamad to sign in. Confirm his second device shows the same clean baseline.

Delete any previously imported legacy Project 202 calendar events before importing the newly generated `hamad-cfa-mastery-calendar.ics` file, otherwise obsolete sessions from the old schedule may remain.

## Security and operating notes

- GitHub Pages contains no private database credential. Never add an Admin SDK key or service-account file.
- Firebase Web App values identify the project; Firestore Rules authorize access.
- The `members` allowlist is the access boundary. An authenticated but unlisted Firebase user cannot read or change tracker data.
- Membership `role` is also enforced by Firestore Rules, not only hidden or disabled in the interface. Keep Mohamed's role exactly `tutor` and Hamad's exactly `student`.
- Import, reset, session scheduling, tutor-session records, session approval, diagnostic administration, topic mastery, mock administration, and private tutor notes are tutor-controlled. Hamad may complete independent/evidence tasks, request or withdraw session completion, record confidence-rated practice and mistakes, and manage shared notes.
- Every cloud snapshot and imported backup is normalized before rendering. Malformed evidence records are discarded, numeric/text fields are bounded, duplicate record IDs are removed, and schedule overrides are accepted only when all 26 checkpoints remain in their original program week and before the exam. The only valid exception is the Friday immediately before that checkpoint's canonical Saturday, still at 09:00 and with a tutor reason.
- Firestore Rules enforce roles, top-level types, collection limits, revision/timestamp consistency, the `weekly-saturday-v1` schedule version, and the fixed Session 01-26 override-key space. Because the tracker intentionally remains one Firestore document, Rules cannot iterate through every object in its large evidence arrays; the application normalizer is the detailed record-shape boundary and JSON export remains the recovery path.
- Keep the database in Spark limits by synchronizing the single tracker document only when state changes, not on a timer.
- JSON export remains the recovery path for accidental edits or service disruption.
- Calendar reminder preferences use browser `localStorage` only; they are not written to Firestore or shared between Mohamed and Hamad. Checkpoint time is fixed at 09:00 Asia/Riyadh. The generated `.ics` is a published calendar import with stable event IDs, not an email invitation.
- Renaming the GitHub repository changes the Pages URL and base path. Update bookmarks and add any new custom hostname to Firebase Authorized domains.

Official references: [Firebase Web setup](https://firebase.google.com/docs/web/setup), [Firebase Authentication](https://firebase.google.com/docs/auth/web/start), [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started), [Firebase API key guidance](https://firebase.google.com/docs/projects/api-keys), and [GitHub Pages custom workflows](https://docs.github.com/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
