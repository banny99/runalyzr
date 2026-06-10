# Password Gate Design

**Date:** 2026-05-04

## Goal

Restrict access to the deployed apps with a simple client-side password gate. Direct navigation to `/runalyzr/run/` or `/runalyzr/bike/` must also prompt for the password before the app loads.

## Architecture

Three changes:

1. **Landing page** — new static file `landing/index.html`, copied to `deploy/index.html` at build time
2. **Sub-app gate** — a small inline script added to `runalyzr/index.html` and `bike/index.html`
3. **Deploy workflow** — one extra `cp` line

There is no backend. All auth state lives in `sessionStorage` (cleared when the tab closes).

---

## Landing Page (`landing/index.html`)

Self-contained HTML/CSS/JS — no external dependencies.

**Flow:**
1. User sees a password input and submit button
2. On submit, the input is hashed with `crypto.subtle.digest('SHA-256', ...)`
3. Hash is compared against the hardcoded expected hash
4. **Match:** sets `sessionStorage.setItem('runalyzr-auth', '1')`, replaces the form with two buttons: **Run** → `/runalyzr/run/` and **Bike** → `/runalyzr/bike/`
5. **No match:** shows an inline error message, clears the input

**Password hash (SHA-256):** `0384e7dd60492f47aeb19b6055d5e967fda9e92e6323d01e9d58add8118bcc19`

To change the password: compute `sha256(newPassword)` and replace the hash in `landing/index.html`.

---

## Sub-App Gate

Added to the `<head>` of `runalyzr/index.html` and `bike/index.html`, as the **first** `<script>` tag (before any bundle), so it runs synchronously before any app content renders:

```html
<script>
  if (!sessionStorage.getItem('runalyzr-auth')) {
    location.replace('/runalyzr/');
  }
</script>
```

This produces no flash of app content — the redirect happens before the DOM is painted.

---

## Deploy Workflow Change

In `.github/workflows/deploy.yml`, after the merge step:

```yaml
- name: Add landing page
  run: cp landing/index.html deploy/index.html
```

---

## Security Properties

- **Not cryptographically secure** — client-side only, a determined person can bypass it by reading the source
- **Suitable for:** keeping the prototype away from casual discovery; sharing with a small group of testers
- **Not suitable for:** protecting sensitive data or preventing determined access
- `sessionStorage` means the gate re-appears on every new tab/browser session

---

## Out of Scope

- Per-user accounts or tokens
- Server-side auth
- Rate limiting on password attempts
- Protecting the direct asset URLs (WASM, model files)
