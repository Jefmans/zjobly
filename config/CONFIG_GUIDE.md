# Shared Config (Simple Mode)

Edit config only in this folder:

- `runtime.json`
- `questions.json`
- `prompts.json`

No per-service config copies are required.

When editing files manually, refresh the browser to pick up frontend changes.
For live updates from the app, use the admin panel (no Docker restart required).

Examples:

- Turn off development navigation: set `runtime.json` -> `ui.showDevelopmentNavigation` to `false`.

Admin panel (dev):

- Open the frontend and sign in.
- Use `Development navigation` -> `Admin config panel`.
- Save changes to update `runtime.json`, `questions.json`, and `prompts.json` from the UI.
- Refresh the browser to apply frontend-side config changes.
