import { ComponentProps } from 'react';
import { ConfigAdminView } from './ConfigAdminView';
import { ViewMode } from '../types';

type Props = {
  view: ViewMode;
  nav: JSX.Element;
  previewAuthenticated: boolean;
  authError: string | null;
  onStartCandidateFlow: () => void;
  onStartCreateFlow: () => void;
  onOpenVoluntaryAuth: (mode: 'login' | 'register') => void;
  configAdminViewProps: ComponentProps<typeof ConfigAdminView>;
};

export function GeneralAppSection({
  view,
  nav,
  previewAuthenticated,
  authError,
  onStartCandidateFlow,
  onStartCreateFlow,
  onOpenVoluntaryAuth,
  configAdminViewProps,
}: Props) {
  return (
    <>
      {view === 'welcome' && (
        <>
          {nav}
          <div className="welcome-stage">
            <section className="hero welcome">
              <p className="tag">Zjobly</p>
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
      )}

      <ConfigAdminView {...configAdminViewProps} />
    </>
  );
}
