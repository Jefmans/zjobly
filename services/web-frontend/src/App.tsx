import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import './App.css';

const MAX_VIDEO_SECONDS = 180;

type Status = 'idle' | 'submitting' | 'success';
type RecordingState = 'idle' | 'recording';
type PermissionState = 'unknown' | 'granted' | 'denied';

function formatDuration(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds)) return null;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${secs}`;
}

function App() {
  const [form, setForm] = useState({ title: '', location: '', description: '' });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordDuration, setRecordDuration] = useState<number>(0);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setStatus('idle');
    setError(null);
  };

  const handleVideoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    setStatus('idle');
    setVideoDuration(null);

    if (!file) {
      setVideoFile(null);
      setVideoUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const duration = probe.duration;
      setVideoDuration(duration);
      if (duration > MAX_VIDEO_SECONDS) {
        setError('Video must be 3 minutes or less.');
        setVideoFile(null);
        setVideoUrl(null);
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setVideoFile(file);
      setVideoUrl(objectUrl);
    };
    probe.onerror = () => {
      setError('Could not read video metadata. Try a different file.');
      setVideoFile(null);
      setVideoUrl(null);
      URL.revokeObjectURL(objectUrl);
    };
    probe.src = objectUrl;
  };

  const stopStreamTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => t.stop());
  };

  const requestPermissions = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera/mic not supported in this browser.');
      setPermissionState('denied');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stopStreamTracks(stream);
      setPermissionState('granted');
    } catch (err) {
      console.error(err);
      setPermissionState('denied');
      setError('Permission denied. Allow camera/mic to record a video.');
    }
  };

  const startRecording = async () => {
    setError(null);
    setStatus('idle');
    setRecordDuration(0);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera/mic not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        stopStreamTracks(stream);
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const blob = new Blob(chunks, { type: 'video/webm' });
        const file = new File([blob], 'capture.webm', { type: 'video/webm' });
        const objectUrl = URL.createObjectURL(blob);
        setVideoDuration(recordDuration);
        setVideoFile(file);
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(objectUrl);
        setRecordingState('idle');
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState('recording');

      const startedAt = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecordingState('idle');
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!form.title || !form.location || !form.description || !videoFile) {
      setError('Please complete all fields and attach a video.');
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

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="tag">Zjobly</p>
        <h1>Post a role with a video intro</h1>
        <p className="lede">
          Upload a short clip (max 3:00) that tells candidates what makes this role special.
        </p>

        <form className="upload-form" onSubmit={handleSubmit}>
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

          <div className="field">
            <label htmlFor="description">What should candidates know?</label>
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

          <div className="field">
            <label htmlFor="video">Job intro video (max 3:00)</label>
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
                <span>MP4, MOV, WEBM — up to 3 minutes</span>
                {durationLabel && <span className="duration">Detected: {durationLabel}</span>}
              </div>
            </div>
          </div>

          <div className="field">
            <label>Or record now (camera + mic)</label>
            <div className="record-box">
              <div className="record-controls">
                <button
                  type="button"
                  className="ghost"
                  onClick={recordingState === 'recording' ? stopRecording : startRecording}
                >
                  {recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
                </button>
                <span className="record-status">
                  {recordingState === 'recording' ? 'Recording…' : 'Not recording'}
                </span>
              </div>
              <div className="record-permission">
                <button type="button" className="ghost" onClick={requestPermissions}>
                  {permissionState === 'granted' ? 'Camera/mic allowed' : 'Request permission'}
                </button>
                <span className="record-status">
                  {permissionState === 'granted'
                    ? 'Ready to record'
                    : permissionState === 'denied'
                    ? 'Permission denied'
                    : 'Permission not requested'}
                </span>
              </div>
              <div className="record-timer">
                <span>{recordLabel ?? '0:00'}</span>
                <span className="record-max">/ 3:00</span>
              </div>
              <p className="hint">Use your webcam or phone camera; we enforce a 3-minute cap.</p>
            </div>
          </div>

          {videoUrl && (
            <div className="video-preview">
              <div className="preview-label">Preview</div>
              <video src={videoUrl} controls preload="metadata" />
            </div>
          )}

          {error && <div className="error">{error}</div>}
          {status === 'success' && (
            <div className="success">Saved! (API wire-up coming next.)</div>
          )}

          <button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Uploading…' : 'Save job & video'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
