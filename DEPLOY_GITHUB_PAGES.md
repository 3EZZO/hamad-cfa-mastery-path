# GitHub Pages deployment

GitHub Pages is the recommended host for this tracker. It serves this browser-only React application directly over HTTPS, deploys automatically from Git, and does not require the container configuration that a Hugging Face Space would add.

## First deployment

1. Create an empty GitHub repository, preferably named `hamad-cfa-project-202`.
2. From this project directory, connect and push the existing `main` branch:

   ```powershell
   git remote add origin https://github.com/YOUR-ACCOUNT/hamad-cfa-project-202.git
   git push -u origin main
   ```

3. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
4. Open the **Actions** tab and wait for **Deploy tracker to GitHub Pages** to complete. The deployment job displays the public URL. For the suggested repository name it will be:

   `https://YOUR-ACCOUNT.github.io/hamad-cfa-project-202/`

Every later push to `main` tests, builds, and redeploys the tracker automatically. The workflow can also be started manually from its **Run workflow** button.

## Verify the static artifact locally

```powershell
$env:BASE_PATH = "/hamad-cfa-project-202/"
npm run build:pages
Remove-Item Env:BASE_PATH
npm run preview:pages -- --host 127.0.0.1 --port 4175
```

The static output is written to `dist-pages/`. The existing `npm run build` command and Cloudflare/OpenAI Sites artifact remain separate and unchanged.

## Student data and privacy

The site has no server or account system. Progress remains in the browser's `localStorage`; GitHub receives only the static application files, not the student's entries. Data is specific to the browser and website origin, so progress from a previous hosted URL will not appear automatically on the GitHub Pages URL. Export a JSON backup from the old URL, then import it once on the Pages deployment. Continue exporting a backup regularly and avoid recording sensitive personal or financial information.

Renaming the repository changes the public path. The workflow recalculates asset URLs automatically on the next deployment, but existing bookmarks must be updated.
