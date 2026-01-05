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
  onCandidates: () => void;
  onFavorites: () => void;
  onInvitations: () => void;
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
  onCandidates,
  onFavorites,
  onInvitations,
  onApplications,
  onRoleChange,
}: Props) {
  const showEmployerNav = role !== "candidate";
  const showCandidateNav = role !== "employer";
  const showBack = view !== "welcome";
  const showMainNav = view !== "welcome";
  const isEmployerJobsView = (view === "jobs" || view === "jobDetail") && role === "employer";
  const isEmployerCandidatesView =
    (view === "candidates" || view === "candidateDetail") && role === "employer";
  const isEmployerFavoritesView = view === "candidateFavorites" && role === "employer";
  const isEmployerInvitationsView = view === "invitations" && role === "employer";
  const isCandidateJobsView =
    (view === "jobs" || view === "jobDetail" || view === "apply") && role === "candidate";
  const isCandidateApplicationsView = view === "applications" && role === "candidate";
  const isCandidateInvitationsView = view === "invitations" && role === "candidate";

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
          <button
            type="button"
            className={`nav-btn ghost ${view === "find" || view === "profile" ? "active" : ""}`}
            onClick={onFind}
          >
            Find Zjob
          </button>
        )}
        <button type="button" className={`nav-btn ghost ${isEmployerJobsView ? "active" : ""}`} onClick={onJobs}>
          Job list
        </button>
        {showEmployerNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isEmployerCandidatesView ? "active" : ""}`}
            onClick={onCandidates}
          >
            Browse candidates
          </button>
        )}
        {showEmployerNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isEmployerFavoritesView ? "active" : ""}`}
            onClick={onFavorites}
          >
            Favorites
          </button>
        )}
        {showEmployerNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isEmployerInvitationsView ? "active" : ""}`}
            onClick={onInvitations}
          >
            Invitations
          </button>
        )}
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
        {showCandidateNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isCandidateInvitationsView ? "active" : ""}`}
            onClick={onInvitations}
          >
            My invitations
          </button>
        )}
        <RoleSelect variant="nav" role={role} onChange={onRoleChange} />
      </div>
    </div>
  );
}
