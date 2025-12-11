import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import './App.css';

const MAX_VIDEO_SECONDS = 180; // Hard 3-minute cap for recordings/uploads

type Status = 'idle' | 'submitting' | 'success';
type RecordingState = 'idle' | 'recording';
type PermissionState = 'unknown' | 'granted' | 'denied';
type ViewMode = 'welcome' | 'create' | 'find' | 'jobs' | 'jobDetail';
type CreateStep = 'details' | 'record' | 'select';
type RecordedTake = {
  id: string;
  file: File;
  url: string;
  duration: number;
  label: string;
  source: 'recording' | 'upload';
};
type Job = {
  id: string;
  title: string;
  location: string;
  status: 'published' | 'draft';
  videoLabel?: string;
};

function formatDuration(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds)) return null;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${secs}`;
}

const makeTakeId = (prefix: 'rec' | 'upload') =>
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;

function App() {
  const [view, setView] = useState<ViewMode>('welcome');
  const [createStep, setCreateStep] = useState<CreateStep>('details');
  const [form, setForm] = useState({ title: '', location: '', description: '' });
  const [jobs, setJobs] = useState<Job[]>([
    { id: 'job-1', title: 'Senior Backend Engineer', location: 'Remote (EU)', status: 'published', videoLabel: 'Take 2' },
    { id: 'job-2', title: 'Product Designer', location: 'Brussels', status: 'published', videoLabel: 'Upload 1' },
    { id: 'job-3', title: 'Data Analyst', location: 'Hybrid Antwerp', status: 'draft', videoLabel: 'Take 1' },
  ]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [recordedTakes, setRecordedTakes] = useState<RecordedTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
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

  const clearRecordTimer = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
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
  }, []);

  useEffect(() => {
    // Auto-play the latest take when not recording.
    if (recordingState !== 'recording' && playbackVideoRef.current) {
      const player = playbackVideoRef.current;
      player.pause();
      player.currentTime = 0;
      player.play().catch(() => undefined);
    }
  }, [videoUrl, recordingState]);

  useEffect(() => {
    // Re-attach the live stream when entering recording mode (after a playback).
    if (recordingState === 'recording' && liveVideoRef.current && liveStreamRef.current) {
      const videoEl = liveVideoRef.current;
      videoEl.srcObject = liveStreamRef.current;
      videoEl.play().catch(() => undefined);
    }
  }, [recordingState]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setStatus('idle');
    setError(null);
  };

  const clearVideoSelection = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoDuration(null);
    setSelectedTakeId(null);
  };

  const handleVideoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    setStatus('idle');
    setVideoDuration(null);

    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const probe = document.createElement('video');
    const playbackProbe = document.createElement('video');
    probe.preload = 'metadata';
    // Immediately fail fast if the browser knows it cannot play this MIME type.
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

  useEffect(() => {
    if (createStep === 'record' && !recorderOpen) {
      openRecorder();
    }
  }, [createStep, recorderOpen]);

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

  const startRecording = async () => {
    setError(null);
    setStatus('idle');
    setRecordDuration(0);

    const stream = await acquireStream();
    if (!stream) return;

    try {
      // Try a set of broadly compatible containers/codecs, preferring H.264/AAC MP4 that most browsers can play.
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

      const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      let latestElapsed = 0;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        clearRecordTimer();
        const blobType = chosenMime || 'video/webm';
        // Use container-only type for better playback sniffing on some browsers.
        const containerType = blobType.split(';')[0] || blobType;
        const blob = new Blob(chunks, { type: containerType });
        const extension = containerType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `capture.${extension}`, { type: containerType });
        const objectUrl = URL.createObjectURL(blob);
        const takeIndex = recordedTakes.filter((t) => t.source === 'recording').length + 1;
        const take: RecordedTake = {
          id: makeTakeId('rec'),
          file,
          url: objectUrl,
          duration: latestElapsed,
          label: `Take ${takeIndex}`,
          source: 'recording',
        };
        takeUrlsRef.current.add(objectUrl);
        setRecordedTakes((prev) => [take, ...prev]);
        setSelectedTakeId(take.id);
        setVideoDuration(latestElapsed);
        setVideoUrl(objectUrl);
        setRecordingState('idle');
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState('recording');
      setLiveStream(stream); // ensure the live element rebinds even if same stream reference

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

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!form.title || !form.location) {
      setError('Add a title and location first.');
      setCreateStep('details');
      return;
    }

    if (!selectedTake) {
      setError('Record or upload a video before publishing.');
      setCreateStep('record');
      return;
    }

    if ((selectedTake?.duration ?? videoDuration ?? 0) > MAX_VIDEO_SECONDS) {
      setError('Video must be 3 minutes or less.');
      return;
    }

    setStatus('submitting');

    // Placeholder: simulate an API call. Replace with real POST to your media API.
    setTimeout(() => {
      setJobs((prev) => [
        {
          id: `job-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
          title: form.title,
          location: form.location,
          status: 'published',
          videoLabel: selectedTake?.label,
        },
        ...prev,
      ]);
      setStatus('success');
      setView('jobs');
    }, 800);
  };

  const selectedTake = recordedTakes.find((t) => t.id === selectedTakeId) ?? null;
  const durationLabel = formatDuration(selectedTake?.duration ?? videoDuration);
  const recordLabel = formatDuration(recordDuration);

  const backToWelcome = () => {
    setView('welcome');
    setStatus('idle');
    setError(null);
    setCreateStep('details');
  };

  const goToStep = (nextStep: CreateStep) => {
    setError(null);
    setCreateStep(nextStep);
  };

  const selectTake = (id: string) => {
    const take = recordedTakes.find((t) => t.id === id);
    if (!take) return;
    setSelectedTakeId(id);
    setVideoUrl(take.url);
    setVideoDuration(take.duration);
  };

  const renderSwitcher = () => (
    <div className="top-nav">
      <button type="button" className="link-btn" onClick={backToWelcome}>
        ΓåÉ Back
      </button>
      <div className="nav-actions">
        <button
          type="button"
          className={`nav-btn ${view === 'create' ? 'active' : ''}`}
          onClick={() => setView('create')}
        >
          Create Zjob
        </button>
        <button
          type="button"
          className={`nav-btn ghost ${view === 'find' ? 'active' : ''}`}
          onClick={() => setView('find')}
        >
          Find Zjob
        </button>
        <button
          type="button"
          className={`nav-btn ghost ${view === 'jobs' ? 'active' : ''}`}
          onClick={() => {
            setSelectedJobId(null);
            setView('jobs');
          }}
        >
          My Jobs
        </button>
      </div>
    </div>
  );

  return (
    <main className="app-shell">
      {view === 'welcome' && (
        <section className="hero welcome">
          <p className="tag">Zjobly</p>
          <h1>Welcome to Zjobly</h1>
          <p className="lede">Pick where you want to start.</p>
          <div className="welcome-actions">
            <button type="button" className="cta primary" onClick={() => setView('create')}>
              Create Zjob
            </button>
            <button type="button" className="cta ghost" onClick={() => setView('find')}>
              Find Zjob
            </button>
          </div>
        </section>
      )}

      {view === 'create' && (
        <>
          {renderSwitcher()}
          <section className="hero">
            <div className="view-pill">Create Zjob</div>
            <p className="tag">Zjobly</p>
            <h1>Post a role with a video intro</h1>
            <p className="lede">
              Follow the steps: add the role, record a quick clip (hard stop at 3:00), then choose the video to publish.
            </p>

            <div className="stepper">
              <div className={`step ${createStep === 'details' ? 'active' : ''}`}>
                <span className="step-id">1</span>
                <span>Role details</span>
              </div>
              <div className={`step ${createStep === 'record' ? 'active' : ''}`}>
                <span className="step-id">2</span>
                <span>Record</span>
              </div>
              <div className={`step ${createStep === 'select' ? 'active' : ''}`}>
                <span className="step-id">3</span>
                <span>Choose video & publish</span>
              </div>
            </div>

            <form className="upload-form" onSubmit={handleSubmit}>
              {createStep === 'details' && (
                <div className="panel">
                  <div className="field">
                    <label htmlFor="title">Job title</label>
                    <input
                      id="title"
                      name="title"
                      value={form.title}
                      onChange={handleInputChange}
                      autoFocus
                      placeholder="e.g., Senior Backend Engineer"
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="location">Location</label>
                    <input
                      id="location"
                      name="location"
                      value={form.location}
                      onChange={handleInputChange}
                      placeholder="e.g., Remote (EU) or Brussels"
                      required
                    />
                  </div>

                  <div className="panel-actions">
                    <button
                      type="button"
                      className="cta primary"
                      onClick={() => goToStep('record')}
                      disabled={!form.title || !form.location}
                    >
                      Continue to recording
                    </button>
                  </div>
                </div>
              )}

              {createStep === 'record' && (
                <div className="fullscreen-recorder">
                  <div className="record-shell">
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
                            <video
                              ref={liveVideoRef}
                              className="live-video"
                              autoPlay
                              playsInline
                              muted
                            />
                          )}
                          <div className="record-screen-overlay">
                            <div className="overlay-top">
                              <span
                                className={`status-pill ${
                                  recordingState === 'recording' ? 'live' : 'idle'
                                }`}
                              >
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
                                <button type="button" className="ghost dark" onClick={() => goToStep('details')}>
                                  Back
                                </button>
                              </div>
                              <div className="overlay-actions-right">
                                {recordingState !== 'recording' && selectedTake && (
                                  <button
                                    type="button"
                                    className="cta primary"
                                    onClick={() => goToStep('select')}
                                  >
                                    Continue
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`record-btn ${
                                    recordingState === 'recording' ? 'stop' : 'start'
                                  }`}
                                  onClick={
                                    recordingState === 'recording' ? stopRecording : startRecording
                                  }
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

                    {error && <div className="error floating">{error}</div>}
                  </div>
                </div>
              )}

              {createStep === 'select' && (
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Choose a video for publication</h2>
                      <p className="hint">Pick one of your takes. WeΓÇÖll add multi-take editing next.</p>
                    </div>
                    <button type="button" className="ghost" onClick={() => goToStep('record')}>
                      Back to record
                    </button>
                  </div>

                  <div className="take-list">
                    {recordedTakes.length === 0 && (
                      <p className="hint">No takes yet. Record or upload to choose one.</p>
                    )}
                    {recordedTakes.map((take) => (
                      <label
                        key={take.id}
                        className={`take-card ${selectedTakeId === take.id ? 'selected' : ''}`}
                      >
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
                          <span className="take-duration">{formatDuration(take.duration) ?? 'ΓÇö'}</span>
                        </div>
                        <video src={take.url} controls preload="metadata" />
                      </label>
                    ))}
                  </div>

                  <div className="field">
                    <label htmlFor="video">Upload instead (max 3:00)</label>
                    <div className="upload-box">
                      <input
                        id="video"
                        name="video"
                        type="file"
                        accept="video/*"
                        onChange={handleVideoChange}
                      />
                      <div className="upload-copy">
                        <strong>Select a video file</strong>
                        <span>MP4, MOV, WEBM - up to 3 minutes</span>
                      </div>
                    </div>
                  </div>

                  {error && <div className="error">{error}</div>}
                  {status === 'success' && <div className="success">Saved! (API wire-up coming next.)</div>}

                  <div className="panel-actions split">
                    <button type="button" className="ghost" onClick={() => goToStep('record')}>
                      Back
                    </button>
                    <button type="submit" disabled={status === 'submitting' || !selectedTake}>
                      {status === 'submitting' ? 'Uploading...' : 'Publish job'}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </section>
        </>
      )}

      {view === 'find' && (
        <>
          {renderSwitcher()}
          <section className="hero">
            <div className="view-pill">Find Zjob</div>
            <p className="tag">Zjobly</p>
            <h1>Discover an open Zjob</h1>
            <p className="lede">
              Search for roles shared with you. WeΓÇÖll add richer search soonΓÇöstart with a keyword or a Zjob link.
            </p>
            <div className="search-card">
              <label className="field-label" htmlFor="search">
                Enter a keyword or Zjob link
              </label>
              <div className="search-row">
                <input id="search" name="search" placeholder="e.g., frontend, data, or https://zjob.ly/123" />
                <button type="button" className="cta primary">
                  Search
                </button>
              </div>
            </div>
            <p className="hint">Search results and job discovery are coming next.</p>
            <div className="welcome-actions">
              <button type="button" className="ghost" onClick={backToWelcome}>
                Back to welcome
              </button>
              <button type="button" className="cta primary" onClick={() => setView('create')}>
                Create a Zjob instead
              </button>
            </div>
          </section>
        </>
      )}

      {view === 'jobs' && (
        <>
          {renderSwitcher()}
          <section className="hero">
            <div className="view-pill">My Jobs</div>
            <p className="tag">Zjobly</p>
            <h1>Your published jobs</h1>
            <p className="lede">Click a job to see its details.</p>
            <div className="jobs-list">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="job-card"
                  onClick={() => {
                    setSelectedJobId(job.id);
                    setView('jobDetail');
                  }}
                >
                  <div>
                    <div className="job-title">{job.title}</div>
                    <div className="job-meta">{job.location}</div>
                  </div>
                  <div className={`job-status ${job.status}`}>
                    {job.status === 'published' ? 'Published' : 'Draft'}
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
            <p className="tag">Zjobly</p>
            {selectedJobId ? (
              (() => {
                const job = jobs.find((j) => j.id === selectedJobId);
                if (!job) {
                  return <p className="hint">Job not found.</p>;
                }
                return (
                  <>
                    <h1>{job.title}</h1>
                    <p className="lede">{job.location}</p>
                    <div className="job-detail-meta">
                      <span className={`job-status ${job.status}`}>
                        {job.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                      {job.videoLabel && <span className="job-chip">Video: {job.videoLabel}</span>}
                    </div>
                    <div className="panel">
                      <p className="hint">Full job description and video preview will appear here.</p>
                    </div>
                    <div className="panel-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setView('jobs')}
                      >
                        Back to jobs
                      </button>
                    </div>
                  </>
                );
              })()
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
