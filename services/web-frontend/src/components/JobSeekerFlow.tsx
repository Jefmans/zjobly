import { ReactNode, useMemo, useState } from "react";
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
};

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
}: Props) {
  const [sortBy, setSortBy] = useState("created_desc");
  const isCandidate = role === "candidate";

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
              <button
                key={job.id}
                type="button"
                className="job-card"
                onClick={() => {
                  onSelectJob(job.id);
                  setView("jobDetail");
                }}
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
                </div>
              </button>
            ))}
          </div>
        </section>
      </>
    );
  }

  if (view === "jobDetail") {
    const job = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : undefined;
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
              <div className="panel-actions">
                <button type="button" className="ghost" onClick={() => setView("jobs")}>
                  Back to jobs
                </button>
              </div>
            </>
          )}
        </section>
      </>
    );
  }

  return null;
}
