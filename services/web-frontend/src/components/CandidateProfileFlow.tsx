import { ReactNode, RefObject, useEffect, useMemo, useState } from "react";
import { formatDuration } from "../helpers";
import { getQuestionSet, VIDEO_QUESTION_CONFIG } from "../config/videoQuestions";
import { runtimeConfig } from "../config/runtimeConfig";
import { CandidateProfileInput, CandidateStep, RecordedTake, RecordingState, Status, ViewMode } from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  isAuthenticated: boolean;
  candidateStep: CandidateStep;
  goToStep: (step: CandidateStep) => void;
  recorderOpen: boolean;
  recordingState: RecordingState;
  videoUrl: string | null;
  candidateVideoObjectKey: string | null;
  liveVideoRef: RefObject<HTMLVideoElement>;
  playbackVideoRef: RefObject<HTMLVideoElement>;
  recordLabel: string | null;
  durationLabel: string | null;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  error: string | null;
  recordedTakes: RecordedTake[];
  selectedTakeId: string | null;
  selectTake: (id: string) => void;
  status: Status;
  uploadProgress: number | null;
  processingMessage: string | null;
  audioSessionTranscripts: Record<string, string>;
  audioSessionStatuses: Record<string, "pending" | "partial" | "final">;
  fallbackTranscript?: string;
  fallbackTranscriptStatus?: "pending" | "final";
  isEditingProfile: boolean;
  keywords: string[];
  onSaveVideo: () => void;
  profile: CandidateProfileInput;
  onProfileChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSaveProfile: () => void;
  profileSaving: boolean;
  profileSaved: boolean;
  canSaveProfile: boolean;
  showValidation: boolean;
  onViewJobs: () => void;
};

export function CandidateProfileFlow({
  view,
  nav,
  isAuthenticated,
  candidateStep,
  goToStep,
  recorderOpen,
  recordingState,
  videoUrl,
  candidateVideoObjectKey,
  liveVideoRef,
  playbackVideoRef,
  recordLabel,
  durationLabel,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  error,
  recordedTakes,
  selectedTakeId,
  selectTake,
  status,
  uploadProgress,
  processingMessage,
  audioSessionTranscripts,
  audioSessionStatuses,
  fallbackTranscript,
  fallbackTranscriptStatus,
  isEditingProfile,
  keywords,
  onSaveVideo,
  profile,
  onProfileChange,
  onSaveProfile,
  profileSaving,
  profileSaved,
  canSaveProfile,
  showValidation,
  onViewJobs,
}: Props) {
  if (view !== "find") return null;

  const isSavingVideo = status === "presigning" || status === "uploading" || status === "confirming";
  const videoSaved = Boolean(candidateVideoObjectKey);
  const uploadPercent = typeof uploadProgress === "number" ? Math.max(0, Math.min(100, uploadProgress)) : null;
  const hasTakes = recordedTakes.length > 0;
  const isRecording = recordingState === "recording";
  const isPaused = recordingState === "paused";
  const isActiveRecording = isRecording || isPaused;
  const canRecord = recordingState === "idle" || recordingState === "paused";
  const canPause = recordingState === "recording";
  const canStop = recordingState === "recording" || recordingState === "paused";
  const introCountdownSeconds = Math.max(1, Number(runtimeConfig.video?.introCountdownSeconds) || 3);
  const questionCountdownSeconds = Math.max(
    1,
    Number(runtimeConfig.video?.questionCountdownSeconds) || 3,
  );
  const maxVideoLabel =
    formatDuration(runtimeConfig.video?.maxDurationSeconds ?? 180) ?? "3:00";
  const selectedTake = recordedTakes.find((t) => t.id === selectedTakeId) ?? null;
  const transcriptSessionId = selectedTake?.audioSessionId;
  const transcript = transcriptSessionId
    ? audioSessionTranscripts[transcriptSessionId]
    : fallbackTranscript || "";
  const transcriptStatus = transcriptSessionId
    ? audioSessionStatuses[transcriptSessionId]
    : fallbackTranscript
    ? fallbackTranscriptStatus ?? "final"
    : undefined;
  const transcriptPlaceholder =
    transcriptStatus === "pending" || transcriptStatus === "partial"
      ? "Transcribing your intro... hang tight."
      : "Transcript will appear here after we process your audio.";
  const transcriptStatusHint =
    transcriptStatus === "partial"
      ? "Partial transcript shown; it will update once processing finishes."
      : transcriptStatus === "pending"
      ? "Transcribing your intro..."
      : "";
  const recordActionLabel = isPaused ? "Resume" : "Start";
  const recordAction = isPaused ? resumeRecording : startRecording;
  const showHeadlineError = showValidation && !`${profile.headline ?? ""}`.trim();
  const showLocationError = showValidation && !`${profile.location ?? ""}`.trim();
  const showSummaryError = showValidation && !`${profile.summary ?? ""}`.trim();
  const showTranscript = !isEditingProfile;
  const backToVideoLabel = showTranscript ? "Back to select video" : "Create new profile video";
  const flowTitle =
    candidateStep === "select"
      ? "Select video"
      : candidateStep === "profile"
      ? "Profile detail"
      : "Record before you browse";
  const flowLede =
    candidateStep === "select"
      ? "Pick your best take."
      : candidateStep === "record"
      ? "Record a short intro video."
      : "";
  const candidateQuestionSet = useMemo(
    () => getQuestionSet(VIDEO_QUESTION_CONFIG.candidateProfile),
    [],
  );
  const candidateQuestions = candidateQuestionSet?.questions ?? [];
  const [candidateQuestionIndex, setCandidateQuestionIndex] = useState(0);
  const [questionCountdown, setQuestionCountdown] = useState<number | null>(null);
  const [introCountdown, setIntroCountdown] = useState<number | null>(null);
  const hasCandidateQuestions = isAuthenticated && candidateQuestions.length > 0;
  const candidateQuestion =
    hasCandidateQuestions && candidateQuestionIndex < candidateQuestions.length
      ? candidateQuestions[candidateQuestionIndex]
      : null;
  const canPrevCandidateQuestion = candidateQuestionIndex > 0;
  const canNextCandidateQuestion = candidateQuestionIndex < candidateQuestions.length - 1;
  const canStartCountdown = questionCountdown === null;
  const questionActionLabel = canNextCandidateQuestion ? "Next question" : "End video";
  const canShowQuestionActions = hasCandidateQuestions && questionCountdown === null && recordingState !== "idle";
  const isLoggedOutIntroFlow = !isAuthenticated && !hasCandidateQuestions;
  const showPlaybackPreviewInRecord = !isLoggedOutIntroFlow && !isActiveRecording && Boolean(videoUrl);
  const hasProfileAutofillData =
    Boolean(`${profile.headline ?? ""}`.trim()) ||
    Boolean(`${profile.location ?? ""}`.trim()) ||
    Boolean(`${profile.summary ?? ""}`.trim()) ||
    keywords.length > 0 ||
    Boolean((transcript || "").trim());
  const showProfileAutofillNotice =
    candidateStep === "profile" &&
    !isEditingProfile &&
    !profileSaved &&
    !hasProfileAutofillData &&
    (status === "processing" || transcriptStatus === "pending");
  const canViewJobs = isEditingProfile || profileSaved;
  const showLoggedOutPostTakeActions = isLoggedOutIntroFlow && recordingState === "idle" && hasTakes;
  const showLoggedOutIntroOverlay =
    !isAuthenticated && hasCandidateQuestions === false && recordingState === "idle";
  const handlePreviousQuestion = () => {
    if (!canPrevCandidateQuestion) return;
    if (recordingState === "recording") {
      pauseRecording();
    }
    setCandidateQuestionIndex((prev) => Math.max(0, prev - 1));
    setQuestionCountdown(questionCountdownSeconds);
  };
  const handleNextQuestion = () => {
    if (!canNextCandidateQuestion) {
      stopRecording();
      return;
    }
    if (recordingState === "recording") {
      pauseRecording();
    }
    setCandidateQuestionIndex((prev) => Math.min(candidateQuestions.length - 1, prev + 1));
    setQuestionCountdown(questionCountdownSeconds);
  };
  const handleRecordAction = () => {
    if (!hasCandidateQuestions) {
      if (!isAuthenticated && recordingState === "idle") {
        if (introCountdown !== null) return;
        setIntroCountdown(introCountdownSeconds);
        return;
      }
      recordAction();
      return;
    }
    if (!canStartCountdown) return;
    setQuestionCountdown(questionCountdownSeconds);
  };

  useEffect(() => {
    if (candidateStep !== "record") {
      setQuestionCountdown(null);
      setIntroCountdown(null);
      return;
    }
    setCandidateQuestionIndex(0);
    setQuestionCountdown(null);
    setIntroCountdown(null);
  }, [candidateStep, candidateQuestionSet?.variant.id]);
  useEffect(() => {
    if (introCountdown === null) return;
    if (introCountdown <= 0) {
      setIntroCountdown(null);
      if (recordingState === "idle") {
        startRecording();
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setIntroCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [introCountdown, recordingState, startRecording]);
  useEffect(() => {
    if (questionCountdown === null) return;
    if (questionCountdown <= 0) {
      setQuestionCountdown(null);
      if (recordingState === "paused") {
        resumeRecording();
      } else if (recordingState === "idle") {
        startRecording();
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setQuestionCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [questionCountdown, recordingState, resumeRecording, startRecording]);

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Find Zjob</div>
        <p className="tag">Zjobly</p>
        <h1>{flowTitle}</h1>
        {flowLede && <p className="lede">{flowLede}</p>}

        <form className="upload-form" onSubmit={(event) => event.preventDefault()}>
          {candidateStep === "profile" && (
            <div className="panel">
              <div className="panel-actions split">
                <button type="button" className="ghost" onClick={() => goToStep("select")}>
                  {backToVideoLabel}
                </button>
                <div className="panel-action-right">
                  <button
                    type="button"
                    className="cta primary"
                    onClick={onSaveProfile}
                    disabled={profileSaving || !canSaveProfile}
                    aria-disabled={!canSaveProfile}
                  >
                    {profileSaving ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </div>
              <div className="field checkbox-field">
                <label htmlFor="discoverable" className="toggle">
                  <input
                    id="discoverable"
                    name="discoverable"
                    type="checkbox"
                    checked={Boolean(profile.discoverable)}
                    onChange={onProfileChange}
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-copy">
                    <span className="toggle-title">Make my profile discoverable to employers</span>
                    <span className="toggle-sub">Let them browse and reach out to you.</span>
                  </span>
                </label>
              </div>
              {showProfileAutofillNotice && (
                <div className="notice notice-with-spinner" role="status" aria-live="polite">
                  <span className="inline-spinner" aria-hidden="true" />
                  <span>{processingMessage || "Preparing your profile details from your video..."}</span>
                </div>
              )}

              <div className="field">
                <label htmlFor="headline">Headline</label>
                <input
                  id="headline"
                  name="headline"
                  value={profile.headline ?? ""}
                  onChange={onProfileChange}
                  placeholder="e.g., Product designer open to hybrid roles"
                  required
                  className={showHeadlineError ? "invalid" : ""}
                  aria-invalid={showHeadlineError}
                />
                {showHeadlineError && <span className="field-error">Required</span>}
              </div>

              <div className="field">
                <label htmlFor="location">Location</label>
                <input
                  id="location"
                  name="location"
                  value={profile.location ?? ""}
                  onChange={onProfileChange}
                  placeholder="e.g., Remote (EU) or Antwerp"
                  required
                  className={showLocationError ? "invalid" : ""}
                  aria-invalid={showLocationError}
                />
                {showLocationError && <span className="field-error">Required</span>}
              </div>

              <div className="field">
                <label htmlFor="summary">Summary</label>
                <textarea
                  id="summary"
                  name="summary"
                  value={profile.summary ?? ""}
                  onChange={onProfileChange}
                  rows={5}
                  placeholder="Add a quick pitch about your experience and what you're looking for."
                  className={showSummaryError ? "invalid" : ""}
                  aria-invalid={showSummaryError}
                />
                {showSummaryError && <span className="field-error">Required</span>}
              </div>

              {showTranscript && (
                <div className="field">
                  <label>Transcript (Auto-transcribed from your intro video.)</label>
                  {transcript ? (
                    <textarea value={transcript} readOnly rows={7} />
                  ) : (
                    <div className="transcript-placeholder" aria-live="polite">
                      {transcriptPlaceholder}
                    </div>
                  )}
                  {transcriptStatusHint && <p className="hint">{transcriptStatusHint}</p>}
                </div>
              )}

              <div className="field">
                <label>Keywords</label>
                {keywords.length > 0 ? (
                  <div className="keyword-chips">
                    {keywords.map((keyword, index) => (
                      <span key={`candidate-keyword-${index}`} className="keyword-chip">
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="hint">Keywords will appear once the transcript is processed.</p>
                )}
              </div>

              {error && <div className="error">{error}</div>}
              {profileSaved && <div className="success">Profile saved. You can head back or refine your video.</div>}

              <div className="panel-actions split">
                <button type="button" className="ghost" onClick={() => goToStep("select")}>
                  {backToVideoLabel}
                </button>
                <div className="panel-action-right">
                  {canViewJobs && (
                    <button type="button" className="cta secondary" onClick={onViewJobs}>
                      View jobs
                    </button>
                  )}
                  <button
                    type="button"
                    className="cta primary"
                    onClick={onSaveProfile}
                    disabled={profileSaving || !canSaveProfile}
                    aria-disabled={!canSaveProfile}
                  >
                    {profileSaving ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {candidateStep === "record" && (
            <div className="fullscreen-recorder">
              <div className="record-shell">
                <div className="record-stage">
                  {recorderOpen ? (
                    <div className={`record-screen ${showPlaybackPreviewInRecord ? "playback" : ""}`}>
                      {showPlaybackPreviewInRecord ? (
                        <video
                          key={videoUrl}
                          ref={playbackVideoRef}
                          src={videoUrl}
                          className="live-video playback-video"
                          controls
                          playsInline
                          autoPlay
                          muted
                        />
                      ) : (
                        <video ref={liveVideoRef} className="live-video" autoPlay playsInline muted />
                      )}
                      <div className="record-screen-overlay">
                        <div className="overlay-top">
                          <span
                            className={`status-pill ${isRecording ? "live" : isPaused ? "paused" : "idle"}`}
                          >
                            {isRecording ? "Recording" : isPaused ? "Paused" : "Camera ready"}
                          </span>
                          <div className="record-timer">
                            <span>
                              {isActiveRecording ? recordLabel ?? "0:00" : durationLabel ?? recordLabel ?? "0:00"}
                            </span>
                            <span className="record-max">/ {maxVideoLabel}</span>
                          </div>
                        </div>
                        {hasCandidateQuestions && questionCountdown !== null && (
                          <div className="overlay-center">
                            <div className="question-overlay">
                              <p className="question-label">
                                Question {candidateQuestionIndex + 1} of {candidateQuestions.length}
                              </p>
                              <p className="question-text">{candidateQuestion?.text ?? ""}</p>
                              <div className="question-countdown">
                                <span className="question-countdown-label">Starting in</span>
                                <span className="question-countdown-value">{questionCountdown}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {showLoggedOutIntroOverlay && (
                          <div className="overlay-center">
                            <div className="question-overlay">
                              {introCountdown !== null ? (
                                <>
                                  <p className="question-label">Get ready</p>
                                  <p className="question-text">Starting in</p>
                                  <div className="question-countdown">
                                    <span className="question-countdown-value">{introCountdown}</span>
                                  </div>
                                </>
                              ) : showLoggedOutPostTakeActions ? (
                                <div className="question-actions">
                                  <button
                                    type="button"
                                    className="cta primary question-cta"
                                    onClick={() => goToStep("select")}
                                  >
                                    Continue
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost dark question-cta"
                                    onClick={handleRecordAction}
                                  >
                                    New take
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <p className="question-text">
                                    Tell us about yourself and the kind of job you are looking for.
                                  </p>
                                  <p className="question-label">
                                    Recording starts after you click Start.
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="overlay-bottom">
                          <div className="overlay-actions-left">
                            {canShowQuestionActions && (
                              <>
                                <button
                                  type="button"
                                  className="ghost dark question-cta"
                                  onClick={handlePreviousQuestion}
                                  disabled={!canPrevCandidateQuestion}
                                >
                                  Previous
                                </button>
                                <button
                                  type="button"
                                  className="cta primary question-cta"
                                  onClick={handleNextQuestion}
                                >
                                  {questionActionLabel}
                                </button>
                              </>
                            )}
                          </div>
                          <div className="overlay-actions-right">
                            <div className="record-controls">
                              <button
                                type="button"
                                className="record-control record"
                                onClick={handleRecordAction}
                                disabled={
                                  !canRecord ||
                                  (hasCandidateQuestions && !canStartCountdown) ||
                                  (!isAuthenticated && recordingState === "idle" && introCountdown !== null)
                                }
                                aria-label={recordActionLabel}
                              >
                                <span className="record-icon record-icon--record" aria-hidden="true" />
                                <span className="record-label">{recordActionLabel}</span>
                              </button>
                              <button
                                type="button"
                                className="record-control pause"
                                onClick={pauseRecording}
                                disabled={!canPause}
                                aria-label="Pause"
                              >
                                <span className="record-icon record-icon--pause" aria-hidden="true" />
                                <span className="record-label">Pause</span>
                              </button>
                              <button
                                type="button"
                                className="record-control stop"
                                onClick={stopRecording}
                                disabled={!canStop}
                                aria-label="Stop"
                              >
                                <span className="record-icon record-icon--stop" aria-hidden="true" />
                                <span className="record-label">Stop</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="record-placeholder">
                      <p>Opening camera... If it does not appear, grant permissions above.</p>
                    </div>
                  )}
                </div>
                {!isAuthenticated && error && <div className="error">{error}</div>}

                {isAuthenticated && (
                  <div className="panel record-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Video recording</h2>
                        <p className="hint">Record one or more takes. You&apos;ll pick the best one next.</p>
                      </div>
                      {hasTakes && <span className="pill soft">{recordedTakes.length} takes</span>}
                    </div>

                    {error && <div className="error">{error}</div>}

                    {hasTakes && (
                      <div className="panel-actions record-panel-actions">
                        <button type="button" className="cta primary" onClick={() => goToStep("select")}>
                          Continue
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {candidateStep === "select" && (
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Select your video</h2>
                    <p className="hint">Choose a take, then continue.</p>
                  </div>
                  <button type="button" className="ghost" onClick={() => goToStep("record")}>
                    New take
                  </button>
                </div>

              <div className="video-preview">
                {videoUrl ? (
                  <video key={videoUrl} ref={playbackVideoRef} src={videoUrl} className="playback-video" controls playsInline />
                ) : (
                  <div className="video-preview-placeholder">
                    <p className="hint">Select a take to preview it here.</p>
                  </div>
                )}
              </div>

              <div className="take-list">
                {recordedTakes.length === 0 && <p className="hint">No takes yet. Record to choose one.</p>}
                {recordedTakes.map((take) => (
                  <label key={take.id} className={`take-card ${selectedTakeId === take.id ? "selected" : ""}`}>
                    <div className="take-card-top">
                      <div className="take-label">
                        <input
                          type="radio"
                          name="selectedTake"
                          checked={selectedTakeId === take.id}
                          onChange={() => selectTake(take.id)}
                        />
                        <span>{take.label}</span>
                      </div>
                      <span className="take-duration">{formatDuration(take.duration) ?? "0:00"}</span>
                    </div>
                  </label>
                ))}
              </div>

              {error && <div className="error">{error}</div>}
              {status === "presigning" && <div className="notice">Requesting an upload URL...</div>}
              {status === "uploading" && (
                <div className="upload-progress">
                  <div className="upload-progress-top">
                    <span>Uploading video...</span>
                    <span>{uploadPercent !== null ? `${uploadPercent}%` : "..."}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${uploadPercent ?? 5}%` }} />
                  </div>
                </div>
              )}
              {status === "confirming" && <div className="notice">Confirming your upload...</div>}
              {status === "processing" && (
                <div className="notice">
                  {processingMessage || "Processing your video (transcription/indexing) ..."}
                </div>
              )}

              <div className="panel-actions split">
                <button type="button" className="ghost" onClick={() => goToStep("record")}>
                  New take
                </button>
                <div className="panel-action-right">
                  <button
                    type="button"
                    className="cta primary"
                    onClick={onSaveVideo}
                    disabled={
                      isSavingVideo ||
                      !selectedTake ||
                      status === "processing" ||
                      status === "presigning" ||
                      status === "uploading" ||
                      status === "confirming"
                    }
                  >
                    {isSavingVideo ? "Saving..." : "Continue"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </section>
    </>
  );
}
