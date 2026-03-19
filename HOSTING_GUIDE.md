# Hosting Guide — Building Walkthrough

## Overview

| What | Where |
|------|-------|
| Code (HTML, JS, lib, styles) | GitHub repo + GitHub Pages |
| GLB model (large file) | Any public URL — GitHub Releases, Cloudflare R2, etc. |

The only thing that connects them is one line in `main.js`.

---

## Swapping the model

Open [main.js](main.js) and update line 19:

```js
const MODEL_URL = 'https://your-host.example.com/your-model.glb';
```

That's the only change needed. The rest of the code picks up whatever URL you set here.

---

## Where to host the GLB

### Option A — GitHub Releases (free, simple)

1. Go to your GitHub repo → **Releases** → **Create a new release**
2. Tag: `v1.0` (or `v1.1`, `v2.0`, etc. for updates)
3. Drag and drop your `.glb` file under **Attach binaries**
4. Click **Publish release**
5. Click the uploaded file → copy the URL:
   ```
   https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0/model.glb
   ```
6. Paste it into `MODEL_URL` in `main.js`

> GitHub Release assets are served with `Access-Control-Allow-Origin: *`, so Three.js will load them without CORS errors even from a different domain.

### Option B — Cloudflare R2 (current production setup)

1. Create a free Cloudflare account → go to **R2 Object Storage**
2. Create a bucket, upload your `.glb`
3. Set the bucket to **Public** (or use a custom domain)
4. Copy the public URL and paste it into `MODEL_URL`

R2 has no egress fees and handles large files well.

### Option C — Local development

Put your `.glb` at `assets/model.glb` and set:

```js
const MODEL_URL = 'assets/model.glb';
```

This only works when running the local dev server (see below). Do not use a relative path in production.

---

## Local development

```bash
# Install dependencies once
npm install

# Start dev server
npx vite

# Open http://localhost:5173
```

---

## Deploying code to GitHub Pages

```bash
# Stage all code files — do NOT add node_modules or large GLB files
git add index.html main.js js/ lib/ images/ styles/ assets/icons/ assets/thumbnails/ .nojekyll
git commit -m "Update model"
git push
```

Then enable Pages once:
1. Repo → **Settings** → **Pages**
2. Source: **Deploy from a branch** → `main` / `/ (root)`
3. Save — site is live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`

---

## Updating the model later

1. Upload the new GLB to your host (new Release tag, new R2 object, etc.)
2. Copy the new URL
3. Update `MODEL_URL` in `main.js` (line 19)
4. Commit and push
