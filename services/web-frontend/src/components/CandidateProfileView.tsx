import { ReactNode } from "react";
import {
  formatLocationLabel,
  getDetailedSignalStructuredDataForDisplay,
  getDetailedSignalTranscriptText,
  resolveDetailedSignalDisplayModes,
} from "../helpers";
import { CandidateDetailedSignal, CandidateProfile, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  profile: CandidateProfile | null;
  keywords: string[];
  videoUrl: string | null;
  loading: boolean;
  error: string | null;
  onCreateProfile: () => void;
  onCreateDetailedProfile: () => void;
  onEditProfile: () => void;
  onBrowseJobs: () => void;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const formatStructuredLabel = (key: string): string =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatStructuredPrimitive = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const getArrayObjectColumns = (rows: Record<string, unknown>[]): string[] => {
  const columns: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!columns.includes(key)) columns.push(key);
    });
  });
  return columns;
};

const renderStructuredValuePreview = (value: unknown, keyPrefix: string): ReactNode => {
  if (Array.isArray(value)) {
    const objectRows = value.filter(isPlainRecord);
    if (objectRows.length === value.length && objectRows.length > 0) {
      const columns = getArrayObjectColumns(objectRows);
      if (columns.length === 0) {
        return <p className="hint">No structured properties yet.</p>;
      }
      return (
        <div className="structured-table-wrap">
          <table className="structured-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={`${keyPrefix}-${column}`}>{formatStructuredLabel(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {objectRows.map((row, rowIndex) => (
                <tr key={`${keyPrefix}-row-${rowIndex}`}>
                  {columns.map((column) => (
                    <td key={`${keyPrefix}-${rowIndex}-${column}`}>
                      {formatStructuredPrimitive(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (value.length === 0) {
      return <p className="hint">No values yet.</p>;
    }
    return (
      <div className="structured-object-list">
        {value.map((item, index) => (
          <div className="field structured-editor-field" key={`${keyPrefix}-item-${index}`}>
            <label>Item {index + 1}</label>
            {renderStructuredValuePreview(item, `${keyPrefix}-item-${index}`)}
          </div>
        ))}
      </div>
    );
  }

  if (isPlainRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <p className="hint">No structured properties yet.</p>;
    }
    return (
      <div className="structured-object-list">
        {entries.map(([key, nestedValue]) => (
          <div className="field structured-editor-field" key={`${keyPrefix}-${key}`}>
            <label>{formatStructuredLabel(key)}</label>
            {renderStructuredValuePreview(nestedValue, `${keyPrefix}-${key}`)}
          </div>
        ))}
      </div>
    );
  }

  return <p className="review-signal-value">{formatStructuredPrimitive(value)}</p>;
};

export function CandidateProfileView({
  view,
  nav,
  profile,
  keywords,
  videoUrl,
  loading,
  error,
  onCreateProfile,
  onCreateDetailedProfile,
  onEditProfile,
  onBrowseJobs,
}: Props) {
  if (view !== "profile") return null;
  const resolvedVideoUrl = profile?.playback_url || videoUrl;
  const detailedSignals = (profile?.detailed_signals || []).filter(
    (signal): signal is CandidateDetailedSignal =>
      Boolean(signal?.question_id && signal?.goal && signal?.value),
  );

  return (
    <>
      {nav}
      <section className="hero">
        <h1>Your profile</h1>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <div className="panel">
            <p className="hint">Loading your profile...</p>
          </div>
        ) : profile ? (
          <>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Details</h2>
                </div>
                <div className="panel-header-actions">
                  <span className="pill soft">
                    {profile.discoverable ? "Profile visible" : "Profile not visible"}
                  </span>
                </div>
              </div>
              <div className="detail-row">
                <span className="detail-label">Headline</span>
                <span>{profile.headline || "Candidate profile"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Location</span>
                <span>{formatLocationLabel(profile)}</span>
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
                <div className="panel-action-right">
                  <button type="button" className="cta secondary" onClick={onCreateDetailedProfile}>
                    Build detailed profile
                  </button>
                  <button type="button" className="cta primary" onClick={onEditProfile}>
                    Edit profile
                  </button>
                </div>
              </div>
            </div>

            <div className="panel">
              <h2>Intro video</h2>
              {resolvedVideoUrl ? (
                <video
                  key={resolvedVideoUrl}
                  src={resolvedVideoUrl}
                  className="job-detail-video"
                  controls
                  preload="metadata"
                />
              ) : (
                <p className="hint">No intro video available yet.</p>
              )}
            </div>

            <div className="panel">
              <h2>Keywords</h2>
              {keywords.length > 0 ? (
                <div className="keyword-chips">
                  {keywords.map((keyword, index) => (
                    <span key={`candidate-keyword-${index}`} className="keyword-chip">
                      {keyword}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="hint">No keywords available yet.</p>
              )}
            </div>

            <div className="panel">
              <h2>Detailed profile data</h2>
              {detailedSignals.length > 0 ? (
                <div className="review-detail-signals">
                  {detailedSignals.map((signal, index) => (
                    (() => {
                      const displayModes = resolveDetailedSignalDisplayModes(signal.display);
                      const showSummary = displayModes.includes("summary");
                      const showTranscript = displayModes.includes("transcript");
                      const showStructured = displayModes.includes("structured");
                      const transcriptText = showTranscript ? getDetailedSignalTranscriptText(signal) : "";
                      const structuredData = getDetailedSignalStructuredDataForDisplay(signal.structured_data);
                      return (
                        <div
                          key={`profile-detailed-signal-${signal.question_id}-${signal.goal}-${index}`}
                          className="review-signal-card"
                        >
                          <div className="review-signal-header">
                            <span className="pill soft">{signal.goal}</span>
                            <span className="hint">{signal.signal_key || signal.question_id}</span>
                          </div>
                          {signal.question_text && <p className="hint review-signal-question">{signal.question_text}</p>}
                          {showSummary && <p className="review-signal-value">{signal.value}</p>}
                          {showTranscript && (
                            <div className="field">
                              <label>Transcript</label>
                              <p className="review-signal-value">{transcriptText || "-"}</p>
                            </div>
                          )}
                          {showStructured && structuredData && (
                            <div className="field">
                              <label>Structured data</label>
                              <div className="structured-editor">
                                {renderStructuredValuePreview(
                                  structuredData,
                                  `profile-detailed-signal-${signal.question_id}-${signal.goal}-${index}`,
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ))}
                </div>
              ) : (
                <p className="hint">No detailed signals available yet.</p>
              )}
            </div>
            <div className="panel-actions">
              <button type="button" className="cta primary" onClick={onEditProfile}>
                Edit profile
              </button>
            </div>
          </>
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
