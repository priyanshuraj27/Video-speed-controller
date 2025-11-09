# Video Speed Controller

A small Chrome/Edge extension (Manifest V3) that injects a floating controller on every web page to adjust video playback speed. It works on any website with HTML5 <video> elements.

Features
- Floating controller with - / + buttons, slider (0.25× to 4×), and reset
- Keyboard command shortcuts (Ctrl+Shift+. to increase, Ctrl+Shift+, to decrease, Ctrl+Shift+0 to reset)
- Applies rate to all video elements on the page and watches for dynamically added videos
- Minimal and non-intrusive UI; draggable

Install (for Chromium-based browsers)
1. Open chrome://extensions (or edge://extensions) and enable Developer mode.
2. Click "Load unpacked" and choose the folder `d:\Work\Video speed controller`.
3. The extension will inject the controller on pages with video elements.

Notes & limitations
- Some sites restrict or override playbackRate; the extension attempts to set playbackRate but may not work on heavily protected players.
- The manifest includes `<all_urls>` so the content script runs on all pages; you can restrict this if needed.

Files
- `manifest.json` - extension manifest (MV3)
- `background.js` - service worker that relays keyboard commands to the content script
- `content.js` - injected UI and logic
- `style.css` - UI styling
- `icons/icon128.png` - optional icon (place a 128×128 PNG here)
Options page
- Open the extension's Options (via the Extensions page or the extension's context) to view and manage saved per-site speeds. You can delete individual saved speeds or clear them all.

License & CI

- License: MIT (see `LICENSE`)
- Basic GitHub Actions workflow is included at `.github/workflows/ci.yml` to validate `manifest.json` and check the default icon is present.

Badge

![manifest-check](https://github.com/priyanshuraj27/Video-speed-controller/actions/workflows/ci.yml/badge.svg)

Enjoy! If you'd like features like per-site default speeds, keyboard-only mode, or better styling, I can add them next.
