# Shared Config (Simple Mode)

Edit config only in this folder:

- `runtime.json`
- `questions.json`
- `dev_questions.json`
- `prompts.json`

No per-service config copies are required.

When editing files manually, refresh the browser to pick up frontend changes.
For live updates from the app, use the admin panel (no Docker restart required).

Examples:

- Turn off development navigation: set `runtime.json` -> `ui.showDevelopmentNavigation` to `false`.

Admin panel (dev):

- Open the frontend and sign in.
- Use `Development navigation` -> `Admin config panel`.
- Save changes to update `runtime.json`, `questions.json`, `dev_questions.json`, and `prompts.json` from the UI.
- Use `Active question set` in admin config to switch between:
  - `default` -> `questions.json`
  - `dev` -> `dev_questions.json`
- Refresh the browser to apply frontend-side config changes.
- Restrict access with `.env`:
  - `CONFIG_ADMIN_ALLOWLIST=admin_username,admin@email.com,<user_id>`
  - Only users matching `id`, `username`, or `email` in this allowlist can use config admin.
- Optional runtime override:
  - `runtime.json` -> `ui.adminUserAllowlist: ["admin"]`
  - Frontend and API both accept this list for admin-config access.
- Config admin on/off is separate from dev navigation:
  - `runtime.json` -> `ui.enableConfigAdmin: true` (default if omitted)
  - Set `ui.enableConfigAdmin: false` only when you want to fully disable `Screen:Admin/Config`.
