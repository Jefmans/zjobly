import rawQuestionsConfig from "../../../../config/questions.json";

export type VideoQuestion = {
  id: string;
  text: string;
  helperText?: string;
  goals?: string[];
  signalKey?: string;
  promptKey?: string;
  outputSchema?: Record<string, unknown>;
  captureText?: {
    mode: "none" | "excerpt" | "full" | "summary";
    promptKey?: string;
    maxChars?: number;
  };
};

export type VideoQuestionVariant = {
  id: string;
  label: string;
  questions: VideoQuestion[];
  enabled?: boolean;
};

export type VideoQuestionConfig = {
  enabled: boolean;
  storageKey: string;
  variants: VideoQuestionVariant[];
  defaultVariantId?: string;
  assignment?: "fixed" | "random";
  jobVariantOverrides?: Record<string, string>;
};

export type JobQuestionOverride = {
  enabled: boolean;
  questions: string[];
  updatedAt?: string;
};

type RawQuestion =
  | string
  | {
      id?: unknown;
      text?: unknown;
      helper_text?: unknown;
      helperText?: unknown;
      subtext?: unknown;
      goals?: unknown;
      signal_key?: unknown;
      signalKey?: unknown;
      target_field?: unknown;
      targetField?: unknown;
      prompt_key?: unknown;
      promptKey?: unknown;
      output_schema?: unknown;
      outputSchema?: unknown;
      capture_text?: unknown;
      captureText?: unknown;
      enabled?: unknown;
    };

type RawQuestionVariant = {
  id?: unknown;
  label?: unknown;
  questions?: unknown;
  enabled?: unknown;
};

type RawQuestionSet = {
  enabled?: unknown;
  assignment?: unknown;
  variants?: unknown;
};

type RawQuestionsConfig = {
  questions?: {
    candidateProfile?: RawQuestionSet;
    application?: RawQuestionSet;
  };
};

let questionsConfig = rawQuestionsConfig as RawQuestionsConfig;
type LegacyTargetField = "headline" | "location" | "summary" | "keywords" | "transcript";

const normalizeGoals = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const goals = value
    .map((goal) => (typeof goal === "string" ? goal.trim() : ""))
    .filter((goal) => goal.length > 0);
  return goals.length > 0 ? goals : undefined;
};

const normalizeTargetField = (
  value: unknown,
): LegacyTargetField | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "headline" ||
    normalized === "location" ||
    normalized === "summary" ||
    normalized === "keywords" ||
    normalized === "transcript"
  ) {
    return normalized;
  }
  return undefined;
};

const normalizeSignalKey = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const mapLegacyTargetFieldToSignalKey = (value: unknown): string | undefined => {
  const target = normalizeTargetField(value);
  if (!target) return undefined;
  if (target === "headline") return "desired_role";
  if (target === "location") return "desired_location";
  if (target === "summary") return "profile_summary";
  if (target === "keywords") return "core_skills";
  if (target === "transcript") return "raw_transcript";
  return undefined;
};

const normalizePromptKey = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  return key.length > 0 ? key : undefined;
};

const normalizeHelperText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
};

const normalizeCaptureTextMode = (
  value: unknown,
): "none" | "excerpt" | "full" | "summary" | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "none") return "none";
  if (normalized === "excerpt") return "excerpt";
  if (normalized === "full" || normalized === "full_transcript") return "full";
  if (normalized === "summary") return "summary";
  return undefined;
};

const normalizeCaptureText = (
  value: unknown,
): VideoQuestion["captureText"] | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as {
    mode?: unknown;
    prompt_key?: unknown;
    promptKey?: unknown;
    max_chars?: unknown;
    maxChars?: unknown;
  };
  const mode = normalizeCaptureTextMode(raw.mode);
  if (!mode) return undefined;
  const promptKey = normalizePromptKey(raw.prompt_key ?? raw.promptKey);
  const maxCharsRaw = Number(raw.max_chars ?? raw.maxChars);
  const maxChars =
    Number.isFinite(maxCharsRaw) && maxCharsRaw > 0
      ? Math.min(2000, Math.max(60, Math.round(maxCharsRaw)))
      : undefined;

  const captureText: VideoQuestion["captureText"] = { mode };
  if (promptKey) captureText.promptKey = promptKey;
  if (typeof maxChars === "number") captureText.maxChars = maxChars;
  return captureText;
};

const normalizeOutputSchema = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};

const normalizeQuestion = (
  value: RawQuestion,
  index: number,
  variantId: string,
): VideoQuestion | null => {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    return { id: `${variantId}-q${index + 1}`, text };
  }
  if (!value || typeof value !== "object") return null;
  if (value.enabled === false) return null;
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!text) return null;
  const id =
    typeof value.id === "string" && value.id.trim().length > 0
      ? value.id.trim()
      : `${variantId}-q${index + 1}`;
  const goals = normalizeGoals(value.goals);
  const helperText = normalizeHelperText(
    value.helper_text ?? value.helperText ?? value.subtext,
  );
  const signalKey =
    normalizeSignalKey(value.signal_key ?? value.signalKey) ??
    mapLegacyTargetFieldToSignalKey(value.target_field ?? value.targetField);
  const promptKey = normalizePromptKey(value.prompt_key ?? value.promptKey);
  const outputSchema = normalizeOutputSchema(value.output_schema ?? value.outputSchema);
  const captureText = normalizeCaptureText(value.capture_text ?? value.captureText);
  const question: VideoQuestion = { id, text };
  if (helperText) question.helperText = helperText;
  if (goals) question.goals = goals;
  if (signalKey) question.signalKey = signalKey;
  if (promptKey) question.promptKey = promptKey;
  if (outputSchema) question.outputSchema = outputSchema;
  if (captureText) question.captureText = captureText;
  return question;
};

const normalizeVariants = (
  value: unknown,
  fallbackPrefix: string,
): VideoQuestionVariant[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((variantValue, variantIndex) => {
      const variant = variantValue as RawQuestionVariant;
      const id =
        typeof variant.id === "string" && variant.id.trim().length > 0
          ? variant.id.trim()
          : `${fallbackPrefix}-${variantIndex + 1}`;
      const label =
        typeof variant.label === "string" && variant.label.trim().length > 0
          ? variant.label.trim()
          : `Variant ${variantIndex + 1}`;
      const rawQuestions = Array.isArray(variant.questions)
        ? (variant.questions as RawQuestion[])
        : [];
      const questions = rawQuestions
        .map((question, questionIndex) =>
          normalizeQuestion(question, questionIndex, id),
        )
        .filter((question): question is VideoQuestion => Boolean(question));
      if (questions.length === 0) return null;
      return {
        id,
        label,
        questions,
        enabled: variant.enabled !== false,
      } as VideoQuestionVariant;
    })
    .filter((variant): variant is VideoQuestionVariant => Boolean(variant));
};

const createQuestionConfig = (
  rawSet: RawQuestionSet | undefined,
  storageKey: string,
  fallbackPrefix: string,
): VideoQuestionConfig => {
  return {
    enabled: rawSet?.enabled !== false,
    storageKey,
    assignment: rawSet?.assignment === "random" ? "random" : "fixed",
    variants: normalizeVariants(rawSet?.variants, fallbackPrefix),
    jobVariantOverrides: {},
  };
};

const buildVideoQuestionConfig = (configSource: RawQuestionsConfig) => ({
  candidateProfile: createQuestionConfig(
    configSource.questions?.candidateProfile,
    "candidate-profile",
    "candidate-profile",
  ),
  application: createQuestionConfig(
    configSource.questions?.application,
    "application-video",
    "application-video",
  ),
});

const initialVideoQuestionConfig = buildVideoQuestionConfig(questionsConfig);

export const VIDEO_QUESTION_CONFIG = {
  candidateProfile: initialVideoQuestionConfig.candidateProfile,
  application: initialVideoQuestionConfig.application,
};

export const applyQuestionsConfig = (nextQuestions: unknown): void => {
  if (!nextQuestions || typeof nextQuestions !== "object" || Array.isArray(nextQuestions)) return;
  const normalized = nextQuestions as RawQuestionsConfig;
  questionsConfig = normalized;
  const rebuilt = buildVideoQuestionConfig(normalized);
  VIDEO_QUESTION_CONFIG.candidateProfile = rebuilt.candidateProfile;
  VIDEO_QUESTION_CONFIG.application = rebuilt.application;
};

const STORAGE_PREFIX = "zjobly-question-variant:";
const JOB_OVERRIDE_PREFIX = "zjobly-job-questions:";

const isJobOverride = (value: unknown): value is JobQuestionOverride => {
  if (!value || typeof value !== "object") return false;
  const record = value as { enabled?: unknown; questions?: unknown };
  if (typeof record.enabled !== "boolean") return false;
  if (!Array.isArray(record.questions)) return false;
  return record.questions.every((question) => typeof question === "string");
};

export const getJobQuestionOverride = (jobId: string): JobQuestionOverride | null => {
  if (!jobId) return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${JOB_OVERRIDE_PREFIX}${jobId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isJobOverride(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const saveJobQuestionOverride = (
  jobId: string,
  override: JobQuestionOverride | null,
): void => {
  if (!jobId) return;
  if (typeof window === "undefined") return;
  try {
    if (!override) {
      window.localStorage.removeItem(`${JOB_OVERRIDE_PREFIX}${jobId}`);
      return;
    }
    window.localStorage.setItem(
      `${JOB_OVERRIDE_PREFIX}${jobId}`,
      JSON.stringify({
        ...override,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore storage failures
  }
};

const getEnabledVariants = (config: VideoQuestionConfig) =>
  config.variants.filter((variant) => (variant.enabled ?? true) && variant.questions.length > 0);

const pickVariantById = (variants: VideoQuestionVariant[], id?: string) =>
  variants.find((variant) => variant.id === id) ?? null;

const pickAssignedVariant = (config: VideoQuestionConfig, variants: VideoQuestionVariant[]) => {
  const defaultVariant =
    pickVariantById(variants, config.defaultVariantId) ?? variants[0] ?? null;
  if (!defaultVariant) return null;
  if (config.assignment !== "random" || variants.length < 2) return defaultVariant;

  const storageKey = `${STORAGE_PREFIX}${config.storageKey}`;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(storageKey);
      const storedVariant = pickVariantById(variants, stored ?? undefined);
      if (storedVariant) return storedVariant;
      const randomVariant = variants[Math.floor(Math.random() * variants.length)];
      window.localStorage.setItem(storageKey, randomVariant.id);
      return randomVariant;
    } catch {
      return defaultVariant;
    }
  }
  return defaultVariant;
};

export const getQuestionSet = (
  config: VideoQuestionConfig,
  options?: { jobId?: string | null; jobOverride?: JobQuestionOverride | null },
): { variant: VideoQuestionVariant; questions: VideoQuestion[] } | null => {
  if (options?.jobOverride?.enabled && options.jobOverride.questions.length > 0) {
    const questions = options.jobOverride.questions
      .map((text, index) =>
        normalizeQuestion(text, index, "job-override"),
      )
      .filter((question): question is VideoQuestion => Boolean(question));
    if (questions.length === 0) return null;
    return {
      variant: { id: "job-override", label: "Job override", questions },
      questions,
    };
  }
  if (!config.enabled) return null;
  const variants = getEnabledVariants(config);
  if (variants.length === 0) return null;

  if (options?.jobId && config.jobVariantOverrides) {
    const overrideId = config.jobVariantOverrides[options.jobId];
    const overrideVariant = pickVariantById(variants, overrideId);
    if (overrideVariant) {
      return { variant: overrideVariant, questions: overrideVariant.questions };
    }
  }

  const variant = pickAssignedVariant(config, variants);
  if (!variant) return null;
  return { variant, questions: variant.questions };
};
