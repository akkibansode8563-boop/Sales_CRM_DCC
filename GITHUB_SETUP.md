# 🐙 GitHub Setup Guide — Sales CRM

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `sales-crm`
3. Set to **Public** (needed for GitHub Pages free hosting)
4. Do NOT check "Initialize with README" (we have our own)
5. Click **Create repository**

---

## Step 2: Push Code to GitHub

Open terminal in your `sales-crm` folder:

```bash
# Initialize git (if not done)
git init

# Add all files
git add .

# First commit
git commit -m "feat: Initial Sales CRM PWA - React + Vite"

# Set main branch
git branch -M main

# Connect to GitHub (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/sales-crm.git

# Push to GitHub
git push -u origin main
```

---

## Step 3: Enable GitHub Pages (Free PWA Hosting)

1. Go to your repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **gh-pages** (will be created when you deploy)
4. Click Save

Then deploy:
```bash
# Install gh-pages package
npm install -D gh-pages

# Add to package.json (under "scripts"):
"predeploy": "npm run build",
"deploy": "gh-pages -d dist"

# Also add this line at top level of package.json:
"homepage": "https://YOUR_USERNAME.github.io/sales-crm"

# Deploy!
npm run deploy
```

Your PWA is live at: **https://YOUR_USERNAME.github.io/sales-crm** 🎉

---

## Step 4: Set Up Development Workflow

```bash
# Create develop branch
git checkout -b develop
git push origin develop

# Work on features
git checkout -b feature/my-new-feature
# ... make changes ...
git add .
git commit -m "feat: add new feature"
git push origin feature/my-new-feature

# Merge back to develop
git checkout develop
git merge feature/my-new-feature

# When ready for production
git checkout main
git merge develop
git push origin main
npm run deploy   # Updates live PWA
```

---

## Useful Git Commands

```bash
git status          # See changed files
git log --oneline   # See commit history
git diff            # See exact changes
git stash           # Temporarily save changes
git stash pop       # Restore saved changes
```

---

## Important: What NOT to Commit

Already in `.gitignore`:
- `node_modules/` — Install with `npm install`
- `dist/` — Build with `npm run build`
- `.env` — Keep secrets local
- `mcp-server/db.json` — Database data
- `.idea/` — IDE settings
