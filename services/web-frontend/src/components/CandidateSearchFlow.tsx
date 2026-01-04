import { ChangeEvent, FormEvent, ReactNode, useEffect, useState } from "react";
import { searchCandidates } from "../api";
import { CandidateProfile, UserRole, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  role: UserRole | null;
};

export function CandidateSearchFlow({ view, nav, role }: Props) {
  const isEmployer = role === "employer";
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (term?: string) => {
    setLoading(true);
    setError(null);
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
    void runSearch();
  }, [view, isEmployer]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isEmployer) return;
    void runSearch(query);
  };

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

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
            <div className="candidate-list">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="candidate-card">
                  <div className="candidate-name">{candidate.headline || "Candidate profile"}</div>
                  <div className="candidate-meta">{candidate.location || "Location not provided"}</div>
                  {candidate.summary && <p className="candidate-summary">{candidate.summary}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
