import { ReactNode } from "react";
import { formatDateLabel, formatInvitationStatusLabel } from "../helpers";
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

  return (
    <>
      {nav}
      <section className="hero">
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
                      <div className="candidate-meta">Invited {formatDateLabel(invitation.created_at)}</div>
                    </div>
                    <span className={`invitation-status ${invitation.status}`}>
                      {formatInvitationStatusLabel(invitation.status)}
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
                      Status: {formatInvitationStatusLabel(invitation.status)}
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

