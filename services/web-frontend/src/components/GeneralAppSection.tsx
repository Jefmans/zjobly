type Props = {
  nav: JSX.Element;
  previewAuthenticated: boolean;
  authError: string | null;
  onStartCandidateFlow: () => void;
  onStartCreateFlow: () => void;
  onOpenVoluntaryAuth: (mode: 'login' | 'register') => void;
};

export function GeneralAppSection({
  nav,
  previewAuthenticated,
  authError,
  onStartCandidateFlow,
  onStartCreateFlow,
  onOpenVoluntaryAuth,
}: Props) {
  return (
    <>
      {nav}
      <div className="welcome-stage">
        <section className="hero welcome">
          <h1>Welcome</h1>
          <div className="welcome-actions">
            <button type="button" className="cta primary" onClick={onStartCandidateFlow}>
              Find Zjob
            </button>
            <button type="button" className="cta secondary" onClick={onStartCreateFlow}>
              Create Zjob
            </button>
          </div>
          {!previewAuthenticated && (
            <div className="welcome-auth-line">
              <div className="welcome-auth-links">
                <button
                  type="button"
                  className="welcome-auth-link"
                  onClick={() => onOpenVoluntaryAuth('login')}
                >
                  Login
                </button>
                <span aria-hidden="true">/</span>
                <button
                  type="button"
                  className="welcome-auth-link"
                  onClick={() => onOpenVoluntaryAuth('register')}
                >
                  Register
                </button>
              </div>
            </div>
          )}
          {!previewAuthenticated && authError && <div className="error auth-inline-error">{authError}</div>}
        </section>
      </div>
    </>
  );
}
