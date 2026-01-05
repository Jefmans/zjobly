import { UserRole, ViewMode } from "../types";

type NavItem = {
  label: string;
  isActive: boolean;
  onClick: () => void;
};

type Props = {
  view: ViewMode;
  role: UserRole | null;
  onHome: () => void;
  onBrowseJobs: () => void;
  onMyApplications: () => void;
  onMyProfile: () => void;
  onMyJobs: () => void;
  onCreateJob: () => void;
  onBrowseCandidates: () => void;
  onFavoriteCandidates: () => void;
  onStartCandidate: () => void;
  onStartEmployer: () => void;
};

export function PrimaryNav({
  view,
  role,
  onHome,
  onBrowseJobs,
  onMyApplications,
  onMyProfile,
  onMyJobs,
  onCreateJob,
  onBrowseCandidates,
  onFavoriteCandidates,
  onStartCandidate,
  onStartEmployer,
}: Props) {
  const isCandidate = role === "candidate";
  const isEmployer = role === "employer";

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
      label: "My profile",
      isActive: view === "profile" || view === "find",
      onClick: onMyProfile,
    },
  ];

  const employerItems: NavItem[] = [
    {
      label: "My jobs",
      isActive: view === "jobs" || view === "jobDetail",
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
      label: "Create job",
      isActive: view === "create",
      onClick: onCreateJob,
    },
  ];

  const items = isCandidate ? candidateItems : isEmployer ? employerItems : [];

  return (
    <div className="primary-nav">
      <button type="button" className="primary-nav-brand" onClick={onHome}>
        <span className="brand-mark" aria-hidden="true" />
        Zjobly
      </button>
      <div className="primary-nav-links">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`nav-btn ${item.isActive ? "active" : ""}`}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
        {!role && (
          <div className="primary-nav-cta">
            <button type="button" className="nav-btn primary" onClick={onStartCandidate}>
              Find Zjob
            </button>
            <button type="button" className="nav-btn" onClick={onStartEmployer}>
              Create Zjob
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
