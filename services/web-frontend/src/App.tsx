import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import './App.css';

const MAX_VIDEO_SECONDS = 180;

type Status = 'idle' | 'submitting' | 'success';
type RecordingState = 'idle' | 'recording';
type PermissionState = 'unknown' | 'granted' | 'denied';
type ViewMode = 'welcome' | 'profile' | 'interview' | 'jobs' | 'jobDetail';

type RecordedTake = {
  id: string;
  file: File;
  url: string;
  duration: number;
  label: string;
  source: 'recording' | 'upload';
  questionId?: string;
  questionPrompt?: string;
};

type CandidateProfile = {
  name: string;
  title: string;
  location: string;
  summary: string;
  links: string[];
};

type InterviewQuestion = {
  id: string;
  prompt: string;
  tip?: string;
};

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  owner: string;
  status: 'open' | 'applied';
  videoLabel?: string;
  videoTakeId?: string;
  note?: string;
};

const QUESTIONS: InterviewQuestion[] = [
  {
    id: 'impact',
    prompt: 'Tell us about a project you are proud of and the impact it had.',
    tip: 'Share the before/after and your unique contribution.',
  },
  {
    id: 'collaboration',
    prompt: 'How do you handle feedback from cross-functional partners?',
    tip: 'Give an example of balancing speed and quality.',
  },
  {
    id: 'learning',
    prompt: 'What are you learning right now?',
    tip: 'Show curiosity and how you stay sharp.',
  },
];

const DEFAULT_PROFILE: CandidateProfile = {
  name: 'Ava Winters',
  title: 'Product Designer',
  location: 'Remote - EU timezone',
  summary:
    'I translate complex problems into intuitive products. Previously shipped onboarding and payments at fast-growing SaaS teams.',
  links: ['https://portfolio.example.com', 'https://www.linkedin.com/in/example'],
};

const INITIAL_JOBS: Job[] = [
  {
    id: 'job-1',
    title: 'Product Designer',
    company: 'Northline',
    location: 'Remote (EU)',
    owner: 'Camila - Hiring Manager',
    status: 'open',
    note: 'Attach a short intro for the design panel.',
  },
  {
    id: 'job-2',
    title: 'Product Manager',
    company: 'Brightwave',
    location: 'Hybrid Brussels',
    owner: 'Jeroen - Product Lead',
    status: 'open',
    note: 'They are async-first; video updates are required.',
  },
  {
    id: 'job-3',
    title: 'UX Researcher',
    company: 'Silven',
    location: 'Remote',
    owner: 'Sonia - Head of Research',
    status: 'open',
    note: 'Share how you partner with designers and PMs.',
  },
];

const DRAFT_STORAGE_KEY = 'zjobly-jobseeker-draft-v1';

type DraftState = {
  view: ViewMode;
  profile: CandidateProfile;
  selectedTakeId: string | null;
  activeQuestionId: string;
};

const loadDraft = (): DraftState | null => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      view: parsed.view ?? 'welcome',
      profile: {
        name: parsed.profile?.name ?? DEFAULT_PROFILE.name,
        title: parsed.profile?.title ?? DEFAULT_PROFILE.title,
        location: parsed.profile?.location ?? DEFAULT_PROFILE.location,
        summary: parsed.profile?.summary ?? DEFAULT_PROFILE.summary,
        links:
          Array.isArray(parsed.profile?.links) && parsed.profile.links.length > 0
            ? parsed.profile.links
            : DEFAULT_PROFILE.links,
      },
      selectedTakeId: parsed.selectedTakeId ?? null,
      activeQuestionId: parsed.activeQuestionId ?? QUESTIONS[0].id,
    };
  } catch (err) {
    console.warn('Could not read draft', err);
    return null;
  }
};

const formatDuration = (seconds: number | null) => {
  if (seconds === null || Number.isNaN(seconds)) return null;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${secs}`;
};

const makeTakeId = (prefix: 'rec' | 'upload') =>
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;

const trimQuestion = (prompt: string) => (prompt.length > 52 ? `${prompt.slice(0, 52)}...` : prompt);

function App() {
  const existingDraft = loadDraft();
  const [view, setView] = useState<ViewMode>(existingDraft?.view ?? 'welcome');
  const [profile, setProfile] = useState<CandidateProfile>(existingDraft?.profile ?? DEFAULT_PROFILE);
  const [activeQuestionId, setActiveQuestionId] = useState<string>(existingDraft?.activeQuestionId ?? QUESTIONS[0].id);
  const [jobs, setJobs] = useState<Job[]>(INITIAL_JOBS);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [recordedTakes, setRecordedTakes] = useState<RecordedTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(existingDraft?.selectedTakeId ?? null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<Status>('idle');
  const [jobStatus, setJobStatus] = useState<Status>('idle');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordDuration, setRecordDuration] = useState<number>(0);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const takeUrlsRef = useRef<Set<string>>(new Set());
  const stopStreamTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => t.stop());
  };

  const persistDraft = (partial: Partial<DraftState>) => {
    try {
      if (typeof window === 'undefined') return;
      const merged: DraftState = {
        view,
        profile,
        selectedTakeId,
        activeQuestionId,
        ...partial,
        profile: partial.profile ?? profile,
        selectedTakeId: partial.selectedTakeId === undefined ? selectedTakeId : partial.selectedTakeId,
        activeQuestionId: partial.activeQuestionId ?? activeQuestionId,
        view: partial.view ?? view,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(merged));
    } catch (err) {
      console.warn('Could not save draft', err);
    }
  };

  const clearRecordTimer = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const handleProfileChange = (field: keyof CandidateProfile, value: string) => {
    setProfile((prev) => {
      const next = { ...prev, [field]: value };
      persistDraft({ profile: next });
      return next;
    });
    setProfileStatus('idle');
  };

  const handleLinkChange = (index: number, value: string) => {
    setProfile((prev) => {
      const nextLinks = prev.links.map((link, idx) => (idx === index ? value : link));
      const next = { ...prev, links: nextLinks };
      persistDraft({ profile: next });
      return next;
    });
  };

  const addLinkRow = () => {
    setProfile((prev) => {
      const next = { ...prev, links: [...prev.links, ''] };
      persistDraft({ profile: next });
      return next;
    });
  };

  const handleProfileSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileStatus('success');
  };

  const clearVideoSelection = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoDuration(null);
    setSelectedTakeId(null);
    persistDraft({ selectedTakeId: null });
  };

  const handleVideoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    setJobStatus('idle');
    setVideoDuration(null);

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
      const question = QUESTIONS.find((q) => q.id === activeQuestionId);
      const take: RecordedTake = {
        id: makeTakeId('upload'),
        file,
        url: objectUrl,
        duration,
        label: `${question ? trimQuestion(question.prompt) : 'Upload'} - Upload ${uploadCount}`,
        source: 'upload',
        questionId: question?.id,
        questionPrompt: question?.prompt,
      };
      takeUrlsRef.current.add(objectUrl);
      setRecordedTakes((prev) => [take, ...prev]);
      setSelectedTakeId(take.id);
      setVideoUrl(objectUrl);
      setVideoDuration(duration);
      persistDraft({ selectedTakeId: take.id });
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

  const requestPermissions = async () => {
    setError(null);
    const stream = await acquireStream();
    if (stream && !recorderOpen) {
      stopStreamTracks(stream);
      setLiveStream(null);
    }
  };

  const openRecorder = async () => {
    setError(null);
    setRecordDuration(0);
    setRecordingState('idle');
    const stream = await acquireStream();
    if (stream) {
      setRecorderOpen(true);
    }
  };

  const closeRecorder = () => {
    clearRecordTimer();
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecordingState('idle');
    stopStreamTracks(liveStreamRef.current);
    setLiveStream(null);
    setRecorderOpen(false);
    setRecordDuration(0);
  };
  useEffect(() => {
    if (view === 'interview' && !recorderOpen) {
      openRecorder();
    }
    if (view !== 'interview' && recorderOpen) {
      closeRecorder();
    }
  }, [view, recorderOpen]);

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

  useEffect(() => {
    return () => {
      clearRecordTimer();
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      stopStreamTracks(liveStreamRef.current);
      takeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (recordingState !== 'recording' && playbackVideoRef.current) {
      const player = playbackVideoRef.current;
      player.pause();
      player.currentTime = 0;
      player.play().catch(() => undefined);
    }
  }, [videoUrl, recordingState]);

  useEffect(() => {
    if (recordingState === 'recording' && liveVideoRef.current && liveStreamRef.current) {
      const videoEl = liveVideoRef.current;
      videoEl.srcObject = liveStreamRef.current;
      videoEl.play().catch(() => undefined);
    }
  }, [recordingState]);

  const startRecording = async () => {
    setError(null);
    setJobStatus('idle');
    setRecordDuration(0);

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
            document.createElement('video').canPlayType(opt) !== '',
        ) || '';

      const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      let latestElapsed = 0;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        clearRecordTimer();
        const blobType = chosenMime || 'video/webm';
        const containerType = blobType.split(';')[0] || blobType;
        const blob = new Blob(chunks, { type: containerType });
        const extension = containerType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `capture.${extension}`, { type: containerType });
        const objectUrl = URL.createObjectURL(blob);
        const activeQuestion = QUESTIONS.find((q) => q.id === activeQuestionId);
        const takeIndex =
          recordedTakes.filter((t) => t.source === 'recording' && t.questionId === activeQuestionId).length + 1;
        const take: RecordedTake = {
          id: makeTakeId('rec'),
          file,
          url: objectUrl,
          duration: latestElapsed,
          label: `${activeQuestion ? trimQuestion(activeQuestion.prompt) : 'Interview'} - Take ${takeIndex}`,
          source: 'recording',
          questionId: activeQuestion?.id,
          questionPrompt: activeQuestion?.prompt,
        };
        takeUrlsRef.current.add(objectUrl);
        setRecordedTakes((prev) => [take, ...prev]);
        setSelectedTakeId(take.id);
        setVideoDuration(latestElapsed);
        setVideoUrl(objectUrl);
        setRecordingState('idle');
        persistDraft({ selectedTakeId: take.id });
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState('recording');
      setLiveStream(stream);

      const startedAt = Date.now();
      clearRecordTimer();
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        latestElapsed = elapsed;
        setRecordDuration(elapsed);
        if (elapsed >= MAX_VIDEO_SECONDS) {
          stopRecording();
        }
      }, 500);
    } catch (err) {
      console.error(err);
      setError('Could not access camera/microphone. Check permissions.');
      setRecordingState('idle');
    }
  };

  const stopRecording = () => {
    clearRecordTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecordingState('idle');
  };

  const selectTake = (id: string) => {
    const take = recordedTakes.find((t) => t.id === id);
    if (!take) return;
    setSelectedTakeId(id);
    setVideoUrl(take.url);
    setVideoDuration(take.duration);
    persistDraft({ selectedTakeId: id });
  };

  const switchView = (next: ViewMode) => {
    setError(null);
    setJobStatus('idle');
    setView(next);
    persistDraft({ view: next });
  };

  const activeQuestion = QUESTIONS.find((q) => q.id === activeQuestionId);
  const selectedTake = recordedTakes.find((t) => t.id === selectedTakeId) ?? null;
  const durationLabel = formatDuration(selectedTake?.duration ?? videoDuration);
  const recordLabel = formatDuration(recordDuration);
  const answeredQuestions = new Set(recordedTakes.map((t) => t.questionId).filter(Boolean) as string[]);
  const selectedJob = selectedJobId ? jobs.find((job) => job.id === selectedJobId) ?? null : null;

  const attachSelectedToJob = () => {
    if (!selectedJobId) return;
    if (!selectedTake) {
      setError('Select a take to send with this job.');
      return;
    }
    setError(null);
    setJobStatus('submitting');
    setTimeout(() => {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === selectedJobId
            ? {
                ...job,
                videoLabel: selectedTake.label,
                videoTakeId: selectedTake.id,
                status: 'applied',
                note: `Shared with ${job.owner}`,
              }
            : job,
        ),
      );
      setJobStatus('success');
    }, 400);
  };

  const renderSwitcher = () => (
    <div className="top-nav">
      <div className="brand">Zjobly</div>
      <div className="nav-actions">
        <button
          type="button"
          className={`nav-btn ${view === 'profile' ? 'active' : ''}`}
          onClick={() => switchView('profile')}
        >
          Profile
        </button>
        <button
          type="button"
          className={`nav-btn ghost ${view === 'interview' ? 'active' : ''}`}
          onClick={() => switchView('interview')}
        >
          Interview
        </button>
        <button
          type="button"
          className={`nav-btn ghost ${view === 'jobs' ? 'active' : ''}`}
          onClick={() => switchView('jobs')}
        >
          Jobs
        </button>
      </div>
    </div>
  );

  return (
    <main className="app-shell">
      {view === 'welcome' && (
        <section className="hero welcome">
          <p className="tag">Job seeker workspace</p>
          <h1>Show your profile and voice</h1>
          <p className="lede">
            Keep your details in one place, answer the automated video prompts, and attach a take to roles you like.
          </p>
          <div className="progress-row">
            <div className="pill">Profile ready</div>
            <div className="pill">
              {answeredQuestions.size}/{QUESTIONS.length} questions answered
            </div>
            <div className="pill">Max 3:00 per take</div>
          </div>
          <div className="welcome-actions">
            <button type="button" className="cta primary" onClick={() => switchView('interview')}>
              Start automated interview
            </button>
            <button type="button" className="cta ghost" onClick={() => switchView('profile')}>
              Update profile
            </button>
            <button type="button" className="ghost" onClick={() => switchView('jobs')}>
              Browse jobs
            </button>
          </div>
        </section>
      )}

      {view === 'profile' && (
        <>
          {renderSwitcher()}
          <section className="hero">
            <div className="view-pill">Profile</div>
            <p className="tag">Candidate</p>
            <h1>Shape your profile for hiring teams</h1>
            <p className="lede">
              These details sit next to your video interview. Keep them concise so job owners can skim quickly.
            </p>

            <form className="profile-form" onSubmit={handleProfileSubmit}>
              <div className="profile-grid">
                <div className="panel">
                  <div className="field">
                    <label htmlFor="name">Name</label>
                    <input
                      id="name"
                      name="name"
                      value={profile.name}
                      onChange={(e) => handleProfileChange('name', e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="title">Headline</label>
                    <input
                      id="title"
                      name="title"
                      value={profile.title}
                      onChange={(e) => handleProfileChange('title', e.target.value)}
                      placeholder="e.g., Product Designer focused on onboarding"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="location">Location</label>
                    <input
                      id="location"
                      name="location"
                      value={profile.location}
                      onChange={(e) => handleProfileChange('location', e.target.value)}
                      placeholder="Remote, city, or timezone"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="summary">Summary</label>
                    <textarea
                      id="summary"
                      name="summary"
                      rows={3}
                      value={profile.summary}
                      onChange={(e) => handleProfileChange('summary', e.target.value)}
                    />
                  </div>
                </div>

                <div className="panel profile-side">
                  <div className="panel-header">
                    <div>
                      <h2>Links</h2>
                      <p className="hint">Portfolio, LinkedIn, GitHub, Dribbble.</p>
                    </div>
                    <button type="button" className="ghost" onClick={addLinkRow}>
                      Add link
                    </button>
                  </div>
                  <div className="link-list">
                    {profile.links.map((link, idx) => (
                      <div className="field" key={idx}>
                        <label>Link {idx + 1}</label>
                        <input
                          value={link}
                          onChange={(e) => handleLinkChange(idx, e.target.value)}
                          placeholder="https://"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="panel-footer">
                    <div className="pill soft">
                      {answeredQuestions.size}/{QUESTIONS.length} video answers saved
                    </div>
                    <button type="button" className="cta primary small" onClick={() => switchView('interview')}>
                      Record answers
                    </button>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Interview highlight</h2>
                    <p className="hint">Pick a take to feature next to your profile.</p>
                  </div>
                </div>
                {recordedTakes.length === 0 && <p className="hint">Record at least one take to feature it here.</p>}
                {selectedTake && (
                  <div className="video-preview">
                    <div className="preview-label">
                      {selectedTake.questionPrompt ? trimQuestion(selectedTake.questionPrompt) : 'Interview take'}
                    </div>
                    <video ref={playbackVideoRef} src={selectedTake.url} controls playsInline className="profile-video" />
                    <div className="take-meta">
                      <span className="pill">{durationLabel ?? '0:00'}</span>
                      <span className="pill">{selectedTake.label}</span>
                    </div>
                  </div>
                )}
                <div className="panel-actions">
                  {profileStatus === 'success' && <div className="success">Profile saved locally.</div>}
                  <button type="submit" className="cta primary">
                    Save profile
                  </button>
                </div>
              </div>
            </form>
          </section>
        </>
      )}
      {view === 'interview' && (
        <>
          {renderSwitcher()}
          <section className="hero">
            <div className="view-pill">Automated interview</div>
            <p className="tag">Video responses</p>
            <h1>Answer the prompts on camera</h1>
            <p className="lede">
              Pick a question, record a take (max 3:00), and keep the best one. You can reuse these across jobs.
            </p>

            <div className="interview-layout">
              <div className="panel question-panel">
                <div className="panel-header">
                  <div>
                    <h2>Questions</h2>
                    <p className="hint">
                      {answeredQuestions.size}/{QUESTIONS.length} answered
                    </p>
                  </div>
                  <button type="button" className="ghost" onClick={requestPermissions}>
                    Check camera access
                  </button>
                </div>
                <div className="question-grid">
                  {QUESTIONS.map((question) => (
                    <button
                      type="button"
                      key={question.id}
                      className={`question-card ${
                        activeQuestionId === question.id ? 'active' : ''
                      } ${answeredQuestions.has(question.id) ? 'answered' : ''}`}
                      onClick={() => {
                        setActiveQuestionId(question.id);
                        persistDraft({ activeQuestionId: question.id });
                      }}
                    >
                      <div className="question-title">{question.prompt}</div>
                      {question.tip && <div className="question-tip">{question.tip}</div>}
                      <div className="question-meta">
                        {answeredQuestions.has(question.id) ? 'Answered' : 'Pending'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel record-panel">
                <div className="panel-header">
                  <div>
                    <h2>{trimQuestion(activeQuestion?.prompt ?? 'Interview take')}</h2>
                    <p className="hint">
                      {permissionState === 'denied'
                        ? 'Camera blocked. Allow access to record.'
                        : 'We save videos locally until you attach them to a job.'}
                    </p>
                  </div>
                  <div className="pill soft">
                    {recordingState === 'recording' ? 'Recording...' : 'Camera ready'}
                  </div>
                </div>

                <div className="record-stage">
                  {recorderOpen ? (
                    <div className={`record-screen ${recordingState !== 'recording' && videoUrl ? 'playback' : ''}`}>
                      {recordingState !== 'recording' && videoUrl ? (
                        <video
                          key={videoUrl}
                          ref={playbackVideoRef}
                          src={videoUrl}
                          className="live-video playback-video"
                          controls
                          playsInline
                          autoPlay
                          muted
                        />
                      ) : (
                        <video ref={liveVideoRef} className="live-video" autoPlay playsInline muted />
                      )}
                      <div className="record-screen-overlay">
                        <div className="overlay-top">
                          <span className={`status-pill ${recordingState === 'recording' ? 'live' : 'idle'}`}>
                            {recordingState === 'recording' ? 'Recording' : 'Camera ready'}
                          </span>
                          <div className="record-timer">
                            <span>
                              {recordingState === 'recording'
                                ? recordLabel ?? '0:00'
                                : durationLabel ?? recordLabel ?? '0:00'}
                            </span>
                            <span className="record-max">/ 3:00</span>
                          </div>
                        </div>
                        <div className="overlay-bottom">
                          <div className="overlay-actions-left">
                            <span className="pill soft">
                              {activeQuestion ? trimQuestion(activeQuestion.prompt) : 'Select a question'}
                            </span>
                          </div>
                          <div className="overlay-actions-right">
                            {recordingState !== 'recording' && selectedTake && (
                              <button type="button" className="cta primary" onClick={() => switchView('jobs')}>
                                Use for a job
                              </button>
                            )}
                            <button
                              type="button"
                              className={`record-btn ${recordingState === 'recording' ? 'stop' : 'start'}`}
                              onClick={recordingState === 'recording' ? stopRecording : startRecording}
                            >
                              {recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="record-placeholder">
                      <p>Opening camera... If it does not appear, grant permissions above.</p>
                    </div>
                  )}
                </div>

                {error && <div className="error">{error}</div>}
              </div>

              <div className="panel takes-panel">
                <div className="panel-header">
                  <div>
                    <h2>Your takes</h2>
                    <p className="hint">Pick one to feature or send with a job.</p>
                  </div>
                </div>
                <div className="take-list">
                  {recordedTakes.length === 0 && <p className="hint">Record or upload to see your takes here.</p>}
                  {recordedTakes.map((take) => (
                    <label key={take.id} className={`take-card ${selectedTakeId === take.id ? 'selected' : ''}`}>
                      <div className="take-card-top">
                        <div className="take-label">
                          <input
                            type="radio"
                            name="selectedTake"
                            checked={selectedTakeId === take.id}
                            onChange={() => selectTake(take.id)}
                          />
                          <span>{take.label}</span>
                        </div>
                        <span className="take-duration">{formatDuration(take.duration) ?? '0:00'}</span>
                      </div>
                      <p className="hint">{take.questionPrompt ? trimQuestion(take.questionPrompt) : 'General take'}</p>
                      <video src={take.url} controls preload="metadata" />
                    </label>
                  ))}
                </div>

                <div className="field">
                  <label htmlFor="video">Upload a take instead (max 3:00)</label>
                  <div className="upload-box">
                    <input id="video" name="video" type="file" accept="video/*" onChange={handleVideoChange} />
                    <div className="upload-copy">
                      <strong>Select a video file</strong>
                      <span>MP4, MOV, WEBM</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {view === 'jobs' && (
        <>
          {renderSwitcher()}
          <section className="hero">
            <div className="view-pill">Jobs</div>
            <p className="tag">Opportunities</p>
            <h1>Attach your interview to an open role</h1>
            <p className="lede">
              Pick a job, review the request, and attach the take you want the job owner to see.
            </p>
            <div className="jobs-list">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="job-card"
                  onClick={() => {
                    setSelectedJobId(job.id);
                    switchView('jobDetail');
                  }}
                >
                  <div className="job-card-left">
                    <div className="job-title">{job.title}</div>
                    <div className="job-meta">
                      {job.company} | {job.location}
                    </div>
                  </div>
                  <div className="job-card-right">
                    {job.videoLabel && <div className="job-chip">Video: {trimQuestion(job.videoLabel)}</div>}
                    <div className={`job-status ${job.status === 'applied' ? 'published' : 'draft'}`}>
                      {job.status === 'applied' ? 'Sent' : 'Open'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {view === 'jobDetail' && (
        <>
          {renderSwitcher()}
          <section className="hero">
            <div className="view-pill">Job Detail</div>
            <p className="tag">Visible to job owner</p>
            {selectedJob ? (
              <>
                <h1>{selectedJob.title}</h1>
                <p className="lede">
                  {selectedJob.company} | {selectedJob.location}
                </p>
                <div className="job-detail-meta">
                  <span className={`job-status ${selectedJob.status === 'applied' ? 'published' : 'draft'}`}>
                    {selectedJob.status === 'applied' ? 'Sent to owner' : 'Open'}
                  </span>
                  {selectedJob.videoLabel && <span className="job-chip">Video: {selectedJob.videoLabel}</span>}
                </div>
                <div className="panel">
                  <h2>Share your video with {selectedJob.owner}</h2>
                  <p className="hint">
                    Only the job owner can view this video. Pick your best take or upload a new one.
                  </p>
                  <div className="take-list">
                    {recordedTakes.length === 0 && <p className="hint">Record a take in the interview tab first.</p>}
                    {recordedTakes.map((take) => (
                      <label key={take.id} className={`take-card ${selectedTakeId === take.id ? 'selected' : ''}`}>
                        <div className="take-card-top">
                          <div className="take-label">
                            <input
                              type="radio"
                              name="jobSelectedTake"
                              checked={selectedTakeId === take.id}
                              onChange={() => selectTake(take.id)}
                            />
                            <span>{take.label}</span>
                          </div>
                          <span className="take-duration">{formatDuration(take.duration) ?? '0:00'}</span>
                        </div>
                        <p className="hint">{take.questionPrompt ? trimQuestion(take.questionPrompt) : 'General take'}</p>
                        <video src={take.url} controls preload="metadata" />
                      </label>
                    ))}
                  </div>

                  <div className="panel-actions split">
                    <div className="panel-action-left">
                      {jobStatus === 'success' && (
                        <div className="success">
                          Sent to {selectedJob.owner}. They can now view this recording.
                        </div>
                      )}
                      {error && <div className="error">{error}</div>}
                    </div>
                    <div className="panel-action-right">
                      <button type="button" className="ghost" onClick={() => switchView('jobs')}>
                        Back to jobs
                      </button>
                      <button
                        type="button"
                        className="cta primary"
                        disabled={jobStatus === 'submitting' || !selectedTake}
                        onClick={attachSelectedToJob}
                      >
                        {jobStatus === 'submitting' ? 'Attaching...' : 'Attach video to job'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="hint">Select a job from the list first.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default App;
