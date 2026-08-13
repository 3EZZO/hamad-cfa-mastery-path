# GitHub Pages and Firebase deployment

GitHub Pages is the permanent static host for Project 202. Firebase Spark supplies the two capabilities a static host cannot provide: authenticated access and synchronized Firestore data for Mohamed and Hamad.

This setup uses no server credential in the browser. The Firebase Web App configuration is public by design; access is enforced by Firebase Authentication and `firestore.rules`.

## 1. Create the Firebase Spark project

1. Open the [Firebase console](https://console.firebase.google.com/) and create a project. Keep it on the no-cost **Spark** plan; Google Analytics is optional.
2. In **Project settings > General > Your apps**, add a Web App named `Project 202 Tracker`.
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
2. In the Firestore console, create the parent document `programs/project-202`. A simple field such as `name = Project 202` is sufficient.
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
- the tutor role to create and administer the complete shared tracker state;
- the student role to update only task completion, practice, mistake, and note evidence;
- no client to list or edit the membership allowlist;
- no client access to any other Firestore path;
- no client deletion of the tracker document.

Repeat the deploy command after every intentional change to `firestore.rules`. Rules are not deployed by the GitHub Pages workflow.

When a release changes both rules and the web client, deploy the backward-compatible rules first, then deploy Pages. The checked-in rules accept legacy tracker documents that do not yet contain the optional `sessionOverrides` and `diagnostics` containers.

## 5. Configure and verify locally

Copy the example file to an ignored local file and enter the four Web App values:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Then test the repository-path build:

```powershell
$env:BASE_PATH = "/hamad-cfa-project-202/"
npm ci
npm test
npm run build:pages
Remove-Item Env:BASE_PATH
npm run preview:pages -- --host 127.0.0.1 --port 4175
```

Open `http://127.0.0.1:4175/hamad-cfa-project-202/`, sign in, and confirm that an unlisted test account receives no Firestore access. Delete or disable the test account afterward.

## 6. Configure GitHub and deploy Pages

1. Create an empty GitHub repository, preferably named `hamad-cfa-project-202`.
2. In **Settings > Secrets and variables > Actions > Variables**, create these four repository variables with the Web App values:

   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`

   These are repository **variables**, not GitHub secrets. The workflow fails early if any one is missing.
3. In **Settings > Pages**, set **Source** to **GitHub Actions**.
4. Connect and push the existing branch:

   ```powershell
   git remote add origin https://github.com/YOUR-ACCOUNT/hamad-cfa-project-202.git
   git push -u origin main
   ```

5. In the **Actions** tab, wait for **Deploy tracker to GitHub Pages** to complete. For the suggested repository name, the URL is:

   `https://YOUR-ACCOUNT.github.io/hamad-cfa-project-202/`

Every later push to `main` tests, builds, and redeploys the static tracker. It does not redeploy Firestore rules.

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

## Security and operating notes

- GitHub Pages contains no private database credential. Never add an Admin SDK key or service-account file.
- Firebase Web App values identify the project; Firestore Rules authorize access.
- The `members` allowlist is the access boundary. An authenticated but unlisted Firebase user cannot read or change tracker data.
- Membership `role` is also enforced by Firestore Rules, not only hidden or disabled in the interface. Keep Mohamed's role exactly `tutor` and Hamad's exactly `student`.
- Import, reset, session scheduling, tutor-session records, diagnostic administration, topic mastery, and mock administration are tutor-controlled. Hamad may update his checklist, practice evidence, mistake records, and notes.
- Every cloud snapshot and imported backup is normalized before rendering. Malformed evidence records are discarded, numeric/text fields are bounded, duplicate record IDs are removed, and schedule overrides are accepted only when the complete 68-session effective calendar remains ordered, on cadence, within three sessions per week, and before the exam.
- Firestore Rules enforce roles, top-level types, collection limits, revision/timestamp consistency, and the fixed Session 01-68 override-key space. Because the tracker intentionally remains one Firestore document, Rules cannot iterate through every object in its large evidence arrays; the application normalizer is the detailed record-shape boundary and JSON export remains the recovery path.
- Keep the database in Spark limits by synchronizing the single tracker document only when state changes, not on a timer.
- JSON export remains the recovery path for accidental edits or service disruption.
- Renaming the GitHub repository changes the Pages URL and base path. Update bookmarks and add any new custom hostname to Firebase Authorized domains.

Official references: [Firebase Web setup](https://firebase.google.com/docs/web/setup), [Firebase Authentication](https://firebase.google.com/docs/auth/web/start), [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started), [Firebase API key guidance](https://firebase.google.com/docs/projects/api-keys), and [GitHub Pages custom workflows](https://docs.github.com/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
