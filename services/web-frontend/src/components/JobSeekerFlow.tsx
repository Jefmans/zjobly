import { ReactNode } from "react";
import { Job, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  jobs: Job[];
  jobsLoading: boolean;
  jobsError: string | null;
  companyId: string | null;
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
  onBackToWelcome: () => void;
  onCreateClick: () => void;
  setView: (v: ViewMode) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  searchResults: Job[];
  searchLoading: boolean;
  searchError: string | null;
};

export function JobSeekerFlow({
  view,
  nav,
  jobs,
  jobsLoading,
  jobsError,
  companyId,
  selectedJobId,
  onSelectJob,
  onBackToWelcome,
  onCreateClick,
  setView,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  searchResults,
  searchLoading,
  searchError,
}: Props) {
  const getStatusMeta = (status: Job["status"]) => {
    if (status === "draft") return { label: "Draft", className: "draft" };
    if (status === "closed") return { label: "Closed", className: "closed" };
    if (status === "open") return { label: "Open", className: "open" };
    return { label: "Published", className: "published" };
  };

  if (view === "find") {
    return (
      <>
        {nav}
        <section className="hero">
          <div className="view-pill">Find Zjob</div>
          <p className="tag">Zjobly</p>
          <h1>Discover an open Zjob</h1>
          <p className="lede">
            Search for roles shared with you. We'll add richer search soon - start with a keyword or a Zjob link.
          </p>
          <div className="search-card">
            <label className="field-label" htmlFor="search">
              Enter a keyword or Zjob link
            </label>
            <div className="search-row">
              <input
                id="search"
                name="search"
                placeholder="e.g., frontend, data, or https://zjob.ly/123"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              <button type="button" className="cta primary" onClick={onSearchSubmit} disabled={searchLoading}>
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>
          {searchError && <p className="error">{searchError}</p>}
          {searchLoading && <p className="hint">Searching jobs...</p>}
          {!searchLoading && searchResults.length > 0 && (
            <div className="jobs-list">
              {searchResults.map((job) => (
                <div key={job.id} className="job-card">
                  <div>
                    <div className="job-title">{job.title}</div>
                    <div className="job-meta">{job.location || "Location TBD"}</div>
                  </div>
                  {(() => {
                    const status = getStatusMeta(job.status);
                    return <div className={`job-status ${status.className}`}>{status.label}</div>;
                  })()}
                </div>
              ))}
            </div>
          )}
          {!searchLoading && !searchError && searchResults.length === 0 && searchQuery && (
            <p className="hint">No matching jobs yet. Try another keyword.</p>
          )}
          {!searchQuery && !searchResults.length && !searchLoading && (
            <p className="hint">Start with a keyword to search public job videos.</p>
          )}
          <div className="welcome-actions">
            <button type="button" className="ghost" onClick={onBackToWelcome}>
              Back to welcome
            </button>
            <button type="button" className="cta primary" onClick={onCreateClick}>
              Create a Zjob instead
            </button>
          </div>
        </section>
      </>
    );
  }

  if (view === "jobs") {
    return (
      <>
        {nav}
        <section className="hero">
          <div className="view-pill">My Jobs</div>
          <p className="tag">Zjobly</p>
          <h1>Your jobs</h1>
          <p className="lede">Click a job to see its details.</p>
          {!companyId && <p className="hint">Set VITE_COMPANY_ID in your .env to load jobs from the API.</p>}
          {jobsError && <p className="error">{jobsError}</p>}
          {jobsLoading && <p className="hint">Loading jobs...</p>}
          {!jobsLoading && !jobsError && jobs.length === 0 && (
            <p className="hint">No jobs yet. Publish one to see it here.</p>
          )}
          <div className="jobs-list">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className="job-card"
                onClick={() => {
                  onSelectJob(job.id);
                  setView("jobDetail");
                }}
              >
                <div>
                  <div className="job-title">{job.title}</div>
                  <div className="job-meta">{job.location}</div>
                </div>
                {(() => {
                  const status = getStatusMeta(job.status);
                  return <div className={`job-status ${status.className}`}>{status.label}</div>;
                })()}
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
          <div className="view-pill">Job Detail</div>
          <p className="tag">Zjobly</p>
          {jobsLoading && <p className="hint">Loading jobs...</p>}
          {jobsError && <p className="error">{jobsError}</p>}
          {!job && !jobsLoading && <p className="hint">Select a job from the list first.</p>}
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
              <div className="panel">
                <p className="hint">Full job description and video preview will appear here.</p>
              </div>
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
