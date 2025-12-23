import { RoleSelect } from "./RoleSelect";
import { UserRole, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  role: UserRole | null;
  onBack: () => void;
  onCreate: () => void;
  onFind: () => void;
  onJobs: () => void;
  onBrowseJobs: () => void;
  onApplications: () => void;
  onRoleChange: (role: UserRole) => void;
};

export function TopNav({
  view,
  role,
  onBack,
  onCreate,
  onFind,
  onJobs,
  onBrowseJobs,
  onApplications,
  onRoleChange,
}: Props) {
  const showEmployerNav = role !== "candidate";
  const showCandidateNav = role !== "employer";
  const showBack = view !== "welcome";
  const showMainNav = view !== "welcome";
  const isEmployerJobsView = (view === "jobs" || view === "jobDetail") && role === "employer";
  const isCandidateJobsView =
    (view === "jobs" || view === "jobDetail" || view === "apply") && role === "candidate";
  const isCandidateApplicationsView = view === "applications" && role === "candidate";

  return (
    <div className="top-nav">
      {showBack && (
        <button type="button" className="link-btn" onClick={onBack}>
          Back
        </button>
      )}
      <div className="nav-actions">
        {showMainNav && showEmployerNav && (
          <button type="button" className={`nav-btn ${view === "create" ? "active" : ""}`} onClick={onCreate}>
            Create Zjob
          </button>
        )}
        {showMainNav && showCandidateNav && (
          <button type="button" className={`nav-btn ghost ${view === "find" ? "active" : ""}`} onClick={onFind}>
            Find Zjob
          </button>
        )}
        <button type="button" className={`nav-btn ghost ${isEmployerJobsView ? "active" : ""}`} onClick={onJobs}>
          Job list
        </button>
        <button
          type="button"
          className={`nav-btn ghost ${isCandidateJobsView ? "active" : ""}`}
          onClick={onBrowseJobs}
        >
          Browse jobs
        </button>
        {showCandidateNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isCandidateApplicationsView ? "active" : ""}`}
            onClick={onApplications}
          >
            My applications
          </button>
        )}
        <RoleSelect variant="nav" role={role} onChange={onRoleChange} />
      </div>
    </div>
  );
}
