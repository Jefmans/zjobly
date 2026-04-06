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
