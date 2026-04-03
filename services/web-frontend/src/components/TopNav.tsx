import { useEffect, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const showEmployerNav = role !== "candidate";
  const showCandidateNav = role !== "employer";
  const showBack = view !== "welcome";
  const showMainNav = view !== "welcome";
  const isEmployerJobsView =
    (view === "jobs" || view === "jobDetail" || view === "jobMatches") && role === "employer";
  const isEmployerCandidatesView =
    (view === "candidates" || view === "candidateDetail") && role === "employer";
  const isEmployerFavoritesView = view === "candidateFavorites" && role === "employer";
  const isEmployerInvitationsView = view === "invitations" && role === "employer";
  const isCandidateJobsView =
    (view === "jobs" || view === "jobDetail" || view === "apply") && role === "candidate";
  const isCandidateApplicationsView = view === "applications" && role === "candidate";
  const isCandidateInvitationsView = view === "invitations" && role === "candidate";
  const handleNavClick = (action: () => void) => {
    action();
    setMenuOpen(false);
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [view, role]);

  return (
    <div className="top-nav">
      {showBack && (
        <button type="button" className="link-btn" onClick={onBack}>
          Back
        </button>
      )}
      <button
        type="button"
        className={`top-nav-toggle ${menuOpen ? "open" : ""}`}
        aria-expanded={menuOpen}
        aria-controls="top-nav-actions"
        aria-label={menuOpen ? "Close top navigation menu" : "Open top navigation menu"}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <span className="top-nav-toggle-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="top-nav-toggle-label">{menuOpen ? "Close" : "Menu"}</span>
      </button>
      <div id="top-nav-actions" className={`nav-actions top-nav-actions ${menuOpen ? "open" : ""}`}>
        {showMainNav && showEmployerNav && (
          <button
            type="button"
            className={`nav-btn ${view === "create" ? "active" : ""}`}
            onClick={() => handleNavClick(onCreate)}
          >
            Create Zjob
          </button>
        )}
        {showMainNav && showCandidateNav && (
          <button
            type="button"
            className={`nav-btn ghost ${view === "find" || view === "profile" ? "active" : ""}`}
            onClick={() => handleNavClick(onFind)}
          >
            Find Zjob
          </button>
        )}
        <button
          type="button"
          className={`nav-btn ghost ${isEmployerJobsView ? "active" : ""}`}
          onClick={() => handleNavClick(onJobs)}
        >
          Job list
        </button>
        {showEmployerNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isEmployerCandidatesView ? "active" : ""}`}
            onClick={() => handleNavClick(onCandidates)}
          >
            Browse candidates
          </button>
        )}
        {showEmployerNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isEmployerFavoritesView ? "active" : ""}`}
            onClick={() => handleNavClick(onFavorites)}
          >
            Favorites
          </button>
        )}
        {showEmployerNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isEmployerInvitationsView ? "active" : ""}`}
            onClick={() => handleNavClick(onInvitations)}
          >
            Invitations
          </button>
        )}
        <button
          type="button"
          className={`nav-btn ghost ${isCandidateJobsView ? "active" : ""}`}
          onClick={() => handleNavClick(onBrowseJobs)}
        >
          Browse jobs
        </button>
        {showCandidateNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isCandidateApplicationsView ? "active" : ""}`}
            onClick={() => handleNavClick(onApplications)}
          >
            My applications
          </button>
        )}
        {showCandidateNav && (
          <button
            type="button"
            className={`nav-btn ghost ${isCandidateInvitationsView ? "active" : ""}`}
            onClick={() => handleNavClick(onInvitations)}
          >
            My invitations
          </button>
        )}
        <RoleSelect
          variant="nav"
          role={role}
          onChange={(nextRole) => {
            onRoleChange(nextRole);
            setMenuOpen(false);
          }}
        />
      </div>
    </div>
  );
}
