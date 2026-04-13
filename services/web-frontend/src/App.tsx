import { CSSProperties, ChangeEvent, FormEvent, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { AppNavigation } from './components/AppNavigation';
import { ScreenLabel } from './components/ScreenLabel';
import {
  confirmUpload,
  confirmAudioChunk,
  createCompany,
  createJob,
  createAudioChunkUrl,
  createUploadUrl,
  getCurrentAuthUser,
  generateJobDraftFromTranscript,
  generateJobDraftFromVideo,
  getCandidateProfile,
  getLocationFromTranscript,
  loginAccount,
  logoutAccount,
  getProfileDraftFromTranscript,
  getSignalFromTranscript,
  finalizeAudioSession,
  getAudioSessionTranscript,
  getCandidateById,
  listCandidateFavorites,
  listCandidateInvitations,
  listCompanyJobs,
  listCompanyInvitations,
  listCandidatesForDev,
  listCompaniesForDev,
  addCandidateFavorite,
  inviteCandidate,
  removeCandidateFavorite,
  publishJob,
  registerAccount,
  updateCandidateInvitation,
  unpublishJob,
  searchPublicJobs,
  upsertCandidateProfile,
  uploadFileToUrl,
} from './api';
import {
  AUDIO_CHUNK_MS,
  AUDIO_TRANSCRIPT_POLL_MS,
  AuthPromptOptions,
  AuthPromptState,
  COMPANY_STORAGE_KEY,
  DEV_AUTH_PREVIEW_STORAGE_KEY,
  DEV_PREVIEW_AUTH_USER,
  DevAuthPreviewMode,
  ENABLE_AUDIO_CHUNKS,
  formatLocationSuggestion,
  getPathForView,
  getScreenLabel,
  getStoredDevAuthPreviewMode,
  getStoredRole,
  getStoredUserId,
  getStoredView,
  getViewFromPath,
  INITIAL_CANDIDATE_PROFILE,
  INITIAL_FORM_STATE,
  isAdminUser,
  MAX_VIDEO_SECONDS,
  MIN_TRANSCRIPT_FOR_DRAFT,
  PROCESSING_STUB_INTERVAL_MS,
  PROCESSING_STUB_SUCCESS_AFTER_ATTEMPTS,
  ROLE_STORAGE_KEY,
  SHOW_DEVELOPMENT_NAVIGATION,
  USER_STORAGE_KEY,
  VIEW_STORAGE_KEY,
} from './appStateConfig';
import {
  filterKeywordsByLocation,
  formatDuration,
  getDetailedSignalIdentityKey,
  getDetailedSignalLabel,
  makeTakeId,
} from './helpers';
import { getQuestionSet, VIDEO_QUESTION_CONFIG, VideoQuestion, VideoQuestionExtractor } from './config/videoQuestions';
import {
  AuthUser,
  CandidateDetailedSignal,
  CandidateReviewChoice,
  CandidateReviewEditable,
  CandidateReviewField,
  CandidateReviewSide,
  CandidateReviewVideoChoice,
  CandidateProfile,
  CandidateProfileInput,
  CandidateStep,
  CandidateDev,
  CandidateInvitation,
  CompanyDev,
  CreateStep,
  InvitationStatus,
  Job,
  RecordedTake,
  RecordingState,
  Status,
  DetailedQuestionWindow,
  UserRole,
  ViewMode,
} from './types';

const AuthOverlays = lazy(() =>
  import('./components/AuthOverlays').then((module) => ({ default: module.AuthOverlays })),
);
const CandidateAppSection = lazy(() =>
  import('./components/CandidateAppSection').then((module) => ({ default: module.CandidateAppSection })),
);
const EmployerAppSection = lazy(() =>
  import('./components/EmployerAppSection').then((module) => ({ default: module.EmployerAppSection })),
);
const ConfigAdminView = lazy(() =>
  import('./components/ConfigAdminView').then((module) => ({ default: module.ConfigAdminView })),
);
const GeneralAppSection = lazy(() =>
  import('./components/GeneralAppSection').then((module) => ({ default: module.GeneralAppSection })),
);
const JobSeekerFlow = lazy(() =>
  import('./components/JobSeekerFlow').then((module) => ({ default: module.JobSeekerFlow })),
);

type AppHistoryState = {
  __zjobly: true;
  view: ViewMode;
  role: UserRole | null;
  createStep: CreateStep;
  candidateStep: CandidateStep;
  candidateDetailedMode: boolean;
};

const VIEW_MODES: ViewMode[] = [
  'welcome',
  'create',
  'find',
  'profile',
  'jobs',
  'jobDetail',
  'apply',
  'applications',
  'candidates',
  'candidateFavorites',
  'candidateDetail',
  'invitations',
  'jobMatches',
  'adminConfig',
];
const CREATE_STEPS: CreateStep[] = ['record', 'select', 'details'];
const CANDIDATE_STEPS: CandidateStep[] = ['intro', 'record', 'select', 'review', 'profile'];

const isViewMode = (value: unknown): value is ViewMode =>
  typeof value === 'string' && VIEW_MODES.includes(value as ViewMode);

const isCreateStep = (value: unknown): value is CreateStep =>
  typeof value === 'string' && CREATE_STEPS.includes(value as CreateStep);

const isCandidateStep = (value: unknown): value is CandidateStep =>
  typeof value === 'string' && CANDIDATE_STEPS.includes(value as CandidateStep);

type CandidateReviewFieldChoices = Record<CandidateReviewField, CandidateReviewChoice>;

const DEFAULT_CANDIDATE_REVIEW_CHOICES: CandidateReviewFieldChoices = {
  headline: 'new',
  location: 'new',
  summary: 'new',
  keywords: 'new',
};

type CandidateDraftFields = {
  headline?: string;
  summary?: string;
  location?: string;
  keywords?: string[];
};

const LOCATION_INTENT_PATTERN =
  /\b(location|where|based|located|city|country|region|remote|hybrid|on[-\s]?site|relocat|commut|locatie|waar|stad|land|regio|gemeente|provincie|postcode|post code|thuiswerk|op kantoor)\b/i;

const LOCATION_PHRASE_PATTERN =
  /\b(work|job|jobs|werken|werk)\b.{0,28}\b(in|at|near|around|te|in de|rond|omgeving)\b/i;

const transcriptLikelyContainsLocationIntent = (transcript: string): boolean => {
  const text = (transcript || '').trim();
  if (!text) return false;
  return LOCATION_INTENT_PATTERN.test(text) || LOCATION_PHRASE_PATTERN.test(text);
};

const normalizeStructuredData = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const ensureStructuredDataForSchema = (
  structuredData: Record<string, unknown> | null,
  outputSchema: Record<string, unknown> | undefined,
  fallbackValue: string,
): Record<string, unknown> | null => {
  if (!outputSchema || typeof outputSchema !== 'object' || Array.isArray(outputSchema)) {
    return structuredData;
  }
  const properties = (outputSchema as { properties?: unknown }).properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return structuredData;
  }
  const normalized: Record<string, unknown> = structuredData ? { ...structuredData } : {};
  const isTypeMatch = (schemaType: unknown, expected: string): boolean => {
    if (schemaType === expected) return true;
    return Array.isArray(schemaType) && schemaType.includes(expected);
  };
  Object.entries(properties as Record<string, unknown>).forEach(([key, definition]) => {
    if (!(key in normalized)) {
      const definitionObject =
        definition && typeof definition === 'object' && !Array.isArray(definition)
          ? (definition as Record<string, unknown>)
          : null;
      const schemaType = definitionObject?.type;
      if (isTypeMatch(schemaType, 'array')) {
        normalized[key] = [];
      } else if (isTypeMatch(schemaType, 'object')) {
        normalized[key] = {};
      } else {
        normalized[key] = null;
      }
    }
  });
  if (typeof normalized.value !== 'string' || !normalized.value.toString().trim()) {
    normalized.value = fallbackValue.trim();
  }
  return normalized;
};

const normalizeDetailedSignals = (signals: CandidateDetailedSignal[] | null | undefined): CandidateDetailedSignal[] => {
  if (!Array.isArray(signals)) return [];
  return signals
    .map((signal) => {
      const questionId = (signal.question_id || '').toString().trim();
      const signalKey = signal.signal_key ? signal.signal_key.toString().trim() : '';
      const goal = (signal.goal || '').toString().trim() || signalKey || questionId;
      const value = (signal.value || '').toString().trim();
      if (!questionId || !value) return null;
      return {
        question_id: questionId,
        goal,
        value,
        signal_key: signalKey || null,
        prompt_key: signal.prompt_key ? signal.prompt_key.toString().trim() : null,
        question_text: signal.question_text ? signal.question_text.toString().trim() : null,
        source: signal.source ? signal.source.toString().trim() : null,
        show: typeof signal.show === 'boolean' ? signal.show : null,
        transcript: signal.transcript ? signal.transcript.toString().trim() : null,
        structured_data: normalizeStructuredData(signal.structured_data),
        question_start_sec:
          typeof signal.question_start_sec === 'number' && Number.isFinite(signal.question_start_sec)
            ? Math.max(0, signal.question_start_sec)
            : null,
        question_end_sec:
          typeof signal.question_end_sec === 'number' && Number.isFinite(signal.question_end_sec)
            ? Math.max(0, signal.question_end_sec)
            : null,
        confidence:
          typeof signal.confidence === 'number' && Number.isFinite(signal.confidence)
            ? Math.max(0, Math.min(1, signal.confidence))
            : null,
        updated_at: signal.updated_at ? signal.updated_at.toString() : null,
      } as CandidateDetailedSignal;
    })
    .filter((signal): signal is CandidateDetailedSignal => Boolean(signal));
};

const mergeDetailedSignals = (
  currentSignals: CandidateDetailedSignal[],
  newSignals: CandidateDetailedSignal[],
): CandidateDetailedSignal[] => {
  const mergedByKey = new Map<string, CandidateDetailedSignal>();
  [...currentSignals, ...newSignals].forEach((signal) => {
    const key = `${signal.question_id}::${getDetailedSignalLabel(signal)}::${signal.value}`.toLowerCase();
    if (!mergedByKey.has(key)) {
      mergedByKey.set(key, signal);
    }
  });
  return Array.from(mergedByKey.values());
};

const buildDetailedSignalChoiceDefaults = (
  currentSignals: CandidateDetailedSignal[],
  newSignals: CandidateDetailedSignal[],
): Record<string, CandidateReviewChoice> => {
  const currentByKey = new Map(currentSignals.map((signal) => [getDetailedSignalIdentityKey(signal), signal]));
  const newByKey = new Map(newSignals.map((signal) => [getDetailedSignalIdentityKey(signal), signal]));
  const allKeys = new Set<string>([...currentByKey.keys(), ...newByKey.keys()]);
  const defaults: Record<string, CandidateReviewChoice> = {};
  allKeys.forEach((key) => {
    if (currentByKey.has(key) && newByKey.has(key)) {
      defaults[key] = 'new';
      return;
    }
    defaults[key] = newByKey.has(key) ? 'new' : 'current';
  });
  return defaults;
};

const normalizeDetailedQuestionWindows = (
  windows: DetailedQuestionWindow[] | null | undefined,
): DetailedQuestionWindow[] => {
  if (!Array.isArray(windows)) return [];
  const byQuestion = new Map<string, DetailedQuestionWindow>();
  windows.forEach((window) => {
    const questionId = (window?.question_id || '').toString().trim();
    const start = Number(window?.start_sec);
    const end = Number(window?.end_sec);
    if (!questionId || !Number.isFinite(start) || !Number.isFinite(end)) return;
    const normalizedStart = Math.max(0, Math.min(start, end));
    const normalizedEnd = Math.max(normalizedStart, Math.max(start, end));
    const existing = byQuestion.get(questionId);
    if (!existing) {
      byQuestion.set(questionId, {
        question_id: questionId,
        start_sec: normalizedStart,
        end_sec: normalizedEnd,
      });
      return;
    }
    byQuestion.set(questionId, {
      question_id: questionId,
      start_sec: Math.min(existing.start_sec, normalizedStart),
      end_sec: Math.max(existing.end_sec, normalizedEnd),
    });
  });
  return Array.from(byQuestion.values()).sort((a, b) => a.start_sec - b.start_sec);
};

const sliceTranscriptByWindow = (
  transcript: string,
  totalDurationSeconds: number,
  window: DetailedQuestionWindow | null,
): string => {
  const source = (transcript || '').trim();
  if (!source) return '';
  if (!window || !Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) {
    return source;
  }

  const startRatio = Math.max(0, Math.min(1, window.start_sec / totalDurationSeconds));
  const endRatio = Math.max(startRatio, Math.min(1, window.end_sec / totalDurationSeconds));
  const totalChars = source.length;
  const startIndex = Math.max(0, Math.min(totalChars - 1, Math.floor(totalChars * startRatio)));
  const endIndex = Math.max(startIndex + 1, Math.min(totalChars, Math.ceil(totalChars * endRatio)));
  const snippet = source.slice(startIndex, endIndex).trim();
  if (snippet.length >= 12) return snippet;
  return source;
};

const trimToMaxChars = (value: string, maxChars: number): string => {
  const text = (value || '').trim();
  if (!text) return '';
  const safeMaxChars = Number.isFinite(maxChars) ? Math.max(60, Math.min(2000, Math.round(maxChars))) : 320;
  return text.length <= safeMaxChars ? text : text.slice(0, safeMaxChars).trim();
};

const buildDetailedSignalsFromQuestions = async (
  questions: VideoQuestion[],
  transcript: string,
  windows: DetailedQuestionWindow[] | null | undefined,
  totalDurationSeconds: number,
): Promise<CandidateDetailedSignal[]> => {
  const now = new Date().toISOString();
  const signals: CandidateDetailedSignal[] = [];
  const normalizedWindows = normalizeDetailedQuestionWindows(windows);
  const windowByQuestionId = new Map(normalizedWindows.map((item) => [item.question_id, item]));

  for (const question of questions) {
    const questionId = (question.id || '').trim();
    const questionText = (question.text || '').trim();
    if (!questionId || !questionText) continue;

    const configuredExtractors =
      Array.isArray(question.extractors) && question.extractors.length > 0
        ? question.extractors
            .map((extractor) =>
              extractor && typeof extractor.signalKey === 'string' && extractor.signalKey.trim()
                ? extractor
                : null,
            )
            .filter((extractor): extractor is VideoQuestionExtractor => Boolean(extractor))
        : [];
    if (configuredExtractors.length === 0) continue;

    const questionWindow = windowByQuestionId.get(questionId) ?? null;
    const questionTranscript = sliceTranscriptByWindow(transcript, totalDurationSeconds, questionWindow);
    const transcriptOutputValue = trimToMaxChars(questionTranscript || transcript, 1200);

    for (const extractor of configuredExtractors) {
      const signalKey = (extractor.signalKey || '').toString().trim();
      if (!signalKey) continue;
      const extractorOutputModes =
        Array.isArray(extractor.output) && extractor.output.length > 0
          ? extractor.output
          : ['prompt'];
      const wantsPromptOutput = extractorOutputModes.includes('prompt');
      const wantsTranscriptOutput = extractorOutputModes.includes('transcript');
      const promptKey = (extractor.promptKey || '').toString().trim();
      const schemaKey = (extractor.schemaKey || '').toString().trim();
      const outputSchema = extractor.outputSchema;
      let promptExtractedValue = '';
      let promptStructuredData: Record<string, unknown> | null = null;

      let value = '';

      if (wantsTranscriptOutput && !wantsPromptOutput) {
        value = transcriptOutputValue;
      }

      if (wantsPromptOutput && promptKey && questionTranscript.length >= 8) {
        try {
          const promptExtraction = await getSignalFromTranscript(
            questionTranscript,
            promptKey,
            outputSchema,
            schemaKey || undefined,
          );
          promptExtractedValue = (promptExtraction?.value || '').toString().trim();
          promptStructuredData = normalizeStructuredData(promptExtraction?.structured_data ?? null);
        } catch (err) {
          console.error(`Could not extract signal for prompt ${promptKey}`, err);
        }
      }

      if (!value) {
        value = promptExtractedValue;
      }

      if (!value && wantsTranscriptOutput) {
        value = transcriptOutputValue;
      }

      if (!value) continue;

      let structuredDataForSignal = ensureStructuredDataForSchema(
        promptStructuredData,
        outputSchema,
        value,
      );

      if (wantsPromptOutput && wantsTranscriptOutput) {
        const combinedStructuredData: Record<string, unknown> = structuredDataForSignal
          ? { ...structuredDataForSignal }
          : {};
        combinedStructuredData._prompt_value = value;
        structuredDataForSignal = combinedStructuredData;
      }

      signals.push({
        question_id: questionId,
        goal: null,
        value,
        signal_key: signalKey,
        prompt_key: promptKey || null,
        question_text: questionText,
        source: promptKey ? `guided-video:${promptKey}` : 'guided-video',
        show: typeof extractor.show === 'boolean' ? extractor.show : true,
        transcript: transcriptOutputValue || null,
        structured_data: structuredDataForSignal,
        question_start_sec: questionWindow?.start_sec ?? null,
        question_end_sec: questionWindow?.end_sec ?? null,
        updated_at: now,
      });
    }
  }

  return normalizeDetailedSignals(signals);
};

function App() {
  const [view, setView] = useState<ViewMode>('welcome');
  const [role, setRole] = useState<UserRole | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPrompt, setAuthPrompt] = useState<AuthPromptState | null>(null);
  const [adminPathAuthRequired, setAdminPathAuthRequired] = useState(false);
  const [candidatePostAuthOverlay, setCandidatePostAuthOverlay] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('record');
  const [candidateStep, setCandidateStep] = useState<CandidateStep>('record');
  const [candidateDetailedMode, setCandidateDetailedMode] = useState(false);
  const [form, setForm] = useState({ ...INITIAL_FORM_STATE });
  const [transcriptText, setTranscriptText] = useState('');
  const [draftKeywords, setDraftKeywords] = useState<string[]>([]);
  const [draftingFromTranscript, setDraftingFromTranscript] = useState(false);
  const [draftingError, setDraftingError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(() => {
    const envId = (import.meta.env.VITE_COMPANY_ID || '').toString().trim();
    if (envId) return envId;
    try {
      const stored = localStorage.getItem(COMPANY_STORAGE_KEY);
      return stored || null;
    } catch {
      return null;
    }
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedCandidateProfile, setSelectedCandidateProfile] = useState<CandidateProfile | null>(null);
  const [candidateSearchOrigin, setCandidateSearchOrigin] = useState<
    'search' | 'applications' | 'favorites' | 'invitations' | 'matches'
  >('search');
  const [candidateFavorites, setCandidateFavorites] = useState<CandidateProfile[]>([]);
  const [candidateFavoritesLoading, setCandidateFavoritesLoading] = useState(false);
  const [candidateFavoritesError, setCandidateFavoritesError] = useState<string | null>(null);
  const [favoriteUpdatingIds, setFavoriteUpdatingIds] = useState<Set<string>>(new Set());
  const [employerInvitations, setEmployerInvitations] = useState<CandidateInvitation[]>([]);
  const [employerInvitationsLoading, setEmployerInvitationsLoading] = useState(false);
  const [employerInvitationsError, setEmployerInvitationsError] = useState<string | null>(null);
  const [inviteUpdatingIds, setInviteUpdatingIds] = useState<Set<string>>(new Set());
  const [candidateInvitations, setCandidateInvitations] = useState<CandidateInvitation[]>([]);
  const [candidateInvitationsLoading, setCandidateInvitationsLoading] = useState(false);
  const [candidateInvitationsError, setCandidateInvitationsError] = useState<string | null>(null);
  const [candidateInviteUpdatingIds, setCandidateInviteUpdatingIds] = useState<Set<string>>(
    new Set(),
  );
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfileInput>({ ...INITIAL_CANDIDATE_PROFILE });
  const [candidateProfileDetails, setCandidateProfileDetails] = useState<CandidateProfile | null>(null);
  const [candidateProfileLoading, setCandidateProfileLoading] = useState(false);
  const [candidateProfileError, setCandidateProfileError] = useState<string | null>(null);
  const [candidateProfileExists, setCandidateProfileExists] = useState(false);
  const [candidateKeywords, setCandidateKeywords] = useState<string[]>([]);
  const [candidateRemovedKeywords, setCandidateRemovedKeywords] = useState<string[]>([]);
  const [candidateKeywordsTouched, setCandidateKeywordsTouched] = useState(false);
  const [candidateVideoObjectKey, setCandidateVideoObjectKey] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoObjectKey, setVideoObjectKey] = useState<string | null>(null);
  const [recordedTakes, setRecordedTakes] = useState<RecordedTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [jobSaving, setJobSaving] = useState(false);
  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);
  const [unpublishingJobId, setUnpublishingJobId] = useState<string | null>(null);
  const [candidateProfileSaving, setCandidateProfileSaving] = useState(false);
  const [candidateProfileSaved, setCandidateProfileSaved] = useState(false);
  const [candidateValidation, setCandidateValidation] = useState(false);
  const [showDetailValidation, setShowDetailValidation] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordDuration, setRecordDuration] = useState<number>(0);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [audioSessionTranscripts, setAudioSessionTranscripts] = useState<Record<string, string>>({});
  const [audioSessionStatuses, setAudioSessionStatuses] = useState<Record<string, 'pending' | 'partial' | 'final'>>({});
  const [pendingDraftSessionId, setPendingDraftSessionId] = useState<string | null>(null);
  const [autoTranscriptSessionId, setAutoTranscriptSessionId] = useState<string | null>(null);
  const [candidateTranscript, setCandidateTranscript] = useState<string>('');
  const [candidateTranscriptStatus, setCandidateTranscriptStatus] = useState<'pending' | 'final' | undefined>(undefined);
  const [candidateReviewCurrent, setCandidateReviewCurrent] = useState<CandidateReviewEditable | null>(null);
  const [candidateReviewNew, setCandidateReviewNew] = useState<CandidateReviewEditable | null>(null);
  const [candidateDetailedSignalsDraft, setCandidateDetailedSignalsDraft] = useState<CandidateDetailedSignal[]>([]);
  const [candidateReviewChoices, setCandidateReviewChoices] = useState<CandidateReviewFieldChoices>(
    DEFAULT_CANDIDATE_REVIEW_CHOICES,
  );
  const [candidateReviewDetailedSignalChoices, setCandidateReviewDetailedSignalChoices] = useState<
    Record<string, CandidateReviewChoice>
  >({});
  const [candidateReviewVideoChoice, setCandidateReviewVideoChoice] =
    useState<CandidateReviewVideoChoice>('new');
  const [candidateReviewCurrentVideoUrl, setCandidateReviewCurrentVideoUrl] = useState<string | null>(null);
  const [candidateReviewCurrentVideoObjectKey, setCandidateReviewCurrentVideoObjectKey] = useState<string | null>(
    null,
  );
  const [devUserId, setDevUserId] = useState<string>(() => getStoredUserId());
  const [devCompanies, setDevCompanies] = useState<CompanyDev[]>([]);
  const [devCompaniesLoading, setDevCompaniesLoading] = useState(false);
  const [devCompaniesError, setDevCompaniesError] = useState<string | null>(null);
  const [devCandidates, setDevCandidates] = useState<CandidateDev[]>([]);

  const authOverlayCardInlineStyle: CSSProperties = {
    minWidth: 0,
    boxSizing: 'border-box',
    marginInline: 'auto',
    overflowX: 'hidden',
  };
  const [devCandidatesLoading, setDevCandidatesLoading] = useState(false);
  const [devCandidatesError, setDevCandidatesError] = useState<string | null>(null);
  const [devAuthPreviewMode, setDevAuthPreviewMode] = useState<DevAuthPreviewMode>(
    () => getStoredDevAuthPreviewMode(),
  );
  const authUserRef = useRef<AuthUser | null>(null);
  const authRequestResolverRef = useRef<((authenticated: boolean) => void) | null>(null);
  const jobVideoUrlsRef = useRef<Record<string, string>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioSessionIdRef = useRef<string | null>(null);
  const audioChunkIndexRef = useRef<number>(0);
  const audioUploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const audioTranscriptPollersRef = useRef<Record<string, number>>({});
  const draftedSessionsRef = useRef<Set<string>>(new Set());
  const pendingDraftSessionRef = useRef<string | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartedAtRef = useRef<number | null>(null);
  const recordElapsedRef = useRef<number>(0);
  const processingTimerRef = useRef<number | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const takeUrlsRef = useRef<Set<string>>(new Set());
  const locationManuallySetRef = useRef(false);
  const locationSuggestionAbortRef = useRef<AbortController | null>(null);
  const lastLocationQueryRef = useRef<string | null>(null);
  const locationSuggestionDisabledRef = useRef(false);
  const candidateProfileEditedRef = useRef<{ headline: boolean; location: boolean; summary: boolean }>({
    headline: false,
    location: false,
    summary: false,
  });
  const candidateLocationAbortRef = useRef<AbortController | null>(null);
  const candidateProfileDraftAbortRef = useRef<AbortController | null>(null);
  const candidateProfileDraftHandledTranscriptRef = useRef<string | null>(null);
  const candidateLocationHandledTranscriptRef = useRef<string | null>(null);
  const historyInitializedRef = useRef(false);
  const applyingHistoryStateRef = useRef(false);
  const lastHistoryStateRef = useRef<string>('');
  const activeDevAuthPreviewMode = SHOW_DEVELOPMENT_NAVIGATION ? devAuthPreviewMode : 'real';
  const previewAuthUser =
    activeDevAuthPreviewMode === 'loggedOut'
      ? null
      : authUser ?? (activeDevAuthPreviewMode === 'loggedIn' ? DEV_PREVIEW_AUTH_USER : null);
  const previewAuthenticated = Boolean(previewAuthUser);
  const canUseAuthenticatedApi = Boolean(authUser) && activeDevAuthPreviewMode !== 'loggedOut';
  const canSeeAdminConfigButton = isAdminUser(authUser);

  const persistRole = (nextRole: UserRole | null) => {
    setRole(nextRole);
    try {
      if (nextRole) {
        localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
      } else {
        localStorage.removeItem(ROLE_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  };

  const resolveAuthRequest = (authenticated: boolean) => {
    const resolver = authRequestResolverRef.current;
    if (!resolver) return;
    authRequestResolverRef.current = null;
    resolver(authenticated);
  };

  const openAuthPrompt = ({
    title,
    message,
    mode = 'register',
    returnToHomeOnSuccess = false,
  }: AuthPromptOptions) => {
    setAuthMode(mode);
    setAuthError(null);
    setAuthPrompt({ title, message, returnToHomeOnSuccess });
  };

  const closeAuthPrompt = () => {
    resolveAuthRequest(false);
    setAdminPathAuthRequired(false);
    setAuthPrompt(null);
    setAuthError(null);
  };

  const ensureAuthenticated = (options: AuthPromptOptions): Promise<boolean> => {
    if (previewAuthenticated) {
      return Promise.resolve(true);
    }
    resolveAuthRequest(false);
    return new Promise<boolean>((resolve) => {
      authRequestResolverRef.current = resolve;
      openAuthPrompt({ ...options, returnToHomeOnSuccess: false });
    });
  };

  const runAuthenticated = (
    options: AuthPromptOptions,
    action: () => void | Promise<void>,
  ) => {
    void (async () => {
      const canContinue = await ensureAuthenticated(options);
      if (!canContinue) return;
      await action();
    })();
  };

  const openVoluntaryAuth = (mode: 'login' | 'register') => {
    resolveAuthRequest(false);
    openAuthPrompt({
      mode,
      title: mode === 'login' ? 'Sign in' : 'Create account',
      message: 'Use your name and password to continue.',
      returnToHomeOnSuccess: true,
    });
  };

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  useEffect(() => {
    if (!SHOW_DEVELOPMENT_NAVIGATION) return;
    try {
      if (devAuthPreviewMode === 'real') {
        localStorage.removeItem(DEV_AUTH_PREVIEW_STORAGE_KEY);
      } else {
        localStorage.setItem(DEV_AUTH_PREVIEW_STORAGE_KEY, devAuthPreviewMode);
      }
    } catch {
      // ignore storage failures
    }
  }, [devAuthPreviewMode]);

  useEffect(() => {
    return () => {
      resolveAuthRequest(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await getCurrentAuthUser();
        if (cancelled) return;
        authUserRef.current = current;
        setAuthUser(current);
        const rawHistoryState = window.history.state as Partial<AppHistoryState> | null;
        const historyState = rawHistoryState && rawHistoryState.__zjobly === true ? rawHistoryState : null;
        const historyView = historyState && isViewMode(historyState.view) ? historyState.view : null;
        const historyRole =
          historyState && (historyState.role === 'candidate' || historyState.role === 'employer')
            ? historyState.role
            : null;
        const historyCreateStep =
          historyState && isCreateStep(historyState.createStep) ? historyState.createStep : null;
        const historyCandidateStep =
          historyState && isCandidateStep(historyState.candidateStep) ? historyState.candidateStep : null;
        const historyCandidateDetailedMode =
          historyState && typeof historyState.candidateDetailedMode === 'boolean'
            ? historyState.candidateDetailedMode
            : false;
        if (current) {
          const isAdmin = isAdminUser(current);
          const pathView = getViewFromPath(window.location.pathname);
          const storedRole = getStoredRole();
          persistRole(historyRole ?? storedRole ?? 'candidate');
          if (historyCreateStep) setCreateStep(historyCreateStep);
          if (historyCandidateStep) setCandidateStep(historyCandidateStep);
          setCandidateDetailedMode(historyCandidateDetailedMode);
          const storedView = getStoredView();
          const safeStoredView =
            storedView === 'adminConfig' && !isAdmin ? 'welcome' : storedView;
          if (pathView === 'adminConfig') {
            setAdminPathAuthRequired(false);
            setView(isAdmin ? 'adminConfig' : 'welcome');
          } else if (historyView && (historyView !== 'adminConfig' || isAdmin)) {
            setAdminPathAuthRequired(false);
            setView(historyView);
          } else {
            setAdminPathAuthRequired(false);
            setView(safeStoredView);
          }
        } else {
          const pathView = getViewFromPath(window.location.pathname);
          if (pathView === 'adminConfig') {
            setAdminPathAuthRequired(true);
            openAuthPrompt({
              mode: 'login',
              title: 'Admin login required',
              message: 'Sign in with an admin account to manage config settings.',
              returnToHomeOnSuccess: false,
            });
            persistRole(null);
            setView('welcome');
          } else {
            setAdminPathAuthRequired(false);
            persistRole(historyRole ?? null);
            if (historyCreateStep) setCreateStep(historyCreateStep);
            if (historyCandidateStep) setCandidateStep(historyCandidateStep);
            setCandidateDetailedMode(historyCandidateDetailedMode);
            if (historyView && historyView !== 'adminConfig') {
              setView(historyView);
            } else {
              const storedView = getStoredView();
              setView(storedView === 'adminConfig' ? 'welcome' : storedView);
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        authUserRef.current = null;
        setAdminPathAuthRequired(false);
        setAuthError(err instanceof Error ? err.message : 'Could not verify your login session.');
        persistRole(null);
        setView('welcome');
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (authLoading) return;
      const state = event.state as Partial<AppHistoryState> | null;
      if (!state || state.__zjobly !== true) return;

      const nextView = isViewMode(state.view)
        ? state.view
        : getViewFromPath(window.location.pathname) ?? 'welcome';
      const nextRole =
        state.role === 'candidate' || state.role === 'employer' ? state.role : null;
      const nextCreateStep = isCreateStep(state.createStep) ? state.createStep : 'record';
      const nextCandidateStep = isCandidateStep(state.candidateStep) ? state.candidateStep : 'record';
      const nextCandidateDetailedMode =
        typeof state.candidateDetailedMode === 'boolean' ? state.candidateDetailedMode : false;

      applyingHistoryStateRef.current = true;
      persistRole(nextRole);
      setCreateStep(nextCreateStep);
      setCandidateStep(nextCandidateStep);
      setCandidateDetailedMode(nextCandidateDetailedMode);
      setView(nextView);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [authLoading]);

  useEffect(() => {
    if (authLoading) return;
    if (adminPathAuthRequired) return;

    const nextPath = getPathForView(view);
    const nextUrl = `${nextPath}${window.location.search}${window.location.hash}`;
    const nextState: AppHistoryState = {
      __zjobly: true,
      view,
      role,
      createStep,
      candidateStep,
      candidateDetailedMode,
    };
    const serializedState = JSON.stringify(nextState);

    if (applyingHistoryStateRef.current) {
      applyingHistoryStateRef.current = false;
      historyInitializedRef.current = true;
      lastHistoryStateRef.current = serializedState;
      window.history.replaceState(nextState, '', nextUrl);
      return;
    }

    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      lastHistoryStateRef.current = serializedState;
      window.history.replaceState(nextState, '', nextUrl);
      return;
    }

    const pathChanged = window.location.pathname !== nextPath;
    const stateChanged = serializedState !== lastHistoryStateRef.current;

    if (pathChanged || stateChanged) {
      lastHistoryStateRef.current = serializedState;
      window.history.pushState(nextState, '', nextUrl);
      return;
    }

    const currentState = window.history.state as Partial<AppHistoryState> | null;
    if (!currentState || currentState.__zjobly !== true) {
      window.history.replaceState(nextState, '', nextUrl);
      lastHistoryStateRef.current = serializedState;
    }
  }, [adminPathAuthRequired, authLoading, candidateDetailedMode, candidateStep, createStep, role, view]);

  useEffect(() => {
    if (authLoading) return;
    if (view !== 'adminConfig') return;
    if (canSeeAdminConfigButton) return;
    setView('welcome');
  }, [authLoading, canSeeAdminConfigButton, view]);

  const resetCandidateReview = () => {
    setCandidateReviewCurrent(null);
    setCandidateReviewNew(null);
    setCandidateReviewChoices(DEFAULT_CANDIDATE_REVIEW_CHOICES);
    setCandidateReviewDetailedSignalChoices({});
    setCandidateReviewVideoChoice('new');
    setCandidateReviewCurrentVideoUrl(null);
    setCandidateReviewCurrentVideoObjectKey(null);
  };

  const resetCandidateFlow = (initialStep: CandidateStep = 'record') => {
    clearVideoSelection();
    clearRecordedTakes();
    resetRecordTimer();
    setRecordingState('idle');
    setCandidateDetailedMode(false);
    setCandidateStep(initialStep);
    setCandidateProfile({ ...INITIAL_CANDIDATE_PROFILE });
    setCandidateProfileDetails(null);
    setCandidateProfileLoading(false);
    setCandidateProfileError(null);
    setCandidateProfileExists(false);
    setCandidateKeywords([]);
    setCandidateRemovedKeywords([]);
    setCandidateKeywordsTouched(false);
    setCandidateDetailedSignalsDraft([]);
    setCandidateVideoObjectKey(null);
    setCandidateProfileSaving(false);
    setCandidateProfileSaved(false);
    setCandidateValidation(false);
    setStatus('idle');
    setUploadProgress(null);
    setProcessingMessage(null);
    setError(null);
    setCandidatePostAuthOverlay(false);
    resetCandidateReview();
    candidateProfileDraftHandledTranscriptRef.current = null;
    candidateLocationHandledTranscriptRef.current = null;
    candidateProfileEditedRef.current = { headline: false, location: false, summary: false };
  };

  const setRoleAndView = (
    nextRole: UserRole,
    nextView?: ViewMode,
    options?: {
      candidateStep?: CandidateStep;
    },
  ) => {
    persistRole(nextRole);
    setSelectedJobId(null);
    if (nextRole === 'employer') {
      setCreateStep('record');
      setShowDetailValidation(false);
    } else {
      resetCandidateFlow(options?.candidateStep ?? 'record');
    }
    setView(nextView ?? (nextRole === 'employer' ? 'create' : 'find'));
  };

  const stopStreamTracks = (stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
  };

  const clearRecordTimer = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const syncRecordElapsed = () => {
    if (recordStartedAtRef.current !== null) {
      recordElapsedRef.current += (Date.now() - recordStartedAtRef.current) / 1000;
      recordStartedAtRef.current = null;
    }
    clearRecordTimer();
    setRecordDuration(recordElapsedRef.current);
  };

  const resetRecordTimer = () => {
    clearRecordTimer();
    recordStartedAtRef.current = null;
    recordElapsedRef.current = 0;
    setRecordDuration(0);
  };

  const startRecordTimer = () => {
    recordStartedAtRef.current = Date.now();
    clearRecordTimer();
    recordTimerRef.current = window.setInterval(() => {
      if (recordStartedAtRef.current === null) return;
      const elapsed = recordElapsedRef.current + (Date.now() - recordStartedAtRef.current) / 1000;
      setRecordDuration(elapsed);
      if (elapsed >= MAX_VIDEO_SECONDS) {
        stopRecording();
      }
    }, 250);
  };

  const clearProcessingTimer = () => {
    if (processingTimerRef.current) {
      window.clearInterval(processingTimerRef.current);
      processingTimerRef.current = null;
    }
  };

  const makeAudioSessionId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `audio-${Date.now()}`).replace(
      /[^a-zA-Z0-9-_]/g,
      '',
    );

  const pickAudioMimeType = () => {
    const preferredAudioMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    return (
      preferredAudioMime.find(
        (opt) =>
          typeof MediaRecorder !== 'undefined' &&
          typeof MediaRecorder.isTypeSupported === 'function' &&
          MediaRecorder.isTypeSupported(opt),
      ) || ''
    );
  };

  const audioExtensionFromMime = (mime: string) => {
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
    return 'webm';
  };

  const stopTranscriptPolling = (sessionId: string) => {
    const timerId = audioTranscriptPollersRef.current[sessionId];
    if (timerId) {
      window.clearInterval(timerId);
      delete audioTranscriptPollersRef.current[sessionId];
    }
  };

  const startTranscriptPolling = (sessionId: string) => {
    if (!sessionId) return;
    if (audioTranscriptPollersRef.current[sessionId]) return;

    const poll = async () => {
      try {
        const res = await getAudioSessionTranscript(sessionId);
        if (!res || typeof res.status !== 'string') {
          return;
        }
        setAudioSessionStatuses((prev) => ({ ...prev, [sessionId]: res.status }));
        if (res.transcript) {
          setAudioSessionTranscripts((prev) => ({ ...prev, [sessionId]: res.transcript }));
        }
        const canDraft =
          pendingDraftSessionRef.current === sessionId &&
          res.transcript &&
          res.transcript.trim().length >= MIN_TRANSCRIPT_FOR_DRAFT &&
          !draftedSessionsRef.current.has(sessionId);
        if (canDraft) {
          draftedSessionsRef.current.add(sessionId);
          setPendingDraftSessionId(null);
          pendingDraftSessionRef.current = null;
          setTranscriptText(res.transcript);
          setAutoTranscriptSessionId(sessionId);
          void generateFromTranscript(res.transcript);
        }
        if (res.status === 'final') {
          stopTranscriptPolling(sessionId);
        }
      } catch (err) {
        console.error('Transcript poll failed', err);
      }
    };

    poll();
    audioTranscriptPollersRef.current[sessionId] = window.setInterval(poll, AUDIO_TRANSCRIPT_POLL_MS);
  };

  const queueAudioChunkUpload = (sessionId: string, chunkIndex: number, blob: Blob, mimeType: string) => {
    if (!ENABLE_AUDIO_CHUNKS) return;
    const ext = audioExtensionFromMime(mimeType || blob.type || 'audio/webm');
    const fileName = `chunk-${chunkIndex.toString().padStart(6, '0')}.${ext}`;
    const chunkFile = new File([blob], fileName, { type: mimeType || blob.type || 'audio/webm' });

    audioUploadChainRef.current = audioUploadChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const presign = await createAudioChunkUrl({
          session_id: sessionId,
          chunk_index: chunkIndex,
          content_type: chunkFile.type,
          file_name: chunkFile.name,
        });
        await uploadFileToUrl(presign.upload_url, chunkFile);
        await confirmAudioChunk({
          session_id: sessionId,
          chunk_index: chunkIndex,
          object_key: presign.object_key,
        });
      })
      .catch((err) => {
        console.error('Audio chunk upload failed', err);
      });
  };

  const finalizeAudioSessionIfNeeded = async () => {
    const sessionId = audioSessionIdRef.current;
    if (!sessionId) return;
    const totalChunks = audioChunkIndexRef.current;
    try {
      await audioUploadChainRef.current;
      await finalizeAudioSession({ session_id: sessionId, total_chunks: totalChunks });
      startTranscriptPolling(sessionId);
    } catch (err) {
      console.error('Finalize audio session failed', err);
    }
  };

  const refreshJobs = useCallback(async (): Promise<Job[]> => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      let fetched: Job[] = [];
      if (role === 'candidate') {
        fetched = await searchPublicJobs();
      } else {
        if (!canUseAuthenticatedApi) {
          setJobs([]);
          setJobsError(null);
          return [];
        }
        if (!companyId) {
          setJobs([]);
          setJobsError(null);
          return [];
        }
        fetched = await listCompanyJobs(companyId);
      }
      if (!Array.isArray(fetched)) {
        setJobs([]);
        setJobsError('Could not load jobs.');
        return [];
      }
      setJobs(
        fetched.map((job) => ({
          ...job,
          videoUrl: job.playback_url || jobVideoUrlsRef.current[job.id],
        })),
      );
      return fetched;
    } catch (err) {
      console.error(err);
      setJobsError(err instanceof Error ? err.message : 'Could not load jobs.');
      return [];
    } finally {
      setJobsLoading(false);
    }
  }, [canUseAuthenticatedApi, companyId, role]);

  const refreshCandidateFavorites = useCallback(async (): Promise<CandidateProfile[]> => {
    if (role !== 'employer' || !companyId || !canUseAuthenticatedApi) {
      setCandidateFavorites([]);
      setCandidateFavoritesLoading(false);
      setCandidateFavoritesError(null);
      return [];
    }
    setCandidateFavoritesLoading(true);
    setCandidateFavoritesError(null);
    try {
      const favorites = await listCandidateFavorites(companyId);
      const results = Array.isArray(favorites) ? favorites : [];
      setCandidateFavorites(results);
      return results;
    } catch (err) {
      console.error(err);
      setCandidateFavoritesError(err instanceof Error ? err.message : 'Could not load favorites.');
      setCandidateFavorites([]);
      return [];
    } finally {
      setCandidateFavoritesLoading(false);
    }
  }, [canUseAuthenticatedApi, companyId, role]);

  const refreshEmployerInvitations = useCallback(async (): Promise<CandidateInvitation[]> => {
    if (role !== 'employer' || !companyId || !canUseAuthenticatedApi) {
      setEmployerInvitations([]);
      setEmployerInvitationsLoading(false);
      setEmployerInvitationsError(null);
      return [];
    }
    setEmployerInvitationsLoading(true);
    setEmployerInvitationsError(null);
    try {
      const invitations = await listCompanyInvitations(companyId);
      const results = Array.isArray(invitations) ? invitations : [];
      setEmployerInvitations(results);
      return results;
    } catch (err) {
      console.error(err);
      setEmployerInvitationsError(err instanceof Error ? err.message : 'Could not load invitations.');
      setEmployerInvitations([]);
      return [];
    } finally {
      setEmployerInvitationsLoading(false);
    }
  }, [canUseAuthenticatedApi, companyId, role]);

  const refreshCandidateInvitations = useCallback(async (): Promise<CandidateInvitation[]> => {
    if (role !== 'candidate' || !canUseAuthenticatedApi) {
      setCandidateInvitations([]);
      setCandidateInvitationsLoading(false);
      setCandidateInvitationsError(null);
      return [];
    }
    setCandidateInvitationsLoading(true);
    setCandidateInvitationsError(null);
    try {
      const invitations = await listCandidateInvitations();
      const results = Array.isArray(invitations) ? invitations : [];
      setCandidateInvitations(results);
      return results;
    } catch (err) {
      console.error(err);
      setCandidateInvitationsError(err instanceof Error ? err.message : 'Could not load invitations.');
      setCandidateInvitations([]);
      return [];
    } finally {
      setCandidateInvitationsLoading(false);
    }
  }, [canUseAuthenticatedApi, role]);

  const startProcessingPoll = (objectKey: string) => {
    clearProcessingTimer();
    setStatus('processing');
    setProcessingMessage('Queued for transcription and processing...');

    let attempts = 0;
    processingTimerRef.current = window.setInterval(() => {
      attempts += 1;
      // Stubbed status: after a few ticks, mark as ready. Replace with a real status endpoint.
      if (attempts >= PROCESSING_STUB_SUCCESS_AFTER_ATTEMPTS) {
        clearProcessingTimer();
        setProcessingMessage('Processing complete (stub). Ready for job details.');
        setStatus('success');
      } else {
        setProcessingMessage('Processing your video (stub status)...');
        setStatus('processing');
      }
    }, PROCESSING_STUB_INTERVAL_MS);
  };

  useEffect(() => {
    pendingDraftSessionRef.current = pendingDraftSessionId;
  }, [pendingDraftSessionId]);

  useEffect(() => {
    liveStreamRef.current = liveStream;
    const videoElement = liveVideoRef.current;
    if (!videoElement) return;

    if (liveStream) {
      videoElement.srcObject = liveStream;
      videoElement.play().catch(() => undefined);
    } else {
      videoElement.srcObject = null;
    }
  }, [liveStream]);

  // Clean up media resources when the app unmounts
  useEffect(() => {
    return () => {
      clearRecordTimer();
      if (
        mediaRecorderRef.current?.state === 'recording' ||
        mediaRecorderRef.current?.state === 'paused'
      ) {
        mediaRecorderRef.current.stop();
      }
      if (
        audioRecorderRef.current?.state === 'recording' ||
        audioRecorderRef.current?.state === 'paused'
      ) {
        audioRecorderRef.current.stop();
      }
      Object.keys(audioTranscriptPollersRef.current).forEach((sessionId) => {
        stopTranscriptPolling(sessionId);
      });
      stopStreamTracks(liveStreamRef.current);
      takeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      clearProcessingTimer();
    };
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    const shouldLoad =
      view === 'candidates' ||
      view === 'candidateDetail' ||
      view === 'candidateFavorites' ||
      view === 'jobMatches';
    if (!shouldLoad) return;
    void refreshCandidateFavorites();
  }, [view, refreshCandidateFavorites]);

  useEffect(() => {
    const shouldLoad =
      view === 'candidates' ||
      view === 'candidateDetail' ||
      view === 'candidateFavorites' ||
      view === 'jobMatches' ||
      view === 'invitations';
    if (!shouldLoad) return;
    void refreshEmployerInvitations();
  }, [view, refreshEmployerInvitations]);

  useEffect(() => {
    if (view !== 'invitations') return;
    void refreshCandidateInvitations();
  }, [view, refreshCandidateInvitations]);

  useEffect(() => {
    try {
      const viewToPersist =
        view === 'candidateDetail'
          ? candidateSearchOrigin === 'favorites'
            ? 'candidateFavorites'
            : candidateSearchOrigin === 'invitations'
            ? 'invitations'
            : candidateSearchOrigin === 'matches'
            ? 'jobMatches'
            : 'candidates'
          : view;
      const shouldPersist =
        view === 'jobs' ||
        (view === 'applications' && role === 'candidate') ||
        (view === 'create' && role === 'employer') ||
        ((view === 'candidates' ||
          view === 'candidateDetail' ||
          view === 'candidateFavorites' ||
          view === 'jobMatches' ||
          view === 'invitations') &&
          role === 'employer') ||
        (view === 'find' && role === 'candidate') ||
        (view === 'invitations' && role === 'candidate') ||
        (view === 'profile' && role === 'candidate');
      if (shouldPersist) {
        localStorage.setItem(VIEW_STORAGE_KEY, viewToPersist);
      } else if (view === 'welcome') {
        localStorage.removeItem(VIEW_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, [view, role, candidateSearchOrigin]);

  useEffect(() => {
    if (!SHOW_DEVELOPMENT_NAVIGATION) return;
    let isActive = true;
    setDevCompaniesLoading(true);
    setDevCandidatesLoading(true);
    setDevCompaniesError(null);
    setDevCandidatesError(null);

    void (async () => {
      try {
        const [companies, candidates] = await Promise.all([listCompaniesForDev(), listCandidatesForDev()]);
        if (!isActive) return;
        setDevCompanies(Array.isArray(companies) ? companies : []);
        setDevCandidates(Array.isArray(candidates) ? candidates : []);
      } catch (err) {
        if (!isActive) return;
        setDevCompanies([]);
        setDevCandidates([]);
        const message = err instanceof Error ? err.message : 'Could not load dev data.';
        setDevCompaniesError(message);
        setDevCandidatesError(message);
      } finally {
        if (isActive) {
          setDevCompaniesLoading(false);
          setDevCandidatesLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const isCandidateProfileContext =
      role === 'candidate' &&
      (view === 'profile' || (view === 'find' && candidateStep === 'profile'));
    if (!isCandidateProfileContext || !canUseAuthenticatedApi) return;

    const controller = new AbortController();
    let isActive = true;
    setCandidateProfileLoading(true);
    setCandidateProfileError(null);

    void (async () => {
      try {
        const profile = await getCandidateProfile(controller.signal);
        if (!isActive) return;
        if (profile) {
          setCandidateProfileDetails(profile);
          setCandidateProfileExists(true);
          setCandidateVideoObjectKey(profile.video_object_key ?? null);
          setCandidateKeywords(normalizeKeywords(profile.keywords));
          setCandidateRemovedKeywords([]);
          setCandidateKeywordsTouched(false);
          setCandidateDetailedSignalsDraft(normalizeDetailedSignals(profile.detailed_signals));
          setCandidateProfile({
            headline: profile.headline ?? '',
            location: profile.location ?? '',
            location_id: profile.location_id ?? null,
            summary: profile.summary ?? '',
            discoverable: Boolean(profile.discoverable),
          });
        } else {
          setCandidateProfileDetails(null);
          setCandidateProfileExists(false);
          setCandidateVideoObjectKey(null);
          setCandidateKeywords([]);
          setCandidateRemovedKeywords([]);
          setCandidateKeywordsTouched(false);
          setCandidateDetailedSignalsDraft([]);
        }
      } catch (err) {
        if (!isActive) return;
        if ((err as { name?: string })?.name === 'AbortError') return;
        setCandidateProfileError(err instanceof Error ? err.message : 'Could not load your profile.');
        setCandidateProfileDetails(null);
        setCandidateProfileExists(false);
        setCandidateVideoObjectKey(null);
        setCandidateKeywords([]);
        setCandidateRemovedKeywords([]);
        setCandidateKeywordsTouched(false);
        setCandidateDetailedSignalsDraft([]);
      } finally {
        if (isActive) {
          setCandidateProfileLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [view, role, candidateStep, canUseAuthenticatedApi]);

  useEffect(() => {
    if (createStep !== 'details') {
      setShowDetailValidation(false);
    }
  }, [createStep]);

  useEffect(() => {
    const onRecordStep =
      (view === 'create' && createStep === 'record') || (view === 'find' && candidateStep === 'record');
    if (recordingState === 'idle' && playbackVideoRef.current && onRecordStep) {
      const player = playbackVideoRef.current;
      player.pause();
      player.currentTime = 0;
      player.play().catch(() => undefined);
    }
  }, [videoUrl, recordingState, view, createStep, candidateStep]);

  useEffect(() => {
    if (recordingState !== 'idle' && liveVideoRef.current && liveStreamRef.current) {
      const videoEl = liveVideoRef.current;
      videoEl.srcObject = liveStreamRef.current;
      videoEl.play().catch(() => undefined);
    }
  }, [recordingState]);

  useEffect(() => {
    const onRecordStep =
      (view === 'create' && createStep === 'record') || (view === 'find' && candidateStep === 'record');
    if (onRecordStep && !recorderOpen) {
      openRecorder();
    }
  }, [view, createStep, candidateStep, recorderOpen]);

  useEffect(() => {
    const onRecordStep =
      (view === 'create' && createStep === 'record') || (view === 'find' && candidateStep === 'record');
    if (onRecordStep) return;
    if (
      mediaRecorderRef.current?.state === 'recording' ||
      mediaRecorderRef.current?.state === 'paused'
    ) {
      stopRecording();
    }
    stopStreamTracks(liveStreamRef.current);
    setLiveStream(null);
    setRecorderOpen(false);
  }, [view, createStep, candidateStep]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'location') {
      locationManuallySetRef.current = true;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
    setStatus('idle');
    setUploadProgress(null);
    setError(null);
  };

  const handleTranscriptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setTranscriptText(e.target.value);
    setDraftingError(null);
    setAutoTranscriptSessionId(null);
  };

  const handleCandidateProfileChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const isCheckbox = e.target instanceof HTMLInputElement && e.target.type === 'checkbox';
    const nextValue = isCheckbox ? e.target.checked : value;
    if (name === 'headline' || name === 'location' || name === 'summary') {
      candidateProfileEditedRef.current = { ...candidateProfileEditedRef.current, [name]: true };
      candidateProfileDraftAbortRef.current?.abort();
    }
    setCandidateProfile((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
    setCandidateValidation(false);
    setCandidateProfileSaved(false);
    setError(null);
  };

  const handleCandidateDetailedSignalValueChange = (index: number, value: string) => {
    setCandidateDetailedSignalsDraft((prev) =>
      prev.map((signal, signalIndex) =>
        signalIndex === index
          ? {
              ...signal,
              value,
            }
          : signal,
      ),
    );
    setCandidateProfileSaved(false);
    setError(null);
  };

  const handleCandidateDetailedSignalStructuredDataChange = (
    index: number,
    structuredData: Record<string, unknown> | null,
  ) => {
    setCandidateDetailedSignalsDraft((prev) =>
      prev.map((signal, signalIndex) =>
        signalIndex === index
          ? {
              ...signal,
              structured_data: normalizeStructuredData(structuredData),
            }
          : signal,
      ),
    );
    setCandidateProfileSaved(false);
    setError(null);
  };

  const normalizeKeywords = (keywords?: string[]): string[] => {
    const seen = new Set<string>();
    return (keywords ?? [])
      .map((kw) => (kw ?? '').toString().trim())
      .filter(Boolean)
      .filter((kw) => {
        const key = kw.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  };

  const moveCandidateProfileKeyword = (from: 'keep' | 'remove', keyword: string) => {
    const value = (keyword || '').toString().trim();
    if (!value) return;
    const normalized = value.toLowerCase();
    if (from === 'keep') {
      setCandidateKeywords((prev) => prev.filter((item) => item.toLowerCase() !== normalized));
      setCandidateRemovedKeywords((prev) => normalizeKeywords([...prev, value]));
    } else {
      setCandidateRemovedKeywords((prev) => prev.filter((item) => item.toLowerCase() !== normalized));
      setCandidateKeywords((prev) => normalizeKeywords([...prev, value]));
    }
    setCandidateKeywordsTouched(true);
    setCandidateProfileSaved(false);
    setError(null);
  };

  const applyDraft = (draft: {
    title?: string;
    description?: string;
    transcript?: string;
    keywords?: string[];
  }) => {
    if (draft.transcript) {
      setTranscriptText(draft.transcript);
    }
    setDraftKeywords(normalizeKeywords(draft.keywords));
    setForm((prev) => ({
      ...prev,
      title: draft.title || prev.title,
      description: draft.description || prev.description,
    }));
  };

  async function generateFromTranscript(overrideText?: string) {
    const text = (overrideText ?? transcriptText).trim();
    setError(null);
    if (!text) {
      setDraftingError('Paste a transcript to generate a draft.');
      return;
    }

    setDraftingFromTranscript(true);
    setDraftingError(null);
    try {
      const draft = await generateJobDraftFromTranscript(text);
      applyDraft(draft);
    } catch (err) {
      console.error(err);
      setDraftingError(err instanceof Error ? err.message : 'Could not generate a draft from the transcript.');
    } finally {
      setDraftingFromTranscript(false);
    }
  }

  const generateFromVideo = async (objectKey: string) => {
    setDraftingFromTranscript(true);
    setDraftingError(null);
    try {
      const draft = await generateJobDraftFromVideo(objectKey);
      applyDraft(draft);
    } catch (err) {
      console.error(err);
      setDraftingError(err instanceof Error ? err.message : 'Could not generate a draft from the video.');
    } finally {
      setDraftingFromTranscript(false);
    }
  };

  const clearVideoSelection = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoDuration(null);
    setVideoObjectKey(null);
    setCandidateVideoObjectKey(null);
    setCandidateTranscript('');
    setCandidateTranscriptStatus(undefined);
    setSelectedTakeId(null);
    setUploadProgress(null);
    setStatus('idle');
    clearProcessingTimer();
    setProcessingMessage(null);
    setDraftKeywords([]);
    setCandidateValidation(false);
    setCandidateProfileSaved(false);
  };

  const clearRecordedTakes = () => {
    takeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    takeUrlsRef.current.clear();
    setRecordedTakes([]);
    setAudioSessionTranscripts({});
    setAudioSessionStatuses({});
    setAutoTranscriptSessionId(null);
    setPendingDraftSessionId(null);
    pendingDraftSessionRef.current = null;
    draftedSessionsRef.current.clear();
  };

  const resetCreateState = () => {
    clearVideoSelection();
    clearRecordedTakes();
    resetRecordTimer();
    setRecordingState('idle');
    setForm(() => ({ ...INITIAL_FORM_STATE }));
    locationManuallySetRef.current = false;
    locationSuggestionAbortRef.current?.abort();
    locationSuggestionAbortRef.current = null;
    lastLocationQueryRef.current = null;
    locationSuggestionDisabledRef.current = false;
    setTranscriptText('');
    setDraftKeywords([]);
    setDraftingError(null);
    setDraftingFromTranscript(false);
    setAutoTranscriptSessionId(null);
    setPendingDraftSessionId(null);
    pendingDraftSessionRef.current = null;
    setShowDetailValidation(false);
    setStatus('idle');
    setUploadProgress(null);
    setProcessingMessage(null);
    setError(null);
    setJobSaving(false);
    setCreateStep('record');
  };

  const startCreateFlow = () => {
    resetCreateState();
    setRoleAndView('employer');
  };

  const startCandidateFlow = () => {
    setCandidateDetailedMode(false);
    if (previewAuthenticated) {
      setRoleAndView('candidate', 'jobs');
      return;
    }
    setRoleAndView('candidate', 'find', { candidateStep: 'intro' });
  };

  const buildCandidateDraftFromTranscript = useCallback(
    async (transcript: string, options?: { includeLocation?: boolean }) => {
      const includeLocation = options?.includeLocation !== false;
      const text = transcript.trim().slice(0, 8000);
      if (!text) return null;
      const canSuggestLocation = includeLocation && transcriptLikelyContainsLocationIntent(text);
      const prefill: {
        headline?: string;
        summary?: string;
        location?: string;
        keywords?: string[];
      } = {};

      const profileDraftPromise = getProfileDraftFromTranscript(text);
      const locationPromise = canSuggestLocation ? getLocationFromTranscript(text) : Promise.resolve(null);
      const [profileDraftResult, locationResult] = await Promise.allSettled([
        profileDraftPromise,
        locationPromise,
      ]);

      if (profileDraftResult.status === 'fulfilled') {
        const profileDraft = profileDraftResult.value;
        const normalizedKeywords = normalizeKeywords(profileDraft.keywords);
        prefill.headline = profileDraft.headline || '';
        prefill.summary = profileDraft.summary || '';
        prefill.keywords = normalizedKeywords;
      } else {
        console.error('Candidate profile prefill failed', profileDraftResult.reason);
      }

      if (canSuggestLocation) {
        if (locationResult.status === 'fulfilled') {
          const suggestion = formatLocationSuggestion(locationResult.value || { location: null });
          prefill.location = suggestion || '';
        } else {
          console.error('Candidate location prefill failed', locationResult.reason);
        }
      }
      return Object.keys(prefill).length > 0 ? prefill : null;
    },
    [],
  );

  const handleRoleSelection = (value: UserRole, navigate: boolean) => {
    if (navigate) {
      if (value === 'employer') {
        startCreateFlow();
      } else {
        startCandidateFlow();
      }
      return;
    }
    persistRole(value);
  };

  const handleVideoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    setStatus('idle');
    setUploadProgress(null);
    setVideoDuration(null);
    setVideoObjectKey(null);
    clearProcessingTimer();
    setProcessingMessage(null);

    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const probe = document.createElement('video');
    const playbackProbe = document.createElement('video');
    probe.preload = 'metadata';
    if (file.type && playbackProbe.canPlayType(file.type) === '') {
      setError(`This browser cannot play files of type ${file.type}. Try MP4 (H.264/AAC).`);
      clearVideoSelection();
      URL.revokeObjectURL(objectUrl);
      return;
    }

    probe.onloadedmetadata = () => {
      const duration = probe.duration;
      setVideoDuration(duration);
      if (duration > MAX_VIDEO_SECONDS) {
        setError('Video must be 3 minutes or less.');
        URL.revokeObjectURL(objectUrl);
        return;
      }
      const uploadCount = recordedTakes.filter((t) => t.source === 'upload').length + 1;
      const take: RecordedTake = {
        id: makeTakeId('upload'),
        file,
        url: objectUrl,
        duration,
        label: `Upload ${uploadCount}`,
        source: 'upload',
      };
      takeUrlsRef.current.add(objectUrl);
      setRecordedTakes((prev) => [take, ...prev]);
      setSelectedTakeId(take.id);
      setVideoUrl(objectUrl);
      setVideoDuration(duration);
    };
    probe.onerror = () => {
      setError('Could not read video metadata. Try a different file.');
      URL.revokeObjectURL(objectUrl);
    };
    probe.src = objectUrl;
  };

  const acquireStream = async () => {
    const legacyGetUserMedia = (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;
    const getUserMedia =
      navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) ||
      (legacyGetUserMedia
        ? (constraints: MediaStreamConstraints) =>
            new Promise<MediaStream>((resolve, reject) =>
              legacyGetUserMedia.call(navigator, constraints, resolve, reject),
            )
        : null);

    if (!getUserMedia) {
      const insecure =
        typeof window !== 'undefined' &&
        !window.isSecureContext &&
        !['localhost', '127.0.0.1'].includes(window.location.hostname);
      setError(
        insecure
          ? 'Camera/mic access is blocked on non-HTTPS pages. Open this site via https:// (or use localhost).'
          : 'Camera/mic not supported in this browser.',
      );
      return null;
    }

    try {
      const stream =
        liveStreamRef.current && liveStreamRef.current.active
          ? liveStreamRef.current
          : await getUserMedia({ video: true, audio: true });

      if (!liveStreamRef.current || !liveStreamRef.current.active) {
        setLiveStream(stream);
      }
      return stream;
    } catch (err) {
      console.error(err);
      setError('Permission denied. Allow camera/mic to record a video.');
      return null;
    }
  };

  const openRecorder = async () => {
    setError(null);
    resetRecordTimer();
    setRecordingState('idle');
    const stream = await acquireStream();
    if (stream) {
      setRecorderOpen(true);
    }
  };

  const startRecording = async () => {
    setError(null);
    setStatus('idle');
    resetRecordTimer();

    const stream = await acquireStream();
    if (!stream) return;

    try {
      // Prep audio streaming (disabled when chunking is off)
      const audioTracks = stream.getAudioTracks();
      const audioMime = pickAudioMimeType();
      const sessionId = ENABLE_AUDIO_CHUNKS && audioTracks.length ? makeAudioSessionId() : null;
      if (sessionId) {
        audioSessionIdRef.current = sessionId;
        audioChunkIndexRef.current = 0;
        audioUploadChainRef.current = Promise.resolve();
        setAudioSessionStatuses((prev) => ({ ...prev, [sessionId]: 'pending' }));
        startTranscriptPolling(sessionId);
      } else {
        audioSessionIdRef.current = null;
      }

      const preferredMimeOptions = [
        'video/mp4',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];

      const chosenMime =
        preferredMimeOptions.find(
          (opt) =>
            typeof MediaRecorder !== 'undefined' &&
            typeof MediaRecorder.isTypeSupported === 'function' &&
            MediaRecorder.isTypeSupported(opt) &&
            document.createElement('video').canPlayType(opt) !== ''
        ) || '';

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        syncRecordElapsed();
        const blobType = chosenMime || 'video/webm';
        const containerType = blobType.split(';')[0] || blobType;
        const blob = new Blob(chunks, { type: containerType });
        const extension = containerType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `capture.${extension}`, { type: containerType });
        const objectUrl = URL.createObjectURL(blob);
        const takeIndex = recordedTakes.filter((t) => t.source === 'recording').length + 1;
        const finalDuration = recordElapsedRef.current;
        const take: RecordedTake = {
          id: makeTakeId('rec'),
          file,
          url: objectUrl,
          duration: finalDuration,
          label: `Take ${takeIndex}`,
          source: 'recording',
          audioSessionId: ENABLE_AUDIO_CHUNKS ? audioSessionIdRef.current || undefined : undefined,
        };
        takeUrlsRef.current.add(objectUrl);
        setRecordedTakes((prev) => {
          const limitGuestToSingleTake = !previewAuthenticated && view === 'find' && candidateStep === 'record';
          if (!limitGuestToSingleTake) {
            return [take, ...prev];
          }
          prev.forEach((oldTake) => {
            if (!oldTake?.url || oldTake.url === objectUrl) return;
            URL.revokeObjectURL(oldTake.url);
            takeUrlsRef.current.delete(oldTake.url);
          });
          return [take];
        });
        setSelectedTakeId(take.id);
        setVideoObjectKey(null);
        setVideoDuration(finalDuration);
        setVideoUrl(objectUrl);
        setRecordingState('idle');
      };

      if (sessionId && audioTracks.length && ENABLE_AUDIO_CHUNKS) {
        try {
          const audioStream = new MediaStream(audioTracks);
          const audioRecorder = audioMime ? new MediaRecorder(audioStream, { mimeType: audioMime }) : new MediaRecorder(audioStream);
          audioRecorder.ondataavailable = (ev) => {
            if (!ev.data || ev.data.size === 0) return;
            const nextIndex = audioChunkIndexRef.current;
            audioChunkIndexRef.current += 1;
            queueAudioChunkUpload(sessionId, nextIndex, ev.data, audioMime || ev.data.type || 'audio/webm');
          };
          audioRecorder.onstop = () => {
            void finalizeAudioSessionIfNeeded();
          };
          audioRecorderRef.current = audioRecorder;
          audioRecorder.start(AUDIO_CHUNK_MS);
        } catch (audioErr) {
          console.error('Audio recorder failed', audioErr);
          audioSessionIdRef.current = null;
        }
      }

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState('recording');
      setLiveStream(stream);
      startRecordTimer();
    } catch (err) {
      console.error(err);
      setError('Could not access camera/microphone. Check permissions.');
      setRecordingState('idle');
    }
  };

  const pauseRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
    try {
      mediaRecorderRef.current.pause();
      if (audioRecorderRef.current && audioRecorderRef.current.state === 'recording') {
        audioRecorderRef.current.pause();
      }
      syncRecordElapsed();
      setRecordingState('paused');
    } catch (err) {
      console.error(err);
      setError('Could not pause the recording. Try again.');
    }
  };

  const resumeRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'paused') return;
    try {
      mediaRecorderRef.current.resume();
      if (audioRecorderRef.current && audioRecorderRef.current.state === 'paused') {
        audioRecorderRef.current.resume();
      }
      setRecordingState('recording');
      startRecordTimer();
    } catch (err) {
      console.error(err);
      setError('Could not resume the recording. Try again.');
    }
  };

  const stopRecording = () => {
    const hasVideoRecorder = Boolean(mediaRecorderRef.current);
    if (!hasVideoRecorder && !audioRecorderRef.current) {
      clearRecordTimer();
      setRecordingState('idle');
      return;
    }
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      syncRecordElapsed();
      mediaRecorderRef.current.stop();
    }
    if (
      ENABLE_AUDIO_CHUNKS &&
      audioRecorderRef.current &&
      (audioRecorderRef.current.state === 'recording' || audioRecorderRef.current.state === 'paused')
    ) {
      audioRecorderRef.current.stop();
    }
    setRecordingState('idle');
  };

  const uploadTake = async (take: RecordedTake, fallbackDuration?: number | null) => {
    setStatus('presigning');
    const presign = await createUploadUrl(take.file);
    setStatus('uploading');
    setUploadProgress(0);
    await uploadFileToUrl(presign.upload_url, take.file, (percent) => setUploadProgress(percent));
    setStatus('confirming');
    const confirmed = await confirmUpload({
      object_key: presign.object_key,
      duration_seconds: take.duration ?? fallbackDuration ?? null,
      source: take.source,
    });
    setUploadProgress(100);
    return { objectKey: confirmed.object_key || presign.object_key };
  };

  const saveVideo = async () => {
    if (status === 'presigning' || status === 'uploading' || status === 'confirming' || status === 'processing') {
      return;
    }
    setError(null);
    setUploadProgress(null);
    clearProcessingTimer();
    setProcessingMessage(null);
    setVideoObjectKey(null);

    if (!selectedTake) {
      setError('Record or upload a video before saving.');
      setCreateStep('select');
      return;
    }

    if ((selectedTake.duration ?? videoDuration ?? 0) > MAX_VIDEO_SECONDS) {
      setError('Video must be 3 minutes or less.');
      return;
    }

    const canContinue = await ensureAuthenticated({
      title: 'Create an account to continue',
      message: 'Create an account before processing this job video and continuing to job details.',
    });
    if (!canContinue) return;

    try {
      const { objectKey } = await uploadTake(selectedTake, videoDuration);
      setVideoObjectKey(objectKey);
      startProcessingPoll(objectKey);
      setDraftingError(null);
      const sessionId = selectedTake.audioSessionId;
      const sessionTranscript = sessionId ? audioSessionTranscripts[sessionId] : '';
      if (sessionId) {
        startTranscriptPolling(sessionId);
        if (sessionTranscript && sessionTranscript.trim().length >= MIN_TRANSCRIPT_FOR_DRAFT) {
          setTranscriptText(sessionTranscript);
          setAutoTranscriptSessionId(sessionId);
          void generateFromTranscript(sessionTranscript);
        } else {
          pendingDraftSessionRef.current = sessionId;
          setPendingDraftSessionId(sessionId);
        }
      } else {
        setTranscriptText('');
        void generateFromVideo(objectKey);
      }
      setShowDetailValidation(false);
      setCreateStep('details');
    } catch (err) {
      console.error(err);
      clearProcessingTimer();
      setProcessingMessage(null);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  const saveCandidateVideo = async (options?: {
    showBlockingOverlay?: boolean;
    detailedQuestionWindows?: DetailedQuestionWindow[];
  }) => {
    if (status === 'presigning' || status === 'uploading' || status === 'confirming' || status === 'processing') {
      return;
    }
    const isDetailedUpdateFlow = candidateDetailedMode;
    setError(null);
    setUploadProgress(null);
    clearProcessingTimer();
    setProcessingMessage(null);
    setCandidateProfileSaved(false);
    if (!isDetailedUpdateFlow) {
      setCandidateVideoObjectKey(null);
      setCandidateKeywords([]);
      setCandidateRemovedKeywords([]);
      setCandidateKeywordsTouched(false);
    }
    setCandidateDetailedSignalsDraft([]);
    candidateProfileDraftHandledTranscriptRef.current = null;
    candidateLocationHandledTranscriptRef.current = null;

    if (!selectedTake) {
      setError('Record or upload a video before saving.');
      setCandidateStep('select');
      return;
    }

    if ((selectedTake.duration ?? videoDuration ?? 0) > MAX_VIDEO_SECONDS) {
      setError('Video must be 3 minutes or less.');
      return;
    }

    const requiresAuth = !previewAuthenticated;
    const canContinue = await ensureAuthenticated({
      title: 'Create account',
      message: 'Use your name and password to continue.',
      mode: 'register',
    });
    if (!canContinue) return;
    const shouldShowBlockingOverlay = Boolean(options?.showBlockingOverlay) || requiresAuth;
    if (shouldShowBlockingOverlay) {
      setCandidatePostAuthOverlay(true);
    }

    try {
      const { objectKey } = await uploadTake(selectedTake, videoDuration);
      if (!isDetailedUpdateFlow) {
        setCandidateVideoObjectKey(objectKey);
      }
      startProcessingPoll(objectKey);
      setCandidateTranscript('');
      setCandidateTranscriptStatus('pending');
      let transcriptPrefill: CandidateDraftFields | null = null;
      let transcriptFromVideo = '';
      try {
        const draft = await generateJobDraftFromVideo(objectKey);
        const transcript = (draft?.transcript || '').trim();
        transcriptFromVideo = transcript;
        if (transcript) {
          transcriptPrefill = await buildCandidateDraftFromTranscript(transcript);
          setCandidateTranscript(transcript);
          setCandidateTranscriptStatus('final');
        } else {
          setCandidateTranscriptStatus(undefined);
        }
      } catch (err) {
        console.error('Could not fetch transcript for candidate video', err);
        setCandidateTranscriptStatus(undefined);
      }
      const detailedQuestionSet = isDetailedUpdateFlow
        ? getQuestionSet(VIDEO_QUESTION_CONFIG.candidateProfile)
        : null;
      const generatedDetailedSignals = isDetailedUpdateFlow
        ? await buildDetailedSignalsFromQuestions(
            detailedQuestionSet?.questions ?? [],
            transcriptFromVideo,
            options?.detailedQuestionWindows ?? [],
            Math.max(0.001, Number(selectedTake.duration ?? videoDuration ?? 0)),
          )
        : [];
      setCandidateDetailedSignalsDraft(generatedDetailedSignals);
      setCandidateValidation(false);
      let existingProfile: CandidateProfile | null = candidateProfileDetails;
      let hasExistingProfile = candidateProfileExists;
      if (!requiresAuth && !hasExistingProfile && canUseAuthenticatedApi) {
        try {
          const fetchedProfile = await getCandidateProfile();
          if (fetchedProfile) {
            existingProfile = fetchedProfile;
            hasExistingProfile = true;
            setCandidateProfileDetails(fetchedProfile);
            setCandidateProfileExists(true);
          }
        } catch (err) {
          console.error('Could not load current profile before review', err);
        }
      }
      const shouldOpenReviewUpdate = !requiresAuth && hasExistingProfile;
      if (shouldOpenReviewUpdate) {
        const currentHeadline = (existingProfile?.headline ?? candidateProfile.headline ?? '')
          .toString()
          .trim();
        const currentLocation = (existingProfile?.location ?? candidateProfile.location ?? '')
          .toString()
          .trim();
        const currentSummary = (existingProfile?.summary ?? candidateProfile.summary ?? '')
          .toString()
          .trim();
        const currentKeywords = normalizeKeywords(
          existingProfile?.keywords?.length ? existingProfile.keywords : candidateKeywords,
        );
        const draftHeadline = (
          isDetailedUpdateFlow ? currentHeadline : transcriptPrefill?.headline ?? currentHeadline
        )
          .toString()
          .trim();
        const draftLocation = (
          isDetailedUpdateFlow ? currentLocation : transcriptPrefill?.location ?? currentLocation
        )
          .toString()
          .trim();
        const draftSummary = (
          isDetailedUpdateFlow ? currentSummary : transcriptPrefill?.summary ?? currentSummary
        )
          .toString()
          .trim();
        const extractedDetailedKeywords = normalizeKeywords(transcriptPrefill?.keywords);
        const draftKeywords = normalizeKeywords(
          isDetailedUpdateFlow
            ? extractedDetailedKeywords
            : transcriptPrefill?.keywords?.length
            ? transcriptPrefill.keywords
            : currentKeywords,
        );
        const currentDetailedSignals = normalizeDetailedSignals(existingProfile?.detailed_signals);
        const newDetailedSignals =
          generatedDetailedSignals.length > 0 ? generatedDetailedSignals : currentDetailedSignals;

        setCandidateReviewCurrent({
          headline: currentHeadline,
          location: currentLocation,
          summary: currentSummary,
          keywords: currentKeywords,
          detailedSignals: currentDetailedSignals,
        });
        setCandidateReviewNew({
          headline: draftHeadline,
          location: draftLocation,
          summary: draftSummary,
          keywords: draftKeywords,
          detailedSignals: newDetailedSignals,
        });
        setCandidateReviewChoices({
          ...DEFAULT_CANDIDATE_REVIEW_CHOICES,
          headline: isDetailedUpdateFlow ? 'current' : DEFAULT_CANDIDATE_REVIEW_CHOICES.headline,
          location: isDetailedUpdateFlow ? 'current' : DEFAULT_CANDIDATE_REVIEW_CHOICES.location,
          summary: isDetailedUpdateFlow ? 'current' : DEFAULT_CANDIDATE_REVIEW_CHOICES.summary,
          keywords: isDetailedUpdateFlow ? 'new' : DEFAULT_CANDIDATE_REVIEW_CHOICES.keywords,
        });
        setCandidateReviewDetailedSignalChoices(buildDetailedSignalChoiceDefaults(currentDetailedSignals, newDetailedSignals));
        setCandidateReviewVideoChoice(isDetailedUpdateFlow ? 'current' : 'new');
        setCandidateReviewCurrentVideoUrl(existingProfile?.playback_url || null);
        setCandidateReviewCurrentVideoObjectKey(existingProfile?.video_object_key ?? null);
        setCandidateStep('review');
        if (role !== 'candidate') {
          persistRole('candidate');
        }
        setView('find');
        return;
      }
      if (requiresAuth) {
        const currentHeadline = (existingProfile?.headline ?? candidateProfile.headline ?? '').toString().trim();
        const currentLocation = (existingProfile?.location ?? candidateProfile.location ?? '').toString().trim();
        const currentSummary = (existingProfile?.summary ?? candidateProfile.summary ?? '').toString().trim();
        const currentKeywords = normalizeKeywords(
          existingProfile?.keywords?.length ? existingProfile.keywords : candidateKeywords,
        );
        const resolvedHeadline = (
          isDetailedUpdateFlow ? currentHeadline : transcriptPrefill?.headline ?? currentHeadline
        )
          .toString()
          .trim();
        const resolvedLocation = (
          isDetailedUpdateFlow ? currentLocation : transcriptPrefill?.location ?? currentLocation
        )
          .toString()
          .trim();
        const resolvedSummary = (
          isDetailedUpdateFlow ? currentSummary : transcriptPrefill?.summary ?? currentSummary
        )
          .toString()
          .trim();
        const extractedDetailedKeywords = normalizeKeywords(transcriptPrefill?.keywords);
        const resolvedKeywords = isDetailedUpdateFlow
          ? normalizeKeywords([...currentKeywords, ...extractedDetailedKeywords])
          : transcriptPrefill?.keywords?.length
          ? transcriptPrefill.keywords
          : candidateKeywords.length
          ? candidateKeywords
          : null;
        const preservedVideoObjectKey = existingProfile?.video_object_key ?? candidateVideoObjectKey ?? null;
        const detailedSignalsPayload = normalizeDetailedSignals(generatedDetailedSignals);
        try {
          const savedProfile = await upsertCandidateProfile({
            headline: resolvedHeadline || null,
            location: resolvedLocation || null,
            location_id: candidateProfile.location_id ?? null,
            summary: resolvedSummary || null,
            keywords: resolvedKeywords && resolvedKeywords.length ? resolvedKeywords : null,
            ...(detailedSignalsPayload.length > 0 ? { detailed_signals: detailedSignalsPayload } : {}),
            video_object_key: isDetailedUpdateFlow ? preservedVideoObjectKey : objectKey,
            discoverable: Boolean(candidateProfile.discoverable),
          });
          setCandidateProfileDetails(savedProfile ?? null);
          setCandidateProfileExists(Boolean(savedProfile));
          if (savedProfile) {
            setCandidateProfile({
              headline: savedProfile.headline ?? '',
              location: savedProfile.location ?? '',
              location_id: savedProfile.location_id ?? null,
              summary: savedProfile.summary ?? '',
              discoverable: Boolean(savedProfile.discoverable),
            });
            if (!isDetailedUpdateFlow) {
              setCandidateVideoObjectKey(savedProfile.video_object_key ?? objectKey);
            } else {
              setCandidateVideoObjectKey(savedProfile.video_object_key ?? preservedVideoObjectKey ?? null);
            }
            setCandidateKeywords(normalizeKeywords(savedProfile.keywords));
            setCandidateRemovedKeywords([]);
            setCandidateKeywordsTouched(false);
            setCandidateDetailedSignalsDraft(normalizeDetailedSignals(savedProfile.detailed_signals));
          }
          setCandidateProfileSaved(true);
          setCandidateDetailedMode(false);
          setCandidateStep('profile');
          if (role !== 'candidate') {
            persistRole('candidate');
          }
          setView('profile');
        } catch (err) {
          console.error('Could not auto-save candidate profile after sign-up', err);
          setError(
            err instanceof Error
              ? err.message
              : 'Could not auto-save your profile. You can complete and save it manually.',
          );
          setCandidateDetailedMode(false);
          setCandidateStep('profile');
        }
      } else {
        if (generatedDetailedSignals.length > 0) {
          setCandidateDetailedSignalsDraft(generatedDetailedSignals);
        }
        setCandidateDetailedMode(false);
        setCandidateStep('profile');
      }
    } catch (err) {
      console.error(err);
      clearProcessingTimer();
      setProcessingMessage(null);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      if (shouldShowBlockingOverlay) {
        setCandidatePostAuthOverlay(false);
      }
    }
  };

  const saveCandidateProfile = async () => {
    setError(null);
    setCandidateProfileSaved(false);

    const headline = (candidateProfile.headline ?? '').toString().trim();
    const location = (candidateProfile.location ?? '').toString().trim();
    const summary = (candidateProfile.summary ?? '').toString().trim();
    const hasVideo = Boolean(candidateVideoObjectKey);
    const keywords = candidateKeywordsTouched
      ? candidateKeywords
      : candidateKeywords.length
      ? candidateKeywords
      : normalizeKeywords(candidateProfileDetails?.keywords);
    const videoObjectKey = candidateVideoObjectKey || candidateProfileDetails?.video_object_key || null;
    const detailedSignalsPayload = normalizeDetailedSignals(candidateDetailedSignalsDraft);

    if (!headline || !location || !summary || (!hasVideo && !candidateProfileExists)) {
      setCandidateValidation(true);
      if (!hasVideo && !candidateProfileExists) {
        setError('Save your video before completing your profile.');
      }
      return;
    }

    const canContinue = await ensureAuthenticated({
      title: 'Create an account to save your profile',
      message: 'Create an account before saving your candidate profile and video.',
    });
    if (!canContinue) return;

    setCandidateProfileSaving(true);
    try {
      const savedProfile = await upsertCandidateProfile({
        headline,
        location,
        summary,
        keywords: keywords.length ? keywords : null,
        ...(detailedSignalsPayload.length > 0 ? { detailed_signals: detailedSignalsPayload } : {}),
        video_object_key: videoObjectKey,
        discoverable: Boolean(candidateProfile.discoverable),
      });
      setCandidateProfileDetails(savedProfile ?? null);
      setCandidateProfileExists(Boolean(savedProfile));
      if (savedProfile) {
        setCandidateProfile({
          headline: savedProfile.headline ?? '',
          location: savedProfile.location ?? '',
          location_id: savedProfile.location_id ?? null,
          summary: savedProfile.summary ?? '',
          discoverable: Boolean(savedProfile.discoverable),
        });
        setCandidateVideoObjectKey(savedProfile.video_object_key ?? null);
        setCandidateKeywords(normalizeKeywords(savedProfile.keywords));
        setCandidateRemovedKeywords([]);
        setCandidateKeywordsTouched(false);
        setCandidateDetailedSignalsDraft(normalizeDetailedSignals(savedProfile.detailed_signals));
      }
      setCandidateProfileSaved(true);
      setCandidateValidation(false);
      setCandidateDetailedMode(false);
      setCandidateStep('profile');
      if (role !== 'candidate') {
        persistRole('candidate');
      }
      setView('profile');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setCandidateProfileSaving(false);
    }
  };

  const handleCandidateReviewTextChange = (
    side: CandidateReviewSide,
    field: 'headline' | 'location' | 'summary',
    value: string,
  ) => {
    if (side === 'current') {
      setCandidateReviewCurrent((prev) => (prev ? { ...prev, [field]: value } : prev));
      return;
    }
    setCandidateReviewNew((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleCandidateReviewChoiceChange = (field: CandidateReviewField, choice: CandidateReviewChoice) => {
    setCandidateReviewChoices((prev) => ({ ...prev, [field]: choice }));
  };

  const handleCandidateReviewDetailedSignalChoiceChange = (key: string, choice: CandidateReviewChoice) => {
    const normalizedKey = (key || '').toString().trim().toLowerCase();
    if (!normalizedKey) return;
    setCandidateReviewDetailedSignalChoices((prev) => ({ ...prev, [normalizedKey]: choice }));
  };

  const handleCandidateReviewDetailedSignalValueChange = (
    side: CandidateReviewSide,
    key: string,
    value: string,
  ) => {
    const normalizedKey = (key || '').toString().trim().toLowerCase();
    if (!normalizedKey) return;
    const applyUpdate = (signals: CandidateDetailedSignal[]) =>
      signals.map((signal) =>
        getDetailedSignalIdentityKey(signal) === normalizedKey
          ? {
              ...signal,
              value,
            }
          : signal,
      );
    if (side === 'current') {
      setCandidateReviewCurrent((prev) =>
        prev
          ? {
              ...prev,
              detailedSignals: applyUpdate(normalizeDetailedSignals(prev.detailedSignals)),
            }
          : prev,
      );
      return;
    }
    setCandidateReviewNew((prev) =>
      prev
        ? {
            ...prev,
            detailedSignals: applyUpdate(normalizeDetailedSignals(prev.detailedSignals)),
          }
        : prev,
    );
  };

  const moveCandidateReviewKeyword = (from: CandidateReviewSide, keyword: string) => {
    const value = (keyword || '').trim();
    if (!value) return;
    if (from === 'current') {
      setCandidateReviewCurrent((prev) => {
        if (!prev) return prev;
        return { ...prev, keywords: prev.keywords.filter((item) => item !== value) };
      });
      setCandidateReviewNew((prev) => {
        if (!prev) return prev;
        return { ...prev, keywords: normalizeKeywords([...prev.keywords, value]) };
      });
      return;
    }
    setCandidateReviewNew((prev) => {
      if (!prev) return prev;
      return { ...prev, keywords: prev.keywords.filter((item) => item !== value) };
    });
    setCandidateReviewCurrent((prev) => {
      if (!prev) return prev;
      return { ...prev, keywords: normalizeKeywords([...prev.keywords, value]) };
    });
  };

  const applyCandidateReviewUpdate = async () => {
    setError(null);
    const isDetailedUpdateFlow = candidateDetailedMode;
    if (!candidateReviewCurrent || !candidateReviewNew) {
      setError(
        isDetailedUpdateFlow
          ? 'Review data is missing. Please go back to recording and continue again.'
          : 'Review data is missing. Please go back to Select video and continue again.',
      );
      setCandidateStep(isDetailedUpdateFlow ? 'record' : 'select');
      return;
    }

    const pickText = (field: 'headline' | 'location' | 'summary') =>
      (candidateReviewChoices[field] === 'current'
        ? candidateReviewCurrent[field]
        : candidateReviewNew[field]
      )
        .toString()
        .trim();
    const selectedKeywords = normalizeKeywords(
      candidateReviewChoices.keywords === 'current'
        ? candidateReviewCurrent.keywords
        : candidateReviewNew.keywords,
    );
    const currentDetailedSignals = normalizeDetailedSignals(candidateReviewCurrent.detailedSignals);
    const newDetailedSignals = normalizeDetailedSignals(candidateReviewNew.detailedSignals);
    const selectedDetailedSignals = isDetailedUpdateFlow
      ? (() => {
          const currentByKey = new Map<string, CandidateDetailedSignal>(
            currentDetailedSignals.map((signal) => [getDetailedSignalIdentityKey(signal), signal]),
          );
          const newByKey = new Map<string, CandidateDetailedSignal>(
            newDetailedSignals.map((signal) => [getDetailedSignalIdentityKey(signal), signal]),
          );
          const allKeys = new Set<string>([...currentByKey.keys(), ...newByKey.keys()]);
          const chosen: CandidateDetailedSignal[] = [];
          allKeys.forEach((key) => {
            const preferred = candidateReviewDetailedSignalChoices[key] ?? (newByKey.has(key) ? 'new' : 'current');
            const picked =
              preferred === 'current'
                ? currentByKey.get(key) ?? newByKey.get(key)
                : newByKey.get(key) ?? currentByKey.get(key);
            if (picked) {
              chosen.push(picked);
            }
          });
          return normalizeDetailedSignals(chosen);
        })()
      : mergeDetailedSignals(currentDetailedSignals, newDetailedSignals);

    const currentVideoKey =
      candidateReviewCurrentVideoObjectKey || candidateProfileDetails?.video_object_key || null;
    const newVideoKey = isDetailedUpdateFlow ? null : candidateVideoObjectKey || null;
    const resolvedVideoObjectKey =
      isDetailedUpdateFlow
        ? currentVideoKey
        : candidateReviewVideoChoice === 'current'
        ? currentVideoKey || newVideoKey
        : newVideoKey || currentVideoKey;

    if (!resolvedVideoObjectKey && !isDetailedUpdateFlow) {
      setError('Choose a video before saving your profile update.');
      return;
    }

    const canContinue = await ensureAuthenticated({
      title: 'Sign in to apply profile update',
      message: 'Sign in before applying your reviewed profile update.',
      mode: 'login',
    });
    if (!canContinue) return;

    const preservedKeywords = normalizeKeywords(
      candidateReviewCurrent.keywords.length > 0
        ? candidateReviewCurrent.keywords
        : candidateProfileDetails?.keywords ?? candidateKeywords,
    );
    const reviewedNewKeywords = normalizeKeywords(candidateReviewNew.keywords);
    const mergedDetailedKeywords = normalizeKeywords([...preservedKeywords, ...reviewedNewKeywords]);
    const preservedLocationId = candidateProfileDetails?.location_id ?? candidateProfile.location_id ?? null;

    setCandidateProfileSaving(true);
    try {
      const savedProfile = await upsertCandidateProfile({
        headline: (isDetailedUpdateFlow ? candidateReviewCurrent.headline : pickText('headline')) || null,
        location: (isDetailedUpdateFlow ? candidateReviewCurrent.location : pickText('location')) || null,
        location_id: preservedLocationId,
        summary: (isDetailedUpdateFlow ? candidateReviewCurrent.summary : pickText('summary')) || null,
        keywords: (isDetailedUpdateFlow ? mergedDetailedKeywords : selectedKeywords).length
          ? (isDetailedUpdateFlow ? mergedDetailedKeywords : selectedKeywords)
          : null,
        detailed_signals: selectedDetailedSignals,
        video_object_key: resolvedVideoObjectKey,
        discoverable: Boolean(candidateProfile.discoverable),
      });
      setCandidateProfileDetails(savedProfile ?? null);
      setCandidateProfileExists(Boolean(savedProfile));
      if (savedProfile) {
        setCandidateProfile({
          headline: savedProfile.headline ?? '',
          location: savedProfile.location ?? '',
          location_id: savedProfile.location_id ?? null,
          summary: savedProfile.summary ?? '',
          discoverable: Boolean(savedProfile.discoverable),
        });
        setCandidateVideoObjectKey(savedProfile.video_object_key ?? currentVideoKey ?? null);
        setCandidateKeywords(normalizeKeywords(savedProfile.keywords));
        setCandidateRemovedKeywords([]);
        setCandidateKeywordsTouched(false);
        setCandidateDetailedSignalsDraft(normalizeDetailedSignals(savedProfile.detailed_signals));
      }
      setCandidateProfileSaved(true);
      setCandidateValidation(false);
      resetCandidateReview();
      setCandidateDetailedMode(false);
      setCandidateStep('profile');
      if (role !== 'candidate') {
        persistRole('candidate');
      }
      setView('profile');
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : isDetailedUpdateFlow
          ? 'Could not save your detailed profile update.'
          : 'Could not save your reviewed profile update.',
      );
    } finally {
      setCandidateProfileSaving(false);
    }
  };

  const saveJob = async (publish: boolean) => {
    setError(null);

    if (!videoObjectKey) {
      setError('Save the video first.');
      setCreateStep('select');
      return;
    }

    if (!form.title.trim() || !form.location.trim()) {
      setError('Add a title and location first.');
      setCreateStep('details');
      setShowDetailValidation(true);
      return;
    }

    if (!companyId && !form.companyName.trim()) {
      setError('Add a company name first.');
      setCreateStep('details');
      setShowDetailValidation(true);
      return;
    }

    const canContinue = await ensureAuthenticated({
      title: publish ? 'Create an account to publish this job' : 'Create an account to save this job',
      message: publish
        ? 'Create an account before publishing your job and contacting candidates.'
        : 'Create an account before saving this job draft.',
    });
    if (!canContinue) return;

    setJobSaving(true);
    try {
      let resolvedCompanyId = companyId;
      if (!resolvedCompanyId) {
        try {
          const company = await createCompany({ name: form.companyName.trim() });
          resolvedCompanyId = company.id;
          setCompanyId(company.id);
          try {
            localStorage.setItem(COMPANY_STORAGE_KEY, company.id);
          } catch {
            // ignore storage failures
          }
        } catch (companyErr) {
          console.error(companyErr);
          setError(companyErr instanceof Error ? companyErr.message : 'Creating the company failed.');
          return;
        }
      }

      if (!resolvedCompanyId) {
        setError('Could not resolve a company for this job.');
        return;
      }

      const jobStatus = publish ? 'open' : 'draft';
      const jobVisibility = publish ? 'public' : 'private';
      const jobKeywords = filterKeywordsByLocation(draftKeywords, form.location);

      const savedJob = await createJob({
        company_id: resolvedCompanyId,
        title: form.title,
        description: form.description || null,
        location: form.location,
        keywords: jobKeywords,
        status: jobStatus,
        visibility: jobVisibility,
        video_object_key: videoObjectKey,
      });
      void refreshJobs();

      const nowIso = new Date().toISOString();
      const jobToDisplay: Job = savedJob || {
        id: `job-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
        company_id: resolvedCompanyId ?? undefined,
        title: form.title,
        location: form.location,
        description: form.description || null,
        keywords: jobKeywords,
        status: jobStatus,
        visibility: jobVisibility,
        video_object_key: videoObjectKey,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const fallbackVideoUrl = selectedTake?.url || null;
      const playbackUrl = savedJob?.playback_url ?? fallbackVideoUrl ?? undefined;
      if (playbackUrl) {
        jobVideoUrlsRef.current[jobToDisplay.id] = playbackUrl;
      }

      setJobs((prev) => [
        {
          ...jobToDisplay,
          videoLabel: selectedTake?.label || 'Video',
          videoUrl: playbackUrl || undefined,
          playback_url: savedJob?.playback_url ?? null,
        },
        ...prev,
      ]);
      setShowDetailValidation(false);
      resetCreateState();
      setView('jobs');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Saving the job failed. Please try again.');
    } finally {
      setJobSaving(false);
    }
  };

  const handlePublishJob = async (jobId: string) => {
    const canContinue = await ensureAuthenticated({
      title: 'Create an account to publish this job',
      message: 'Create an account before publishing company jobs.',
    });
    if (!canContinue) return;
    setJobsError(null);
    setPublishingJobId(jobId);
    try {
      const updated = await publishJob(jobId);
      if (updated?.playback_url) {
        jobVideoUrlsRef.current[jobId] = updated.playback_url;
      }
      setJobs((prev) =>
        prev.map((job) => {
          if (job.id !== jobId) return job;
          const fallbackVideoUrl = job.videoUrl || updated?.playback_url || jobVideoUrlsRef.current[jobId];
          return {
            ...job,
            ...updated,
            videoUrl: fallbackVideoUrl,
            videoLabel: job.videoLabel,
          };
        }),
      );
    } catch (err) {
      console.error(err);
      setJobsError(err instanceof Error ? err.message : 'Publishing the job failed.');
    } finally {
      setPublishingJobId(null);
    }
  };

  const handleUnpublishJob = async (jobId: string) => {
    const canContinue = await ensureAuthenticated({
      title: 'Sign in to manage this job',
      message: 'Sign in to update the publishing status of your jobs.',
      mode: 'login',
    });
    if (!canContinue) return;
    setJobsError(null);
    setUnpublishingJobId(jobId);
    try {
      const updated = await unpublishJob(jobId);
      if (updated?.playback_url) {
        jobVideoUrlsRef.current[jobId] = updated.playback_url;
      }
      setJobs((prev) =>
        prev.map((job) => {
          if (job.id !== jobId) return job;
          const fallbackVideoUrl = job.videoUrl || updated?.playback_url || jobVideoUrlsRef.current[jobId];
          return {
            ...job,
            ...updated,
            videoUrl: fallbackVideoUrl,
            videoLabel: job.videoLabel,
          };
        }),
      );
    } catch (err) {
      console.error(err);
      setJobsError(err instanceof Error ? err.message : 'Unpublishing the job failed.');
    } finally {
      setUnpublishingJobId(null);
    }
  };

  const selectedTake = recordedTakes.find((t) => t.id === selectedTakeId) ?? null;

  useEffect(() => {
    if (view === 'find' && candidateStep === 'select' && !previewAuthenticated) {
      setCandidateStep('record');
      return;
    }
  }, [view, candidateStep, previewAuthenticated]);

  useEffect(() => {
    if (view !== 'find' || candidateStep !== 'review') return;
    if (candidateReviewCurrent && candidateReviewNew) return;
    setCandidateStep(previewAuthenticated ? 'select' : 'record');
  }, [view, candidateStep, candidateReviewCurrent, candidateReviewNew, previewAuthenticated]);

  useEffect(() => {
    if (selectedTake?.audioSessionId) {
      startTranscriptPolling(selectedTake.audioSessionId);
    }
  }, [selectedTake?.audioSessionId]);

  useEffect(() => {
    const sessionId = selectedTake?.audioSessionId;
    if (!sessionId) return;
    const transcript = audioSessionTranscripts[sessionId];
    if (!transcript) return;
    const shouldApply = !transcriptText.trim() || autoTranscriptSessionId === sessionId;
    if (shouldApply) {
      setTranscriptText(transcript);
      setAutoTranscriptSessionId(sessionId);
    }
  }, [selectedTake?.audioSessionId, audioSessionTranscripts, transcriptText, autoTranscriptSessionId]);

  useEffect(() => {
    const text = transcriptText.trim();
    const currentLocation = form.location.trim();
    if (!text) {
      locationSuggestionAbortRef.current?.abort();
      lastLocationQueryRef.current = null;
      return;
    }
    if (locationManuallySetRef.current) return;
    if (locationSuggestionDisabledRef.current) return;
    const truncated = text.slice(0, 8000);
    if (lastLocationQueryRef.current === truncated) return;

    const controller = new AbortController();
    locationSuggestionAbortRef.current?.abort();
    locationSuggestionAbortRef.current = controller;
    lastLocationQueryRef.current = truncated;

    void (async () => {
      try {
        const res = await getLocationFromTranscript(truncated, controller.signal);
        if (controller.signal.aborted) return;
        const suggestion = formatLocationSuggestion(res || { location: null });
        const latestLocation = form.location.trim();
        if (!suggestion) return;
        if (locationManuallySetRef.current) return;
        if (latestLocation && latestLocation.toLowerCase() === suggestion.toLowerCase()) return;
        if (latestLocation) return;
        setForm((prev) => ({ ...prev, location: suggestion }));
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        const message = (err as Error)?.message?.toLowerCase?.() || '';
        if (message.includes('not found') || message.includes('404')) {
          locationSuggestionDisabledRef.current = true;
          return;
        }
        console.error('Location suggestion failed', err);
      }
    })();

    return () => controller.abort();
  }, [transcriptText, form.location]);

  // Autofill candidate profile fields from transcript when available
  useEffect(() => {
    if (candidateStep === 'review') return;
    const text = candidateTranscript.trim();
    if (!text || candidateTranscriptStatus !== 'final') return;
    const transcriptKey = text.slice(0, 8000);
    if (candidateProfileDraftHandledTranscriptRef.current === transcriptKey) return;

    const draftController = new AbortController();
    candidateProfileDraftAbortRef.current?.abort();
    candidateProfileDraftAbortRef.current = draftController;

    // LLM draft for headline/summary
    void (async () => {
      try {
        const draft = await getProfileDraftFromTranscript(transcriptKey, draftController.signal);
        if (draftController.signal.aborted) return;
        setCandidateProfile((prev) => {
          const next = { ...prev };
          if (!candidateProfileEditedRef.current.headline && !(prev.headline || '').trim()) {
            next.headline = draft.headline;
          }
          if (!candidateProfileEditedRef.current.summary && !(prev.summary || '').trim()) {
            next.summary = draft.summary;
          }
          return next;
        });
        setCandidateKeywords(normalizeKeywords(draft.keywords));
        setCandidateRemovedKeywords([]);
        setCandidateKeywordsTouched(false);
        candidateProfileDraftHandledTranscriptRef.current = transcriptKey;
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        console.error('Candidate profile draft failed', err);
      }
    })();

    return () => {
      draftController.abort();
    };
  }, [candidateTranscript, candidateTranscriptStatus, candidateStep]);

  // Geocode candidate location when transcript is ready and location is empty
  useEffect(() => {
    if (candidateStep === 'review') return;
    const text = candidateTranscript.trim();
    if (!text || candidateTranscriptStatus !== 'final') return;
    const transcriptKey = text.slice(0, 8000);
    if (candidateLocationHandledTranscriptRef.current === transcriptKey) return;
    if (candidateProfileEditedRef.current.location) return;
    if (!transcriptLikelyContainsLocationIntent(text)) {
      candidateLocationHandledTranscriptRef.current = transcriptKey;
      return;
    }

    const controller = new AbortController();
    candidateLocationAbortRef.current?.abort();
    candidateLocationAbortRef.current = controller;

    void (async () => {
      try {
        const res = await getLocationFromTranscript(transcriptKey, controller.signal);
        if (controller.signal.aborted) return;
        const suggestion = formatLocationSuggestion(res || { location: null });
        if (suggestion) {
          setCandidateProfile((prev) => {
            if (candidateProfileEditedRef.current.location) return prev;
            if ((prev.location || '').trim()) return prev;
            return { ...prev, location: suggestion };
          });
        }
        candidateLocationHandledTranscriptRef.current = transcriptKey;
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        console.error('Candidate location suggestion failed', err);
      }
    })();

    return () => controller.abort();
  }, [candidateTranscript, candidateTranscriptStatus, candidateStep]);

  const durationLabel = formatDuration(selectedTake?.duration ?? videoDuration);
  const recordLabel = formatDuration(recordDuration);
  const screenLabel = getScreenLabel(
    view,
    createStep,
    candidateStep,
    role,
    previewAuthenticated,
    candidateDetailedMode,
  );
  const showDevNav = SHOW_DEVELOPMENT_NAVIGATION;
  const shellClassName = [
    'app-shell',
    showDevNav ? null : 'sticky-nav',
  ]
    .filter(Boolean)
    .join(' ');
  const filteredDraftKeywords = filterKeywordsByLocation(draftKeywords, form.location);
  const filteredCandidateKeywords = filterKeywordsByLocation(
    candidateKeywords,
    candidateProfileDetails?.location ?? candidateProfile.location,
  );
  const favoriteCandidateIds = new Set(candidateFavorites.map((candidate) => candidate.id));
  const canManageFavorites = role === 'employer' && Boolean(companyId);
  const canManageInvitations = role === 'employer' && Boolean(companyId);
  const selectedJobForMatches = jobs.find((job) => job.id === selectedJobId) ?? null;
  const invitationStatusByCandidateId = employerInvitations.reduce(
    (acc, invitation) => {
      acc[invitation.candidate_id] = invitation.status;
      return acc;
    },
    {} as Record<string, InvitationStatus | undefined>,
  );
  const candidateDetailBackLabel =
    candidateSearchOrigin === 'applications'
      ? 'Back to applications'
      : candidateSearchOrigin === 'favorites'
      ? 'Back to favorites'
      : candidateSearchOrigin === 'matches'
      ? 'Back to matches'
      : candidateSearchOrigin === 'invitations'
      ? 'Back to invitations'
      : 'Back to results';
  const canSaveCandidateProfile = Boolean(candidateVideoObjectKey) || candidateProfileExists;
  const overlayHost = typeof document !== 'undefined' ? document.body : null;
  const candidatePostAuthOverlayMessage =
    status === 'presigning'
      ? 'Requesting an upload URL...'
      : status === 'uploading'
      ? `Uploading your video${typeof uploadProgress === 'number' ? ` (${Math.round(uploadProgress)}%)` : '...'}`
      : status === 'confirming'
      ? 'Confirming your upload...'
      : status === 'processing'
      ? processingMessage || 'Processing your video and preparing profile details...'
      : 'Preparing your profile details...';

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = authName.trim();
    const password = authPassword;
    if (!name || !password) {
      setAuthError('Enter your name and password.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const activePrompt = authPrompt;
      const wasAdminPathAuthRequired = adminPathAuthRequired;
      const user =
        authMode === 'login'
          ? await loginAccount(name, password)
          : await registerAccount(name, password);
      authUserRef.current = user;
      setAuthUser(user);
      setAuthPassword('');
      if (role) {
        persistRole(role);
      }
      if (wasAdminPathAuthRequired) {
        setAdminPathAuthRequired(false);
      }
      setAuthPrompt(null);
      const resolver = authRequestResolverRef.current;
      if (resolver) {
        authRequestResolverRef.current = null;
        resolver(true);
      } else if (wasAdminPathAuthRequired) {
        if (isAdminUser(user)) {
          setView('adminConfig');
        } else {
          setView('welcome');
        }
      } else if (activePrompt?.returnToHomeOnSuccess) {
        setRoleAndView('candidate', 'profile');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not authenticate your account.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const backToWelcome = () => {
    resetCreateState();
    resetCandidateFlow();
    persistRole(null);
    setView('welcome');
  };

  const handleLogout = async () => {
    try {
      await logoutAccount();
    } catch (err) {
      console.error(err);
    }
    authUserRef.current = null;
    closeAuthPrompt();
    setAuthUser(null);
    setAuthPassword('');
    setAuthError(null);
    persistRole(null);
    setCompanyId(null);
    try {
      localStorage.removeItem(COMPANY_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
    backToWelcome();
  };

  const goToStep = (nextStep: CreateStep) => {
    setError(null);
    setCreateStep(nextStep);
  };

  const goToCandidateStep = (nextStep: CandidateStep) => {
    setError(null);
    setCandidateStep(nextStep);
  };

  const goToCandidateView = (nextView: ViewMode) => {
    if (role === 'candidate') {
      setView(nextView);
      return;
    }
    setRoleAndView('candidate', nextView);
  };

  const goToEmployerView = (nextView: ViewMode) => {
    if (role === 'employer') {
      setView(nextView);
      return;
    }
    setRoleAndView('employer', nextView);
  };

  const goToCandidateProfileView = () => {
    runAuthenticated({
      title: 'Create an account to view your profile',
      message: 'Create an account before opening your saved candidate profile.',
    }, () => {
      setCandidateDetailedMode(false);
      if (role === 'candidate') {
        setView('profile');
      } else {
        setRoleAndView('candidate', 'profile');
      }
    });
  };

  const goToCandidateProfileEdit = () => {
    runAuthenticated({
      title: 'Create an account to edit your profile',
      message: 'Create an account before editing your saved candidate profile.',
    }, () => {
      setCandidateDetailedMode(false);
      if (role === 'candidate') {
        setView('find');
      } else {
        setRoleAndView('candidate', 'find');
      }
      setCandidateStep('profile');
    });
  };

  const goToCandidateDetailedProfileRecord = () => {
    runAuthenticated(
      {
        title: 'Create an account to build a detailed profile',
        message: 'Sign in before recording a detailed profile with guided questions.',
        mode: 'login',
      },
      () => {
        if (role === 'candidate') {
          resetCandidateFlow('intro');
          setView('find');
        } else {
          setRoleAndView('candidate', 'find', { candidateStep: 'intro' });
        }
        setCandidateDetailedMode(true);
      },
    );
  };

  const goToJobsOverview = () => {
    setSelectedJobId(null);
    setView('jobs');
  };

  const openJobMatches = (jobId: string) => {
    setSelectedJobId(jobId);
    goToEmployerView('jobMatches');
  };

  const backToJobDetail = () => {
    goToEmployerView(selectedJobId ? 'jobDetail' : 'jobs');
  };

  const goToCandidateSearch = () => {
    setSelectedCandidateProfile(null);
    setCandidateSearchOrigin('search');
    goToEmployerView('candidates');
  };

  const goToCandidateFavorites = () => {
    runAuthenticated({
      title: 'Create an account to view favorite candidates',
      message: 'Create an account before opening your saved candidates.',
    }, () => {
      setSelectedCandidateProfile(null);
      setCandidateSearchOrigin('favorites');
      goToEmployerView('candidateFavorites');
    });
  };

  const goToEmployerInvitations = () => {
    runAuthenticated({
      title: 'Create an account to view invitations',
      message: 'Create an account before opening your candidate invitations.',
    }, () => {
      setSelectedCandidateProfile(null);
      setCandidateSearchOrigin('invitations');
      goToEmployerView('invitations');
    });
  };

  const goToCandidateInvitations = () => {
    runAuthenticated({
      title: 'Create an account to view invitations',
      message: 'Create an account before viewing company invitations.',
    }, () => {
      goToCandidateView('invitations');
    });
  };

  const goToInvitations = () => {
    if (role === 'employer') {
      goToEmployerInvitations();
      return;
    }
    goToCandidateInvitations();
  };

  const goToAdminConfig = () => {
    runAuthenticated({
      title: 'Sign in to manage config',
      message: 'Sign in before editing shared runtime settings.',
    }, () => {
      setView('adminConfig');
    });
  };

  const openCandidateProfileFromSearch = (candidate: CandidateProfile) => {
    runAuthenticated({
      title: 'Create an account to view full candidate profiles',
      message: 'Sign in to open the full candidate detail page and continue recruiting.',
    }, async () => {
      let candidateToOpen = candidate;
      try {
        candidateToOpen = await getCandidateById(candidate.id);
      } catch (err) {
        console.error(err);
      }
      setSelectedCandidateProfile(candidateToOpen);
      setCandidateSearchOrigin('search');
      goToEmployerView('candidateDetail');
    });
  };

  const openCandidateProfileFromFavorites = (candidate: CandidateProfile) => {
    setSelectedCandidateProfile(candidate);
    setCandidateSearchOrigin('favorites');
    goToEmployerView('candidateDetail');
  };

  const openCandidateProfileFromInvitations = (candidate: CandidateProfile) => {
    setSelectedCandidateProfile(candidate);
    setCandidateSearchOrigin('invitations');
    goToEmployerView('candidateDetail');
  };

  const openCandidateProfileFromApplications = (candidate: CandidateProfile) => {
    setSelectedCandidateProfile(candidate);
    setCandidateSearchOrigin('applications');
    goToEmployerView('candidateDetail');
  };

  const openCandidateProfileFromMatches = (candidate: CandidateProfile) => {
    setSelectedCandidateProfile(candidate);
    setCandidateSearchOrigin('matches');
    goToEmployerView('candidateDetail');
  };

  const handleCandidateDetailBack = () => {
    setSelectedCandidateProfile(null);
    if (candidateSearchOrigin === 'applications') {
      goToEmployerView(selectedJobId ? 'jobDetail' : 'jobs');
      return;
    }
    if (candidateSearchOrigin === 'favorites') {
      goToEmployerView('candidateFavorites');
      return;
    }
    if (candidateSearchOrigin === 'matches') {
      goToEmployerView('jobMatches');
      return;
    }
    if (candidateSearchOrigin === 'invitations') {
      goToEmployerView('invitations');
      return;
    }
    goToEmployerView('candidates');
  };

  const setFavoriteUpdating = (candidateId: string, isUpdating: boolean) => {
    setFavoriteUpdatingIds((prev) => {
      const next = new Set(prev);
      if (isUpdating) {
        next.add(candidateId);
      } else {
        next.delete(candidateId);
      }
      return next;
    });
  };

  const setInviteUpdating = (candidateId: string, isUpdating: boolean) => {
    setInviteUpdatingIds((prev) => {
      const next = new Set(prev);
      if (isUpdating) {
        next.add(candidateId);
      } else {
        next.delete(candidateId);
      }
      return next;
    });
  };

  const setCandidateInviteUpdating = (invitationId: string, isUpdating: boolean) => {
    setCandidateInviteUpdatingIds((prev) => {
      const next = new Set(prev);
      if (isUpdating) {
        next.add(invitationId);
      } else {
        next.delete(invitationId);
      }
      return next;
    });
  };

  const handleAddCandidateFavorite = async (candidateId: string) => {
    const canContinue = await ensureAuthenticated({
      title: 'Create an account to save candidates',
      message: 'Create an account before adding candidates to your favorites.',
    });
    if (!canContinue) return;
    if (!companyId) {
      setCandidateFavoritesError('Select a company to save favorites.');
      return;
    }
    setCandidateFavoritesError(null);
    setFavoriteUpdating(candidateId, true);
    try {
      const added = await addCandidateFavorite(companyId, candidateId);
      setCandidateFavorites((prev) => {
        if (prev.some((candidate) => candidate.id === added.id)) return prev;
        return [added, ...prev];
      });
    } catch (err) {
      console.error(err);
      setCandidateFavoritesError(err instanceof Error ? err.message : 'Could not save favorite.');
    } finally {
      setFavoriteUpdating(candidateId, false);
    }
  };

  const handleRemoveCandidateFavorite = async (candidateId: string) => {
    const canContinue = await ensureAuthenticated({
      title: 'Sign in to manage favorites',
      message: 'Sign in before removing candidates from your favorites.',
      mode: 'login',
    });
    if (!canContinue) return;
    if (!companyId) {
      setCandidateFavoritesError('Select a company to manage favorites.');
      return;
    }
    setCandidateFavoritesError(null);
    setFavoriteUpdating(candidateId, true);
    try {
      await removeCandidateFavorite(companyId, candidateId);
      setCandidateFavorites((prev) => prev.filter((candidate) => candidate.id !== candidateId));
    } catch (err) {
      console.error(err);
      setCandidateFavoritesError(err instanceof Error ? err.message : 'Could not remove favorite.');
    } finally {
      setFavoriteUpdating(candidateId, false);
    }
  };

  const handleToggleCandidateFavorite = () => {
    if (!selectedCandidateProfile) return;
    if (favoriteCandidateIds.has(selectedCandidateProfile.id)) {
      void handleRemoveCandidateFavorite(selectedCandidateProfile.id);
      return;
    }
    void handleAddCandidateFavorite(selectedCandidateProfile.id);
  };

  const handleInviteCandidate = async (candidateId: string) => {
    const canContinue = await ensureAuthenticated({
      title: 'Create an account to invite candidates',
      message: 'Create an account before contacting candidates.',
    });
    if (!canContinue) return;
    if (!companyId) {
      setEmployerInvitationsError('Select a company to send invitations.');
      return;
    }
    const existingStatus = invitationStatusByCandidateId[candidateId];
    if (existingStatus && existingStatus !== 'rejected') {
      return;
    }
    setEmployerInvitationsError(null);
    setInviteUpdating(candidateId, true);
    try {
      const invitation = await inviteCandidate(companyId, candidateId);
      setEmployerInvitations((prev) => {
        const next = prev.filter((item) => item.id !== invitation.id);
        return [invitation, ...next];
      });
    } catch (err) {
      console.error(err);
      setEmployerInvitationsError(err instanceof Error ? err.message : 'Could not send invitation.');
    } finally {
      setInviteUpdating(candidateId, false);
    }
  };

  const handleCandidateInvitationUpdate = async (
    invitationId: string,
    status: InvitationStatus,
  ) => {
    const canContinue = await ensureAuthenticated({
      title: 'Sign in to manage invitations',
      message: 'Sign in before accepting or rejecting company invitations.',
      mode: 'login',
    });
    if (!canContinue) return;
    setCandidateInvitationsError(null);
    setCandidateInviteUpdating(invitationId, true);
    try {
      const updated = await updateCandidateInvitation(invitationId, status);
      setCandidateInvitations((prev) =>
        prev.map((invitation) => (invitation.id === updated.id ? updated : invitation)),
      );
    } catch (err) {
      console.error(err);
      setCandidateInvitationsError(
        err instanceof Error ? err.message : 'Could not update invitation.',
      );
    } finally {
      setCandidateInviteUpdating(invitationId, false);
    }
  };

  const selectedDevCompany = devCompanies.find((company) => company.id === companyId) ?? null;
  const selectedDevCandidate = devCandidates.find((candidate) => candidate.user_id === devUserId) ?? null;

  const applyDevCompanySelection = (company: CompanyDev | null) => {
    if (!company) {
      setCompanyId(null);
      setCandidateFavorites([]);
      setCandidateFavoritesError(null);
      setFavoriteUpdatingIds(new Set());
      setEmployerInvitations([]);
      setEmployerInvitationsError(null);
      setInviteUpdatingIds(new Set());
      try {
        localStorage.removeItem(COMPANY_STORAGE_KEY);
      } catch {
        // ignore storage failures
      }
      return;
    }
    setCompanyId(company.id);
    setCandidateFavorites([]);
    setCandidateFavoritesError(null);
    setFavoriteUpdatingIds(new Set());
    setEmployerInvitations([]);
    setEmployerInvitationsError(null);
    setInviteUpdatingIds(new Set());
    try {
      localStorage.setItem(COMPANY_STORAGE_KEY, company.id);
    } catch {
      // ignore storage failures
    }
    if (company.default_user_id) {
      try {
        localStorage.setItem(USER_STORAGE_KEY, company.default_user_id);
      } catch {
        // ignore storage failures
      }
      setDevUserId(company.default_user_id);
    }
  };

  const handleDevCompanyChange = (nextId: string) => {
    const nextCompany = devCompanies.find((company) => company.id === nextId) ?? null;
    applyDevCompanySelection(nextCompany);
  };

  const applyDevCandidateSelection = (candidate: CandidateDev | null) => {
    if (!candidate) {
      setDevUserId('');
      try {
        localStorage.removeItem(USER_STORAGE_KEY);
      } catch {
        // ignore storage failures
      }
      return;
    }
    try {
      localStorage.setItem(USER_STORAGE_KEY, candidate.user_id);
    } catch {
      // ignore storage failures
    }
    setDevUserId(candidate.user_id);
    setRoleAndView('candidate', 'profile');
  };

  const handleDevCandidateChange = (nextUserId: string) => {
    const nextCandidate = devCandidates.find((candidate) => candidate.user_id === nextUserId) ?? null;
    applyDevCandidateSelection(nextCandidate);
  };

  const goToCandidateApplications = () => {
    runAuthenticated({
      title: 'Create an account to view your applications',
      message: 'Create an account before tracking the jobs you apply to.',
    }, () => {
      goToCandidateView('applications');
    });
  };

  const goToEmployerJobs = () => {
    runAuthenticated({
      title: 'Create an account to manage jobs',
      message: 'Create an account before opening your company jobs.',
    }, () => {
      goToEmployerView('jobs');
    });
  };

  const selectTake = (id: string) => {
    const take = recordedTakes.find((t) => t.id === id);
    if (!take) return;
    setSelectedTakeId(id);
    setVideoUrl(take.url);
    setVideoDuration(take.duration);
    setVideoObjectKey(null);
    setUploadProgress(null);
    setStatus('idle');
    setError(null);
    clearProcessingTimer();
    setProcessingMessage(null);
  };
  const hideGuestAuthSessionRow = !previewAuthenticated && view === 'find' && candidateStep === 'select';

  const nav = (
    <AppNavigation
      view={view}
      role={role}
      previewAuthenticated={previewAuthenticated}
      showDevNav={showDevNav}
      canSeeAdminConfigButton={canSeeAdminConfigButton}
      devAuthPreviewMode={devAuthPreviewMode}
      authUser={authUser}
      previewAuthUser={previewAuthUser}
      companyId={companyId}
      devCompanies={devCompanies}
      devCompaniesLoading={devCompaniesLoading}
      devCompaniesError={devCompaniesError}
      devCandidates={devCandidates}
      devCandidatesLoading={devCandidatesLoading}
      devCandidatesError={devCandidatesError}
      devUserId={devUserId}
      hideGuestAuthSessionRow={hideGuestAuthSessionRow}
      onHome={backToWelcome}
      onBrowseJobs={() => goToCandidateView('jobs')}
      onMyApplications={goToCandidateApplications}
      onMyProfile={goToCandidateProfileView}
      onMyJobs={goToEmployerJobs}
      onCreateJob={() => goToEmployerView('create')}
      onBrowseCandidates={goToCandidateSearch}
      onFavoriteCandidates={goToCandidateFavorites}
      onInvitations={goToInvitations}
      onTopNavBack={backToWelcome}
      onTopNavCreate={startCreateFlow}
      onTopNavFind={startCandidateFlow}
      onTopNavJobs={goToEmployerJobs}
      onTopNavBrowseJobs={() => setRoleAndView('candidate', 'jobs')}
      onTopNavCandidates={goToCandidateSearch}
      onTopNavFavorites={goToCandidateFavorites}
      onTopNavInvitations={goToInvitations}
      onTopNavApplications={goToCandidateApplications}
      onTopNavRoleChange={(nextRole) => handleRoleSelection(nextRole, true)}
      onAuthPreviewModeChange={setDevAuthPreviewMode}
      onDevCompanyChange={handleDevCompanyChange}
      onDevCandidateChange={handleDevCandidateChange}
      onGoToAdminConfig={goToAdminConfig}
      onUseRealAuth={() => setDevAuthPreviewMode('real')}
      onLogout={handleLogout}
      onOpenLogin={() => openVoluntaryAuth('login')}
      onOpenRegister={() => openVoluntaryAuth('register')}
    />
  );
  const shouldRenderGeneralSection = view === 'welcome';
  const shouldRenderConfigAdminSection = view === 'adminConfig';
  const shouldRenderEmployerSection =
    view === 'create' ||
    view === 'candidates' ||
    view === 'candidateDetail' ||
    view === 'candidateFavorites' ||
    view === 'jobMatches' ||
    (view === 'invitations' && role === 'employer');
  const shouldRenderCandidateSection =
    view === 'find' || view === 'profile' || (view === 'invitations' && role === 'candidate');
  const shouldRenderJobSeekerFlow =
    view === 'jobs' || view === 'jobDetail' || view === 'apply' || view === 'applications';
  const shouldRenderAuthOverlays = Boolean(candidatePostAuthOverlay || authPrompt);

  if (authLoading) {
    return (
      <main className={shellClassName}>
        <ScreenLabel label="Screen:Auth/Loading/LoggedOut" />
        <section className="hero welcome">
          <h1>Checking your session...</h1>
          <p className="lede">Please wait while we verify your login.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={shellClassName}>
      <ScreenLabel label={screenLabel} />
      <Suspense fallback={null}>
        {shouldRenderGeneralSection && (
          <GeneralAppSection
            nav={nav}
            previewAuthenticated={previewAuthenticated}
            authError={authError}
            onStartCandidateFlow={startCandidateFlow}
            onStartCreateFlow={startCreateFlow}
            onOpenVoluntaryAuth={openVoluntaryAuth}
          />
        )}

        {shouldRenderConfigAdminSection && <ConfigAdminView nav={nav} />}

        {shouldRenderEmployerSection && (
          <EmployerAppSection
            jobCreationFlowProps={{
              view,
              nav,
              createStep,
              form,
              transcriptText,
              onInputChange: handleInputChange,
              onTranscriptChange: handleTranscriptChange,
              onGenerateFromTranscript: generateFromTranscript,
              draftingFromTranscript,
              draftingError,
              draftKeywords: filteredDraftKeywords,
              goToStep,
              onSaveVideo: saveVideo,
              onSaveJob: saveJob,
              recorderOpen,
              recordingState,
              videoUrl,
              videoObjectKey,
              liveVideoRef,
              playbackVideoRef,
              recordLabel,
              durationLabel,
              selectedTake,
              startRecording,
              pauseRecording,
              resumeRecording,
              stopRecording,
              error,
              recordedTakes,
              selectedTakeId,
              selectTake,
              handleVideoChange,
              status,
              uploadProgress,
              processingMessage,
              companyId,
              jobSaving,
              showDetailValidation,
            }}
            candidateDetailViewProps={{
              view,
              nav,
              role,
              candidate: selectedCandidateProfile,
              onBack: handleCandidateDetailBack,
              backLabel: candidateDetailBackLabel,
              canFavorite: canManageFavorites,
              isFavorite: selectedCandidateProfile ? favoriteCandidateIds.has(selectedCandidateProfile.id) : false,
              favoriteUpdating: selectedCandidateProfile ? favoriteUpdatingIds.has(selectedCandidateProfile.id) : false,
              favoritesError: candidateFavoritesError,
              onToggleFavorite: handleToggleCandidateFavorite,
              invitationStatus: selectedCandidateProfile
                ? invitationStatusByCandidateId[selectedCandidateProfile.id] ?? null
                : null,
              invitationUpdating: selectedCandidateProfile ? inviteUpdatingIds.has(selectedCandidateProfile.id) : false,
              invitationsError: employerInvitationsError,
              canInvite: canManageInvitations,
              onInvite: () => {
                if (!selectedCandidateProfile) return;
                handleInviteCandidate(selectedCandidateProfile.id);
              },
            }}
            candidateFavoritesViewProps={{
              view,
              nav,
              role,
              favorites: candidateFavorites,
              loading: candidateFavoritesLoading,
              error: candidateFavoritesError,
              canFavorite: canManageFavorites,
              favoriteUpdatingIds,
              onViewCandidate: openCandidateProfileFromFavorites,
              onRemoveFavorite: handleRemoveCandidateFavorite,
            }}
            employerInvitationsViewProps={{
              view,
              nav,
              role,
              invitations: employerInvitations,
              loading: employerInvitationsLoading,
              error: employerInvitationsError,
              canInvite: canManageInvitations,
              onViewCandidate: openCandidateProfileFromInvitations,
            }}
            candidateSearchFlowProps={{
              view,
              nav,
              role,
              isAuthenticated: previewAuthenticated,
              favoriteCandidateIds,
              favoriteUpdatingIds,
              favoritesError: candidateFavoritesError,
              canFavorite: canManageFavorites,
              onAddFavorite: handleAddCandidateFavorite,
              onRemoveFavorite: handleRemoveCandidateFavorite,
              invitationStatusByCandidateId,
              inviteUpdatingIds,
              invitationsError: employerInvitationsError,
              canInvite: canManageInvitations,
              onInviteCandidate: handleInviteCandidate,
              onViewCandidate: openCandidateProfileFromSearch,
            }}
            candidateMatchesViewProps={{
              view,
              nav,
              role,
              job: selectedJobForMatches,
              favoriteCandidateIds,
              favoriteUpdatingIds,
              favoritesError: candidateFavoritesError,
              canFavorite: canManageFavorites,
              onAddFavorite: handleAddCandidateFavorite,
              onRemoveFavorite: handleRemoveCandidateFavorite,
              invitationStatusByCandidateId,
              inviteUpdatingIds,
              invitationsError: employerInvitationsError,
              canInvite: canManageInvitations,
              onInviteCandidate: handleInviteCandidate,
              onViewCandidate: openCandidateProfileFromMatches,
              onBackToJob: backToJobDetail,
            }}
          />
        )}

        {shouldRenderCandidateSection && (
          <CandidateAppSection
            candidateProfileFlowProps={{
              view,
              nav,
              isAuthenticated: previewAuthenticated,
              useGuidedQuestions: candidateDetailedMode,
              candidateStep,
              goToStep: goToCandidateStep,
              recorderOpen,
              recordingState,
              videoUrl,
              liveVideoRef,
              playbackVideoRef,
              recordLabel,
              recordDurationSec: recordDuration,
              durationLabel,
              startRecording,
              pauseRecording,
              resumeRecording,
              stopRecording,
              error,
              recordedTakes,
              selectedTakeId,
              selectTake,
              status,
              uploadProgress,
              processingMessage,
              audioSessionTranscripts,
              audioSessionStatuses,
              fallbackTranscript: candidateTranscript,
              fallbackTranscriptStatus: candidateTranscriptStatus,
              isEditingProfile: candidateProfileExists,
              keywords: candidateKeywords,
              removedKeywords: candidateRemovedKeywords,
              onSaveVideo: saveCandidateVideo,
              profile: candidateProfile,
              onProfileChange: handleCandidateProfileChange,
              onSaveProfile: saveCandidateProfile,
              profileSaving: candidateProfileSaving,
              profileSaved: candidateProfileSaved,
              canSaveProfile: canSaveCandidateProfile,
              showValidation: candidateValidation,
              detailedSignals: candidateDetailedSignalsDraft,
              onDetailedSignalValueChange: handleCandidateDetailedSignalValueChange,
              onDetailedSignalStructuredDataChange: handleCandidateDetailedSignalStructuredDataChange,
              onProfileMoveKeyword: moveCandidateProfileKeyword,
              onViewJobs: goToJobsOverview,
              reviewCurrent: candidateReviewCurrent,
              reviewNew: candidateReviewNew,
              reviewChoices: candidateReviewChoices,
              reviewDetailedSignalChoices: candidateReviewDetailedSignalChoices,
              reviewVideoChoice: candidateReviewVideoChoice,
              reviewCurrentVideoUrl: candidateReviewCurrentVideoUrl,
              reviewCurrentVideoObjectKey: candidateReviewCurrentVideoObjectKey,
              reviewNewVideoUrl: videoUrl,
              onReviewTextChange: handleCandidateReviewTextChange,
              onReviewChoiceChange: handleCandidateReviewChoiceChange,
              onReviewDetailedSignalChoiceChange: handleCandidateReviewDetailedSignalChoiceChange,
              onReviewDetailedSignalValueChange: handleCandidateReviewDetailedSignalValueChange,
              onReviewVideoChoiceChange: setCandidateReviewVideoChoice,
              onReviewMoveKeyword: moveCandidateReviewKeyword,
              onApplyReview: applyCandidateReviewUpdate,
            }}
            candidateProfileViewProps={{
              view,
              nav,
              profile: candidateProfileDetails,
              keywords: filteredCandidateKeywords,
              videoUrl,
              loading: candidateProfileLoading,
              error: candidateProfileError,
              onCreateProfile: startCandidateFlow,
              onCreateDetailedProfile: goToCandidateDetailedProfileRecord,
              onEditProfile: goToCandidateProfileEdit,
              onBrowseJobs: goToJobsOverview,
            }}
            candidateInvitationsViewProps={{
              view,
              nav,
              role,
              invitations: candidateInvitations,
              loading: candidateInvitationsLoading,
              error: candidateInvitationsError,
              updatingIds: candidateInviteUpdatingIds,
              onUpdateInvitation: handleCandidateInvitationUpdate,
            }}
          />
        )}

        {shouldRenderJobSeekerFlow && (
          <JobSeekerFlow
            view={view}
            nav={nav}
            role={role}
            isAuthenticated={previewAuthenticated}
            jobs={jobs}
            jobsLoading={jobsLoading}
            jobsError={jobsError}
            companyId={companyId}
            selectedJobId={selectedJobId}
            onSelectJob={setSelectedJobId}
            setView={setView}
            ensureAuthenticated={ensureAuthenticated}
            onPublishJob={handlePublishJob}
            onUnpublishJob={handleUnpublishJob}
            onRefreshJobs={refreshJobs}
            publishingJobId={publishingJobId}
            unpublishingJobId={unpublishingJobId}
            onViewCandidateProfile={openCandidateProfileFromApplications}
            onViewMatches={openJobMatches}
          />
        )}

        {shouldRenderAuthOverlays && (
          <AuthOverlays
            overlayHost={overlayHost}
            candidatePostAuthOverlay={candidatePostAuthOverlay}
            candidatePostAuthOverlayMessage={candidatePostAuthOverlayMessage}
            authPrompt={authPrompt}
            authOverlayCardInlineStyle={authOverlayCardInlineStyle}
            authSubmitting={authSubmitting}
            authMode={authMode}
            authName={authName}
            authPassword={authPassword}
            authError={authError}
            onCloseAuthPrompt={closeAuthPrompt}
            onAuthSubmit={handleAuthSubmit}
            onToggleAuthMode={() => setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'))}
            onAuthNameChange={setAuthName}
            onAuthPasswordChange={setAuthPassword}
          />
        )}
      </Suspense>
    </main>
  );
}

export default App;
