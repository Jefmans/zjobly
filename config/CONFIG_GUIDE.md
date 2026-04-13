# Shared Config (Simple Mode)

Edit config only in this folder:

- `runtime.json`
- `questions.json`
- `dev_questions.json`
- `prompts.json`
- `signal_schemas.json`

No per-service config copies are required.

When editing files manually, refresh the browser to pick up frontend changes.
For live updates from the app, use the admin panel (no Docker restart required).

Examples:

- Turn off development navigation: set `runtime.json` -> `ui.showDevelopmentNavigation` to `false`.

Admin panel (dev):

- Open the frontend and sign in.
- Use `Development navigation` -> `Admin config panel`.
- Save changes to update `runtime.json`, `questions.json`, `dev_questions.json`, and `prompts.json` from the UI.
- Save changes to update `runtime.json`, `questions.json`, `dev_questions.json`, `prompts.json`, and `signal_schemas.json` from the UI.
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

Schema registry (recommended for structured questions):

- Put reusable JSON schemas in `signal_schemas.json` (for example `education_v1`).
- In a question, reference it with:
  - `"schema_key": "education_v1"`
- This avoids duplicating large `output_schema` blocks in `questions.json` and `prompts.json`.
- Inline `output_schema` still works and takes precedence when both are set.
- Optional compatibility: prompts can also reference shared schemas with `"schema_key"` when needed for direct `/nlp/signal-from-transcript` calls that do not send `output_schema`.

Extractor-based question config (recommended):

- Add `extractors` to a question in `questions.json` / `dev_questions.json`.
- Each extractor can define:
  - `signal_key` (required)
  - `prompt_key` (optional)
  - `schema_key` (optional)
  - `show` (optional, default `true`)
- Recommended: set `show` explicitly on every extractor so visibility intent is obvious in config.
- Transcript is always stored per generated signal in a dedicated `transcript` attribute.

Example:

```json
{
  "id": "candidate-education",
  "text": "What is your education? Where did you study?",
  "extractors": [
    {
      "signal_key": "education_structured",
      "prompt_key": "goal_education_v2",
      "schema_key": "education_v1",
      "display": ["structured"]
    },
    {
      "signal_key": "education_summary",
      "prompt_key": "goal_education_v1",
      "display": ["summary"]
    }
  ]
}
```

Legacy compatibility:

- Legacy question-level fields (`signal_key`, `prompt_key`, `schema_key`, `output_schema`, `output`, `display`) are still accepted.
- New configs should prefer `extractors` + `show` for simpler behavior.
