# Contributing to Recly

Thanks for your interest in improving Recly.

## Before you start
- For a bug, open an issue with the steps to reproduce it, what you expected, and what happened.
  Include your browser and version. **Do not attach recordings of your own screen**: reproduce with
  something neutral instead.
- For a new feature, open an issue first so we can agree on the direction.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Working on the code
1. Fork the repository and clone it.
2. `npm install` (developer tooling only: Playwright, axe-core, the Rubik font source, transformers.js).
3. Serve the folder (`.\start.bat` on Windows, or `python -m http.server 8777`) and open `http://localhost:8777`.
4. `npm test` must pass before you open a pull request. Add a test for any bug you fix.

## Ground rules
- **The video never leaves the user's computer.** No upload, no analytics, no accounts.
- **No outside requests.** No CDNs, no web fonts, no remote scripts. The one exception is the captions
  model, downloaded only after the user agrees in the page. Third-party code goes in `vendor/`.
- **A failing camera or microphone never stops a recording** that has a screen to record.
- **The default stays "screen only"**, with no extra permission prompts.
- **No build step and no runtime dependencies.** The app is `index.html` plus a few static files.
- The interface is Hebrew-first and right-to-left. Keep new UI readable in the light and dark themes;
  colors come only from the variables in `:root`, and the axe check must pass.
- Every `localStorage` read and write goes inside `try/catch`.

By contributing you agree that your contribution is licensed under the GNU GPL v3, like the rest of the project.
