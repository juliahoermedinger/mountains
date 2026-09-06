# Deploying and installing MountainScope

## 1. One-time GitHub Pages setup

1. Push this repo to GitHub (I'll do this with you when you're ready — see the main
   conversation for why I held off on doing it automatically).
2. In the repo on GitHub: **Settings → Pages → Source**, select **GitHub Actions**.
3. That's it — every push to `main` that touches `web/` now deploys automatically via
   `.github/workflows/deploy-pages.yml`. The Actions tab shows each deploy and its live URL.

## 2. Installing on the recipient's iPhone (permanent, free, no cable)

1. Send them the GitHub Pages URL (looks like `https://<username>.github.io/<repo>/`).
2. They open it in **Safari** (must be Safari, not Chrome — "Add to Home Screen" for a
   full installable PWA is a Safari-only feature on iOS).
3. Tap the **Share** button (square with an arrow) → **Add to Home Screen** → **Add**.
4. Done. It now sits on their home screen with its own icon, opens full-screen like a
   native app, and works offline (the peak database and app code are cached by the
   service worker on first load) — permanently, with no expiry and nothing further
   required from either of you.

## 3. Updating it later

Push a change to `web/` on `main` — it redeploys automatically. Returning visitors get
the update next time they open the app and have a connection (the service worker checks
for a new version in the background). If you change any file listed in
`web/service-worker.js`'s `APP_SHELL` array, bump `CACHE_NAME` in that file too, so the
old cached version doesn't linger.

## 4. Custom domain (optional)

Not necessary for anything here — GitHub Pages' own HTTPS domain works fine for
everything the app needs (camera/location APIs require HTTPS, which Pages provides by
default). Only worth doing if you want a nicer/shorter URL to share.
