# Put Department Hub online (free demo, about 10 minutes)

Uses GitHub (to hold the files) + Render (to run the site). Both have free plans.

## What to expect on the free plan
* The site **sleeps after 15 minutes** without visitors; the next visit takes about a minute to wake it.
* Storage is **wiped each time it restarts** – so the demo reloads its sample data automatically and anything you add is lost. This is for *looking around only*, not real work.
* Demo logins are public knowledge (`admin@example.com` / `admin123`, others `demo123`). Do not enter real company data.

## Steps
1. **GitHub**: create a free account at github.com → click **+** (top right) → **New repository** → name it `department-hub` → **Create repository**.
2. On the new repository page click **uploading an existing file**. Open this project folder on your computer, press **Ctrl+A** to select everything *inside* it (`package.json`, `server.js`, `public`…), and **drag it all** into the browser. Click **Commit changes**.
   * Check: the repository's front page must show `package.json` and `server.js` directly – not a folder containing them.
3. **Render**: go to render.com → sign up with your GitHub account → **New +** → **Blueprint** → choose your `department-hub` repository → **Apply**.
   (No blueprint option? Use **New + → Web Service**, pick the repo, set *Build Command* `npm install`, *Start Command* `npm run start:demo`, instance type **Free**, and add an environment variable `NODE_VERSION` = `22`.)
4. Wait 3–5 minutes for the first deploy. When the status says **Live**, click the address at the top (`https://department-hub-xxxx.onrender.com`).
5. Sign in with `admin@example.com` / `admin123`, or try the roles: `hr01@demo.com` (HOD), `hr02@demo.com` (team member), `pc01@demo.com` (view-only) – password `demo123`.

## For real use
Free hosting loses data. For real work you need a host with a **persistent disk** (a paid plan on Render, Railway, Fly.io…) pointed at the `DATA_DIR` setting, or run it on an office computer with `START-HERE.bat`.

## Updating the online copy later
On GitHub open your repository, click into the **department-hub-v3** folder (the one Render uses), choose **Add file → Upload files**, drag in the new
files (including the `public` folder) and **Commit changes**. Render notices and redeploys by itself in a few minutes.
