import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import './App.css';

const MAX_VIDEO_SECONDS = 180; // Hard 3-minute cap for recordings/uploads

type Status = 'idle' | 'submitting' | 'success';
type RecordingState = 'idle' | 'recording';
type PermissionState = 'unknown' | 'granted' | 'denied';
type ViewMode = 'welcome' | 'create' | 'find';
type CreateStep = 'details' | 'record' | 'select';

function formatDuration(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds)) return null;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${secs}`;
}

function App() {
  const [view, setView] = useState<ViewMode>('welcome');
  const [createStep, setCreateStep] = useState<CreateStep>('details');
  const [form, setForm] = useState({ title: '', location: '', description: '' });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
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
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

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
    };
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setStatus('idle');
    setError(null);
  };

  const clearVideoSelection = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoDuration(null);
  };

  const handleVideoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    setStatus('idle');
    setVideoDuration(null);

    if (!file) {
      clearVideoSelection();
      return;
    }

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
        clearVideoSelection();
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setVideoFile(file);
      setVideoUrl(objectUrl);
    };
    probe.onerror = () => {
      setError('Could not read video metadata. Try a different file.');
      clearVideoSelection();
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
        setVideoDuration(latestElapsed);
        setVideoFile(file);
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(objectUrl);
        setRecordingState('idle');
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState('recording');

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

    if (!videoFile) {
      setError('Record or upload a video before publishing.');
      setCreateStep('record');
      return;
    }

    if (!form.description) {
      setError('Add a short description before publishing.');
      return;
    }

    if (videoDuration !== null && videoDuration > MAX_VIDEO_SECONDS) {
      setError('Video must be 3 minutes or less.');
      return;
    }

    setStatus('submitting');

    // Placeholder: simulate an API call. Replace with real POST to your media API.
    setTimeout(() => {
      setStatus('success');
    }, 800);
  };

  const durationLabel = formatDuration(videoDuration);
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

  const resetRecording = () => {
    clearRecordTimer();
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecordingState('idle');
    setRecordDuration(0);
    clearVideoSelection();
  };

  const renderSwitcher = () => (
    <div className="top-nav">
      <button type="button" className="link-btn" onClick={backToWelcome}>
        ← Back
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
                            <video src={videoUrl} className="live-video playback-video" controls playsInline />
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
                                <button type="button" className="ghost dark" onClick={resetRecording}>
                                  Retake
                                </button>
                              </div>
                              <div className="overlay-actions-right">
                                {recordingState !== 'recording' && videoFile && (
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
                      <p className="hint">Use your latest take or upload a different file (still capped at 3:00).</p>
                    </div>
                    <button type="button" className="ghost" onClick={() => goToStep('record')}>
                      Retake
                    </button>
                  </div>

                  {videoUrl && (
                    <div className="video-preview">
                      <div className="preview-label">Selected video</div>
                      <video src={videoUrl} controls preload="metadata" />
                      {durationLabel && <span className="duration">Detected: {durationLabel}</span>}
                    </div>
                  )}

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

                  <div className="field">
                    <label htmlFor="description">Short description</label>
                    <textarea
                      id="description"
                      name="description"
                      value={form.description}
                      onChange={handleInputChange}
                      placeholder="Key responsibilities, stack, team, and why it matters."
                      rows={4}
                      required
                    />
                  </div>

                  {error && <div className="error">{error}</div>}
                  {status === 'success' && <div className="success">Saved! (API wire-up coming next.)</div>}

                  <div className="panel-actions split">
                    <button type="button" className="ghost" onClick={() => goToStep('record')}>
                      Back
                    </button>
                    <button type="submit" disabled={status === 'submitting'}>
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
              Search for roles shared with you. We’ll add richer search soon—start with a keyword or a Zjob link.
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
    </main>
  );
}

export default App;
