import { ReactNode } from "react";
import { CandidateProfile, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  profile: CandidateProfile | null;
  loading: boolean;
  error: string | null;
  onCreateProfile: () => void;
  onEditProfile: () => void;
  onBrowseJobs: () => void;
};

export function CandidateProfileView({
  view,
  nav,
  profile,
  loading,
  error,
  onCreateProfile,
  onEditProfile,
  onBrowseJobs,
}: Props) {
  if (view !== "profile") return null;

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
        <div className="view-pill">My profile</div>
        <p className="tag">Zjobly</p>
        <h1>Your profile</h1>
        <p className="lede">Keep your details up to date so employers can find you.</p>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <div className="panel">
            <p className="hint">Loading your profile...</p>
          </div>
        ) : profile ? (
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Profile detail</h2>
                <p className="hint">This is what employers see when they browse candidates.</p>
              </div>
              <button type="button" className="ghost" onClick={onEditProfile}>
                Edit profile
              </button>
            </div>
            <div className="detail-row">
              <span className="detail-label">Headline</span>
              <span>{profile.headline || "Candidate profile"}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Location</span>
              <span>{formatLocation(profile)}</span>
            </div>
            {profile.location_details && (
              <>
                {profile.location_details.city && (
                  <div className="detail-row">
                    <span className="detail-label">City</span>
                    <span>{profile.location_details.city}</span>
                  </div>
                )}
                {profile.location_details.region && (
                  <div className="detail-row">
                    <span className="detail-label">Region</span>
                    <span>{profile.location_details.region}</span>
                  </div>
                )}
                {profile.location_details.country && (
                  <div className="detail-row">
                    <span className="detail-label">Country</span>
                    <span>{profile.location_details.country}</span>
                  </div>
                )}
                {profile.location_details.postal_code && (
                  <div className="detail-row">
                    <span className="detail-label">Postal code</span>
                    <span>{profile.location_details.postal_code}</span>
                  </div>
                )}
              </>
            )}
            <div className="detail-row">
              <span className="detail-label">Discoverable</span>
              <span>{profile.discoverable ? "Yes" : "No"}</span>
            </div>
            {profile.summary ? (
              <p className="candidate-summary">{profile.summary}</p>
            ) : (
              <p className="hint">Summary not provided.</p>
            )}
            <div className="panel-actions split">
              <button type="button" className="cta secondary" onClick={onBrowseJobs}>
                Browse jobs
              </button>
              <button type="button" className="cta primary" onClick={onEditProfile}>
                Edit profile
              </button>
            </div>
          </div>
        ) : (
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>No profile yet</h2>
                <p className="hint">Record a quick intro and add your details to get discovered.</p>
              </div>
            </div>
            <div className="panel-actions split">
              <button type="button" className="cta secondary" onClick={onBrowseJobs}>
                Browse jobs
              </button>
              <button type="button" className="cta primary" onClick={onCreateProfile}>
                Create profile
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
