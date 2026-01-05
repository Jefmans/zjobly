import { ReactNode } from "react";
import { filterKeywordsByLocation } from "../helpers";
import { CandidateProfile, InvitationStatus, UserRole, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  role: UserRole | null;
  candidate: CandidateProfile | null;
  onBack: () => void;
  backLabel?: string;
  canFavorite: boolean;
  isFavorite: boolean;
  favoriteUpdating: boolean;
  favoritesError: string | null;
  onToggleFavorite: () => void;
  invitationStatus: InvitationStatus | null;
  invitationUpdating: boolean;
  invitationsError: string | null;
  canInvite: boolean;
  onInvite: () => void;
};

export function CandidateDetailView({
  view,
  nav,
  role,
  candidate,
  onBack,
  backLabel = "Back",
  canFavorite,
  isFavorite,
  favoriteUpdating,
  favoritesError,
  onToggleFavorite,
  invitationStatus,
  invitationUpdating,
  invitationsError,
  canInvite,
  onInvite,
}: Props) {
  if (view !== "candidateDetail") return null;

  const isEmployer = role === "employer";
  const formatLocation = (profile: CandidateProfile) => {
    if (profile.location) return profile.location;
    const details = profile.location_details;
    if (!details) return "Location not provided";
    const parts = [details.city, details.region, details.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Location not provided";
  };
  const keywords = candidate ? filterKeywordsByLocation(candidate.keywords, candidate.location) : [];

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Candidate profile</div>
        <p className="tag">Zjobly</p>
        <h1>Candidate profile</h1>
        <p className="lede">Review the candidate details and intro video.</p>
        {favoritesError && isEmployer && <p className="error">{favoritesError}</p>}
        {invitationsError && isEmployer && <p className="error">{invitationsError}</p>}
        {!isEmployer ? (
          <div className="panel">
            <p className="hint">Switch to the employer role to browse candidates.</p>
            <div className="panel-actions">
              <button type="button" className="ghost" onClick={onBack}>
                {backLabel}
              </button>
            </div>
          </div>
        ) : !candidate ? (
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>No candidate selected</h2>
                <p className="hint">Choose a candidate from the search results.</p>
              </div>
              <div className="panel-header-actions">
                <button type="button" className="ghost" onClick={onBack}>
                  {backLabel}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>{candidate.headline || "Candidate profile"}</h2>
                  <p className="hint">Full candidate profile details.</p>
                </div>
                <div className="panel-header-actions">
                  <button type="button" className="ghost" onClick={onBack}>
                    {backLabel}
                  </button>
                  {invitationStatus && (
                    <span className={`invitation-status ${invitationStatus}`}>
                      {invitationStatus === "pending"
                        ? "Pending"
                        : invitationStatus === "accepted"
                        ? "Accepted"
                        : "Rejected"}
                    </span>
                  )}
                  <button
                    type="button"
                    className="ghost"
                    onClick={onInvite}
                    disabled={
                      !canInvite ||
                      invitationUpdating ||
                      (invitationStatus !== null && invitationStatus !== "rejected")
                    }
                  >
                    {invitationUpdating
                      ? "Sending..."
                      : invitationStatus === "pending"
                      ? "Invited"
                      : invitationStatus === "accepted"
                      ? "Accepted"
                      : invitationStatus === "rejected"
                      ? "Invite again"
                      : "Invite"}
                  </button>
                  <button
                    type="button"
                    className={`ghost ${isFavorite ? "success" : ""}`}
                    onClick={onToggleFavorite}
                    disabled={!canFavorite || favoriteUpdating}
                  >
                    {favoriteUpdating
                      ? isFavorite
                        ? "Removing..."
                        : "Saving..."
                      : isFavorite
                      ? "Remove favorite"
                      : "Add to favorites"}
                  </button>
                </div>
              </div>
              <div className="detail-row">
                <span className="detail-label">Headline</span>
                <span>{candidate.headline || "Candidate profile"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Location</span>
                <span>{formatLocation(candidate)}</span>
              </div>
              {candidate.location_details && (
                <>
                  {candidate.location_details.city && (
                    <div className="detail-row">
                      <span className="detail-label">City</span>
                      <span>{candidate.location_details.city}</span>
                    </div>
                  )}
                  {candidate.location_details.region && (
                    <div className="detail-row">
                      <span className="detail-label">Region</span>
                      <span>{candidate.location_details.region}</span>
                    </div>
                  )}
                  {candidate.location_details.country && (
                    <div className="detail-row">
                      <span className="detail-label">Country</span>
                      <span>{candidate.location_details.country}</span>
                    </div>
                  )}
                  {candidate.location_details.postal_code && (
                    <div className="detail-row">
                      <span className="detail-label">Postal code</span>
                      <span>{candidate.location_details.postal_code}</span>
                    </div>
                  )}
                </>
              )}
              <div className="detail-row">
                <span className="detail-label">Discoverable</span>
                <span>{candidate.discoverable ? "Yes" : "No"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Keywords</span>
                {keywords.length > 0 ? (
                  <div className="keyword-chips">
                    {keywords.map((keyword, index) => (
                      <span key={`candidate-keyword-${index}`} className="keyword-chip">
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span>None</span>
                )}
              </div>
              {candidate.summary ? (
                <p className="candidate-summary">{candidate.summary}</p>
              ) : (
                <p className="hint">Summary not provided.</p>
              )}
            </div>
            <div className="panel">
              <h2>Profile video</h2>
              {candidate.playback_url ? (
                <video
                  key={candidate.playback_url}
                  src={candidate.playback_url}
                  className="job-detail-video"
                  controls
                  preload="metadata"
                />
              ) : (
                <p className="hint">Profile video is unavailable.</p>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}
