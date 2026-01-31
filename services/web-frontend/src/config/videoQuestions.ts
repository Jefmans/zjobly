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

const candidateProfileQuestions: VideoQuestionConfig = {
  enabled: true,
  storageKey: "candidate-profile",
  assignment: "fixed",
  variants: [
    {
      id: "baseline",
      label: "Baseline",
      questions: [
        "Where are you looking for a job?",
        "What is your education? Where did you study?",
        "What do you like in a job?",
        "What are your strengths and weaknesses?",
        "What are your strongest skills?",
      ],
    },
  ],
};

const applicationQuestions: VideoQuestionConfig = {
  enabled: false,
  storageKey: "application-video",
  assignment: "fixed",
  variants: [
    {
      id: "baseline",
      label: "Baseline",
      questions: [
        "Why do you want this job?",
        "What would your first 90 days look like?",
        "Which skills make you a strong fit?",
      ],
    },
  ],
  jobVariantOverrides: {},
};

export const VIDEO_QUESTION_CONFIG = {
  candidateProfile: candidateProfileQuestions,
  application: applicationQuestions,
};

const STORAGE_PREFIX = "zjobly-question-variant:";

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
  options?: { jobId?: string | null },
): { variant: VideoQuestionVariant; questions: string[] } | null => {
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
