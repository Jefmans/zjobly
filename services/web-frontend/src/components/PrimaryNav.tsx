import { useEffect, useState } from "react";
import { UserRole, ViewMode } from "../types";

type NavItem = {
  label: string;
  isActive: boolean;
  onClick: () => void;
};

type Props = {
  view: ViewMode;
  role: UserRole | null;
  sticky?: boolean;
  authUserName?: string | null;
  showAdminConfig?: boolean;
  onGoToAdminConfig?: () => void;
  onLogout?: () => void;
  onHome: () => void;
  onBrowseJobs: () => void;
  onMyApplications: () => void;
  onMyProfile: () => void;
  onMyJobs: () => void;
  onCreateJob: () => void;
  onBrowseCandidates: () => void;
  onFavoriteCandidates: () => void;
  onInvitations: () => void;
};

export function PrimaryNav({
  view,
  role,
  sticky = false,
  authUserName,
  showAdminConfig = false,
  onGoToAdminConfig,
  onLogout,
  onHome,
  onBrowseJobs,
  onMyApplications,
  onMyProfile,
  onMyJobs,
  onCreateJob,
  onBrowseCandidates,
  onFavoriteCandidates,
  onInvitations,
}: Props) {
  const isCandidate = role === "candidate";
  const isEmployer = role === "employer";
  const normalizedUserName = (authUserName || "").trim();
  const truncatedUserName =
    normalizedUserName.length > 30 ? `${normalizedUserName.slice(0, 30)}...` : normalizedUserName;

  const candidateItems: NavItem[] = [
    {
      label: "Browse jobs",
      isActive: view === "jobs" || view === "jobDetail" || view === "apply",
      onClick: onBrowseJobs,
    },
    {
      label: "My applications",
      isActive: view === "applications",
      onClick: onMyApplications,
    },
    {
      label: "My invitations",
      isActive: view === "invitations",
      onClick: onInvitations,
    },
    {
      label: "My profile",
      isActive: view === "profile" || view === "find",
      onClick: onMyProfile,
    },
  ];

  const employerItems: NavItem[] = [
    {
      label: "My jobs",
      isActive: view === "jobs" || view === "jobDetail" || view === "jobMatches",
      onClick: onMyJobs,
    },
    {
      label: "Search candidates",
      isActive: view === "candidates" || view === "candidateDetail",
      onClick: onBrowseCandidates,
    },
    {
      label: "Favorites",
      isActive: view === "candidateFavorites",
      onClick: onFavoriteCandidates,
    },
    {
      label: "Invitations",
      isActive: view === "invitations",
      onClick: onInvitations,
    },
    {
      label: "Create job",
      isActive: view === "create",
      onClick: onCreateJob,
    },
  ];

  const items = isCandidate ? candidateItems : isEmployer ? employerItems : [];
  const hasSessionActions = Boolean(normalizedUserName || onLogout || (showAdminConfig && onGoToAdminConfig));
  const hasMenuContent = items.length > 0 || hasSessionActions;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleLabel = truncatedUserName || (menuOpen ? "Close" : "Menu");

  useEffect(() => {
    setMenuOpen(false);
  }, [view, role, normalizedUserName]);

  const handleItemClick = (onClick: () => void) => {
    onClick();
    setMenuOpen(false);
  };

  return (
    <div className={`primary-nav ${sticky ? "sticky" : ""}`}>
      <button type="button" className="primary-nav-brand" onClick={onHome}>
        <span className="brand-mark" aria-hidden="true" />
        Zjobly
      </button>
      {hasMenuContent && (
        <button
          type="button"
          className={`primary-nav-toggle ${menuOpen ? "open" : ""}`}
          aria-expanded={menuOpen}
          aria-controls="primary-nav-links"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span className="primary-nav-toggle-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="primary-nav-toggle-label" title={normalizedUserName || "Menu"}>
            {menuToggleLabel}
          </span>
        </button>
      )}
      {hasMenuContent && (
        <div id="primary-nav-links" className={`primary-nav-links ${menuOpen ? "open" : ""}`}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`nav-btn ${item.isActive ? "active" : ""}`}
              onClick={() => handleItemClick(item.onClick)}
            >
              {item.label}
            </button>
          ))}

          {hasSessionActions && items.length > 0 && <div className="primary-nav-divider" aria-hidden="true" />}
          {normalizedUserName && (
            <div className="primary-nav-user" title={`Signed in as ${normalizedUserName}`}>
              Signed in as {truncatedUserName}
            </div>
          )}
          {showAdminConfig && onGoToAdminConfig && (
            <button type="button" className="nav-btn" onClick={() => handleItemClick(onGoToAdminConfig)}>
              Admin config
            </button>
          )}
          {onLogout && (
            <button type="button" className="nav-btn" onClick={() => handleItemClick(onLogout)}>
              Log out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
