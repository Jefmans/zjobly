import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { JobCreationFlow } from './components/JobCreationFlow';
import { CandidateProfileFlow } from './components/CandidateProfileFlow';
import { CandidateProfileView } from './components/CandidateProfileView';
import { CandidateSearchFlow } from './components/CandidateSearchFlow';
import { JobSeekerFlow } from './components/JobSeekerFlow';
import { PrimaryNav } from './components/PrimaryNav';
import { ScreenLabel } from './components/ScreenLabel';
import { TopNav } from './components/TopNav';
import {
  confirmUpload,
  confirmAudioChunk,
  createCompany,
  createJob,
  createAudioChunkUrl,
  createUploadUrl,
  generateJobDraftFromTranscript,
  generateJobDraftFromVideo,
  getCandidateProfile,
  getLocationFromTranscript,
  finalizeAudioSession,
  getAudioSessionTranscript,
  listCompanyJobs,
  publishJob,
  unpublishJob,
  searchPublicJobs,
  upsertCandidateProfile,
  uploadFileToUrl,
} from './api';
import { filterKeywordsByLocation, formatDuration, makeTakeId } from './helpers';
import {
  CandidateStep,
  CandidateProfile,
  CandidateProfileInput,
  CreateStep,
  Job,
  RecordedTake,
  RecordingState,
  Status,
  UserRole,
  ViewMode,
} from './types';
import { getProfileDraftFromTranscript } from './api';

const MAX_VIDEO_SECONDS = 180; // Hard 3-minute cap for recordings/uploads
const AUDIO_CHUNK_MS = 5000; // Chunk audio every 5s for faster partial transcripts
const AUDIO_TRANSCRIPT_POLL_MS = 3000;
const MIN_TRANSCRIPT_FOR_DRAFT = 30;
const INITIAL_FORM_STATE = { title: '', location: '', description: '', companyName: '' };
const ROLE_STORAGE_KEY = 'zjobly-user-role';
const VIEW_STORAGE_KEY = 'zjobly-view';
const INITIAL_CANDIDATE_PROFILE: CandidateProfileInput = {
  headline: '',
  location: '',
  summary: '',
  discoverable: true,
};
// Disable chunked audio uploads; record/upload full files only.
const ENABLE_AUDIO_CHUNKS = false;
const formatLocationSuggestion = (suggestion: { location: string | null; city?: string | null; region?: string | null; country?: string | null; postal_code?: string | null }): string => {
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

const getStoredRole = (): UserRole | null => {
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

const getStoredView = (): ViewMode => {
  const storedRole = getStoredRole();
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'jobs') return 'jobs';
    if (stored === 'applications' && storedRole === 'candidate') return 'applications';
    if (stored === 'candidates' && storedRole === 'employer') return 'candidates';
    if (stored === 'create' && storedRole === 'employer') return 'create';
    if (stored === 'profile' && storedRole === 'candidate') return 'profile';
    if (stored === 'find' && storedRole === 'candidate') return 'find';
  } catch {
    // ignore storage failures
  }
  return 'welcome';
};

// Location is inferred server-side via spaCy; frontend only cleans the returned phrase.

const getScreenLabel = (
  view: ViewMode,
  step: CreateStep,
  candidateStep: CandidateStep,
  role: UserRole | null,
): string => {
  if (view === 'welcome') return 'Screen:Welcome';
  if (view === 'find') {
    if (candidateStep === 'record') return 'Screen:FindZjob/RecordVideo';
    if (candidateStep === 'select') return 'Screen:FindZjob/SelectVideo';
    return 'Screen:FindZjob/ProfileDetail';
  }
  if (view === 'profile') return 'Screen:MyProfile/Detail';
  if (view === 'apply') return 'Screen:FindZjob/ApplyVideo';
  if (view === 'applications') return 'Screen:FindZjob/MyApplications';
  if (view === 'jobs') {
    return role === 'candidate' ? 'Screen:FindZjob/JobsList' : 'Screen:MyJobs/List';
  }
  if (view === 'candidates') {
    return 'Screen:FindCandidates/Search';
  }
  if (view === 'jobDetail') {
    return role === 'candidate' ? 'Screen:FindZjob/JobDetail' : 'Screen:MyJobs/Detail';
  }
  if (view === 'create') {
    if (step === 'record') return 'Screen:CreateZjob/RecordVideo';
    if (step === 'select') return 'Screen:CreateZjob/SelectVideo';
    return 'Screen:CreateZjob/JobDetails';
  }
  return 'Screen:Unknown';
};

function App() {
  const [view, setView] = useState<ViewMode>(() => getStoredView());
  const [role, setRole] = useState<UserRole | null>(() => getStoredRole());
  const [createStep, setCreateStep] = useState<CreateStep>('record');
  const [candidateStep, setCandidateStep] = useState<CandidateStep>('record');
  const [form, setForm] = useState({ ...INITIAL_FORM_STATE });
  const [transcriptText, setTranscriptText] = useState('');
  const [draftKeywords, setDraftKeywords] = useState<string[]>([]);
  const [draftingFromTranscript, setDraftingFromTranscript] = useState(false);
  const [draftingError, setDraftingError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(() => {
    const envId = (import.meta.env.VITE_COMPANY_ID || '').toString().trim();
    if (envId) return envId;
    try {
      const stored = localStorage.getItem('zjobly-company-id');
      return stored || null;
    } catch {
      return null;
    }
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfileInput>({ ...INITIAL_CANDIDATE_PROFILE });
  const [candidateProfileDetails, setCandidateProfileDetails] = useState<CandidateProfile | null>(null);
  const [candidateProfileLoading, setCandidateProfileLoading] = useState(false);
  const [candidateProfileError, setCandidateProfileError] = useState<string | null>(null);
  const [candidateProfileExists, setCandidateProfileExists] = useState(false);
  const [candidateKeywords, setCandidateKeywords] = useState<string[]>([]);
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
  const [locationDetails, setLocationDetails] = useState<{ city?: string | null; region?: string | null; country?: string | null; postal_code?: string | null } | null>(null);
  const candidateProfileEditedRef = useRef<{ headline: boolean; location: boolean; summary: boolean }>({
    headline: false,
    location: false,
    summary: false,
  });
  const candidateLocationAbortRef = useRef<AbortController | null>(null);
  const candidateProfileDraftAbortRef = useRef<AbortController | null>(null);

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

  const resetCandidateFlow = () => {
    clearVideoSelection();
    clearRecordedTakes();
    resetRecordTimer();
    setRecordingState('idle');
    setCandidateStep('record');
    setCandidateProfile({ ...INITIAL_CANDIDATE_PROFILE });
    setCandidateProfileDetails(null);
    setCandidateProfileLoading(false);
    setCandidateProfileError(null);
    setCandidateProfileExists(false);
    setCandidateKeywords([]);
    setCandidateVideoObjectKey(null);
    setCandidateProfileSaving(false);
    setCandidateProfileSaved(false);
    setCandidateValidation(false);
    setStatus('idle');
    setUploadProgress(null);
    setProcessingMessage(null);
    setError(null);
  };

  const setRoleAndView = (nextRole: UserRole, nextView?: ViewMode) => {
    persistRole(nextRole);
    setSelectedJobId(null);
    if (nextRole === 'employer') {
      setCreateStep('record');
      setShowDetailValidation(false);
    } else {
      resetCandidateFlow();
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
  }, [companyId, role]);

  const startProcessingPoll = (objectKey: string) => {
    clearProcessingTimer();
    setStatus('processing');
    setProcessingMessage('Queued for transcription and processing...');

    let attempts = 0;
    processingTimerRef.current = window.setInterval(() => {
      attempts += 1;
      // Stubbed status: after a few ticks, mark as ready. Replace with a real status endpoint.
      if (attempts >= 3) {
        clearProcessingTimer();
        setProcessingMessage('Processing complete (stub). Ready for job details.');
        setStatus('success');
      } else {
        setProcessingMessage('Processing your video (stub status)...');
        setStatus('processing');
      }
    }, 2000);
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
    try {
      const shouldPersist =
        view === 'jobs' ||
        (view === 'applications' && role === 'candidate') ||
        (view === 'create' && role === 'employer') ||
        (view === 'candidates' && role === 'employer') ||
        (view === 'find' && role === 'candidate') ||
        (view === 'profile' && role === 'candidate');
      if (shouldPersist) {
        localStorage.setItem(VIEW_STORAGE_KEY, view);
      } else if (view === 'welcome') {
        localStorage.removeItem(VIEW_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, [view, role]);

  useEffect(() => {
    if (view !== 'profile' || role !== 'candidate') return;

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
        }
      } catch (err) {
        if (!isActive) return;
        if ((err as { name?: string })?.name === 'AbortError') return;
        setCandidateProfileError(err instanceof Error ? err.message : 'Could not load your profile.');
        setCandidateProfileDetails(null);
        setCandidateProfileExists(false);
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
  }, [view, role]);

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
      setLocationDetails(null);
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
    setLocationDetails(null);
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
    setRoleAndView('candidate');
  };

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
        setRecordedTakes((prev) => [take, ...prev]);
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

  const saveCandidateVideo = async () => {
    setError(null);
    setUploadProgress(null);
    clearProcessingTimer();
    setProcessingMessage(null);
    setCandidateVideoObjectKey(null);
    setCandidateProfileSaved(false);
    setCandidateKeywords([]);

    if (!selectedTake) {
      setError('Record or upload a video before saving.');
      setCandidateStep('select');
      return;
    }

    if ((selectedTake.duration ?? videoDuration ?? 0) > MAX_VIDEO_SECONDS) {
      setError('Video must be 3 minutes or less.');
      return;
    }

    try {
      const { objectKey } = await uploadTake(selectedTake, videoDuration);
      setCandidateVideoObjectKey(objectKey);
      startProcessingPoll(objectKey);
      setCandidateTranscript('');
      setCandidateTranscriptStatus('pending');
      try {
        const draft = await generateJobDraftFromVideo(objectKey);
        if (draft?.transcript) {
          setCandidateTranscript(draft.transcript);
          setCandidateTranscriptStatus('final');
        } else {
          setCandidateTranscriptStatus(undefined);
        }
      } catch (err) {
        console.error('Could not fetch transcript for candidate video', err);
        setCandidateTranscriptStatus(undefined);
      }
      setCandidateValidation(false);
      setCandidateStep('profile');
    } catch (err) {
      console.error(err);
      clearProcessingTimer();
      setProcessingMessage(null);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  const saveCandidateProfile = async () => {
    setError(null);
    setCandidateProfileSaved(false);

    const headline = (candidateProfile.headline ?? '').toString().trim();
    const location = (candidateProfile.location ?? '').toString().trim();
    const summary = (candidateProfile.summary ?? '').toString().trim();
    const hasVideo = Boolean(candidateVideoObjectKey);

    if (!headline || !location || !summary || (!hasVideo && !candidateProfileExists)) {
      setCandidateValidation(true);
      if (!hasVideo && !candidateProfileExists) {
        setError('Save your video before completing your profile.');
      }
      return;
    }

    setCandidateProfileSaving(true);
    try {
      const savedProfile = await upsertCandidateProfile({
        headline,
        location,
        summary,
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
      }
      setCandidateProfileSaved(true);
      setCandidateValidation(false);
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

    setJobSaving(true);
    try {
      let resolvedCompanyId = companyId;
      if (!resolvedCompanyId) {
        try {
          const company = await createCompany({ name: form.companyName.trim() });
          resolvedCompanyId = company.id;
          setCompanyId(company.id);
          try {
            localStorage.setItem('zjobly-company-id', company.id);
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
  const selectedAudioSessionId = selectedTake?.audioSessionId || null;

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
        setLocationDetails({
          city: res?.city,
          region: res?.region,
          country: res?.country,
          postal_code: res?.postal_code,
        });
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
    const text = candidateTranscript.trim();
    if (!text || candidateTranscriptStatus !== 'final') return;

    const draftController = new AbortController();
    candidateProfileDraftAbortRef.current?.abort();
    candidateProfileDraftAbortRef.current = draftController;

    // LLM draft for headline/summary
    void (async () => {
      try {
        const draft = await getProfileDraftFromTranscript(text.slice(0, 8000), draftController.signal);
        if (draftController.signal.aborted) return;
        if (!candidateProfileEditedRef.current.headline && !(candidateProfile.headline || '').trim()) {
          setCandidateProfile((prev) => ({ ...prev, headline: draft.headline }));
        }
        if (!candidateProfileEditedRef.current.summary && !(candidateProfile.summary || '').trim()) {
          setCandidateProfile((prev) => ({ ...prev, summary: draft.summary }));
        }
        setCandidateKeywords(normalizeKeywords(draft.keywords));
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        console.error('Candidate profile draft failed', err);
      }
    })();

    return () => {
      draftController.abort();
    };
  }, [candidateTranscript, candidateTranscriptStatus, candidateProfile.headline, candidateProfile.summary, candidateProfile.location]);

  // Geocode candidate location when transcript is ready and location is empty
  useEffect(() => {
    const text = candidateTranscript.trim();
    if (!text || candidateTranscriptStatus !== 'final') return;
    if (candidateProfileEditedRef.current.location) return;
    if ((candidateProfile.location || '').trim()) return;

    const controller = new AbortController();
    candidateLocationAbortRef.current?.abort();
    candidateLocationAbortRef.current = controller;

    void (async () => {
      try {
        const res = await getLocationFromTranscript(text.slice(0, 8000), controller.signal);
        if (controller.signal.aborted) return;
        const suggestion = formatLocationSuggestion(res || { location: null });
        if (suggestion && !candidateProfileEditedRef.current.location && !(candidateProfile.location || '').trim()) {
          setCandidateProfile((prev) => ({ ...prev, location: suggestion }));
        }
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        console.error('Candidate location suggestion failed', err);
      }
    })();

    return () => controller.abort();
  }, [candidateTranscript, candidateTranscriptStatus, candidateProfile.location]);

  const durationLabel = formatDuration(selectedTake?.duration ?? videoDuration);
  const recordLabel = formatDuration(recordDuration);
  const screenLabel = getScreenLabel(view, createStep, candidateStep, role);
  const showDevNav = (import.meta.env.VITE_DEV_NAV ?? 'true').toString().toLowerCase() === 'true';
  const filteredDraftKeywords = filterKeywordsByLocation(draftKeywords, form.location);
  const filteredCandidateKeywords = filterKeywordsByLocation(
    candidateKeywords,
    candidateProfileDetails?.location ?? candidateProfile.location,
  );
  const canSaveCandidateProfile = Boolean(candidateVideoObjectKey) || candidateProfileExists;

  const backToWelcome = () => {
    resetCreateState();
    resetCandidateFlow();
    setView('welcome');
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
    if (role === 'candidate') {
      setView('profile');
    } else {
      setRoleAndView('candidate', 'profile');
    }
  };

  const goToCandidateProfileEdit = () => {
    if (role === 'candidate') {
      setView('find');
    } else {
      setRoleAndView('candidate', 'find');
    }
    setCandidateStep('profile');
  };

  const goToJobsOverview = () => {
    setSelectedJobId(null);
    setView('jobs');
  };

  const goToCandidateSearch = () => {
    goToEmployerView('candidates');
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

  const nav = (
    <>
      {showDevNav && (
        <div className="dev-nav-wrap">
          <div className="dev-nav-label">Development navigation</div>
          <TopNav
            view={view}
            role={role}
            onBack={backToWelcome}
            onCreate={startCreateFlow}
            onFind={startCandidateFlow}
            onJobs={() => setRoleAndView('employer', 'jobs')}
            onBrowseJobs={() => setRoleAndView('candidate', 'jobs')}
            onCandidates={() => setRoleAndView('employer', 'candidates')}
            onApplications={() => setRoleAndView('candidate', 'applications')}
            onRoleChange={(nextRole) => handleRoleSelection(nextRole, true)}
          />
        </div>
      )}
      <PrimaryNav
        view={view}
        role={role}
        onHome={backToWelcome}
        onBrowseJobs={() => goToCandidateView('jobs')}
        onMyApplications={() => goToCandidateView('applications')}
        onMyProfile={goToCandidateProfileView}
        onMyJobs={() => goToEmployerView('jobs')}
        onCreateJob={() => goToEmployerView('create')}
        onBrowseCandidates={goToCandidateSearch}
        onStartCandidate={startCandidateFlow}
        onStartEmployer={startCreateFlow}
      />
    </>
  );

  return (
    <main className="app-shell">
      <ScreenLabel label={screenLabel} />
      {view === 'welcome' && (
        <>
          {nav}
          <section className="hero welcome">
            <p className="tag">Zjobly</p>
            <h1>Choose your next step</h1>
            <p className="lede">Start by finding a Zjob or creating one with a short video.</p>
            <div className="welcome-actions">
              <button type="button" className="cta primary" onClick={startCandidateFlow}>
                Find Zjob
              </button>
              <button type="button" className="cta secondary" onClick={startCreateFlow}>
                Create Zjob
              </button>
            </div>
          </section>
        </>
      )}

      <JobCreationFlow
        view={view}
        nav={nav}
        createStep={createStep}
        form={form}
        transcriptText={transcriptText}
        onInputChange={handleInputChange}
        onTranscriptChange={handleTranscriptChange}
        onGenerateFromTranscript={generateFromTranscript}
        draftingFromTranscript={draftingFromTranscript}
        draftingError={draftingError}
        draftKeywords={filteredDraftKeywords}
        goToStep={goToStep}
        onSaveVideo={saveVideo}
        onSaveJob={saveJob}
        onBackToWelcome={backToWelcome}
        recorderOpen={recorderOpen}
        recordingState={recordingState}
        videoUrl={videoUrl}
        videoObjectKey={videoObjectKey}
        liveVideoRef={liveVideoRef}
        playbackVideoRef={playbackVideoRef}
        recordLabel={recordLabel}
        durationLabel={durationLabel}
        selectedTake={selectedTake}
        startRecording={startRecording}
        pauseRecording={pauseRecording}
        resumeRecording={resumeRecording}
        stopRecording={stopRecording}
        error={error}
        recordedTakes={recordedTakes}
        selectedTakeId={selectedTakeId}
        selectTake={selectTake}
        handleVideoChange={handleVideoChange}
        status={status}
        uploadProgress={uploadProgress}
        processingMessage={processingMessage}
        companyId={companyId}
        jobSaving={jobSaving}
        showDetailValidation={showDetailValidation}
      />

      <CandidateProfileFlow
        view={view}
        nav={nav}
        candidateStep={candidateStep}
        goToStep={goToCandidateStep}
        onBackToWelcome={backToWelcome}
        recorderOpen={recorderOpen}
        recordingState={recordingState}
        videoUrl={videoUrl}
        candidateVideoObjectKey={candidateVideoObjectKey}
        liveVideoRef={liveVideoRef}
        playbackVideoRef={playbackVideoRef}
        recordLabel={recordLabel}
        durationLabel={durationLabel}
        startRecording={startRecording}
        pauseRecording={pauseRecording}
        resumeRecording={resumeRecording}
        stopRecording={stopRecording}
        error={error}
        recordedTakes={recordedTakes}
        selectedTakeId={selectedTakeId}
        selectTake={selectTake}
        handleVideoChange={handleVideoChange}
        status={status}
        uploadProgress={uploadProgress}
        processingMessage={processingMessage}
        audioSessionTranscripts={audioSessionTranscripts}
        audioSessionStatuses={audioSessionStatuses}
        fallbackTranscript={candidateTranscript}
        fallbackTranscriptStatus={candidateTranscriptStatus}
        onSaveVideo={saveCandidateVideo}
        profile={candidateProfile}
        onProfileChange={handleCandidateProfileChange}
        onSaveProfile={saveCandidateProfile}
        profileSaving={candidateProfileSaving}
        profileSaved={candidateProfileSaved}
        canSaveProfile={canSaveCandidateProfile}
        showValidation={candidateValidation}
        onViewJobs={goToJobsOverview}
      />

      <CandidateProfileView
        view={view}
        nav={nav}
        profile={candidateProfileDetails}
        keywords={filteredCandidateKeywords}
        videoUrl={videoUrl}
        loading={candidateProfileLoading}
        error={candidateProfileError}
        onCreateProfile={startCandidateFlow}
        onEditProfile={goToCandidateProfileEdit}
        onBrowseJobs={goToJobsOverview}
      />

      <CandidateSearchFlow view={view} nav={nav} role={role} />

      <JobSeekerFlow
        view={view}
        nav={nav}
        role={role}
        jobs={jobs}
        jobsLoading={jobsLoading}
        jobsError={jobsError}
        companyId={companyId}
        selectedJobId={selectedJobId}
        onSelectJob={setSelectedJobId}
        setView={setView}
        onPublishJob={handlePublishJob}
        onUnpublishJob={handleUnpublishJob}
        onRefreshJobs={refreshJobs}
        publishingJobId={publishingJobId}
        unpublishingJobId={unpublishingJobId}
      />
    </main>
  );
}

export default App;
