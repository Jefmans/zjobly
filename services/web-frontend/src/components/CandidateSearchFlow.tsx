import { ChangeEvent, FormEvent, ReactNode, useEffect, useState } from "react";
import { searchCandidates } from "../api";
import { filterKeywordsByLocation } from "../helpers";
import { CandidateProfile, UserRole, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  role: UserRole | null;
  selectedCandidate: CandidateProfile | null;
  onSelectCandidate: (candidate: CandidateProfile | null) => void;
  onBackToResults: () => void;
};

export function CandidateSearchFlow({
  view,
  nav,
  role,
  selectedCandidate,
  onSelectCandidate,
  onBackToResults,
}: Props) {
  const isEmployer = role === "employer";
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (term?: string, preserveSelection?: boolean) => {
    setLoading(true);
    setError(null);
    if (!preserveSelection) {
      onSelectCandidate(null);
    }
    try {
      const trimmed = (term ?? "").trim();
      const results = await searchCandidates(trimmed ? trimmed : undefined);
      setCandidates(Array.isArray(results) ? results : []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not load candidates.");
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view !== "candidates" || !isEmployer) return;
    void runSearch(undefined, Boolean(selectedCandidate));
  }, [view, isEmployer]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isEmployer) return;
    void runSearch(query);
  };

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const handleSelectCandidate = (candidate: CandidateProfile) => {
    onSelectCandidate(candidate);
  };

  const handleBackToResults = () => {
    onBackToResults();
  };

  const formatLocation = (candidate: CandidateProfile) => {
    if (candidate.location) return candidate.location;
    const details = candidate.location_details;
    if (!details) return "Location not provided";
    const parts = [details.city, details.region, details.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Location not provided";
  };
  const resolveKeywords = (candidate: CandidateProfile) =>
    filterKeywordsByLocation(candidate.keywords, candidate.location);
  const selectedCandidateKeywords = selectedCandidate ? resolveKeywords(selectedCandidate) : [];

  if (view !== "candidates") return null;

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Find Candidates</div>
        <p className="tag">Zjobly</p>
        <h1>Search candidates</h1>
        <p className="lede">Find candidates by headline and review their profiles.</p>
        {!isEmployer ? (
          <div className="panel">
            <p className="hint">Switch to the employer role to search candidates.</p>
          </div>
        ) : (
          <>
            <form className="search-card" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="candidateSearch">Search by headline</label>
                <div className="search-row">
                  <input
                    id="candidateSearch"
                    name="candidateSearch"
                    value={query}
                    onChange={handleQueryChange}
                    placeholder="e.g., Backend engineer, Product designer"
                  />
                  <button type="submit" disabled={loading}>
                    {loading ? "Searching..." : "Search"}
                  </button>
                </div>
              </div>
            </form>
            {error && <p className="error">{error}</p>}
            {loading && <p className="hint">Loading candidates...</p>}
            {!loading && !error && candidates.length === 0 && (
              <p className="hint">No candidates found. Try a different search.</p>
            )}
            {selectedCandidate ? (
              <>
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Candidate profile</h2>
                      <p className="hint">Review the candidate details below.</p>
                    </div>
                    <button type="button" className="ghost" onClick={handleBackToResults}>
                      Back to results
                    </button>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Headline</span>
                    <span>{selectedCandidate.headline || "Candidate profile"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Location</span>
                    <span>{formatLocation(selectedCandidate)}</span>
                  </div>
                  {selectedCandidate.location_details && (
                    <>
                      {selectedCandidate.location_details.city && (
                        <div className="detail-row">
                          <span className="detail-label">City</span>
                          <span>{selectedCandidate.location_details.city}</span>
                        </div>
                      )}
                      {selectedCandidate.location_details.region && (
                        <div className="detail-row">
                          <span className="detail-label">Region</span>
                          <span>{selectedCandidate.location_details.region}</span>
                        </div>
                      )}
                      {selectedCandidate.location_details.country && (
                        <div className="detail-row">
                          <span className="detail-label">Country</span>
                          <span>{selectedCandidate.location_details.country}</span>
                        </div>
                      )}
                      {selectedCandidate.location_details.postal_code && (
                        <div className="detail-row">
                          <span className="detail-label">Postal code</span>
                          <span>{selectedCandidate.location_details.postal_code}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="detail-row">
                    <span className="detail-label">Discoverable</span>
                    <span>{selectedCandidate.discoverable ? "Yes" : "No"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Keywords</span>
                    {selectedCandidateKeywords.length > 0 ? (
                      <div className="keyword-chips">
                        {selectedCandidateKeywords.map((keyword, index) => (
                          <span key={`candidate-keyword-${index}`} className="keyword-chip">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span>None</span>
                    )}
                  </div>
                  {selectedCandidate.summary ? (
                    <p className="candidate-summary">{selectedCandidate.summary}</p>
                  ) : (
                    <p className="hint">Summary not provided.</p>
                  )}
                </div>
                <div className="panel">
                  <h2>Profile video</h2>
                  {selectedCandidate.playback_url ? (
                    <video
                      key={selectedCandidate.playback_url}
                      src={selectedCandidate.playback_url}
                      className="job-detail-video"
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <p className="hint">Profile video is unavailable.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="candidate-list">
                {candidates.map((candidate) => (
                  <div key={candidate.id} className="candidate-card">
                    <button
                      type="button"
                      className="candidate-link"
                      onClick={() => handleSelectCandidate(candidate)}
                    >
                      {candidate.headline || "Candidate profile"}
                    </button>
                    <div className="candidate-meta">{formatLocation(candidate)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
