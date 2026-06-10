# Password Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side password gate to the root landing page and both sub-apps so that direct navigation to any URL prompts for a password before showing any content.

**Architecture:** A static `landing/index.html` acts as the entry point — it checks the password against a hardcoded SHA-256 hash and writes a `sessionStorage` flag on success. Both sub-apps (`runalyzr` and `bike`) have a synchronous inline script injected at the top of their `<head>` that redirects to the landing page if the flag is absent. The deploy workflow copies the landing page into `deploy/index.html`.

**Tech Stack:** Vanilla HTML/CSS/JS, WebCrypto API (`crypto.subtle`), `sessionStorage`, GitHub Actions

---

### Task 1: Create the landing page

**Files:**
- Create: `landing/index.html`

- [ ] **Step 1: Create `landing/index.html`**

  Create the file with this exact content:

  ```html
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Runalyzr</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #0a0a0a;
        color: #f5f5f5;
        font-family: system-ui, sans-serif;
        padding: 1.5rem;
      }
      h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 2rem; }
      .card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 2rem;
        width: 100%;
        max-width: 360px;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      input[type="password"] {
        width: 100%;
        padding: 0.75rem 1rem;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 8px;
        color: #f5f5f5;
        font-size: 1rem;
        outline: none;
      }
      input[type="password"]:focus { border-color: #555; }
      button {
        width: 100%;
        padding: 0.75rem;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
      }
      .btn-primary { background: #f5f5f5; color: #0a0a0a; }
      .btn-primary:hover { background: #e0e0e0; }
      .btn-run  { background: #22c55e; color: #fff; }
      .btn-run:hover  { background: #16a34a; }
      .btn-bike { background: #3b82f6; color: #fff; }
      .btn-bike:hover { background: #2563eb; }
      .error { color: #ef4444; font-size: 0.875rem; text-align: center; min-height: 1.25rem; }
      .hidden { display: none; }
      a { text-decoration: none; }
    </style>
  </head>
  <body>
    <h1>Runalyzr</h1>

    <div class="card" id="gate">
      <input type="password" id="pw" placeholder="Password" autocomplete="current-password" />
      <button class="btn-primary" id="submit-btn">Enter</button>
      <p class="error" id="error"></p>
    </div>

    <div class="card hidden" id="menu">
      <a href="/runalyzr/run/"><button class="btn-run">Run analysis</button></a>
      <a href="/runalyzr/bike/"><button class="btn-bike">Bike fit</button></a>
    </div>

    <script>
      const HASH = '0384e7dd60492f47aeb19b6055d5e967fda9e92e6323d01e9d58add8118bcc19';

      async function sha256(str) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }

      function showMenu() {
        document.getElementById('gate').classList.add('hidden');
        document.getElementById('menu').classList.remove('hidden');
      }

      async function checkPassword() {
        const pw = document.getElementById('pw').value;
        const hash = await sha256(pw);
        if (hash === HASH) {
          sessionStorage.setItem('runalyzr-auth', '1');
          showMenu();
        } else {
          document.getElementById('error').textContent = 'Incorrect password';
          document.getElementById('pw').value = '';
          document.getElementById('pw').focus();
        }
      }

      if (sessionStorage.getItem('runalyzr-auth')) {
        showMenu();
      }

      document.getElementById('submit-btn').addEventListener('click', checkPassword);
      document.getElementById('pw').addEventListener('keydown', e => {
        if (e.key === 'Enter') checkPassword();
      });
    </script>
  </body>
  </html>
  ```

- [ ] **Step 2: Verify the landing page works locally**

  Open `landing/index.html` directly in a browser (file:// or a local server).

  Check:
  - Page loads with a dark background, "Runalyzr" heading, and a password input
  - Entering a wrong password shows "Incorrect password" and clears the input
  - Entering `runalyzR!1` hides the gate and shows two coloured buttons: green "Run analysis" and blue "Bike fit"
  - Refreshing the page with the correct password previously entered skips the gate and shows the menu directly

- [ ] **Step 3: Commit**

  ```bash
  git add landing/index.html
  git commit -m "feat: add password-gated landing page"
  ```

---

### Task 2: Gate the runalyzr sub-app

**Files:**
- Modify: `runalyzr/index.html` (add one `<script>` tag at line 4, inside `<head>`)

- [ ] **Step 1: Add the auth guard script**

  In `runalyzr/index.html`, add this as the **first line inside `<head>`** (after `<meta charset="UTF-8" />`, before anything else):

  ```html
  <script>if(!sessionStorage.getItem('runalyzr-auth'))location.replace('/runalyzr/');</script>
  ```

  The resulting `<head>` opening should look like:

  ```html
  <head>
    <meta charset="UTF-8" />
    <script>if(!sessionStorage.getItem('runalyzr-auth'))location.replace('/runalyzr/');</script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ...
  ```

- [ ] **Step 2: Verify the guard works**

  Serve the runalyzr app locally:

  ```bash
  cd runalyzr && npm run dev
  ```

  - Open `http://localhost:5173/runalyzr/` in a fresh private/incognito window
  - You should be immediately redirected to `/runalyzr/` (or the root, which in dev is just the same origin) — the app content should not appear
  - Now manually set the flag in the browser console: `sessionStorage.setItem('runalyzr-auth','1')` and refresh — the app should load normally

- [ ] **Step 3: Commit**

  ```bash
  git add runalyzr/index.html
  git commit -m "feat: gate runalyzr app behind session auth check"
  ```

---

### Task 3: Gate the bike sub-app

**Files:**
- Modify: `bike/index.html` (add one `<script>` tag inside `<head>`)

- [ ] **Step 1: Add the auth guard script**

  In `bike/index.html`, add this as the **first line inside `<head>`** (after `<meta charset="UTF-8" />`, before anything else):

  ```html
  <script>if(!sessionStorage.getItem('runalyzr-auth'))location.replace('/runalyzr/');</script>
  ```

  The resulting `<head>` opening should look like:

  ```html
  <head>
    <meta charset="UTF-8" />
    <script>if(!sessionStorage.getItem('runalyzr-auth'))location.replace('/runalyzr/');</script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ...
  ```

- [ ] **Step 2: Verify the guard works**

  Serve the bike app locally:

  ```bash
  cd bike && npm run dev
  ```

  - Open `http://localhost:5173/runalyzr/` in a fresh private/incognito window
  - The app content should not appear (redirect fires immediately)
  - Set `sessionStorage.setItem('runalyzr-auth','1')` in the console and refresh — app loads normally

- [ ] **Step 3: Commit**

  ```bash
  git add bike/index.html
  git commit -m "feat: gate bike app behind session auth check"
  ```

---

### Task 4: Update the deploy workflow

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add the landing page copy step**

  In `.github/workflows/deploy.yml`, add a new step after the "Merge build outputs" step:

  ```yaml
  - name: Add landing page
    run: cp landing/index.html deploy/index.html
  ```

  The full jobs.build.steps section should end with:

  ```yaml
        - name: Merge build outputs
          run: |
            mkdir -p deploy/run deploy/bike
            cp -r runalyzr/dist/. deploy/run/
            cp -r bike/dist/. deploy/bike/

        - name: Add landing page
          run: cp landing/index.html deploy/index.html

        - uses: actions/upload-pages-artifact@v3
          with:
            path: deploy
  ```

- [ ] **Step 2: Commit and push to trigger deploy**

  ```bash
  git add .github/workflows/deploy.yml
  git commit -m "chore: copy landing page into deploy output"
  git push
  ```

- [ ] **Step 3: Verify the deployed site**

  Once the GitHub Actions deploy completes:

  - Open `https://banny99.github.io/runalyzr/` — should show the password gate
  - Enter `runalyzR!1` — should show the two buttons
  - Click "Run analysis" — should open the runalyzr app
  - In a new tab, navigate directly to `https://banny99.github.io/runalyzr/run/` — should redirect to the landing page
  - In a new tab, navigate directly to `https://banny99.github.io/runalyzr/bike/` — should redirect to the landing page
