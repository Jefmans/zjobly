import { ReactNode } from "react";
import { CandidateInvitation, InvitationStatus, UserRole, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  role: UserRole | null;
  invitations: CandidateInvitation[];
  loading: boolean;
  error: string | null;
  updatingIds: Set<string>;
  onUpdateInvitation: (invitationId: string, status: InvitationStatus) => void;
};

export function CandidateInvitationsView({
  view,
  nav,
  role,
  invitations,
  loading,
  error,
  updatingIds,
  onUpdateInvitation,
}: Props) {
  if (view !== "invitations" || role !== "candidate") return null;
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
        <div className="view-pill">My invitations</div>
        <p className="tag">Zjobly</p>
        <h1>Company invitations</h1>
        <p className="lede">Respond to companies showing interest in your profile.</p>
        {error && <p className="error">{error}</p>}
        {loading && <p className="hint">Loading invitations...</p>}
        {!loading && invitations.length === 0 && <p className="hint">No invitations yet.</p>}
        {invitations.length > 0 && (
          <div className="candidate-list">
            {invitations.map((invitation) => {
              const isUpdating = updatingIds.has(invitation.id);
              const companyName = invitation.company?.name || "Company";
              return (
                <div key={invitation.id} className="candidate-card">
                  <div className="candidate-card-header">
                    <div>
                      <div className="candidate-link">{companyName}</div>
                      <div className="candidate-meta">Invited {formatDate(invitation.created_at)}</div>
                    </div>
                    <span className={`invitation-status ${invitation.status}`}>
                      {invitation.status === "pending"
                        ? "Pending"
                        : invitation.status === "accepted"
                        ? "Accepted"
                        : "Rejected"}
                    </span>
                  </div>
                  {invitation.status === "pending" ? (
                    <div className="panel-actions">
                      <button
                        type="button"
                        className="ghost success"
                        onClick={() => onUpdateInvitation(invitation.id, "accepted")}
                        disabled={isUpdating}
                      >
                        {isUpdating ? "Saving..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        className="ghost danger"
                        onClick={() => onUpdateInvitation(invitation.id, "rejected")}
                        disabled={isUpdating}
                      >
                        {isUpdating ? "Saving..." : "Reject"}
                      </button>
                    </div>
                  ) : (
                    <p className="hint">
                      Status: {invitation.status === "accepted" ? "Accepted" : "Rejected"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
