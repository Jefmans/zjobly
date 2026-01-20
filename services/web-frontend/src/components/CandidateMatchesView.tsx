import { ReactNode, useEffect, useState } from "react";
import { searchCandidatesForJob } from "../api";
import { CandidateProfile, InvitationStatus, Job, UserRole, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  role: UserRole | null;
  job: Job | null;
  favoriteCandidateIds: Set<string>;
  favoriteUpdatingIds: Set<string>;
  favoritesError: string | null;
  canFavorite: boolean;
  onAddFavorite: (candidateId: string) => void;
  onRemoveFavorite: (candidateId: string) => void;
  invitationStatusByCandidateId: Record<string, InvitationStatus | undefined>;
  inviteUpdatingIds: Set<string>;
  invitationsError: string | null;
  canInvite: boolean;
  onInviteCandidate: (candidateId: string) => void;
  onViewCandidate: (candidate: CandidateProfile) => void;
  onBackToJob: () => void;
};

export function CandidateMatchesView({
  view,
  nav,
  role,
  job,
  favoriteCandidateIds,
  favoriteUpdatingIds,
  favoritesError,
  canFavorite,
  onAddFavorite,
  onRemoveFavorite,
  invitationStatusByCandidateId,
  inviteUpdatingIds,
  invitationsError,
  canInvite,
  onInviteCandidate,
  onViewCandidate,
  onBackToJob,
}: Props) {
  const isEmployer = role === "employer";
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view !== "jobMatches" || !isEmployer || !job?.id) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const results = await searchCandidatesForJob(job.id);
        setCandidates(Array.isArray(results) ? results : []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Could not load matched candidates.");
        setCandidates([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [view, isEmployer, job?.id]);

  const formatLocation = (candidate: CandidateProfile) => {
    if (candidate.location) return candidate.location;
    const details = candidate.location_details;
    if (!details) return "Location not provided";
    const parts = [details.city, details.region, details.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Location not provided";
  };
  const uniqueErrors = Array.from(
    new Set([favoritesError, invitationsError, error].filter(Boolean) as string[]),
  );

  if (view !== "jobMatches") return null;

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Matched candidates</div>
        <p className="tag">Zjobly</p>
        <h1>{job ? `Top matches for ${job.title}` : "Top job matches"}</h1>
        <p className="lede">
          We rank candidates by skills, experience, and proximity to this job.
        </p>
        {!isEmployer ? (
          <div className="panel">
            <p className="hint">Switch to the employer role to view job matches.</p>
          </div>
        ) : !job ? (
          <div className="panel">
            <p className="hint">Select a job first to see matching candidates.</p>
            <div className="panel-actions">
              <button type="button" className="ghost" onClick={onBackToJob}>
                Back to job
              </button>
            </div>
          </div>
        ) : (
          <>
            {!canFavorite && <p className="hint">Select a company to save favorites.</p>}
            {!canInvite && <p className="hint">Select a company to send invitations.</p>}
            {uniqueErrors.map((message) => (
              <p key={message} className="error">
                {message}
              </p>
            ))}
            {loading && <p className="hint">Loading matched candidates...</p>}
            {!loading && !error && candidates.length === 0 && (
              <p className="hint">No matches yet. Try updating the job description or keywords.</p>
            )}
            <div className="candidate-list">
              {candidates.map((candidate) => (
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
                      {(() => {
                        const status = invitationStatusByCandidateId[candidate.id];
                        const isUpdating = inviteUpdatingIds.has(candidate.id);
                        const canSend = canInvite && (!status || status === "rejected") && !isUpdating;
                        const label = isUpdating
                          ? "Sending..."
                          : status === "pending"
                          ? "Invited"
                          : status === "accepted"
                          ? "Accepted"
                          : status === "rejected"
                          ? "Invite again"
                          : "Invite";
                        return (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => onInviteCandidate(candidate.id)}
                            disabled={!canSend}
                          >
                            {label}
                          </button>
                        );
                      })()}
                      {(() => {
                        const isFavorite = favoriteCandidateIds.has(candidate.id);
                        const isUpdating = favoriteUpdatingIds.has(candidate.id);
                        const label = isUpdating
                          ? isFavorite
                            ? "Removing..."
                            : "Saving..."
                          : isFavorite
                          ? "Remove favorite"
                          : "Add to favorites";
                        return (
                          <button
                            type="button"
                            className={`ghost ${isFavorite ? "success" : ""}`}
                            onClick={() =>
                              isFavorite ? onRemoveFavorite(candidate.id) : onAddFavorite(candidate.id)
                            }
                            disabled={!canFavorite || isUpdating}
                          >
                            {label}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  {(() => {
                    const status = invitationStatusByCandidateId[candidate.id];
                    if (!status) return null;
                    return (
                      <span className={`invitation-status ${status}`}>
                        {status === "pending"
                          ? "Pending"
                          : status === "accepted"
                          ? "Accepted"
                          : "Rejected"}
                      </span>
                    );
                  })()}
                  <div className="candidate-meta">{formatLocation(candidate)}</div>
                  {candidate.summary && <p className="candidate-summary">{candidate.summary}</p>}
                </div>
              ))}
            </div>
            <div className="panel-actions">
              <button type="button" className="ghost" onClick={onBackToJob}>
                Back to job
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
