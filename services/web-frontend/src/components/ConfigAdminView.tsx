import { ReactNode, useEffect, useState } from "react";
import {
  AdminConfigBundle,
  getAdminConfigBundle,
  updateAdminConfigBundle,
} from "../api";
import { ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
};

const DEFAULT_CONFIG: AdminConfigBundle = {
  runtime: {},
  questions: {},
  prompts: {},
};

const stringifyConfig = (value: Record<string, unknown>) =>
  JSON.stringify(value ?? {}, null, 2);

export function ConfigAdminView({ view, nav }: Props) {
  const [runtimeText, setRuntimeText] = useState<string>(stringifyConfig(DEFAULT_CONFIG.runtime));
  const [questionsText, setQuestionsText] = useState<string>(stringifyConfig(DEFAULT_CONFIG.questions));
  const [promptsText, setPromptsText] = useState<string>(stringifyConfig(DEFAULT_CONFIG.prompts));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const config = await getAdminConfigBundle();
      setRuntimeText(stringifyConfig(config.runtime));
      setQuestionsText(stringifyConfig(config.questions));
      setPromptsText(stringifyConfig(config.prompts));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not load config.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view !== "adminConfig") return;
    void loadConfig();
  }, [view]);

  const parseConfigSection = (label: string, text: string): Record<string, unknown> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${label} JSON is invalid.`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: AdminConfigBundle = {
        runtime: parseConfigSection("runtime", runtimeText),
        questions: parseConfigSection("questions", questionsText),
        prompts: parseConfigSection("prompts", promptsText),
      };
      const updated = await updateAdminConfigBundle(payload);
      setRuntimeText(stringifyConfig(updated.runtime));
      setQuestionsText(stringifyConfig(updated.questions));
      setPromptsText(stringifyConfig(updated.prompts));
      setSuccess("Config saved. Refresh the browser to apply frontend-side changes.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not save config.");
    } finally {
      setSaving(false);
    }
  };

  if (view !== "adminConfig") return null;

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Admin config</div>
        <p className="tag">Zjobly</p>
        <h1>Config admin panel</h1>
        <p className="lede">Edit runtime, questions, and prompts without restarting Docker services.</p>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>JSON config editor</h2>
              <p className="hint">Only save valid JSON objects. Invalid JSON will be rejected.</p>
            </div>
            <div className="panel-header-actions">
              <button type="button" className="ghost" onClick={() => void loadConfig()} disabled={loading || saving}>
                {loading ? "Loading..." : "Reload from server"}
              </button>
              <button type="button" className="cta primary" onClick={() => void handleSave()} disabled={saving || loading}>
                {saving ? "Saving..." : "Save config"}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="runtimeConfigJson">runtime.json</label>
            <textarea
              id="runtimeConfigJson"
              name="runtimeConfigJson"
              rows={10}
              value={runtimeText}
              onChange={(event) => setRuntimeText(event.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="field">
            <label htmlFor="questionsConfigJson">questions.json</label>
            <textarea
              id="questionsConfigJson"
              name="questionsConfigJson"
              rows={10}
              value={questionsText}
              onChange={(event) => setQuestionsText(event.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="field">
            <label htmlFor="promptsConfigJson">prompts.json</label>
            <textarea
              id="promptsConfigJson"
              name="promptsConfigJson"
              rows={10}
              value={promptsText}
              onChange={(event) => setPromptsText(event.target.value)}
              spellCheck={false}
            />
          </div>

          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}
        </div>
      </section>
    </>
  );
}
