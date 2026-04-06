import { runtimeConfig } from './config/runtimeConfig';
import { AuthUser, CandidateProfileInput, CandidateStep, CreateStep, UserRole, ViewMode } from './types';

const getPositiveNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const MAX_VIDEO_SECONDS = getPositiveNumber(
  runtimeConfig.video?.maxDurationSeconds,
  180,
);
export const AUDIO_CHUNK_MS = getPositiveNumber(runtimeConfig.video?.audioChunkMs, 5000);
export const AUDIO_TRANSCRIPT_POLL_MS = getPositiveNumber(
  runtimeConfig.video?.audioTranscriptPollMs,
  3000,
);
export const MIN_TRANSCRIPT_FOR_DRAFT = getPositiveNumber(
  runtimeConfig.transcript?.autoDraftMinChars,
  30,
);
export const INITIAL_FORM_STATE = { title: '', location: '', description: '', companyName: '' };
export const ROLE_STORAGE_KEY = 'zjobly-user-role';
export const VIEW_STORAGE_KEY = 'zjobly-view';
export const USER_STORAGE_KEY = 'zjobly-user-id';
export const COMPANY_STORAGE_KEY = 'zjobly-company-id';
export const DEV_AUTH_PREVIEW_STORAGE_KEY = 'zjobly-dev-auth-preview';
export const ADMIN_CONFIG_PATH = '/admin';
export const INITIAL_CANDIDATE_PROFILE: CandidateProfileInput = {
  headline: '',
  location: '',
  summary: '',
  discoverable: true,
};
export const ENABLE_AUDIO_CHUNKS = Boolean(runtimeConfig.video?.enableAudioChunks);
export const PROCESSING_STUB_INTERVAL_MS = getPositiveNumber(
  runtimeConfig.processing?.stubPollIntervalMs,
  2000,
);
export const PROCESSING_STUB_SUCCESS_AFTER_ATTEMPTS = getPositiveNumber(
  runtimeConfig.processing?.stubSuccessAfterAttempts,
  3,
);
export const SHOW_DEVELOPMENT_NAVIGATION =
  runtimeConfig.ui?.showDevelopmentNavigation !== false;

const ADMIN_USER_ALLOWLIST = (() => {
  const raw = runtimeConfig.ui?.adminUserAllowlist;
  if (!Array.isArray(raw)) return ['admin'];
  const normalized = raw
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : ['admin'];
})();

const isAdminIdentity = (value: string | null | undefined): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ADMIN_USER_ALLOWLIST.includes(normalized);
};

export const isAdminUser = (user: AuthUser | null): boolean => {
  if (!user) return false;
  return (
    isAdminIdentity(user.id) ||
    isAdminIdentity(user.username) ||
    isAdminIdentity(user.name)
  );
};

type LocationSuggestion = {
  location: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postal_code?: string | null;
};

export const formatLocationSuggestion = (suggestion: LocationSuggestion): string => {
  const fallback = (suggestion.location || '').trim();
  const parts = [suggestion.city, suggestion.region, suggestion.postal_code, suggestion.country]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  if (parts.length === 0) return fallback;
  if (!fallback) return parts.join(', ');
  const fallbackLower = fallback.toLowerCase();
  const partsLower = parts.map((part) => part.toLowerCase());
  if (!partsLower.includes(fallbackLower)) {
    return [fallback, ...parts].join(', ');
  }
  return parts.join(', ');
};

export const getStoredRole = (): UserRole | null => {
  try {
    const stored = localStorage.getItem(ROLE_STORAGE_KEY);
    if (stored === 'candidate' || stored === 'employer') {
      return stored;
    }
  } catch {
    // ignore storage failures
  }
  return null;
};

export const getStoredUserId = (): string => {
  const envId = (import.meta.env.VITE_USER_ID || '').toString().trim();
  try {
    return localStorage.getItem(USER_STORAGE_KEY) || envId || '';
  } catch {
    return envId || '';
  }
};

export const getStoredView = (): ViewMode => {
  const storedRole = getStoredRole();
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'jobs') return 'jobs';
    if (stored === 'applications' && storedRole === 'candidate') return 'applications';
    if (stored === 'candidates' && storedRole === 'employer') return 'candidates';
    if (stored === 'candidateFavorites' && storedRole === 'employer') return 'candidateFavorites';
    if (stored === 'jobMatches' && storedRole === 'employer') return 'jobMatches';
    if (stored === 'invitations' && storedRole) return 'invitations';
    if (stored === 'create' && storedRole === 'employer') return 'create';
    if (stored === 'profile' && storedRole === 'candidate') return 'profile';
    if (stored === 'find' && storedRole === 'candidate') return 'find';
    if (stored === 'adminConfig') return 'adminConfig';
  } catch {
    // ignore storage failures
  }
  return 'welcome';
};

const normalizePath = (pathname: string): string => {
  if (!pathname) return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
};

export const getViewFromPath = (pathname: string): ViewMode | null => {
  const normalized = normalizePath(pathname);
  if (normalized === ADMIN_CONFIG_PATH) {
    return 'adminConfig';
  }
  return null;
};

export const getPathForView = (view: ViewMode): string => {
  if (view === 'adminConfig') {
    return ADMIN_CONFIG_PATH;
  }
  return '/';
};

export const getScreenLabel = (
  view: ViewMode,
  step: CreateStep,
  candidateStep: CandidateStep,
  role: UserRole | null,
  authenticated: boolean,
): string => {
  let base = 'Screen:Unknown';
  if (view === 'welcome') {
    base = 'Screen:Welcome';
  } else if (view === 'find') {
    if (candidateStep === 'intro') base = 'Screen:FindZjob/FlowIntro';
    else if (candidateStep === 'record') base = 'Screen:FindZjob/RecordVideo';
    else if (candidateStep === 'select') base = 'Screen:FindZjob/SelectVideo';
    else base = authenticated ? 'Screen:MyProfile/Edit' : 'Screen:FindZjob/ProfileDetail';
  } else if (view === 'profile') {
    base = 'Screen:MyProfile/Detail';
  } else if (view === 'apply') {
    base = 'Screen:FindZjob/ApplyVideo';
  } else if (view === 'applications') {
    base = 'Screen:FindZjob/MyApplications';
  } else if (view === 'jobs') {
    base = role === 'candidate' ? 'Screen:FindZjob/JobsList' : 'Screen:MyJobs/List';
  } else if (view === 'candidates') {
    base = 'Screen:FindCandidates/Search';
  } else if (view === 'candidateFavorites') {
    base = 'Screen:FindCandidates/Favorites';
  } else if (view === 'candidateDetail') {
    base = 'Screen:FindCandidates/Detail';
  } else if (view === 'jobMatches') {
    base = 'Screen:MyJobs/Matches';
  } else if (view === 'invitations') {
    base = role === 'candidate'
      ? 'Screen:MyInvitations/List'
      : 'Screen:FindCandidates/Invitations';
  } else if (view === 'adminConfig') {
    base = 'Screen:Admin/Config';
  } else if (view === 'jobDetail') {
    base = role === 'candidate' ? 'Screen:FindZjob/JobDetail' : 'Screen:MyJobs/Detail';
  } else if (view === 'create') {
    if (step === 'record') base = 'Screen:CreateZjob/RecordVideo';
    else if (step === 'select') base = 'Screen:CreateZjob/SelectVideo';
    else base = 'Screen:CreateZjob/JobDetails';
  }
  return `${base}/${authenticated ? 'LoggedIn' : 'LoggedOut'}`;
};

export type AuthPromptState = {
  title: string;
  message: string;
  returnToHomeOnSuccess: boolean;
};

export type AuthPromptOptions = {
  title: string;
  message: string;
  mode?: 'login' | 'register';
  returnToHomeOnSuccess?: boolean;
};

export type DevAuthPreviewMode = 'real' | 'loggedOut' | 'loggedIn';

export const DEV_PREVIEW_AUTH_USER: AuthUser = {
  id: 'dev-preview-user',
  username: 'dev-preview',
  name: 'Dev preview user',
};

export const getStoredDevAuthPreviewMode = (): DevAuthPreviewMode => {
  if (!SHOW_DEVELOPMENT_NAVIGATION) return 'real';
  try {
    const stored = localStorage.getItem(DEV_AUTH_PREVIEW_STORAGE_KEY);
    if (stored === 'loggedOut' || stored === 'loggedIn' || stored === 'real') {
      return stored;
    }
  } catch {
    // ignore storage failures
  }
  return 'real';
};
