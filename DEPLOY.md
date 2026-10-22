# Publishing FocusFlow on GitHub Pages

FocusFlow is a static site: everything runs in the visitor's browser, so GitHub Pages can host it for free. Each visitor's data stays in their own browser, and each visitor uses their own AI key (or demo mode). You are never charged for other people's usage.

The repository contains the publishing workflow (`.github/workflows/pages.yml`). Every push to `main` runs two jobs:

1. **build**: installs packages (`npm ci`), runs the tests, builds the React app into `dist/`, and uploads it.
2. **deploy**: publishes `dist/` to GitHub Pages.

If the tests or the build fail, nothing is published and the previous version stays online.

**You'll need:** a GitHub account, and Git on your computer (or GitHub Desktop).

## Updating an existing repository to this version

If your repository already has the earlier FocusFlow (with `public/` and `server.js`):

1. Unzip `focusflow.zip`.
2. In your local copy of the repository, delete everything **except the hidden `.git` folder**, then copy in everything from the unzipped `focusflow` folder, including the hidden `.github` folder. (Or skip the copying: the zip already contains the full Git history, so you can work from the unzipped folder and run `git remote add origin <your repo URL>` there.)
3. Commit and push:

   ```bash
   git add -A
   git commit -m "Rebuild FocusFlow with React and shadcn/ui"
   git push
   ```

   If you work from the unzipped folder, run `git push -u origin main --force` once instead, because its history replaces the old one.
4. Open the **Actions** tab and wait for **Deploy to GitHub Pages** to show green checks on **build** and **deploy** (about 1–2 minutes).

**Settings → Pages → Source** stays on **GitHub Actions**. Nothing else changes: the address is the same, and visitors keep their tasks, journal and API key, because the app uses the same browser storage as before.

## Publishing from scratch

### 1. Create an empty public repository

1. On GitHub, click **+** (top right), then **New repository**.
2. Choose a name. It becomes part of your web address.
3. Choose **Public**. GitHub Pages is free for public repositories.
4. Leave **Add a README**, **.gitignore** and **license** unticked, so the repository starts empty.
5. Click **Create repository** and keep the page open.

### 2. Upload the code

Don't drag files into GitHub's website. The upload page skips hidden folders like `.github`, so the publishing workflow would be missing.

**Command line.** Unzip `focusflow.zip`, open a terminal in the `focusflow` folder, and run:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

If Git asks for a password, GitHub needs a personal access token, not your account password. The easiest fix is to install the GitHub CLI, run `gh auth login`, and push again.

**GitHub Desktop.** **File → Add local repository…**, choose the unzipped `focusflow` folder, then **Publish repository** (untick **Keep this code private**).

### 3. Turn on GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

There's no branch or folder to pick. If Source is set to "Deploy from a branch", GitHub shows the README instead of the app.

### 4. Run the workflow

Your first push may have happened before Pages was on, so that run may have failed. That's expected.

1. Open the **Actions** tab.
2. Click **Deploy to GitHub Pages**, then **Run workflow → Run workflow**.
3. Wait until **build** and **deploy** both show a green check.

### 5. Open your site

```
https://YOUR-USERNAME.github.io/YOUR-REPO/
```

The link also appears in **Settings → Pages** and on the finished **deploy** job. The first publish can take a couple of minutes.

## Turning on the AI coach (each visitor does this once)

The first visit opens a guided setup. Or, at any time:

1. Get a key. Google Gemini has a free tier: open <https://aistudio.google.com/apikey> and create an API key.
2. In FocusFlow, open **Settings**, keep **Google Gemini** selected, and paste the key.
3. Click **Test connection**. You should see "Connected to Google Gemini".
4. Click **Save settings**. The chip in the top right changes from **AI: Demo** to **AI: Gemini**.

The key is saved only in that browser and sent only to the provider. It never reaches GitHub, and it's left out of data exports. **Remove key** in Settings deletes it.

## Troubleshooting

| What you see | What to do |
|---|---|
| The site shows the README instead of the app | **Settings → Pages → Source** must be **GitHub Actions**. Change it, then re-run the workflow. |
| The **deploy** job fails, saying Pages isn't enabled | Same fix as above. |
| The **build** job fails | Click it to see which step failed. On your computer, run `npm ci`, `npm test` and `npm run build` to reproduce it, fix it, and push again. |
| `npm ci` fails: lock file out of sync | Run `npm install` on your computer, commit the updated `package-lock.json`, push again. |
| 404 at the site address | Wait two or three minutes after the first publish, and check that the address matches the repository name exactly (it's case-sensitive). |
| The page loads but is blank | Press F12 and look at the **Console** tab. Make sure the workflow published `dist/` (the built app), not the source folder. |
| Test connection: "Check the API key" | The key was copied incompletely or was deleted. Create a new one and paste it again. |
| Test connection: the model name may be out of date | Providers rename models. Put a current model name from your provider's docs in **Model**. |
| "Rate limit or quota reached" | Free tiers have per-minute and per-day limits. Wait a minute, or check your usage on the provider's site. |
| My tasks aren't on my other computer or phone | Data is saved per browser. Use **Settings → Export my data**, then **Import a backup** on the other device. |

## Running it on your own computer

Needs Node.js 20.19 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 41 tests
npm run build      # builds dist/, exactly what GitHub Pages publishes
npm run preview    # serves dist/ so you can check the build
```

The build uses relative paths, so the same `dist/` works at any address, including a GitHub Pages subfolder.
