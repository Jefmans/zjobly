import { CSSProperties, FormEvent, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AuthPromptState } from '../appStateConfig';

type Props = {
  overlayHost: Element | null;
  candidatePostAuthOverlay: boolean;
  candidatePostAuthOverlayMessage: string;
  authPrompt: AuthPromptState | null;
  authOverlayCardInlineStyle: CSSProperties;
  authSubmitting: boolean;
  authMode: 'login' | 'register';
  authName: string;
  authPassword: string;
  authError: string | null;
  onCloseAuthPrompt: () => void;
  onAuthSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleAuthMode: () => void;
  onAuthNameChange: (value: string) => void;
  onAuthPasswordChange: (value: string) => void;
};

export function AuthOverlays({
  overlayHost,
  candidatePostAuthOverlay,
  candidatePostAuthOverlayMessage,
  authPrompt,
  authOverlayCardInlineStyle,
  authSubmitting,
  authMode,
  authName,
  authPassword,
  authError,
  onCloseAuthPrompt,
  onAuthSubmit,
  onToggleAuthMode,
  onAuthNameChange,
  onAuthPasswordChange,
}: Props) {
  const overlayOpen = Boolean(candidatePostAuthOverlay || authPrompt);

  useEffect(() => {
    if (!overlayOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverflowX = html.style.overflowX;
    const prevHtmlOverscrollBehaviorX = html.style.overscrollBehaviorX;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverflowX = body.style.overflowX;
    const prevBodyOverscrollBehaviorX = body.style.overscrollBehaviorX;
    const prevBodyTouchAction = body.style.touchAction;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyWidth = body.style.width;
    const prevBodyMaxWidth = body.style.maxWidth;

    // Reset any residual horizontal offset before locking the viewport.
    window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    html.scrollLeft = 0;
    body.scrollLeft = 0;

    html.style.overflow = 'hidden';
    html.style.overflowX = 'hidden';
    html.style.overscrollBehaviorX = 'none';

    // iOS-safe modal lock: pin body to viewport while preserving vertical position.
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.maxWidth = '100%';
    body.style.overflow = 'hidden';
    body.style.overflowX = 'hidden';
    body.style.overscrollBehaviorX = 'none';
    body.style.touchAction = 'pan-y';

    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overflowX = prevHtmlOverflowX;
      html.style.overscrollBehaviorX = prevHtmlOverscrollBehaviorX;
      body.style.overflow = prevBodyOverflow;
      body.style.overflowX = prevBodyOverflowX;
      body.style.overscrollBehaviorX = prevBodyOverscrollBehaviorX;
      body.style.touchAction = prevBodyTouchAction;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      body.style.maxWidth = prevBodyMaxWidth;
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    };
  }, [overlayOpen]);

  return (
    <>
      {overlayHost &&
        candidatePostAuthOverlay &&
        createPortal(
          <div
            className="auth-overlay"
            role="status"
            aria-live="polite"
            aria-label="Preparing profile details"
          >
            <div className="panel auth-overlay-card" style={authOverlayCardInlineStyle}>
              <div className="panel-header">
                <div>
                  <h2>Preparing your profile</h2>
                  <p className="hint">Please wait while we finish your video and open profile details.</p>
                </div>
              </div>
              <div className="notice notice-with-spinner">
                <span className="inline-spinner" aria-hidden="true" />
                <span>{candidatePostAuthOverlayMessage}</span>
              </div>
            </div>
          </div>,
          overlayHost,
        )}

      {overlayHost &&
        authPrompt &&
        !candidatePostAuthOverlay &&
        createPortal(
          <div
            className="auth-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="authPromptTitle"
          >
            <div className="panel auth-overlay-card" style={authOverlayCardInlineStyle}>
              <div className="panel-header">
                <div>
                  <h2 id="authPromptTitle">{authPrompt.title}</h2>
                  <p className="hint">{authPrompt.message}</p>
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={onCloseAuthPrompt}
                  disabled={authSubmitting}
                >
                  Not now
                </button>
              </div>
              <form className="upload-form auth-form" onSubmit={onAuthSubmit}>
                <div className="field">
                  <label htmlFor="authName">Name</label>
                  <input
                    id="authName"
                    name="authName"
                    value={authName}
                    onChange={(event) => onAuthNameChange(event.target.value)}
                    autoComplete="username"
                    placeholder="Your name"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="authPassword">Password</label>
                  <input
                    id="authPassword"
                    name="authPassword"
                    type="password"
                    value={authPassword}
                    onChange={(event) => onAuthPasswordChange(event.target.value)}
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                  />
                </div>
                {authError && <div className="error">{authError}</div>}
                <div className="panel-actions split">
                  <button
                    type="button"
                    className="ghost"
                    onClick={onToggleAuthMode}
                    disabled={authSubmitting}
                  >
                    {authMode === 'login' ? 'Need an account?' : 'Already have an account?'}
                  </button>
                  <button type="submit" className="cta primary" disabled={authSubmitting}>
                    {authSubmitting ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Create account'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          overlayHost,
        )}
    </>
  );
}
