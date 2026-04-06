import { Suspense, lazy } from 'react';
import { DevAuthPreviewMode } from '../appStateConfig';
import { AuthUser, CandidateDev, CompanyDev, UserRole, ViewMode } from '../types';
import { PrimaryNav } from './PrimaryNav';

const TopNav = lazy(() =>
  import('./TopNav').then((module) => ({ default: module.TopNav })),
);

type Props = {
  view: ViewMode;
  role: UserRole | null;
  previewAuthenticated: boolean;
  showDevNav: boolean;
  canSeeAdminConfigButton: boolean;
  devAuthPreviewMode: DevAuthPreviewMode;
  authUser: AuthUser | null;
  previewAuthUser: AuthUser | null;
  companyId: string | null;
  devCompanies: CompanyDev[];
  devCompaniesLoading: boolean;
  devCompaniesError: string | null;
  devCandidates: CandidateDev[];
  devCandidatesLoading: boolean;
  devCandidatesError: string | null;
  devUserId: string;
  hideGuestAuthSessionRow: boolean;
  onHome: () => void;
  onBrowseJobs: () => void;
  onMyApplications: () => void;
  onMyProfile: () => void;
  onMyJobs: () => void;
  onCreateJob: () => void;
  onBrowseCandidates: () => void;
  onFavoriteCandidates: () => void;
  onInvitations: () => void;
  onTopNavBack: () => void;
  onTopNavCreate: () => void;
  onTopNavFind: () => void;
  onTopNavJobs: () => void;
  onTopNavBrowseJobs: () => void;
  onTopNavCandidates: () => void;
  onTopNavFavorites: () => void;
  onTopNavInvitations: () => void;
  onTopNavApplications: () => void;
  onTopNavRoleChange: (nextRole: UserRole) => void;
  onAuthPreviewModeChange: (mode: DevAuthPreviewMode) => void;
  onDevCompanyChange: (companyId: string) => void;
  onDevCandidateChange: (userId: string) => void;
  onGoToAdminConfig: () => void;
  onUseRealAuth: () => void;
  onLogout: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

export function AppNavigation({
  view,
  role,
  previewAuthenticated,
  showDevNav,
  canSeeAdminConfigButton,
  devAuthPreviewMode,
  authUser,
  previewAuthUser,
  companyId,
  devCompanies,
  devCompaniesLoading,
  devCompaniesError,
  devCandidates,
  devCandidatesLoading,
  devCandidatesError,
  devUserId,
  hideGuestAuthSessionRow,
  onHome,
  onBrowseJobs,
  onMyApplications,
  onMyProfile,
  onMyJobs,
  onCreateJob,
  onBrowseCandidates,
  onFavoriteCandidates,
  onInvitations,
  onTopNavBack,
  onTopNavCreate,
  onTopNavFind,
  onTopNavJobs,
  onTopNavBrowseJobs,
  onTopNavCandidates,
  onTopNavFavorites,
  onTopNavInvitations,
  onTopNavApplications,
  onTopNavRoleChange,
  onAuthPreviewModeChange,
  onDevCompanyChange,
  onDevCandidateChange,
  onGoToAdminConfig,
  onUseRealAuth,
  onLogout,
  onOpenLogin,
  onOpenRegister,
}: Props) {
  const primaryNavRole = previewAuthenticated ? role : null;

  return (
    <>
      <PrimaryNav
        view={view}
        role={primaryNavRole}
        sticky={!showDevNav}
        onHome={onHome}
        onBrowseJobs={onBrowseJobs}
        onMyApplications={onMyApplications}
        onMyProfile={onMyProfile}
        onMyJobs={onMyJobs}
        onCreateJob={onCreateJob}
        onBrowseCandidates={onBrowseCandidates}
        onFavoriteCandidates={onFavoriteCandidates}
        onInvitations={onInvitations}
      />
      {showDevNav && (
        <div className="dev-nav-wrap">
          <div className="dev-nav-label">Development navigation</div>
          <Suspense fallback={null}>
            <TopNav
              view={view}
              role={role}
              onBack={onTopNavBack}
              onCreate={onTopNavCreate}
              onFind={onTopNavFind}
              onJobs={onTopNavJobs}
              onBrowseJobs={onTopNavBrowseJobs}
              onCandidates={onTopNavCandidates}
              onFavorites={onTopNavFavorites}
              onInvitations={onTopNavInvitations}
              onApplications={onTopNavApplications}
              onRoleChange={onTopNavRoleChange}
            />
          </Suspense>
          <div className="dev-company-row">
            <label htmlFor="devAuthPreviewSelect">Auth preview</label>
            <select
              id="devAuthPreviewSelect"
              value={devAuthPreviewMode}
              onChange={(event) => onAuthPreviewModeChange(event.target.value as DevAuthPreviewMode)}
            >
              <option value="real">Real auth</option>
              <option value="loggedOut">Force logged out</option>
              <option value="loggedIn">Force logged in</option>
            </select>
            <span className="dev-company-meta">
              Real session: {authUser ? authUser.name : 'none'}
              {devAuthPreviewMode === 'loggedIn' && !authUser ? ' | preview only' : ''}
            </span>
          </div>
          <div className="dev-company-row">
            <label htmlFor="devCompanySelect">Company</label>
            <select
              id="devCompanySelect"
              value={companyId ?? ''}
              onChange={(event) => onDevCompanyChange(event.target.value)}
              disabled={devCompaniesLoading}
            >
              <option value="">Select a company</option>
              {devCompanies.map((company) => {
                return (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                );
              })}
            </select>
          </div>
          {devCompaniesError && <p className="error">{devCompaniesError}</p>}
          <div className="dev-company-row">
            <label htmlFor="devCandidateSelect">Candidate</label>
            <select
              id="devCandidateSelect"
              value={devUserId}
              onChange={(event) => onDevCandidateChange(event.target.value)}
              disabled={devCandidatesLoading}
            >
              <option value="">Select a candidate</option>
              {devCandidates.map((candidate) => {
                const headline = candidate.headline || 'Candidate';
                const displayName = headline.length > 20 ? headline.slice(0, 20) : headline;
                return (
                  <option key={candidate.id} value={candidate.user_id}>
                    {displayName}
                  </option>
                );
              })}
            </select>
          </div>
          {devCandidatesError && <p className="error">{devCandidatesError}</p>}
          {canSeeAdminConfigButton && (
            <div className="dev-company-row">
              <button type="button" className="ghost" onClick={onGoToAdminConfig}>
                Admin config panel
              </button>
            </div>
          )}
        </div>
      )}
      {(previewAuthenticated || view !== 'welcome') && !hideGuestAuthSessionRow && (
        <div className="auth-session-row">
          {previewAuthenticated ? (
            <>
              <span className="hint">
                {devAuthPreviewMode === 'loggedIn' && !authUser
                  ? 'Dev preview: logged in (no real session)'
                  : `Signed in as ${previewAuthUser?.name}`}
              </span>
              {canSeeAdminConfigButton && view !== 'adminConfig' && (
                <button type="button" className="ghost" onClick={onGoToAdminConfig}>
                  Admin config
                </button>
              )}
              {devAuthPreviewMode !== 'real' ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={onUseRealAuth}
                >
                  Use real auth
                </button>
              ) : (
                authUser && (
                  <button type="button" className="ghost" onClick={onLogout}>
                    Log out
                  </button>
                )
              )}
            </>
          ) : (
            <>
              <span className="hint">
                {devAuthPreviewMode === 'loggedOut' && authUser
                  ? 'Dev preview: logged out'
                  : 'Browse first. Create an account when you want to save, apply, or contact.'}
              </span>
              {devAuthPreviewMode !== 'real' ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={onUseRealAuth}
                >
                  Use real auth
                </button>
              ) : (
                <>
                  <button type="button" className="ghost" onClick={onOpenLogin}>
                    Login
                  </button>
                  <button
                    type="button"
                    className="cta secondary"
                    onClick={onOpenRegister}
                  >
                    Register
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
