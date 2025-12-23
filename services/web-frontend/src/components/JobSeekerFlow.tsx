import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { applyToJob, confirmUpload, createUploadUrl, uploadFileToUrl } from "../api";
import { formatDuration } from "../helpers";
import { Job, UserRole, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  role: UserRole | null;
  jobs: Job[];
  jobsLoading: boolean;
  jobsError: string | null;
  companyId: string | null;
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
  setView: (v: ViewMode) => void;
  onPublishJob: (id: string) => void;
  publishingJobId: string | null;
};

const MAX_APPLICATION_VIDEO_SECONDS = 180;

export function JobSeekerFlow({
  view,
  nav,
  role,
  jobs,
  jobsLoading,
  jobsError,
  companyId,
  selectedJobId,
  onSelectJob,
  setView,
  onPublishJob,
  publishingJobId,
}: Props) {
  const [sortBy, setSortBy] = useState("created_desc");
  const isCandidate = role === "candidate";
  const isEmployer = role === "employer";
  const [applyVideoFile, setApplyVideoFile] = useState<File | null>(null);
  const [applyVideoUrl, setApplyVideoUrl] = useState<string | null>(null);
  const [applyDuration, setApplyDuration] = useState<number | null>(null);
  const [applyVideoSource, setApplyVideoSource] = useState<"recording" | "upload" | null>(null);
  const [applyStream, setApplyStream] = useState<MediaStream | null>(null);
  const [applyRecordingState, setApplyRecordingState] = useState<"idle" | "recording" | "paused">("idle");
  const [applyRecordDuration, setApplyRecordDuration] = useState<number>(0);
  const [applyStatus, setApplyStatus] = useState<
    "idle" | "presigning" | "uploading" | "confirming" | "saving" | "success" | "error"
  >("idle");
  const [applyProgress, setApplyProgress] = useState<number | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedJobs, setAppliedJobs] = useState<Record<string, boolean>>({});
  const applyStreamRef = useRef<MediaStream | null>(null);
  const applyRecorderRef = useRef<MediaRecorder | null>(null);
  const applyChunksRef = useRef<Blob[]>([]);
  const applyRecordTimerRef = useRef<number | null>(null);
  const applyRecordStartedAtRef = useRef<number | null>(null);
  const applyRecordElapsedRef = useRef<number>(0);
  const applyDiscardRecordingRef = useRef<boolean>(false);
  const applyLiveVideoRef = useRef<HTMLVideoElement | null>(null);
  const applyPercent = typeof applyProgress === "number" ? Math.max(0, Math.min(100, applyProgress)) : null;
  const selectedJob = selectedJobId ? jobs.find((job) => job.id === selectedJobId) : undefined;
  const canApplyForSelectedJob = Boolean(
    selectedJob && isCandidate && selectedJob.status === "open" && selectedJob.visibility === "public",
  );
  const hasAppliedForSelectedJob = Boolean(selectedJob && appliedJobs[selectedJob.id]);

  const formatDate = (value?: string | null) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  const sortedJobs = useMemo(() => {
    const items = [...jobs];
    const dateValue = (value?: string | null) => {
      if (!value) return 0;
      const ts = new Date(value).getTime();
      return Number.isNaN(ts) ? 0 : ts;
    };
    const statusRank: Record<Job["status"], number> = {
      draft: 2,
      open: 0,
      closed: 3,
      published: 1,
    };
    const getPublishedTime = (job: Job) => (job.status === "open" || job.status === "published" ? dateValue(job.created_at) : 0);

    switch (sortBy) {
      case "created_asc":
        return items.sort((a, b) => dateValue(a.created_at) - dateValue(b.created_at));
      case "published_desc":
        return items.sort((a, b) => getPublishedTime(b) - getPublishedTime(a));
      case "location_asc":
        return items.sort((a, b) => (a.location || "").localeCompare(b.location || "", undefined, { sensitivity: "base" }));
      case "status":
        return items.sort((a, b) => (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99));
      case "created_desc":
      default:
        return items.sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at));
    }
  }, [jobs, sortBy]);
  const getStatusMeta = (status: Job["status"]) => {
    if (status === "draft") return { label: "Draft", className: "draft" };
    if (status === "closed") return { label: "Closed", className: "closed" };
    if (status === "open") return { label: "Open", className: "open" };
    return { label: "Published", className: "published" };
  };
  const clearApplyRecordTimer = () => {
    if (applyRecordTimerRef.current) {
      window.clearInterval(applyRecordTimerRef.current);
      applyRecordTimerRef.current = null;
    }
  };
  const syncApplyRecordElapsed = () => {
    if (applyRecordStartedAtRef.current !== null) {
      applyRecordElapsedRef.current += (Date.now() - applyRecordStartedAtRef.current) / 1000;
      applyRecordStartedAtRef.current = null;
    }
    clearApplyRecordTimer();
    setApplyRecordDuration(applyRecordElapsedRef.current);
  };
  const resetApplyRecordTimer = () => {
    clearApplyRecordTimer();
    applyRecordStartedAtRef.current = null;
    applyRecordElapsedRef.current = 0;
    setApplyRecordDuration(0);
  };
  const startApplyRecordTimer = () => {
    applyRecordStartedAtRef.current = Date.now();
    clearApplyRecordTimer();
    applyRecordTimerRef.current = window.setInterval(() => {
      if (applyRecordStartedAtRef.current === null) return;
      const elapsed =
        applyRecordElapsedRef.current + (Date.now() - applyRecordStartedAtRef.current) / 1000;
      setApplyRecordDuration(elapsed);
      if (elapsed >= MAX_APPLICATION_VIDEO_SECONDS) {
        stopApplyRecording(false);
      }
    }, 250);
  };
  const openApplyRecorder = async () => {
    if (applyStreamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setApplyError("Camera/mic access is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      applyStreamRef.current = stream;
      setApplyStream(stream);
    } catch (err) {
      console.error(err);
      setApplyError("Could not access camera/mic. Check permissions and try again.");
    }
  };
  const stopApplyStream = () => {
    if (applyStreamRef.current) {
      applyStreamRef.current.getTracks().forEach((track) => track.stop());
      applyStreamRef.current = null;
    }
    setApplyStream(null);
  };
  const stopApplyRecording = (discard: boolean) => {
    applyDiscardRecordingRef.current = discard;
    if (applyRecorderRef.current && applyRecorderRef.current.state !== "inactive") {
      syncApplyRecordElapsed();
      applyRecorderRef.current.stop();
      return;
    }
    applyDiscardRecordingRef.current = false;
    applyChunksRef.current = [];
    resetApplyRecordTimer();
    setApplyRecordingState("idle");
    stopApplyStream();
  };
  const pauseApplyRecording = () => {
    if (applyRecordingState !== "recording") return;
    if (applyRecorderRef.current && applyRecorderRef.current.state === "recording") {
      applyRecorderRef.current.pause();
      syncApplyRecordElapsed();
      setApplyRecordingState("paused");
    }
  };
  const resumeApplyRecording = () => {
    if (applyRecordingState !== "paused") return;
    if (applyRecorderRef.current && applyRecorderRef.current.state === "paused") {
      applyRecorderRef.current.resume();
      startApplyRecordTimer();
      setApplyRecordingState("recording");
    }
  };
  const resetApplyState = () => {
    stopApplyRecording(true);
    if (applyVideoUrl) {
      URL.revokeObjectURL(applyVideoUrl);
    }
    setApplyVideoFile(null);
    setApplyVideoUrl(null);
    setApplyDuration(null);
    setApplyVideoSource(null);
    setApplyStatus("idle");
    setApplyProgress(null);
    setApplyError(null);
  };
  const openJobDetail = (jobId: string) => {
    onSelectJob(jobId);
    setView("jobDetail");
  };
  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, jobId: string) => {
    if (event.currentTarget !== event.target) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openJobDetail(jobId);
    }
  };

  useEffect(() => {
    resetApplyState();
  }, [selectedJobId]);

  useEffect(() => {
    if (view !== "jobDetail" && view !== "apply") {
      resetApplyState();
    }
  }, [view]);
  useEffect(() => {
    if (view !== "apply") return;
    if (!canApplyForSelectedJob || hasAppliedForSelectedJob) return;
    void openApplyRecorder();
  }, [view, canApplyForSelectedJob, hasAppliedForSelectedJob]);
  useEffect(() => {
    if (view === "apply") return;
    if (applyRecordingState !== "idle") {
      stopApplyRecording(true);
    } else {
      stopApplyStream();
    }
  }, [view, applyRecordingState]);
  useEffect(() => {
    return () => {
      stopApplyRecording(true);
    };
  }, []);
  useEffect(() => {
    const videoEl = applyLiveVideoRef.current;
    if (!videoEl) return;
    if (applyStream) {
      videoEl.srcObject = applyStream;
      videoEl.play().catch(() => undefined);
    } else {
      videoEl.srcObject = null;
    }
  }, [applyStream]);

  const handleApplyVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setApplyError(null);
    setApplyStatus("idle");
    setApplyProgress(null);

    if (!file) return;
    if (applyVideoUrl) {
      URL.revokeObjectURL(applyVideoUrl);
    }
    setApplyVideoSource("upload");

    const objectUrl = URL.createObjectURL(file);
    const probe = document.createElement("video");
    const playbackProbe = document.createElement("video");
    probe.preload = "metadata";
    if (file.type && playbackProbe.canPlayType(file.type) === "") {
      setApplyError(`This browser cannot play files of type ${file.type}. Try MP4 (H.264/AAC).`);
      URL.revokeObjectURL(objectUrl);
      return;
    }

    probe.onloadedmetadata = () => {
      const duration = probe.duration;
      if (duration > MAX_APPLICATION_VIDEO_SECONDS) {
        setApplyError("Video must be 3 minutes or less.");
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setApplyVideoFile(file);
      setApplyVideoUrl(objectUrl);
      setApplyDuration(duration);
      setApplyVideoSource("upload");
    };
    probe.onerror = () => {
      setApplyError("Could not read video metadata. Try a different file.");
      URL.revokeObjectURL(objectUrl);
    };
    probe.src = objectUrl;
  };
  const startApplyRecording = async () => {
    if (applyRecordingState === "recording") return;
    setApplyError(null);
    setApplyStatus("idle");
    setApplyProgress(null);
    if (applyVideoUrl) {
      URL.revokeObjectURL(applyVideoUrl);
    }
    setApplyVideoFile(null);
    setApplyVideoUrl(null);
    setApplyDuration(null);
    setApplyVideoSource(null);
    try {
      if (!applyStreamRef.current) {
        await openApplyRecorder();
      }
      const stream = applyStreamRef.current;
      if (!stream) return;
      applyChunksRef.current = [];
      const preferredTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      applyRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          applyChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        applyRecorderRef.current = null;
        resetApplyRecordTimer();
        setApplyRecordingState("idle");
        stopApplyStream();
        const discard = applyDiscardRecordingRef.current;
        applyDiscardRecordingRef.current = false;
        const chunks = applyChunksRef.current;
        applyChunksRef.current = [];
        if (discard) return;
        if (!chunks.length) {
          setApplyError("Recording failed to capture video.");
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        const objectUrl = URL.createObjectURL(blob);
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => {
          const duration = probe.duration;
          if (duration > MAX_APPLICATION_VIDEO_SECONDS) {
            setApplyError("Video must be 3 minutes or less.");
            URL.revokeObjectURL(objectUrl);
            return;
          }
          const fileName = `application-${Date.now()}.webm`;
          const file = new File([blob], fileName, { type: blob.type || "video/webm" });
          if (applyVideoUrl) {
            URL.revokeObjectURL(applyVideoUrl);
          }
          setApplyVideoFile(file);
          setApplyVideoUrl(objectUrl);
          setApplyDuration(duration);
          setApplyVideoSource("recording");
        };
        probe.onerror = () => {
          setApplyError("Could not read recorded video metadata. Try again.");
          URL.revokeObjectURL(objectUrl);
        };
        probe.src = objectUrl;
      };
      resetApplyRecordTimer();
      startApplyRecordTimer();
      recorder.start();
      setApplyRecordingState("recording");
    } catch (err) {
      console.error(err);
      stopApplyStream();
      setApplyError("Could not access camera/mic. Check permissions and try again.");
    }
  };
  const stopApplyRecordingClick = () => {
    stopApplyRecording(false);
  };

  const handleApplyToJob = async (jobId: string) => {
    setApplyError(null);
    if (!applyVideoFile) {
      setApplyError("Add a short video to apply.");
      return;
    }

    try {
      setApplyStatus("presigning");
      const presign = await createUploadUrl(applyVideoFile);
      setApplyStatus("uploading");
      setApplyProgress(0);
      await uploadFileToUrl(presign.upload_url, applyVideoFile, (percent) => setApplyProgress(percent));
      setApplyStatus("confirming");
      const confirmed = await confirmUpload({
        object_key: presign.object_key,
        duration_seconds: applyDuration ?? null,
        source: applyVideoSource || "upload",
      });
      setApplyStatus("saving");
      await applyToJob(jobId, { video_object_key: confirmed.object_key || presign.object_key });
      setApplyStatus("success");
      setAppliedJobs((prev) => ({ ...prev, [jobId]: true }));
      stopApplyStream();
      setView("jobDetail");
    } catch (err) {
      console.error(err);
      setApplyStatus("error");
      setApplyError(err instanceof Error ? err.message : "Could not submit your application.");
    }
  };
  const handleApplyCancel = () => {
    stopApplyRecording(true);
    setView("jobDetail");
  };

  if (view === "jobs") {
    return (
      <>
        {nav}
        <section className="hero">
          <div className="view-pill">{isCandidate ? "Find Zjob" : "My Jobs"}</div>
          <p className="tag">Zjobly</p>
          <h1>{isCandidate ? "Open jobs" : "Your jobs"}</h1>
          <p className="lede">
            {isCandidate ? "Browse published jobs and tap one for details." : "Click a job to see its details."}
          </p>
          <div className="jobs-toolbar">
            <div className="field">
              <label htmlFor="jobSort">Sort by</label>
              <select id="jobSort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="created_desc">Date created (newest)</option>
                <option value="created_asc">Date created (oldest)</option>
                <option value="published_desc">Date published (newest)</option>
                <option value="location_asc">Location (A-Z)</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>
          {!isCandidate && !companyId && (
            <p className="hint">Set VITE_COMPANY_ID in your .env to load jobs from the API.</p>
          )}
          {jobsError && <p className="error">{jobsError}</p>}
          {jobsLoading && <p className="hint">Loading jobs...</p>}
          {!jobsLoading && !jobsError && jobs.length === 0 && (
            <p className="hint">
              {isCandidate ? "No open jobs yet. Check back soon." : "No jobs yet. Publish one to see it here."}
            </p>
          )}
          <div className="jobs-list">
            {sortedJobs.map((job) => (
              <div
                key={job.id}
                className="job-card"
                role="button"
                tabIndex={0}
                aria-label={`View details for ${job.title}`}
                onClick={() => openJobDetail(job.id)}
                onKeyDown={(event) => handleCardKeyDown(event, job.id)}
              >
                <div className="job-card-left">
                  <div className="job-title">{job.title}</div>
                  <div className="job-meta">{job.location || "Location TBD"}</div>
                  <div className="job-meta-row">
                    <span>Created: {formatDate(job.created_at)}</span>
                    <span>
                      Published: {job.status === "open" || job.status === "published" ? formatDate(job.created_at) : "Not published"}
                    </span>
                  </div>
                </div>
                <div className="job-card-right">
                  {(() => {
                    const status = getStatusMeta(job.status);
                    return <div className={`job-status ${status.className}`}>{status.label}</div>;
                  })()}
                  {job.videoLabel && <span className="job-chip">Video: {job.videoLabel}</span>}
                  {isEmployer && (job.status !== "open" || job.visibility !== "public") && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPublishJob(job.id);
                      }}
                      disabled={publishingJobId === job.id}
                    >
                      {publishingJobId === job.id ? "Publishing..." : "Publish"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </>
    );
  }

  if (view === "apply") {
    const job = selectedJob;
    const isRecording = applyRecordingState === "recording";
    const isPaused = applyRecordingState === "paused";
    const isActiveRecording = isRecording || isPaused;
    const canRecord = applyRecordingState === "idle" || isPaused;
    const canPause = applyRecordingState === "recording";
    const canStop = isActiveRecording;
    const recordActionLabel = isPaused ? "Resume" : "Start";
    const recordAction = isPaused ? resumeApplyRecording : startApplyRecording;
    const isApplying = ["presigning", "uploading", "confirming", "saving"].includes(applyStatus);
    const recorderOpen = Boolean(applyStream || applyVideoUrl);
    const recordLabel = formatDuration(applyRecordDuration) ?? "0:00";
    const durationLabel = formatDuration(applyDuration) ?? "0:00";

    return (
      <>
        {nav}
        <section className="hero">
          <div className="view-pill">Find Zjob</div>
          <p className="tag">Zjobly</p>
          <h1>Record your application</h1>
          <p className="lede">
            {job ? `Tell the recruiter why you want ${job.title}.` : "Select a job to apply."}
          </p>
          {!job && (
            <div className="panel">
              <p className="hint">Select a job from the list first.</p>
              <div className="panel-actions">
                <button type="button" className="ghost" onClick={() => setView("jobs")}>
                  Back to jobs
                </button>
              </div>
            </div>
          )}
          {job && (
            <div className="fullscreen-recorder">
              <div className="record-shell">
                <div className="record-stage">
                  {recorderOpen ? (
                    <div className={`record-screen ${!isActiveRecording && applyVideoUrl ? "playback" : ""}`}>
                      {!isActiveRecording && applyVideoUrl ? (
                        <video
                          key={applyVideoUrl}
                          src={applyVideoUrl}
                          className="live-video playback-video"
                          controls
                          playsInline
                          autoPlay
                          muted
                        />
                      ) : (
                        <video ref={applyLiveVideoRef} className="live-video" autoPlay playsInline muted />
                      )}
                      <div className="record-screen-overlay">
                        <div className="overlay-top">
                          <span
                            className={`status-pill ${isRecording ? "live" : isPaused ? "paused" : "idle"}`}
                          >
                            {isRecording ? "Recording" : isPaused ? "Paused" : "Camera ready"}
                          </span>
                          <div className="record-timer">
                            <span>{isActiveRecording ? recordLabel : durationLabel}</span>
                            <span className="record-max">/ 3:00</span>
                          </div>
                        </div>
                        <div className="overlay-bottom">
                          <div className="overlay-actions-left">
                            <button type="button" className="ghost dark" onClick={handleApplyCancel}>
                              Back to job
                            </button>
                          </div>
                          <div className="overlay-actions-right">
                            <div className="record-controls">
                              <button
                                type="button"
                                className="record-control record"
                                onClick={recordAction}
                                disabled={
                                  !canApplyForSelectedJob ||
                                  hasAppliedForSelectedJob ||
                                  isApplying ||
                                  !canRecord
                                }
                                aria-label={recordActionLabel}
                              >
                                <span className="record-icon record-icon--record" aria-hidden="true" />
                                <span className="record-label">{recordActionLabel}</span>
                              </button>
                              <button
                                type="button"
                                className="record-control pause"
                                onClick={pauseApplyRecording}
                                disabled={!canPause}
                                aria-label="Pause"
                              >
                                <span className="record-icon record-icon--pause" aria-hidden="true" />
                                <span className="record-label">Pause</span>
                              </button>
                              <button
                                type="button"
                                className="record-control stop"
                                onClick={stopApplyRecordingClick}
                                disabled={!canStop}
                                aria-label="Stop"
                              >
                                <span className="record-icon record-icon--stop" aria-hidden="true" />
                                <span className="record-label">Stop</span>
                              </button>
                            </div>
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

                <div className="panel record-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Application video</h2>
                      <p className="hint">
                        Focus on why you want the job and what you can deliver in the first 90 days.
                      </p>
                    </div>
                    <button type="button" className="ghost" onClick={handleApplyCancel}>
                      Back to job
                    </button>
                  </div>
                  {!canApplyForSelectedJob && (
                    <p className="hint">This job is not open for applications right now.</p>
                  )}
                  <div className="upload-box">
                    <input
                      id="application-video"
                      name="application-video"
                      type="file"
                      accept="video/*"
                      onChange={handleApplyVideoChange}
                      disabled={
                        !canApplyForSelectedJob ||
                        hasAppliedForSelectedJob ||
                        isApplying ||
                        isActiveRecording
                      }
                    />
                    <div className="upload-copy">
                      <strong>Select a video file</strong>
                      <span>MP4, MOV, WEBM - up to 3 minutes</span>
                    </div>
                  </div>
                  {applyDuration !== null && (
                    <p className="duration">Video length: {formatDuration(applyDuration)}</p>
                  )}
                  {applyError && <div className="error">{applyError}</div>}
                  {applyStatus === "presigning" && <div className="notice">Requesting an upload URL...</div>}
                  {applyStatus === "uploading" && (
                    <div className="upload-progress">
                      <div className="upload-progress-top">
                        <span>Uploading application video...</span>
                        <span>{applyPercent !== null ? `${applyPercent}%` : "..."}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: `${applyPercent ?? 5}%` }} />
                      </div>
                    </div>
                  )}
                  {applyStatus === "confirming" && <div className="notice">Confirming your upload...</div>}
                  {applyStatus === "saving" && <div className="notice">Submitting your application...</div>}
                  {applyStatus === "success" && (
                    <div className="success">Application sent. The recruiter will review your video.</div>
                  )}
                  <div className="panel-actions">
                    <button
                      type="button"
                      className="cta primary"
                      onClick={() => job && handleApplyToJob(job.id)}
                      disabled={
                        !canApplyForSelectedJob ||
                        hasAppliedForSelectedJob ||
                        isApplying ||
                        isActiveRecording ||
                        !applyVideoFile
                      }
                    >
                      {hasAppliedForSelectedJob ? "Applied" : isApplying ? "Applying..." : "Send application"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </>
    );
  }

  if (view === "jobDetail") {
    const job = selectedJob;
    const canApply = canApplyForSelectedJob;
    const hasApplied = hasAppliedForSelectedJob;
    return (
      <>
        {nav}
        <section className="hero">
          <div className="view-pill">{isCandidate ? "Zjob Detail" : "Job Detail"}</div>
          <p className="tag">Zjobly</p>
          {jobsLoading && <p className="hint">Loading jobs...</p>}
          {jobsError && <p className="error">{jobsError}</p>}
          {!job && !jobsLoading && (
            <p className="hint">
              {isCandidate ? "Pick a job from the list to view details." : "Select a job from the list first."}
            </p>
          )}
          {job && (
            <>
              <h1>{job.title}</h1>
              <p className="lede">{job.location}</p>
              <div className="job-detail-meta">
                {(() => {
                  const status = getStatusMeta(job.status);
                  return <span className={`job-status ${status.className}`}>{status.label}</span>;
                })()}
                {job.videoLabel && <span className="job-chip">Video: {job.videoLabel}</span>}
              </div>
              {job.videoUrl || job.playback_url ? (
                <div className="panel">
                  <video
                    className="job-detail-video"
                    src={job.videoUrl || job.playback_url || undefined}
                    controls
                    preload="metadata"
                  />
                </div>
              ) : (
                <div className="panel">
                  <p className="hint">
                    {isCandidate
                      ? "Video is processing or unavailable."
                      : "Video is processing or unavailable. Publish a job with a video to see it here."}
                  </p>
                </div>
              )}
              {job.description && (
                <div className="panel">
                  <h2>Job description</h2>
                  <p>{job.description}</p>
                </div>
              )}
              {job && isCandidate && (
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>{hasApplied ? "Your application" : "Apply to this job"}</h2>
                      <p className="hint">
                        {hasApplied
                          ? "Your application video has been sent to the recruiter."
                          : "Record a short video explaining why this role is a great fit."}
                      </p>
                    </div>
                    {hasApplied && <span className="pill soft">Applied</span>}
                  </div>
                  {!hasApplied && !canApply && (
                    <p className="hint">This job is not open for applications right now.</p>
                  )}
                  {hasApplied ? (
                    <>
                      <p className="hint">Status: Applied</p>
                      {applyVideoUrl ? (
                        <video
                          key={applyVideoUrl}
                          src={applyVideoUrl}
                          className="job-detail-video"
                          controls
                          preload="metadata"
                        />
                      ) : (
                        <p className="hint">Your application video was submitted.</p>
                      )}
                    </>
                  ) : (
                    <>
                      {applyVideoUrl && (
                        <div className="video-preview">
                          <video
                            key={applyVideoUrl}
                            src={applyVideoUrl}
                            className="playback-video"
                            controls
                            preload="metadata"
                          />
                        </div>
                      )}
                      <div className="panel-actions">
                        <button
                          type="button"
                          className="cta primary"
                          onClick={() => setView("apply")}
                          disabled={!canApply}
                        >
                          {applyVideoUrl ? "Continue application" : "Apply with video"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="panel-actions split">
                <button type="button" className="ghost" onClick={() => setView("jobs")}>
                  Back to jobs
                </button>
                {isEmployer && (job.status !== "open" || job.visibility !== "public") && (
                  <button
                    type="button"
                    className="cta secondary"
                    onClick={() => onPublishJob(job.id)}
                    disabled={publishingJobId === job.id}
                  >
                    {publishingJobId === job.id ? "Publishing..." : "Publish job"}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </>
    );
  }

  return null;
}
