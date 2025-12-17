import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { JobCreationFlow } from './components/JobCreationFlow';
import { JobSeekerFlow } from './components/JobSeekerFlow';
import {
  confirmUpload,
  createCompany,
  createJob,
  createUploadUrl,
  generateJobDraftFromTranscript,
  generateJobDraftFromVideo,
  listCompanyJobs,
  searchPublicJobs,
  uploadFileToUrl,
} from './api';
import { formatDuration, makeTakeId } from './helpers';
import { CreateStep, Job, PermissionState, RecordedTake, RecordingState, Status, UserRole, ViewMode } from './types';

const MAX_VIDEO_SECONDS = 180; // Hard 3-minute cap for recordings/uploads

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
  const [form, setForm] = useState({ title: '', location: '', description: '', companyName: '' });
  const [transcriptText, setTranscriptText] = useState('');
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Job[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoObjectKey, setVideoObjectKey] = useState<string | null>(null);
  const [recordedTakes, setRecordedTakes] = useState<RecordedTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [jobSaving, setJobSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordDuration, setRecordDuration] = useState<number>(0);
  const [, setPermissionState] = useState<PermissionState>('unknown');
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [, setLastUploadKey] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const jobVideoUrlsRef = useRef<Record<string, string>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartedAtRef = useRef<number | null>(null);
  const recordElapsedRef = useRef<number>(0);
  const processingTimerRef = useRef<number | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const takeUrlsRef = useRef<Set<string>>(new Set());

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

  const setRoleAndView = (nextRole: UserRole, nextView?: ViewMode) => {
    persistRole(nextRole);
    setSelectedJobId(null);
    if (nextRole === 'employer') {
      setCreateStep('record');
    }
    setView(nextView ?? (nextRole === 'employer' ? 'create' : 'find'));
  };

  const handleRoleSelection = (value: string, navigate: boolean) => {
    if (value !== 'candidate' && value !== 'employer') return;
    if (navigate) {
      setRoleAndView(value);
      return;
    }
    persistRole(value);
  };

  const renderRoleSelect = (variant: 'nav' | 'welcome') => {
    const selectId = variant === 'welcome' ? 'welcome-role' : 'nav-role';
    const navigateOnChange = variant === 'nav';

    return (
      <div className={variant === 'welcome' ? 'role-switcher welcome' : 'role-switcher'}>
        <label htmlFor={selectId}>Role</label>
        <select
          id={selectId}
          value={role ?? ''}
          onChange={(event) => handleRoleSelection(event.target.value, navigateOnChange)}
        >
          <option value="" disabled>
            Choose a role
          </option>
          <option value="employer">Employer</option>
          <option value="candidate">Candidate</option>
        </select>
      </div>
    );
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

  const runSearch = async (query: string) => {
    const trimmed = query.trim();
    setSearchQuery(trimmed);
    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await searchPublicJobs(trimmed);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
      setSearchError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  const startProcessingPoll = (objectKey: string) => {
    clearProcessingTimer();
    setLastUploadKey(objectKey);
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
      stopStreamTracks(liveStreamRef.current);
      takeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      clearProcessingTimer();
    };
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    if (recordingState === 'idle' && playbackVideoRef.current) {
      const player = playbackVideoRef.current;
      player.pause();
      player.currentTime = 0;
      player.play().catch(() => undefined);
    }
  }, [videoUrl, recordingState]);

  useEffect(() => {
    if (recordingState !== 'idle' && liveVideoRef.current && liveStreamRef.current) {
      const videoEl = liveVideoRef.current;
      videoEl.srcObject = liveStreamRef.current;
      videoEl.play().catch(() => undefined);
    }
  }, [recordingState]);

  useEffect(() => {
    if (createStep === 'record' && !recorderOpen) {
      openRecorder();
    }
  }, [createStep, recorderOpen]);

  useEffect(() => {
    if (createStep === 'record') return;
    if (
      mediaRecorderRef.current?.state === 'recording' ||
      mediaRecorderRef.current?.state === 'paused'
    ) {
      stopRecording();
    }
    stopStreamTracks(liveStreamRef.current);
    setLiveStream(null);
    setRecorderOpen(false);
  }, [createStep]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setStatus('idle');
    setUploadProgress(null);
    setError(null);
  };

  const handleTranscriptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setTranscriptText(e.target.value);
    setDraftingError(null);
  };

  const applyDraft = (draft: { title?: string; description?: string; transcript?: string }) => {
    if (draft.transcript) {
      setTranscriptText(draft.transcript);
    }
    setForm((prev) => ({
      ...prev,
      title: draft.title || prev.title,
      description: draft.description || prev.description,
    }));
  };

  const generateFromTranscript = async () => {
    const text = transcriptText.trim();
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
  };

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
    setSelectedTakeId(null);
    setUploadProgress(null);
    setStatus('idle');
    clearProcessingTimer();
    setProcessingMessage(null);
    setLastUploadKey(null);
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
      setPermissionState('denied');
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
      setPermissionState('granted');
      return stream;
    } catch (err) {
      console.error(err);
      setPermissionState('denied');
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
        };
        takeUrlsRef.current.add(objectUrl);
        setRecordedTakes((prev) => [take, ...prev]);
        setSelectedTakeId(take.id);
        setVideoObjectKey(null);
        setVideoDuration(finalDuration);
        setVideoUrl(objectUrl);
        setRecordingState('idle');
      };

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
      setRecordingState('recording');
      startRecordTimer();
    } catch (err) {
      console.error(err);
      setError('Could not resume the recording. Try again.');
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) {
      clearRecordTimer();
      setRecordingState('idle');
      return;
    }
    if (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused') {
      syncRecordElapsed();
      mediaRecorderRef.current.stop();
    }
    setRecordingState('idle');
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
      setStatus('presigning');
      const presign = await createUploadUrl(selectedTake.file);
      setStatus('uploading');
      setUploadProgress(0);
      await uploadFileToUrl(presign.upload_url, selectedTake.file, (percent) => setUploadProgress(percent));
      setStatus('confirming');
      const confirmed = await confirmUpload({
        object_key: presign.object_key,
        duration_seconds: selectedTake.duration ?? videoDuration ?? null,
        source: selectedTake.source,
      });
      setUploadProgress(100);

      const objectKey = confirmed.object_key || presign.object_key;
      setVideoObjectKey(objectKey);
      startProcessingPoll(objectKey);
      setDraftingError(null);
      setTranscriptText('');
      setCreateStep('details');
      void generateFromVideo(objectKey);
    } catch (err) {
      console.error(err);
      clearProcessingTimer();
      setProcessingMessage(null);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  const saveJob = async (publish: boolean) => {
    setError(null);

    if (!videoObjectKey) {
      setError('Save the video first.');
      setCreateStep('select');
      return;
    }

    if (!form.title || !form.location) {
      setError('Add a title and location first.');
      setCreateStep('details');
      return;
    }

    if (!companyId && !form.companyName.trim()) {
      setError('Add a company name first.');
      setCreateStep('details');
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
      setView('jobs');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Saving the job failed. Please try again.');
    } finally {
      setJobSaving(false);
    }
  };

  const selectedTake = recordedTakes.find((t) => t.id === selectedTakeId) ?? null;
  const durationLabel = formatDuration(selectedTake?.duration ?? videoDuration);
  const recordLabel = formatDuration(recordDuration);

  const backToWelcome = () => {
    setView('welcome');
    setStatus('idle');
    setUploadProgress(null);
    setError(null);
    setCreateStep('record');
  };

  const goToStep = (nextStep: CreateStep) => {
    setError(null);
    setCreateStep(nextStep);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleSearchSubmit = () => {
    runSearch(searchQuery);
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

  const renderSwitcher = () => {
    const showEmployerNav = role !== 'candidate';
    const showCandidateNav = role !== 'employer';
    const showBack = view !== 'welcome';
    const showMainNav = view !== 'welcome';

    return (
      <div className="top-nav">
        {showBack && (
          <button type="button" className="link-btn" onClick={backToWelcome}>
            Back
          </button>
        )}
        <div className="nav-actions">
          {showMainNav && showEmployerNav && (
            <button
              type="button"
              className={`nav-btn ${view === 'create' ? 'active' : ''}`}
              onClick={() => setRoleAndView('employer')}
            >
              Create Zjob
            </button>
          )}
          {showMainNav && showCandidateNav && (
            <button
              type="button"
              className={`nav-btn ghost ${view === 'find' ? 'active' : ''}`}
              onClick={() => setRoleAndView('candidate')}
            >
              Find Zjob
            </button>
          )}
          <button
            type="button"
            className={`nav-btn ghost ${view === 'jobs' ? 'active' : ''}`}
            onClick={() => setRoleAndView('employer', 'jobs')}
          >
            Job list
          </button>
          {renderRoleSelect('nav')}
        </div>
      </div>
    );
  };

  return (
    <main className="app-shell">
      {view === 'welcome' && (
        <>
          {renderSwitcher()}
          <section className="hero welcome">
            <p className="tag">Zjobly</p>
            <h1>Choose your next step</h1>
            <p className="lede">Start by finding a Zjob or creating one with a short video.</p>
            <div className="welcome-actions">
              <button type="button" className="cta primary" onClick={() => setRoleAndView('candidate')}>
                Find Zjob
              </button>
              <button type="button" className="cta secondary" onClick={() => setRoleAndView('employer')}>
                Create Zjob
              </button>
            </div>
          </section>
        </>
      )}

      <JobCreationFlow
        view={view}
        nav={renderSwitcher()}
        createStep={createStep}
        form={form}
        transcriptText={transcriptText}
        onInputChange={handleInputChange}
        onTranscriptChange={handleTranscriptChange}
        onGenerateFromTranscript={generateFromTranscript}
        draftingFromTranscript={draftingFromTranscript}
        draftingError={draftingError}
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
      />

      <JobSeekerFlow
        view={view}
        nav={renderSwitcher()}
        jobs={jobs}
        jobsLoading={jobsLoading}
        jobsError={jobsError}
        companyId={companyId}
        selectedJobId={selectedJobId}
        onSelectJob={setSelectedJobId}
        onBackToWelcome={backToWelcome}
        onCreateClick={() => setRoleAndView('employer')}
        setView={setView}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSearchSubmit={handleSearchSubmit}
        searchResults={searchResults}
        searchLoading={searchLoading}
        searchError={searchError}
      />
    </main>
  );
}

export default App;
