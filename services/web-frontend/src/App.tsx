import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import './App.css';

const MAX_VIDEO_SECONDS = 180;

type Status = 'idle' | 'submitting' | 'success';

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
