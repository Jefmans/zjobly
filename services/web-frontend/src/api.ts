import type {
  AuthUser,
  CandidateProfile,
  CandidateProfileInput,
  CandidateApplication,
  CandidateInvitation,
  CandidateDev,
  Company,
  CompanyDev,
  Job,
  JobApplication,
  JobApplicationDetail,
  ApplicationStatus,
  InvitationStatus,
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
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postal_code?: string | null;
};

export type ProfileDraft = {
  headline: string;
  summary: string;
  location?: string | null;
  keywords?: string[];
};

const apiBase = () => {
  const base = (import.meta.env.VITE_API_URL || "").toString().trim();
  if (!base) {
    throw new Error("Missing VITE_API_URL. Set it to your API base, e.g. https://api.zjobly.com/videos");
  }
  return base.replace(/\/$/, "");
};

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${apiBase()}${path}`;
  const initHeaders =
    init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init.headers as Record<string, string> | undefined) || {};

  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...initHeaders,
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

export async function registerAccount(name: string, password: string): Promise<AuthUser> {
  return requestJson<AuthUser>("/accounts/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, password }),
  });
}

export async function loginAccount(name: string, password: string): Promise<AuthUser> {
  return requestJson<AuthUser>("/accounts/auth/login", {
    method: "POST",
    body: JSON.stringify({ name, password }),
  });
}

export async function logoutAccount(): Promise<void> {
  await requestJson<{ status: string }>("/accounts/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  try {
    return await requestJson<AuthUser>("/accounts/auth/me", { method: "GET" });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "";
    const message = rawMessage.toLowerCase();
    if (message.includes("401") || message.includes("not authenticated") || message.includes("invalid session")) {
      return null;
    }
    throw err;
  }
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

export async function getProfileDraftFromTranscript(
  transcript: string,
  signal?: AbortSignal,
): Promise<ProfileDraft> {
  return requestJson<ProfileDraft>("/nlp/profile-draft", {
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

export async function listCompaniesForDev(): Promise<CompanyDev[]> {
  return requestJson<CompanyDev[]>("/accounts/companies/dev", { method: "GET" });
}

export async function listCandidatesForDev(): Promise<CandidateDev[]> {
  return requestJson<CandidateDev[]>("/accounts/candidates/dev", { method: "GET" });
}

export async function upsertCandidateProfile(payload: CandidateProfileInput): Promise<CandidateProfile> {
  return requestJson<CandidateProfile>("/accounts/candidate-profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCandidateProfile(signal?: AbortSignal): Promise<CandidateProfile | null> {
  try {
    return await requestJson<CandidateProfile>("/accounts/candidate-profile", { method: "GET", signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      throw err;
    }
    const rawMessage = err instanceof Error ? err.message : "";
    const message = rawMessage.toLowerCase();
    if (message.includes("not found") || message.includes("404")) {
      return null;
    }
    throw err;
  }
}

export async function createJob(payload: {
  company_id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  location_id?: string | null;
  keywords?: string[] | null;
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

export async function publishJob(jobId: string): Promise<Job> {
  return requestJson<Job>(`/accounts/jobs/${encodeURIComponent(jobId)}/publish`, { method: "POST" });
}

export async function unpublishJob(jobId: string): Promise<Job> {
  return requestJson<Job>(`/accounts/jobs/${encodeURIComponent(jobId)}/unpublish`, { method: "POST" });
}

export async function applyToJob(jobId: string, payload: { video_object_key: string }): Promise<JobApplication> {
  return requestJson<JobApplication>(`/accounts/jobs/${encodeURIComponent(jobId)}/applications`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listJobApplications(jobId: string): Promise<JobApplicationDetail[]> {
  return requestJson<JobApplicationDetail[]>(`/accounts/jobs/${encodeURIComponent(jobId)}/applications`, {
    method: "GET",
  });
}

export async function listCandidateApplications(): Promise<CandidateApplication[]> {
  return requestJson<CandidateApplication[]>("/accounts/applications", { method: "GET" });
}

export async function updateJobApplication(
  jobId: string,
  applicationId: string,
  payload: { status: ApplicationStatus },
): Promise<JobApplication> {
  return requestJson<JobApplication>(
    `/accounts/jobs/${encodeURIComponent(jobId)}/applications/${encodeURIComponent(applicationId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function searchCandidates(query?: string): Promise<CandidateProfile[]> {
  const search = query ? `?q=${encodeURIComponent(query)}` : "";
  return requestJson<CandidateProfile[]>(`/accounts/candidates/search${search}`, { method: "GET" });
}

export async function searchCandidatesForJob(jobId: string): Promise<CandidateProfile[]> {
  const search = new URLSearchParams({ job_id: jobId });
  return requestJson<CandidateProfile[]>(`/accounts/candidates/search?${search.toString()}`, {
    method: "GET",
  });
}

export async function listCompanyInvitations(companyId: string): Promise<CandidateInvitation[]> {
  const search = new URLSearchParams({ company_id: companyId });
  return requestJson<CandidateInvitation[]>(
    `/accounts/candidates/invitations?${search.toString()}`,
    { method: "GET" },
  );
}

export async function inviteCandidate(
  companyId: string,
  candidateId: string,
): Promise<CandidateInvitation> {
  const search = new URLSearchParams({ company_id: companyId });
  return requestJson<CandidateInvitation>(
    `/accounts/candidates/${encodeURIComponent(candidateId)}/invitations?${search.toString()}`,
    { method: "POST" },
  );
}

export async function listCandidateInvitations(): Promise<CandidateInvitation[]> {
  return requestJson<CandidateInvitation[]>("/accounts/invitations", { method: "GET" });
}

export async function updateCandidateInvitation(
  invitationId: string,
  status: InvitationStatus,
): Promise<CandidateInvitation> {
  return requestJson<CandidateInvitation>(`/accounts/invitations/${encodeURIComponent(invitationId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function listCandidateFavorites(companyId: string): Promise<CandidateProfile[]> {
  const search = new URLSearchParams({ company_id: companyId });
  return requestJson<CandidateProfile[]>(`/accounts/candidates/favorites?${search.toString()}`, {
    method: "GET",
  });
}

export async function addCandidateFavorite(
  companyId: string,
  candidateId: string,
): Promise<CandidateProfile> {
  const search = new URLSearchParams({ company_id: companyId });
  return requestJson<CandidateProfile>(
    `/accounts/candidates/${encodeURIComponent(candidateId)}/favorite?${search.toString()}`,
    { method: "POST" },
  );
}

export async function removeCandidateFavorite(companyId: string, candidateId: string): Promise<void> {
  const search = new URLSearchParams({ company_id: companyId });
  await requestJson<{ status: string }>(
    `/accounts/candidates/${encodeURIComponent(candidateId)}/favorite?${search.toString()}`,
    { method: "DELETE" },
  );
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
