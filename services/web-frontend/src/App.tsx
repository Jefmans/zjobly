import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { JobCreationFlow } from './components/JobCreationFlow';
import { CandidateProfileFlow } from './components/CandidateProfileFlow';
import { JobSeekerFlow } from './components/JobSeekerFlow';
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
  getLocationFromTranscript,
  finalizeAudioSession,
  getAudioSessionTranscript,
  listCompanyJobs,
  upsertCandidateProfile,
  uploadFileToUrl,
} from './api';
import { formatDuration, makeTakeId } from './helpers';
import {
  CandidateStep,
  CandidateProfileInput,
  CreateStep,
  Job,
  RecordedTake,
  RecordingState,
  Status,
  UserRole,
  ViewMode,
} from './types';

const MAX_VIDEO_SECONDS = 180; // Hard 3-minute cap for recordings/uploads
const AUDIO_CHUNK_MS = 5000; // Chunk audio every 5s for faster partial transcripts
const AUDIO_TRANSCRIPT_POLL_MS = 3000;
const MIN_TRANSCRIPT_FOR_DRAFT = 30;
const INITIAL_FORM_STATE = { title: '', location: '', description: '', companyName: '' };
const INITIAL_CANDIDATE_PROFILE: CandidateProfileInput = {
  headline: '',
  location: '',
  summary: '',
  discoverable: true,
};
// Disable chunked audio uploads; record/upload full files only.
const ENABLE_AUDIO_CHUNKS = false;
const normalizeLocationText = (loc: string) => loc.replace(/^[\s,]+|[\s,.]+$/g, '').replace(/\s+/g, ' ').trim();

const guessLocationLocally = (text: string): string | null => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const remoteMatch = normalized.match(
    /\bremote\b(?:\s+(?:within|across|in)\s+(?<region>(?:the\s+)?[A-Z][\w]+(?:[ -][A-Z][\w]+){0,2}(?:,\s*[A-Z][\w]+)?))?/i,
  );
  if (remoteMatch) {
    const region = remoteMatch.groups?.region ? normalizeLocationText(remoteMatch.groups.region) : null;
    return region ? `Remote (${region})` : 'Remote';
  }

  const patterns = [
    /\b(?:based|located|living|live|from|out of|working|work(?:ing)?|hiring|recruiting|role is|position is|job is|onsite|on-site|office|team|teams)\s+(?:in|near|around)\s+(?<loc>(?:the\s+)?[A-Z][\w]+(?:[ -][A-Z][\w]+){0,2}(?:,\s*[A-Z][\w]+)*)/i,
    /\b(?:relocating|relocate)\s+to\s+(?<loc>(?:the\s+)?[A-Z][\w]+(?:[ -][A-Z][\w]+){0,2}(?:,\s*[A-Z][\w]+)*)/i,
    /\b(?:in|around)\s+(?<loc>[A-Z][\w]+(?:[ -][A-Z][\w]+){0,2}),\s*(?<region>[A-Z]{2,}|[A-Z][a-z]+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (match?.groups) {
      const loc = normalizeLocationText(match.groups.loc || '');
      const region = match.groups.region ? normalizeLocationText(match.groups.region) : '';
      const combined = region ? `${loc}, ${region}` : loc;
      if (combined && combined.length >= 3 && combined.length <= 60) {
        return combined;
      }
    }
  }

  return null;
};

const getScreenLabel = (view: ViewMode, step: CreateStep, candidateStep: CandidateStep): string => {
  if (view === 'welcome') return 'Screen:Welcome';
  if (view === 'find') {
    if (candidateStep === 'record') return 'Screen:FindZjob/RecordVideo';
    if (candidateStep === 'select') return 'Screen:FindZjob/SelectVideo';
    return 'Screen:FindZjob/ProfileDetail';
  }
  if (view === 'jobs') return 'Screen:MyJobs/List';
  if (view === 'jobDetail') return 'Screen:MyJobs/Detail';
  if (view === 'create') {
    if (step === 'record') return 'Screen:CreateZjob/RecordVideo';
    if (step === 'select') return 'Screen:CreateZjob/SelectVideo';
    return 'Screen:CreateZjob/JobDetails';
  }
  return 'Screen:Unknown';
};

function App() {
  const [view, setView] = useState<ViewMode>('welcome');
  const [role, setRole] = useState<UserRole | null>(() => {
    try {
      const stored = localStorage.getItem('zjobly-user-role');
      if (stored === 'candidate' || stored === 'employer') {
        return stored;
      }
    } catch {
      // ignore storage failures
    }
    return null;
  });
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
  const [candidateVideoObjectKey, setCandidateVideoObjectKey] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoObjectKey, setVideoObjectKey] = useState<string | null>(null);
  const [recordedTakes, setRecordedTakes] = useState<RecordedTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [jobSaving, setJobSaving] = useState(false);
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

  const persistRole = (nextRole: UserRole | null) => {
    setRole(nextRole);
    try {
      if (nextRole) {
        localStorage.setItem('zjobly-user-role', nextRole);
      } else {
        localStorage.removeItem('zjobly-user-role');
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

  const refreshJobs = useCallback(async () => {
    if (!companyId) {
      setJobs([]);
      setJobsError(null);
      return;
    }
    setJobsLoading(true);
    setJobsError(null);
    try {
      const fetched = await listCompanyJobs(companyId);
      if (!Array.isArray(fetched)) {
        setJobs([]);
        setJobsError('Could not load jobs.');
        return;
      }
      setJobs(
        fetched.map((job) => ({
          ...job,
          videoUrl: job.playback_url || jobVideoUrlsRef.current[job.id],
        })),
      );
    } catch (err) {
      console.error(err);
      setJobsError(err instanceof Error ? err.message : 'Could not load jobs.');
    } finally {
      setJobsLoading(false);
    }
  }, [companyId]);

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

    if (!headline || !location || !summary || !hasVideo) {
      setCandidateValidation(true);
      if (!hasVideo) {
        setError('Save your video before completing your profile.');
      }
      return;
    }

    setCandidateProfileSaving(true);
    try {
      await upsertCandidateProfile({
        headline,
        location,
        summary,
        discoverable: Boolean(candidateProfile.discoverable),
      });
      setCandidateProfileSaved(true);
      setCandidateValidation(false);
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

      const savedJob = await createJob({
        company_id: resolvedCompanyId,
        title: form.title,
        description: form.description || null,
        location: form.location,
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
    const guess = guessLocationLocally(transcriptText);
    const currentLocation = form.location.trim();
    if (!guess || !transcriptText.trim()) return;
    if (locationManuallySetRef.current) return;
    if (currentLocation && currentLocation.toLowerCase() === guess.toLowerCase()) return;
    if (currentLocation) return;
    setForm((prev) => ({ ...prev, location: guess }));
  }, [transcriptText, form.location]);

  useEffect(() => {
    const text = transcriptText.trim();
    const currentLocation = form.location.trim();
    if (!text) {
      locationSuggestionAbortRef.current?.abort();
      lastLocationQueryRef.current = null;
      return;
    }
    if (locationManuallySetRef.current) return;
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
        const suggestion = (res?.location || '').trim();
        const latestLocation = form.location.trim();
        if (!suggestion) return;
        if (locationManuallySetRef.current) return;
        if (latestLocation && latestLocation.toLowerCase() === suggestion.toLowerCase()) return;
        if (latestLocation) return;
        setForm((prev) => ({ ...prev, location: suggestion }));
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        console.error('Location suggestion failed', err);
      }
    })();

    return () => controller.abort();
  }, [transcriptText, form.location]);

  const durationLabel = formatDuration(selectedTake?.duration ?? videoDuration);
  const recordLabel = formatDuration(recordDuration);
  const screenLabel = getScreenLabel(view, createStep, candidateStep);

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
    <TopNav
      view={view}
      role={role}
      onBack={backToWelcome}
      onCreate={startCreateFlow}
      onFind={startCandidateFlow}
      onJobs={() => setRoleAndView('employer', 'jobs')}
      onRoleChange={(nextRole) => handleRoleSelection(nextRole, true)}
    />
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
        draftKeywords={draftKeywords}
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
        showValidation={candidateValidation}
      />

      <JobSeekerFlow
        view={view}
        nav={nav}
        jobs={jobs}
        jobsLoading={jobsLoading}
        jobsError={jobsError}
        companyId={companyId}
        selectedJobId={selectedJobId}
        onSelectJob={setSelectedJobId}
        setView={setView}
      />
    </main>
  );
}

export default App;
