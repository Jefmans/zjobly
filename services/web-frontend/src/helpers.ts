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

export const makeTakeId = (prefix: "rec" | "upload") =>
  `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
