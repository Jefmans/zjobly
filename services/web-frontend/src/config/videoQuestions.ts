import rawQuestionsConfig from "../../../../config/questions.json";
import rawDevQuestionsConfig from "../../../../config/dev_questions.json";
import rawSignalSchemasConfig from "../../../../config/signal_schemas.json";
import { runtimeConfig } from "./runtimeConfig";

export type VideoQuestion = {
  id: string;
  text: string;
  helperText?: string;
  extractors?: VideoQuestionExtractor[];
};

export type VideoQuestionExtractor = {
  signalKey: string;
  promptKey?: string;
  schemaKey?: string;
  outputSchema?: Record<string, unknown>;
  output?: VideoQuestionOutputMode[];
  show?: boolean;
};

export type VideoQuestionOutputMode = "prompt" | "transcript";

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
      extractors?: unknown;
      enabled?: unknown;
    };

type RawQuestionVariant = {
  id?: unknown;
  label?: unknown;
  questions?: unknown;
  enabled?: unknown;
};

type RawExtractor = {
  signal_key?: unknown;
  prompt_key?: unknown;
  schema_key?: unknown;
  output_schema?: unknown;
  output?: unknown;
  show?: unknown;
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

type RawSignalSchemasConfig = Record<string, unknown>;

export type QuestionSetName = "default" | "dev";

let defaultQuestionsConfig = rawQuestionsConfig as RawQuestionsConfig;
let devQuestionsConfig = rawDevQuestionsConfig as RawQuestionsConfig;
let signalSchemasConfig = rawSignalSchemasConfig as RawSignalSchemasConfig;

const normalizeQuestionSetName = (value: unknown): QuestionSetName => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "dev" || normalized === "development" ? "dev" : "default";
};

let activeQuestionSet: QuestionSetName = normalizeQuestionSetName(
  (runtimeConfig as { ui?: { activeQuestionSet?: unknown } }).ui?.activeQuestionSet,
);

const getConfigBySet = (setName: QuestionSetName): RawQuestionsConfig =>
  setName === "dev" ? devQuestionsConfig : defaultQuestionsConfig;

const normalizeSignalKey = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizePromptKey = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  return key.length > 0 ? key : undefined;
};

const normalizeSchemaKey = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  return key.length > 0 ? key : undefined;
};

const normalizeHelperText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
};

const normalizeShow = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
  if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  return undefined;
};

const normalizeOutputSchema = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const schema = { ...(value as Record<string, unknown>) };
  return schema;
};

const getSignalSchemaByKey = (schemaKey: string | undefined): Record<string, unknown> | undefined => {
  if (!schemaKey) return undefined;
  const candidate = signalSchemasConfig[schemaKey];
  return normalizeOutputSchema(candidate);
};

const normalizeOutputModeValue = (value: unknown): VideoQuestionOutputMode | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "prompt" || normalized === "summary") return "prompt";
  if (normalized === "transcript") return "transcript";
  return null;
};

const normalizeOutputModes = (value: unknown): VideoQuestionOutputMode[] | undefined => {
  const rawValues = Array.isArray(value) ? value : [value];
  const modes: VideoQuestionOutputMode[] = [];
  rawValues.forEach((rawValue) => {
    const normalized = normalizeOutputModeValue(rawValue);
    if (!normalized) return;
    if (!modes.includes(normalized)) modes.push(normalized);
  });
  return modes.length > 0 ? modes : undefined;
};

const normalizeExtractor = (value: RawExtractor): VideoQuestionExtractor | null => {
  if (!value || typeof value !== "object") return null;
  const signalKey = normalizeSignalKey(value.signal_key);
  if (!signalKey) return null;
  const promptKey = normalizePromptKey(value.prompt_key);
  const schemaKey = normalizeSchemaKey(value.schema_key);
  const outputSchema =
    normalizeOutputSchema(value.output_schema) ??
    getSignalSchemaByKey(schemaKey);
  const outputModes = normalizeOutputModes(value.output);
  const show = normalizeShow(value.show);
  const extractor: VideoQuestionExtractor = { signalKey };
  if (promptKey) extractor.promptKey = promptKey;
  if (schemaKey) extractor.schemaKey = schemaKey;
  if (outputSchema) extractor.outputSchema = outputSchema;
  if (outputModes) extractor.output = outputModes;
  if (typeof show === "boolean") extractor.show = show;
  return extractor;
};

const normalizeExtractors = (value: unknown): VideoQuestionExtractor[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const extractors = value
    .map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? normalizeExtractor(entry as RawExtractor)
        : null,
    )
    .filter((extractor): extractor is VideoQuestionExtractor => Boolean(extractor));
  return extractors.length > 0 ? extractors : undefined;
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
  const extractors = normalizeExtractors(value.extractors);
  const helperText = normalizeHelperText(value.helper_text);
  const question: VideoQuestion = { id, text };
  if (helperText) question.helperText = helperText;
  if (!extractors) return null;
  question.extractors = extractors;
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

const initialVideoQuestionConfig = buildVideoQuestionConfig(getConfigBySet(activeQuestionSet));

export const VIDEO_QUESTION_CONFIG = {
  candidateProfile: initialVideoQuestionConfig.candidateProfile,
  application: initialVideoQuestionConfig.application,
};

const rebuildActiveQuestionConfig = (): void => {
  const rebuilt = buildVideoQuestionConfig(getConfigBySet(activeQuestionSet));
  VIDEO_QUESTION_CONFIG.candidateProfile = rebuilt.candidateProfile;
  VIDEO_QUESTION_CONFIG.application = rebuilt.application;
};

export const getActiveQuestionSet = (): QuestionSetName => activeQuestionSet;

export const applyQuestionSetSelection = (nextSet: unknown): QuestionSetName => {
  activeQuestionSet = normalizeQuestionSetName(nextSet);
  rebuildActiveQuestionConfig();
  return activeQuestionSet;
};

export const applyQuestionsConfig = (nextQuestions: unknown, setName?: QuestionSetName): void => {
  if (!nextQuestions || typeof nextQuestions !== "object" || Array.isArray(nextQuestions)) return;
  const normalized = nextQuestions as RawQuestionsConfig;
  const targetSet = setName ?? activeQuestionSet;
  if (targetSet === "dev") {
    devQuestionsConfig = normalized;
  } else {
    defaultQuestionsConfig = normalized;
  }
  rebuildActiveQuestionConfig();
};

export const applySignalSchemasConfig = (nextSignalSchemas: unknown): void => {
  if (!nextSignalSchemas || typeof nextSignalSchemas !== "object" || Array.isArray(nextSignalSchemas)) return;
  signalSchemasConfig = nextSignalSchemas as RawSignalSchemasConfig;
  rebuildActiveQuestionConfig();
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
