# Publishing FocusFlow on GitHub Pages

FocusFlow is a static site: everything runs in the visitor's browser, so GitHub Pages can host it for free. Each visitor's data stays in their own browser, and each visitor uses their own AI key (or demo mode). You are never charged for other people's usage.

The repository already contains the publishing workflow (`.github/workflows/pages.yml`). It runs the tests and then publishes the `public/` folder every time you push to `main`.

**You'll need:** a GitHub account, and Git on your computer (or GitHub Desktop, see step 2B).

## 1. Create an empty public repository

1. On GitHub, click **+** (top right), then **New repository**.
2. **Repository name:** `focusflow`. The name becomes part of your web address.
3. Choose **Public**. GitHub Pages is free for public repositories.
4. Leave **Add a README**, **.gitignore** and **license** unticked. The project already has them, and an empty repository avoids a merge conflict.
5. Click **Create repository** and keep the page open.

## 2. Upload the code

Pick **A** (command line) or **B** (GitHub Desktop). Don't drag the files into GitHub's website. The upload page skips hidden folders like `.github`, so the publishing workflow would be missing.

### A. Command line

Unzip `focusflow.zip`, open a terminal in the `focusflow` folder, and run (replace `YOUR-USERNAME`):

```bash
git remote add origin https://github.com/YOUR-USERNAME/focusflow.git
git push -u origin main
```

If Git asks for a password, GitHub needs a personal access token, not your account password. The easiest fix is to install the GitHub CLI and run `gh auth login`, then push again.

### B. GitHub Desktop

1. **File → Add local repository…**, then choose the unzipped `focusflow` folder.
2. Click **Publish repository**. Untick **Keep this code private**, then click **Publish**.

   If you already created the repository in step 1, use **Repository → Repository settings → Remote** and paste `https://github.com/YOUR-USERNAME/focusflow.git` instead, then click **Push origin**.

## 3. Turn on GitHub Pages

1. In your repository on GitHub, open **Settings → Pages** (in the left sidebar under "Code and automation").
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

That's the only setting. There is no branch or folder to pick, because the workflow handles it.

## 4. Run the publishing workflow

Your first push probably happened before Pages was turned on, so that first run may have failed. That's expected.

1. Open the **Actions** tab.
2. Click **Deploy to GitHub Pages** in the left list.
3. Click **Run workflow → Run workflow**.
4. Wait about a minute until both jobs, **test** and **deploy**, show a green check.

## 5. Open your site

Your site is at:

```
https://YOUR-USERNAME.github.io/focusflow/
```

The link also appears in **Settings → Pages** and on the finished **deploy** job. The first publish can take a couple of minutes to appear.

## 6. Turn on the AI coach (each visitor does this once)

1. Get a key. Google Gemini has a free tier: open <https://aistudio.google.com/apikey> and create an API key.
2. In FocusFlow, click **Settings**, keep **Google Gemini** selected, and paste the key.
3. Click **Test connection**. You should see "Connected to Google Gemini".
4. Click **Save settings**. The Coach page now shows "Google Gemini" instead of "Demo mode".

The key is saved only in that browser and sent only to the provider. It never reaches GitHub or anyone else, and it's left out of data exports. **Remove key** in Settings deletes it.

## 7. Updating the site

Commit and push your changes as usual (or **Commit** then **Push origin** in GitHub Desktop). The workflow tests and republishes automatically in about a minute. If a test fails, the old version stays online; the **Actions** tab shows what broke.

## Submitting the assignment

- **Code:** `https://github.com/YOUR-USERNAME/focusflow`
- **Published app (bonus):** `https://YOUR-USERNAME.github.io/focusflow/`

Add the published link near the top of `README.md` so graders find it.

## Troubleshooting

| What you see | What to do |
|---|---|
| The **deploy** job fails with a message about Pages not being enabled | Do step 3, then re-run the workflow (step 4). |
| The **test** job fails | Run `npm install` and `npm test` on your computer to see which test failed, fix it, and push again. |
| 404 page at the site address | Wait two or three minutes after the first publish. Check the address includes `/focusflow/` and matches your repository name exactly. |
| The page loads but is blank | Press F12 and look at the **Console** tab for the error. Make sure `index.html` is directly inside `public/`. |
| Test connection: "Check the API key in Settings" | The key was copied incompletely or was deleted. Create a new one and paste it again. |
| Test connection: "The model name may be out of date" | Providers rename models. Put a current model name from your provider's docs in **Model (optional)**. |
| "Rate limit or quota reached" | The free tier has per-minute and per-day limits. Wait a minute, or check your usage on the provider's site. |
| My tasks aren't on my other computer or phone | Data is saved per browser. Use **Settings → Export my data**, then **Import a backup** on the other device. |
| I cleared my browser data and lost everything | Browser storage is all there is. Export a backup now and then. |

## Running it on your own computer

```bash
npm install
npm start          # http://localhost:3000
npm test           # 23 tests
```

`npm start` serves the same `public/` folder that GitHub Pages publishes, so what you see locally is what goes online.
