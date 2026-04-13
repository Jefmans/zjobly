import { ReactNode, useEffect, useState } from "react";
import {
  AdminConfigBundle,
  getAdminConfigBundle,
  updateAdminConfigBundle,
} from "../api";
import { applyRuntimeConfig } from "../config/runtimeConfig";
import {
  applyQuestionsConfig,
  applyQuestionSetSelection,
  applySignalSchemasConfig,
  QuestionSetName,
} from "../config/videoQuestions";

type Props = {
  nav: ReactNode;
};

const DEFAULT_CONFIG: AdminConfigBundle = {
  runtime: {},
  questions: {},
  dev_questions: {},
  prompts: {},
  signal_schemas: {},
  active_question_set: "default",
};

const stringifyConfig = (value: Record<string, unknown>) =>
  JSON.stringify(value ?? {}, null, 2);

const normalizeQuestionSetName = (value: unknown): QuestionSetName =>
  typeof value === "string" && value.trim().toLowerCase() === "dev" ? "dev" : "default";

export function ConfigAdminView({ nav }: Props) {
  const [runtimeText, setRuntimeText] = useState<string>(stringifyConfig(DEFAULT_CONFIG.runtime));
  const [defaultQuestionsText, setDefaultQuestionsText] = useState<string>(
    stringifyConfig(DEFAULT_CONFIG.questions),
  );
  const [devQuestionsText, setDevQuestionsText] = useState<string>(
    stringifyConfig(DEFAULT_CONFIG.dev_questions ?? {}),
  );
  const [promptsText, setPromptsText] = useState<string>(stringifyConfig(DEFAULT_CONFIG.prompts));
  const [signalSchemasText, setSignalSchemasText] = useState<string>(
    stringifyConfig(DEFAULT_CONFIG.signal_schemas ?? {}),
  );
  const [activeQuestionSet, setActiveQuestionSet] = useState<QuestionSetName>("default");
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
      setDefaultQuestionsText(stringifyConfig(config.questions));
      setDevQuestionsText(stringifyConfig(config.dev_questions ?? {}));
      setPromptsText(stringifyConfig(config.prompts));
      setSignalSchemasText(stringifyConfig(config.signal_schemas ?? {}));
      const selectedSet = normalizeQuestionSetName(config.active_question_set);
      setActiveQuestionSet(selectedSet);
      applyRuntimeConfig(config.runtime);
      applyQuestionSetSelection(selectedSet);
      applyQuestionsConfig(config.questions, "default");
      applyQuestionsConfig(config.dev_questions ?? {}, "dev");
      applySignalSchemasConfig(config.signal_schemas ?? {});
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not load config.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

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
        questions: parseConfigSection("questions", defaultQuestionsText),
        dev_questions: parseConfigSection("dev_questions", devQuestionsText),
        prompts: parseConfigSection("prompts", promptsText),
        signal_schemas: parseConfigSection("signal_schemas", signalSchemasText),
        active_question_set: activeQuestionSet,
      };
      const updated = await updateAdminConfigBundle(payload);
      setRuntimeText(stringifyConfig(updated.runtime));
      setDefaultQuestionsText(stringifyConfig(updated.questions));
      setDevQuestionsText(stringifyConfig(updated.dev_questions ?? {}));
      setPromptsText(stringifyConfig(updated.prompts));
      setSignalSchemasText(stringifyConfig(updated.signal_schemas ?? {}));
      const selectedSet = normalizeQuestionSetName(updated.active_question_set);
      setActiveQuestionSet(selectedSet);
      applyRuntimeConfig(updated.runtime);
      applyQuestionSetSelection(selectedSet);
      applyQuestionsConfig(updated.questions, "default");
      applyQuestionsConfig(updated.dev_questions ?? {}, "dev");
      applySignalSchemasConfig(updated.signal_schemas ?? {});
      setSuccess("Config saved and applied.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not save config.");
    } finally {
      setSaving(false);
    }
  };

  const questionsText = activeQuestionSet === "dev" ? devQuestionsText : defaultQuestionsText;
  const questionsLabel = activeQuestionSet === "dev" ? "dev_questions.json" : "questions.json";

  return (
    <>
      {nav}
      <section className="hero">
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
            <label htmlFor="activeQuestionSet">Active question set</label>
            <select
              id="activeQuestionSet"
              name="activeQuestionSet"
              value={activeQuestionSet}
              onChange={(event) => setActiveQuestionSet(normalizeQuestionSetName(event.target.value))}
              disabled={loading || saving}
            >
              <option value="default">default (questions.json)</option>
              <option value="dev">dev (dev_questions.json)</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="questionsConfigJson">{questionsLabel}</label>
            <textarea
              id="questionsConfigJson"
              name="questionsConfigJson"
              rows={10}
              value={questionsText}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (activeQuestionSet === "dev") {
                  setDevQuestionsText(nextValue);
                } else {
                  setDefaultQuestionsText(nextValue);
                }
              }}
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

          <div className="field">
            <label htmlFor="signalSchemasConfigJson">signal_schemas.json</label>
            <textarea
              id="signalSchemasConfigJson"
              name="signalSchemasConfigJson"
              rows={10}
              value={signalSchemasText}
              onChange={(event) => setSignalSchemasText(event.target.value)}
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

