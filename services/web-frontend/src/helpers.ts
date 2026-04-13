export const formatDuration = (seconds: number | null) => {
  if (seconds === null || Number.isNaN(seconds)) return null;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
};

const normalizeKeywordValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const filterKeywordsByLocation = (
  keywords: string[] | null | undefined,
  location?: string | null,
): string[] => {
  if (!keywords || keywords.length === 0) return [];
  const normalizedLocation = normalizeKeywordValue(location ?? "");
  if (!normalizedLocation) return [...keywords];
  const locationTokens = normalizedLocation.split(" ").filter((token) => token.length > 1);
  return keywords.filter((keyword) => {
    const normalizedKeyword = normalizeKeywordValue(keyword);
    if (!normalizedKeyword) return false;
    if (normalizedKeyword === normalizedLocation) return false;
    if (normalizedLocation.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedLocation)) {
      return false;
    }
    if (locationTokens.includes(normalizedKeyword)) return false;
    return true;
  });
};

type LocationLike = {
  location?: string | null;
  location_details?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
};

export const formatLocationLabel = (item: LocationLike | null | undefined): string => {
  if (!item) return "Location not provided";
  if (item.location) return item.location;
  const details = item.location_details;
  if (!details) return "Location not provided";
  const parts = [details.city, details.region, details.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Location not provided";
};

export const formatDateLabel = (value?: string | null): string => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export const formatInvitationStatusLabel = (status?: string | null): string => {
  if (status === "pending") return "Pending";
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  return "Unknown";
};

export const makeTakeId = (prefix: "rec" | "upload") =>
  `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;

export type DetailedSignalDisplayMode = "summary" | "transcript" | "structured";

const normalizeDetailedSignalDisplayMode = (value: unknown): DetailedSignalDisplayMode | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "summary" || normalized === "value" || normalized === "prompt") return "summary";
  if (normalized === "transcript") return "transcript";
  if (normalized === "structured" || normalized === "schema") return "structured";
  return null;
};

export const normalizeDetailedSignalDisplayModes = (
  value: unknown,
): DetailedSignalDisplayMode[] | null => {
  const rawValues = Array.isArray(value) ? value : [value];
  const modes: DetailedSignalDisplayMode[] = [];
  rawValues.forEach((rawValue) => {
    const mode = normalizeDetailedSignalDisplayMode(rawValue);
    if (!mode) return;
    if (!modes.includes(mode)) modes.push(mode);
  });
  return modes.length > 0 ? modes : null;
};

export const resolveDetailedSignalDisplayModes = (value: unknown): DetailedSignalDisplayMode[] =>
  normalizeDetailedSignalDisplayModes(value) ?? ["summary", "structured"];

export const getDetailedSignalTranscriptText = (signal: {
  value?: string | null;
  transcript?: string | null;
  structured_data?: Record<string, unknown> | null;
}): string => {
  if (typeof signal?.transcript === "string" && signal.transcript.trim()) {
    return signal.transcript.trim();
  }
  const structuredData = signal?.structured_data;
  if (structuredData && typeof structuredData._transcript === "string" && structuredData._transcript.trim()) {
    return structuredData._transcript.trim();
  }
  return (signal?.value || "").toString().trim();
};

export const getDetailedSignalStructuredDataForDisplay = (
  structuredData: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null => {
  if (!structuredData || typeof structuredData !== "object" || Array.isArray(structuredData)) return null;
  const filtered = Object.fromEntries(
    Object.entries(structuredData).filter(([key]) => !key.startsWith("_")),
  );
  return Object.keys(filtered).length > 0 ? filtered : null;
};

type DetailedSignalLike = {
  question_id?: string | null;
  signal_key?: string | null;
  goal?: string | null;
  value?: string | null;
  show?: boolean | null;
};

const normalizeSignalPart = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const getDetailedSignalLabel = (signal: DetailedSignalLike | null | undefined): string => {
  if (!signal) return "signal";
  const primary = (signal.signal_key || "").toString().trim();
  if (primary) return primary;
  const secondary = (signal.goal || "").toString().trim();
  if (secondary) return secondary;
  const fallback = (signal.question_id || "").toString().trim();
  return fallback || "signal";
};

export const getDetailedSignalIdentityKey = (signal: DetailedSignalLike | null | undefined): string => {
  const questionId = normalizeSignalPart(signal?.question_id);
  const secondary = normalizeSignalPart(signal?.signal_key) || normalizeSignalPart(signal?.goal) || "signal";
  return `${questionId}::${secondary}`;
};

export const isVisibleDetailedSignal = <T extends DetailedSignalLike>(
  signal: T | null | undefined,
): signal is T => Boolean(signal && signal.show !== false && `${signal.question_id ?? ""}`.trim() && `${signal.value ?? ""}`.trim());
