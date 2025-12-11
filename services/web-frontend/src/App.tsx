import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import './App.css';
import { JobCreationFlow } from './components/JobCreationFlow';
import { JobSeekerFlow } from './components/JobSeekerFlow';
import { formatDuration, makeTakeId } from './helpers';
import { CreateStep, Job, PermissionState, RecordedTake, RecordingState, Status, ViewMode } from './types';

const MAX_VIDEO_SECONDS = 180; // Hard 3-minute cap for recordings/uploads

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
  const [, setPermissionState] = useState<PermissionState>('unknown');
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

  useEffect(() => {
    if (createStep === 'record' && !recorderOpen) {
      openRecorder();
    }
  }, [createStep, recorderOpen]);

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
    setRecordDuration(0);
    setRecordingState('idle');
    const stream = await acquireStream();
    if (stream) {
      setRecorderOpen(true);
    }
  };

  const startRecording = async () => {
    setError(null);
    setStatus('idle');
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

      <JobCreationFlow
        view={view}
        nav={renderSwitcher()}
        createStep={createStep}
        form={form}
        onInputChange={handleInputChange}
        goToStep={goToStep}
        handleSubmit={handleSubmit}
        recorderOpen={recorderOpen}
        recordingState={recordingState}
        videoUrl={videoUrl}
        liveVideoRef={liveVideoRef}
        playbackVideoRef={playbackVideoRef}
        recordLabel={recordLabel}
        durationLabel={durationLabel}
        selectedTake={selectedTake}
        startRecording={startRecording}
        stopRecording={stopRecording}
        error={error}
        recordedTakes={recordedTakes}
        selectedTakeId={selectedTakeId}
        selectTake={selectTake}
        handleVideoChange={handleVideoChange}
        status={status}
      />

      <JobSeekerFlow
        view={view}
        nav={renderSwitcher()}
        jobs={jobs}
        selectedJobId={selectedJobId}
        onSelectJob={setSelectedJobId}
        onBackToWelcome={backToWelcome}
        onCreateClick={() => setView('create')}
        setView={setView}
      />
    </main>
  );
}

export default App;

