import { ReactNode } from "react";
import { CandidateProfile, UserRole, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  role: UserRole | null;
  favorites: CandidateProfile[];
  loading: boolean;
  error: string | null;
  canFavorite: boolean;
  favoriteUpdatingIds: Set<string>;
  onViewCandidate: (candidate: CandidateProfile) => void;
  onRemoveFavorite: (candidateId: string) => void;
};

export function CandidateFavoritesView({
  view,
  nav,
  role,
  favorites,
  loading,
  error,
  canFavorite,
  favoriteUpdatingIds,
  onViewCandidate,
  onRemoveFavorite,
}: Props) {
  if (view !== "candidateFavorites") return null;

  const isEmployer = role === "employer";
  const formatLocation = (candidate: CandidateProfile) => {
    if (candidate.location) return candidate.location;
    const details = candidate.location_details;
    if (!details) return "Location not provided";
    const parts = [details.city, details.region, details.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Location not provided";
  };

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Favorite candidates</div>
        <p className="tag">Zjobly</p>
        <h1>Saved candidates</h1>
        <p className="lede">Keep track of top profiles to revisit quickly.</p>
        {!isEmployer ? (
          <div className="panel">
            <p className="hint">Switch to the employer role to manage favorites.</p>
          </div>
        ) : !canFavorite ? (
          <div className="panel">
            <p className="hint">Select a company to load your favorite candidates.</p>
          </div>
        ) : (
          <>
            {error && <p className="error">{error}</p>}
            {loading && <p className="hint">Loading favorite candidates...</p>}
            {!loading && favorites.length === 0 && (
              <p className="hint">No favorite candidates yet. Save candidates from the search view.</p>
            )}
            {favorites.length > 0 && (
              <div className="candidate-list">
                {favorites.map((candidate) => {
                  const isUpdating = favoriteUpdatingIds.has(candidate.id);
                  return (
                    <div key={candidate.id} className="candidate-card">
                      <div className="candidate-card-header">
                        <button
                          type="button"
                          className="candidate-link"
                          onClick={() => onViewCandidate(candidate)}
                        >
                          {candidate.headline || "Candidate profile"}
                        </button>
                        <div className="candidate-card-actions">
                          <button
                            type="button"
                            className="ghost danger"
                            onClick={() => onRemoveFavorite(candidate.id)}
                            disabled={isUpdating}
                          >
                            {isUpdating ? "Removing..." : "Remove favorite"}
                          </button>
                        </div>
                      </div>
                      <div className="candidate-meta">{formatLocation(candidate)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
