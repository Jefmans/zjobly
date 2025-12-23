import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
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
  const [applyStatus, setApplyStatus] = useState<
    "idle" | "presigning" | "uploading" | "confirming" | "saving" | "success" | "error"
  >("idle");
  const [applyProgress, setApplyProgress] = useState<number | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedJobs, setAppliedJobs] = useState<Record<string, boolean>>({});
  const applyPercent = typeof applyProgress === "number" ? Math.max(0, Math.min(100, applyProgress)) : null;

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
  const resetApplyState = () => {
    if (applyVideoUrl) {
      URL.revokeObjectURL(applyVideoUrl);
    }
    setApplyVideoFile(null);
    setApplyVideoUrl(null);
    setApplyDuration(null);
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
    if (view !== "jobDetail") {
      resetApplyState();
    }
  }, [view]);

  const handleApplyVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setApplyError(null);
    setApplyStatus("idle");
    setApplyProgress(null);

    if (!file) return;
    if (applyVideoUrl) {
      URL.revokeObjectURL(applyVideoUrl);
    }

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
    };
    probe.onerror = () => {
      setApplyError("Could not read video metadata. Try a different file.");
      URL.revokeObjectURL(objectUrl);
    };
    probe.src = objectUrl;
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
        source: "upload",
      });
      setApplyStatus("saving");
      await applyToJob(jobId, { video_object_key: confirmed.object_key || presign.object_key });
      setApplyStatus("success");
      setAppliedJobs((prev) => ({ ...prev, [jobId]: true }));
    } catch (err) {
      console.error(err);
      setApplyStatus("error");
      setApplyError(err instanceof Error ? err.message : "Could not submit your application.");
    }
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

  if (view === "jobDetail") {
    const job = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : undefined;
    const canApply = Boolean(job && isCandidate && job.status === "open" && job.visibility === "public");
    const hasApplied = Boolean(job && appliedJobs[job.id]);
    const isApplying = ["presigning", "uploading", "confirming", "saving"].includes(applyStatus);
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
                  <h2>Apply with a short video</h2>
                  <p className="hint">
                    Record a 1-3 minute video about why you want this job, then upload it here to apply.
                  </p>
                  {!canApply && (
                    <p className="hint">This job is not open for applications right now.</p>
                  )}
                  <div className="upload-box">
                    <input
                      id="application-video"
                      name="application-video"
                      type="file"
                      accept="video/*"
                      onChange={handleApplyVideoChange}
                      disabled={!canApply || hasApplied || isApplying}
                    />
                    <div className="upload-copy">
                      <strong>Select a video file</strong>
                      <span>MP4, MOV, WEBM - up to 3 minutes</span>
                    </div>
                  </div>
                  {applyDuration !== null && (
                    <p className="duration">Video length: {formatDuration(applyDuration)}</p>
                  )}
                  <div className="video-preview">
                    {applyVideoUrl ? (
                      <video
                        key={applyVideoUrl}
                        src={applyVideoUrl}
                        className="playback-video"
                        controls
                        playsInline
                      />
                    ) : (
                      <div className="video-preview-placeholder">
                        <p className="hint">Upload a video to preview it here.</p>
                      </div>
                    )}
                  </div>
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
                      disabled={!canApply || hasApplied || isApplying || !applyVideoFile}
                    >
                      {hasApplied ? "Applied" : isApplying ? "Applying..." : "Apply now"}
                    </button>
                  </div>
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
