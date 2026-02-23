# Shared Config (Simple Mode)

Edit config only in this folder:

- `runtime.json`
- `questions.json`
- `prompts.json`

No per-service config copies are required.

After changes, restart/rebuild services so they pick up the new values.

Examples:

- Turn off development navigation: set `runtime.json` -> `ui.showDevelopmentNavigation` to `false`.
