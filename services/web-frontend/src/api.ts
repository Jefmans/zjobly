import type {
  CandidateProfile,
  CandidateProfileInput,
  Company,
  Job,
  JobStatus,
  JobVisibility,
} from "./types";

type UploadUrlResponse = {
  upload_url: string;
  object_key: string;
  expires_in: number;
};

type ConfirmUploadPayload = {
  object_key: string;
  duration_seconds?: number | null;
  source: "recording" | "upload";
};

type AudioChunkUrlResponse = {
  upload_url: string;
  object_key: string;
  expires_in: number;
};

export type AudioTranscriptStatus = "pending" | "partial" | "final";

type AudioSessionTranscriptResponse = {
  status: AudioTranscriptStatus;
  transcript: string;
  chunk_count: number;
};

export type JobDraft = {
  title: string;
  description: string;
  keywords?: string[];
  transcript?: string;
};

export type LocationSuggestion = {
  location: string | null;
};

const LOCAL_USER_KEY = "zjobly-user-id";

const apiBase = () => {
  const base = (import.meta.env.VITE_API_URL || "").toString().trim();
  if (!base) {
    throw new Error("Missing VITE_API_URL. Set it to your API base, e.g. https://api.zjobly.com/videos");
  }
  return base.replace(/\/$/, "");
};

const normalizeUserId = (id: string) => {
  const clean = id.replace(/[^a-zA-Z0-9]/g, "");
  if (clean) return clean.slice(0, 32);
  return (crypto.randomUUID?.().replace(/-/g, "") || `user${Date.now()}`).slice(0, 32);
};

const resolveUserId = (): string => {
  const envId = (import.meta.env.VITE_USER_ID || "").toString().trim();
  const normalizedEnv = envId ? normalizeUserId(envId) : null;
  const generateId = () => normalizeUserId(crypto.randomUUID?.() || `user${Date.now()}`);
  try {
    const cached = localStorage.getItem(LOCAL_USER_KEY);
    if (cached) return normalizeUserId(cached);
    const resolved = normalizedEnv || generateId();
    localStorage.setItem(LOCAL_USER_KEY, resolved);
    return resolved;
  } catch {
    return normalizedEnv || generateId();
  }
};


const resolveUserEmail = (): string | undefined => {
  const envEmail = (import.meta.env.VITE_USER_EMAIL || "").toString().trim();
  return envEmail || undefined;
};

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${apiBase()}${path}`;
  const userId = resolveUserId();
  const userEmail = resolveUserEmail();
  const initHeaders =
    init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init.headers as Record<string, string> | undefined) || {};

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...initHeaders,
      ...(userId ? { "X-User-Id": userId } : {}),
      ...(userEmail ? { "X-User-Email": userEmail } : {}),
    },
  });

  let body: any = null;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (isJson) {
    body = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const detail = body?.detail || body?.message;
    const msg = detail ? `${detail}` : `Request failed with status ${res.status}`;
    throw new Error(msg);
  }

  return body as T;
}

export async function createUploadUrl(file: File): Promise<UploadUrlResponse> {
  return requestJson<UploadUrlResponse>("/upload-url", {
    method: "POST",
    body: JSON.stringify({
      file_name: file.name,
      content_type: file.type || undefined,
    }),
  });
}

export async function confirmUpload(payload: ConfirmUploadPayload) {
  return requestJson<{ status: string; object_key: string }>("/confirm-upload", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createAudioChunkUrl(payload: {
  session_id: string;
  chunk_index: number;
  content_type?: string;
  file_name?: string;
}): Promise<AudioChunkUrlResponse> {
  return requestJson<AudioChunkUrlResponse>("/audio-chunk-url", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function confirmAudioChunk(payload: {
  session_id: string;
  chunk_index: number;
  object_key: string;
}) {
  return requestJson<{ status: string; object_key: string }>("/audio-chunk-confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function finalizeAudioSession(payload: { session_id: string; total_chunks: number }) {
  return requestJson<{ status: string }>("/audio-session/finalize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAudioSessionTranscript(sessionId: string): Promise<AudioSessionTranscriptResponse> {
  return requestJson<AudioSessionTranscriptResponse>(`/audio-session/${encodeURIComponent(sessionId)}/transcript`, {
    method: "GET",
  });
}

export async function generateJobDraftFromTranscript(transcript: string): Promise<JobDraft> {
  return requestJson<JobDraft>("/nlp/job-draft", {
    method: "POST",
    body: JSON.stringify({ transcript }),
  });
}

export async function generateJobDraftFromVideo(objectKey: string): Promise<JobDraft> {
  return requestJson<JobDraft>("/nlp/job-draft-from-video", {
    method: "POST",
    body: JSON.stringify({ object_key: objectKey }),
  });
}

export async function getLocationFromTranscript(
  transcript: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion> {
  return requestJson<LocationSuggestion>("/nlp/location-from-transcript", {
    method: "POST",
    body: JSON.stringify({ transcript }),
    signal,
  });
}

export async function createCompany(payload: { name: string; website?: string | null }): Promise<Company> {
  return requestJson<Company>("/accounts/companies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function upsertCandidateProfile(payload: CandidateProfileInput): Promise<CandidateProfile> {
  return requestJson<CandidateProfile>("/accounts/candidate-profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createJob(payload: {
  company_id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  status?: JobStatus;
  visibility?: JobVisibility;
  video_object_key?: string | null;
}): Promise<Job> {
  return requestJson<Job>("/accounts/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listCompanyJobs(companyId: string): Promise<Job[]> {
  const search = new URLSearchParams({ company_id: companyId });
  return requestJson<Job[]>(`/accounts/jobs?${search.toString()}`, { method: "GET" });
}

export async function searchPublicJobs(query?: string): Promise<Job[]> {
  const search = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson<Job[]>(`/accounts/jobs/search${search}`, { method: "GET" });
}

export async function searchCandidates(query?: string): Promise<CandidateProfile[]> {
  const search = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson<CandidateProfile[]>(`/accounts/candidates/search${search}`, { method: "GET" });
}

export function uploadFileToUrl(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const contentType = file.type || "application/octet-stream";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress?.(percent);
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error while uploading the video. Please try again."));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}.`));
      }
    };

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}
