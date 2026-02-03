import { appConfig } from "./appConfig";

export type VideoQuestionVariant = {
  id: string;
  label: string;
  questions: string[];
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

const candidateProfileQuestions: VideoQuestionConfig = {
  enabled: Boolean(appConfig.questions.candidateProfile.enabled),
  storageKey: "candidate-profile",
  assignment: appConfig.questions.candidateProfile.assignment === "random" ? "random" : "fixed",
  variants: appConfig.questions.candidateProfile.variants.map((variant) => ({
    id: variant.id,
    label: variant.label,
    questions: variant.questions,
  })),
};

const applicationQuestions: VideoQuestionConfig = {
  enabled: Boolean(appConfig.questions.application.enabled),
  storageKey: "application-video",
  assignment: appConfig.questions.application.assignment === "random" ? "random" : "fixed",
  variants: appConfig.questions.application.variants.map((variant) => ({
    id: variant.id,
    label: variant.label,
    questions: variant.questions,
  })),
  jobVariantOverrides: {},
};

export const VIDEO_QUESTION_CONFIG = {
  candidateProfile: candidateProfileQuestions,
  application: applicationQuestions,
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
  id ? variants.find((variant) => variant.id === id) ?? null : null;

const pickAssignedVariant = (config: VideoQuestionConfig, variants: VideoQuestionVariant[]) => {
  const defaultVariant =
    pickVariantById(variants, config.defaultVariantId) ?? (variants.length > 0 ? variants[0] : null);
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
): { variant: VideoQuestionVariant; questions: string[] } | null => {
  if (options?.jobOverride?.enabled && options.jobOverride.questions.length > 0) {
    return {
      variant: { id: "job-override", label: "Job override", questions: options.jobOverride.questions },
      questions: options.jobOverride.questions,
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
