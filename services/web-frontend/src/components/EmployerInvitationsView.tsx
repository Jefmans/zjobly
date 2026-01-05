import { ReactNode } from "react";
import { CandidateInvitation, CandidateProfile, UserRole, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  role: UserRole | null;
  invitations: CandidateInvitation[];
  loading: boolean;
  error: string | null;
  canInvite: boolean;
  onViewCandidate: (candidate: CandidateProfile) => void;
};

export function EmployerInvitationsView({
  view,
  nav,
  role,
  invitations,
  loading,
  error,
  canInvite,
  onViewCandidate,
}: Props) {
  if (view !== "invitations" || role !== "employer") return null;
  const formatLocation = (candidate: CandidateProfile) => {
    if (candidate.location) return candidate.location;
    const details = candidate.location_details;
    if (!details) return "Location not provided";
    const parts = [details.city, details.region, details.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Location not provided";
  };
  const formatDate = (value?: string) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Candidate invitations</div>
        <p className="tag">Zjobly</p>
        <h1>Invitations</h1>
        <p className="lede">Track candidate interest and responses.</p>
        {!canInvite ? (
          <div className="panel">
            <p className="hint">Select a company to view invitations.</p>
          </div>
        ) : (
          <>
            {error && <p className="error">{error}</p>}
            {loading && <p className="hint">Loading invitations...</p>}
            {!loading && invitations.length === 0 && (
              <p className="hint">No invitations sent yet.</p>
            )}
            {invitations.length > 0 && (
              <div className="candidate-list">
                {invitations.map((invitation) => {
                  const candidate = invitation.candidate_profile;
                  if (!candidate) return null;
                  return (
                    <div key={invitation.id} className="candidate-card">
                      <div className="candidate-card-header">
                        <button
                          type="button"
                          className="candidate-link"
                          onClick={() => onViewCandidate(candidate)}
                        >
                          {candidate.headline || "Candidate profile"}
                        </button>
                        <span className={`invitation-status ${invitation.status}`}>
                          {invitation.status === "pending"
                            ? "Pending"
                            : invitation.status === "accepted"
                            ? "Accepted"
                            : "Rejected"}
                        </span>
                      </div>
                      <div className="candidate-meta">{formatLocation(candidate)}</div>
                      <p className="hint">Invited {formatDate(invitation.created_at)}</p>
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
