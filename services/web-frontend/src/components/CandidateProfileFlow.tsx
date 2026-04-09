import { ChangeEvent, ReactNode, RefObject, useEffect, useMemo, useState } from "react";
import { formatDuration } from "../helpers";
import { getQuestionSet, VIDEO_QUESTION_CONFIG } from "../config/videoQuestions";
import { runtimeConfig } from "../config/runtimeConfig";
import {
  CandidateProfileInput,
  CandidateReviewChoice,
  CandidateReviewEditable,
  CandidateReviewField,
  CandidateReviewSide,
  CandidateReviewVideoChoice,
  CandidateStep,
  RecordedTake,
  RecordingState,
  Status,
  ViewMode,
} from "../types";

type Props = {
  view: ViewMode;
  nav: ReactNode;
  isAuthenticated: boolean;
  useGuidedQuestions: boolean;
  candidateStep: CandidateStep;
  goToStep: (step: CandidateStep) => void;
  recorderOpen: boolean;
  recordingState: RecordingState;
  videoUrl: string | null;
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
  onSaveVideo: (options?: { showBlockingOverlay?: boolean }) => void | Promise<void>;
  profile: CandidateProfileInput;
  onProfileChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSaveProfile: () => void;
  profileSaving: boolean;
  profileSaved: boolean;
  canSaveProfile: boolean;
  showValidation: boolean;
  onViewJobs: () => void;
  reviewCurrent: CandidateReviewEditable | null;
  reviewNew: CandidateReviewEditable | null;
  reviewChoices: Record<CandidateReviewField, CandidateReviewChoice>;
  reviewVideoChoice: CandidateReviewVideoChoice;
  reviewCurrentVideoUrl: string | null;
  reviewCurrentVideoObjectKey: string | null;
  reviewNewVideoUrl: string | null;
  onReviewTextChange: (
    side: CandidateReviewSide,
    field: "headline" | "location" | "summary",
    value: string,
  ) => void;
  onReviewChoiceChange: (field: CandidateReviewField, choice: CandidateReviewChoice) => void;
  onReviewVideoChoiceChange: (choice: CandidateReviewVideoChoice) => void;
  onReviewMoveKeyword: (from: CandidateReviewSide, keyword: string) => void;
  onApplyReview: () => void;
};

export function CandidateProfileFlow({
  view,
  nav,
  isAuthenticated,
  useGuidedQuestions,
  candidateStep,
  goToStep,
  recorderOpen,
  recordingState,
  videoUrl,
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
  reviewCurrent,
  reviewNew,
  reviewChoices,
  reviewVideoChoice,
  reviewCurrentVideoUrl,
  reviewCurrentVideoObjectKey,
  reviewNewVideoUrl,
  onReviewTextChange,
  onReviewChoiceChange,
  onReviewVideoChoiceChange,
  onReviewMoveKeyword,
  onApplyReview,
}: Props) {
  if (view !== "find") return null;

  const isSavingVideo = status === "presigning" || status === "uploading" || status === "confirming";
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
  const backToVideoLabel = isEditingProfile ? "New Video" : "Back to select video";
  const backToVideoStep: CandidateStep = isEditingProfile ? "record" : "select";
  const flowTitle =
    candidateStep === "intro"
      ? "How it works"
      : candidateStep === "select"
      ? "Select video"
      : candidateStep === "review"
      ? "Review profile update"
      : candidateStep === "profile"
      ? "Profile detail"
      : "Record before you browse";
  const flowLede =
    candidateStep === "intro"
      ? ""
      : candidateStep === "select"
      ? "Pick your best take."
      : candidateStep === "review"
      ? "Compare current and new details, then keep what you want."
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
  const [introStartPending, setIntroStartPending] = useState(false);
  const [detailedFlowStarted, setDetailedFlowStarted] = useState(false);
  const [detailedAwaitingContinue, setDetailedAwaitingContinue] = useState(false);
  const [detailedAutoSavePending, setDetailedAutoSavePending] = useState(false);
  const [detailedAutoSaveTakeCount, setDetailedAutoSaveTakeCount] = useState(0);
  const hasCandidateQuestions = useGuidedQuestions && isAuthenticated && candidateQuestions.length > 0;
  const candidateQuestion =
    hasCandidateQuestions && candidateQuestionIndex < candidateQuestions.length
      ? candidateQuestions[candidateQuestionIndex]
      : null;
  const canPrevCandidateQuestion = candidateQuestionIndex > 0;
  const canNextCandidateQuestion = candidateQuestionIndex < candidateQuestions.length - 1;
  const questionActionLabel = canNextCandidateQuestion ? "Next question" : "End video";
  const showDetailedIntroOverlay =
    hasCandidateQuestions && recordingState === "idle" && !detailedFlowStarted;
  const showDetailedQuestionPrompt =
    hasCandidateQuestions && detailedFlowStarted && detailedAwaitingContinue && recordingState !== "recording";
  const canShowDetailedQuestionActions =
    hasCandidateQuestions && detailedFlowStarted && !detailedAwaitingContinue && recordingState === "recording";
  const isCandidateProcessing =
    status === "presigning" || status === "uploading" || status === "confirming" || status === "processing";
  const showDetailedAutoProcessingOverlay =
    hasCandidateQuestions && (detailedAutoSavePending || isCandidateProcessing);
  const isSimpleRecordingFlow = !hasCandidateQuestions;
  const showPlaybackPreviewInRecord = !isSimpleRecordingFlow && !isActiveRecording && Boolean(videoUrl);
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
  const showPostTakeActions = isSimpleRecordingFlow && recordingState === "idle" && hasTakes;
  const showSimpleIntroOverlay = isSimpleRecordingFlow && recordingState === "idle" && !introStartPending;
  const isDetailedIntro = candidateStep === "intro" && isAuthenticated && useGuidedQuestions;
  const showNav = !(!isAuthenticated && (candidateStep === "intro" || candidateStep === "record"));
  const heroClassName =
    candidateStep === "select" && !isAuthenticated ? "hero hero-select-loggedout" : "hero";
  const handleStartDetailedFlow = () => {
    if (!hasCandidateQuestions || recordingState !== "idle") return;
    setCandidateQuestionIndex(0);
    setQuestionCountdown(null);
    setDetailedAutoSavePending(false);
    setDetailedFlowStarted(true);
    setDetailedAwaitingContinue(true);
  };
  const handleContinueDetailedQuestion = () => {
    if (!hasCandidateQuestions || !detailedAwaitingContinue || questionCountdown !== null) return;
    setQuestionCountdown(questionCountdownSeconds);
  };
  const handlePreviousDetailedQuestion = () => {
    if (!hasCandidateQuestions || !canPrevCandidateQuestion) return;
    if (recordingState === "recording") {
      pauseRecording();
    }
    setQuestionCountdown(null);
    setCandidateQuestionIndex((prev) => Math.max(0, prev - 1));
    setDetailedAwaitingContinue(true);
  };
  const handleNextQuestion = () => {
    if (!canNextCandidateQuestion) {
      setQuestionCountdown(null);
      setDetailedAwaitingContinue(false);
      setDetailedAutoSaveTakeCount(recordedTakes.length);
      setDetailedAutoSavePending(true);
      stopRecording();
      return;
    }
    if (recordingState === "recording") {
      pauseRecording();
    }
    setQuestionCountdown(null);
    setCandidateQuestionIndex((prev) => Math.min(candidateQuestions.length - 1, prev + 1));
    setDetailedAwaitingContinue(true);
  };
  const handleRecordAction = () => {
    if (!isSimpleRecordingFlow) return;
    if (recordingState === "idle") {
      if (introCountdown !== null) return;
      setIntroStartPending(false);
      setIntroCountdown(introCountdownSeconds);
      return;
    }
    recordAction();
  };

  useEffect(() => {
    if (candidateStep !== "record") {
      setQuestionCountdown(null);
      setIntroCountdown(null);
      setIntroStartPending(false);
      setDetailedFlowStarted(false);
      setDetailedAwaitingContinue(false);
      setDetailedAutoSavePending(false);
      setDetailedAutoSaveTakeCount(0);
      return;
    }
    setCandidateQuestionIndex(0);
    setQuestionCountdown(null);
    setIntroCountdown(null);
    setIntroStartPending(false);
    setDetailedFlowStarted(false);
    setDetailedAwaitingContinue(false);
    setDetailedAutoSavePending(false);
    setDetailedAutoSaveTakeCount(0);
  }, [candidateStep, candidateQuestionSet?.variant.id]);
  useEffect(() => {
    if (introCountdown === null) return;
    if (introCountdown <= 0) {
      setIntroCountdown(null);
      if (recordingState === "idle") {
        setIntroStartPending(true);
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
    if (!introStartPending) return;
    if (recordingState !== "idle") {
      setIntroStartPending(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setIntroStartPending(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [introStartPending, recordingState]);
  useEffect(() => {
    if (questionCountdown === null) return;
    if (questionCountdown <= 0) {
      setQuestionCountdown(null);
      setDetailedAwaitingContinue(false);
      if (recordingState === "paused") {
        resumeRecording();
        return;
      }
      if (recordingState === "idle") {
        startRecording();
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setQuestionCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [questionCountdown, recordingState, resumeRecording, startRecording]);
  useEffect(() => {
    if (!detailedAutoSavePending) return;
    if (recordingState !== "idle") return;
    if (recordedTakes.length <= detailedAutoSaveTakeCount) return;
    setDetailedAutoSavePending(false);
    void onSaveVideo({ showBlockingOverlay: true });
  }, [detailedAutoSavePending, recordingState, recordedTakes.length, detailedAutoSaveTakeCount, onSaveVideo]);
  useEffect(() => {
    if (!hasCandidateQuestions) return;
    if (status !== "error" || recordingState !== "idle") return;
    setQuestionCountdown(null);
    setDetailedAwaitingContinue(false);
    setDetailedFlowStarted(false);
    setDetailedAutoSavePending(false);
  }, [hasCandidateQuestions, status, recordingState]);
  const renderReviewTextField = (
    field: "headline" | "location" | "summary",
    label: string,
    multiline: boolean,
  ) => {
    if (!reviewCurrent || !reviewNew) return null;
    const choiceName = `review-choice-${field}`;
    const currentValue = reviewCurrent[field];
    const newValue = reviewNew[field];
    return (
      <div className="review-block">
        <div className="review-block-header">
          <h2>{label}</h2>
          <div className="review-choice">
            <label>
              <input
                type="radio"
                name={choiceName}
                checked={reviewChoices[field] === "current"}
                onChange={() => onReviewChoiceChange(field, "current")}
              />
              Keep current
            </label>
            <label>
              <input
                type="radio"
                name={choiceName}
                checked={reviewChoices[field] === "new"}
                onChange={() => onReviewChoiceChange(field, "new")}
              />
              Keep new
            </label>
          </div>
        </div>
        <div className="review-grid">
          <div className="field">
            <label>Current</label>
            {multiline ? (
              <textarea
                rows={5}
                value={currentValue}
                onChange={(event) => onReviewTextChange("current", field, event.target.value)}
              />
            ) : (
              <input
                value={currentValue}
                onChange={(event) => onReviewTextChange("current", field, event.target.value)}
              />
            )}
          </div>
          <div className="field">
            <label>New</label>
            {multiline ? (
              <textarea
                rows={5}
                value={newValue}
                onChange={(event) => onReviewTextChange("new", field, event.target.value)}
              />
            ) : (
              <input value={newValue} onChange={(event) => onReviewTextChange("new", field, event.target.value)} />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {showNav && nav}
      <section className={heroClassName}>
        <h1>{flowTitle}</h1>
        {flowLede && <p className="lede">{flowLede}</p>}

        <form className="upload-form" onSubmit={(event) => event.preventDefault()}>
          {candidateStep === "intro" && (
            <div className="flow-intro">
              <div className="flow-intro-row">
                <div className="flow-intro-image">
                  <img
                    src="/images/flow-record.png"
                    alt={isDetailedIntro ? "Answer guided questions in your video" : "Record your intro video"}
                    loading="lazy"
                  />
                </div>
                <div className="flow-intro-copy">
                  <h2>{isDetailedIntro ? "1. Answer guided questions" : "1. Record your intro video"}</h2>
                  {isDetailedIntro ? (
                    <p>
                      We will ask questions one by one while recording.
                      <br />
                      Keep each answer clear and specific.
                    </p>
                  ) : (
                    <p>
                      Tell us what kind of job you want, where you want to work and what you&apos;re good at.
                      <br />
                      Videos are 3 min max.
                    </p>
                  )}
                </div>
              </div>

              <div className="flow-intro-row reverse">
                <div className="flow-intro-image">
                  <img
                    src="/images/flow-profile.png"
                    alt={isDetailedIntro ? "Process each answer into profile signals" : "Auto build your profile from video"}
                    loading="lazy"
                  />
                </div>
                <div className="flow-intro-copy">
                  <h2>{isDetailedIntro ? "2. We process each answer by goal" : "2. We auto build your profile"}</h2>
                  {isDetailedIntro ? (
                    <p>
                      Each question maps to specific profile fields.
                      <br />
                      Example: strengths update skills and keywords.
                    </p>
                  ) : (
                    <p>
                      We use your recording to draft your profile details automatically, so you can start quickly and
                      edit anything you want afterward.
                    </p>
                  )}
                </div>
              </div>

              <div className="flow-intro-row">
                <div className="flow-intro-image">
                  <img
                    src="/images/flow-search.png"
                    alt={
                      isDetailedIntro
                        ? "Review current and new profile details before saving"
                        : "Search jobs and get discovered by companies"
                    }
                    loading="lazy"
                  />
                </div>
                <div className="flow-intro-copy">
                  <h2>{isDetailedIntro ? "3. Review before you save" : "3. Search jobs and get discovered"}</h2>
                  {isDetailedIntro ? (
                    <p>
                      After recording, you compare current and new values.
                      <br />
                      You decide per field what to keep.
                    </p>
                  ) : (
                    <p>
                      You can search jobs immediately, and you can also make your profile searchable so companies can
                      find and contact you.
                    </p>
                  )}
                </div>
              </div>

              <div className="flow-intro-actions">
                <button type="button" className="cta primary" onClick={() => goToStep("record")}>
                  {isDetailedIntro ? "Start detailed recording" : "Continue"}
                </button>
              </div>
            </div>
          )}

          {candidateStep === "profile" && (
            <div className="panel">
              <div className="panel-actions split">
                <button type="button" className="ghost" onClick={() => goToStep(backToVideoStep)}>
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
                <button type="button" className="ghost" onClick={() => goToStep(backToVideoStep)}>
                  {backToVideoLabel}
                </button>
                <div className="panel-action-right">
                  {canViewJobs && !isEditingProfile && (
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
                        {showDetailedIntroOverlay && (
                          <div className="overlay-center">
                            <div className="question-overlay">
                              <p className="question-text">
                                After you click Start, we begin with the first question.
                              </p>
                              <p className="question-label">We pause between each question.</p>
                              <div className="question-actions">
                                <button
                                  type="button"
                                  className="cta primary question-cta"
                                  onClick={handleStartDetailedFlow}
                                >
                                  Start
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        {showDetailedQuestionPrompt && (
                          <div className="overlay-center">
                            <div className="question-overlay">
                              <p className="question-label">
                                Question {candidateQuestionIndex + 1} of {candidateQuestions.length}
                              </p>
                              <p className="question-text">{candidateQuestion?.text ?? ""}</p>
                              {questionCountdown !== null ? (
                                <div className="question-countdown">
                                  <span className="question-countdown-label">Starting in</span>
                                  <span className="question-countdown-value">{questionCountdown}</span>
                                </div>
                              ) : (
                                <div className="question-actions question-actions-vertical">
                                  <button
                                    type="button"
                                    className="cta primary question-cta"
                                    onClick={handleContinueDetailedQuestion}
                                  >
                                    Continue
                                  </button>
                                  {canPrevCandidateQuestion && (
                                    <button
                                      type="button"
                                      className="ghost dark question-cta question-cta-subtle"
                                      onClick={handlePreviousDetailedQuestion}
                                    >
                                      Previous
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {showDetailedAutoProcessingOverlay && (
                          <div className="overlay-center">
                            <div className="question-overlay">
                              <p className="question-label">Processing your detailed profile</p>
                              <p className="question-text">Please wait while we process your video and profile data.</p>
                              <div className="notice notice-with-spinner question-processing-notice">
                                <span className="inline-spinner" aria-hidden="true" />
                                <span>
                                  {processingMessage ||
                                    (status === "uploading"
                                      ? "Uploading your video..."
                                      : status === "confirming"
                                      ? "Confirming your upload..."
                                      : status === "processing"
                                      ? "Analyzing transcript and building profile update..."
                                      : "Preparing...")}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        {showSimpleIntroOverlay && (
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
                              ) : showPostTakeActions ? (
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
                                  <p className="question-text">Tell us about yourself!</p>
                                  <p className="question-label">What kind of job you want?</p>
                                  <p className="question-label">What location?</p>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        <div
                          className={`overlay-bottom ${isSimpleRecordingFlow ? "overlay-bottom-centered" : ""}`}
                        >
                          <div className="overlay-actions-left">
                            {canShowDetailedQuestionActions && !showDetailedAutoProcessingOverlay && (
                              <button
                                type="button"
                                className="cta primary question-cta"
                                onClick={handleNextQuestion}
                              >
                                {questionActionLabel}
                              </button>
                            )}
                          </div>
                          <div
                            className={`overlay-actions-right ${
                              isSimpleRecordingFlow ? "overlay-actions-right-centered" : ""
                            }`}
                          >
                            {isSimpleRecordingFlow && (
                              <div className="record-controls record-controls-solid">
                                <button
                                  type="button"
                                  className="record-control record"
                                  onClick={handleRecordAction}
                                  disabled={
                                    !canRecord ||
                                    (isSimpleRecordingFlow && recordingState === "idle" && introCountdown !== null)
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
                            )}
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
                {error && <div className="error">{error}</div>}
              </div>
            </div>
          )}

          {candidateStep === "select" && (
              <div className="panel candidate-select-panel">
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

              {!isAuthenticated && (
                <div className="field checkbox-field">
                  <label htmlFor="discoverableSelect" className="toggle">
                    <input
                      id="discoverableSelect"
                      name="discoverable"
                      type="checkbox"
                      checked={Boolean(profile.discoverable)}
                      onChange={onProfileChange}
                    />
                    <span className="toggle-track" aria-hidden="true">
                      <span className="toggle-thumb" />
                    </span>
                    <span className="toggle-copy">
                      <span className="toggle-title">Show my profile to employers</span>
                      <span className="toggle-sub">Let them browse and reach out to you.</span>
                    </span>
                  </label>
                </div>
              )}

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

          {candidateStep === "review" && (
            <div className="panel profile-review-panel">
              {reviewCurrent && reviewNew ? (
                <>
                  <div className="panel-header">
                    <div>
                      <h2>Current vs New</h2>
                      <p className="hint">Edit either side, then choose what to keep for each field.</p>
                    </div>
                  </div>

                  {renderReviewTextField("headline", "Headline", false)}
                  {renderReviewTextField("location", "Location", false)}
                  {renderReviewTextField("summary", "Summary", true)}

                  <div className="review-block">
                    <div className="review-block-header">
                      <h2>Keywords</h2>
                      <div className="review-choice">
                        <label>
                          <input
                            type="radio"
                            name="review-choice-keywords"
                            checked={reviewChoices.keywords === "current"}
                            onChange={() => onReviewChoiceChange("keywords", "current")}
                          />
                          Keep current
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="review-choice-keywords"
                            checked={reviewChoices.keywords === "new"}
                            onChange={() => onReviewChoiceChange("keywords", "new")}
                          />
                          Keep new
                        </label>
                      </div>
                    </div>
                    <div className="review-grid">
                      <div className="field">
                        <label>Current</label>
                        <div className="keyword-chips review-keyword-chips">
                          {reviewCurrent.keywords.length > 0 ? (
                            reviewCurrent.keywords.map((keyword) => (
                              <button
                                key={`review-current-keyword-${keyword}`}
                                type="button"
                                className="keyword-chip keyword-chip-move"
                                onClick={() => onReviewMoveKeyword("current", keyword)}
                                title="Move to New"
                              >
                                {keyword} &rarr;
                              </button>
                            ))
                          ) : (
                            <p className="hint">No current keywords.</p>
                          )}
                        </div>
                      </div>
                      <div className="field">
                        <label>New</label>
                        <div className="keyword-chips review-keyword-chips">
                          {reviewNew.keywords.length > 0 ? (
                            reviewNew.keywords.map((keyword) => (
                              <button
                                key={`review-new-keyword-${keyword}`}
                                type="button"
                                className="keyword-chip keyword-chip-move"
                                onClick={() => onReviewMoveKeyword("new", keyword)}
                                title="Move to Current"
                              >
                                &larr; {keyword}
                              </button>
                            ))
                          ) : (
                            <p className="hint">No new keywords.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="review-block">
                    <div className="review-block-header">
                      <h2>Video</h2>
                    </div>
                    <div className="review-grid">
                      <div className="video-preview">
                        <p className="preview-label">Current video</p>
                        {reviewCurrentVideoUrl ? (
                          <video src={reviewCurrentVideoUrl} className="playback-video" controls playsInline />
                        ) : (
                          <div className="video-preview-placeholder">
                            <p className="hint">No current video.</p>
                          </div>
                        )}
                      </div>
                      <div className="video-preview">
                        <p className="preview-label">New video</p>
                        {reviewNewVideoUrl ? (
                          <video
                            key={reviewNewVideoUrl}
                            src={reviewNewVideoUrl}
                            className="playback-video"
                            controls
                            playsInline
                          />
                        ) : (
                          <div className="video-preview-placeholder">
                            <p className="hint">No new video available.</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="review-video-choice">
                      <label>
                        <input
                          type="radio"
                          name="review-video-choice"
                          checked={reviewVideoChoice === "current"}
                          onChange={() => onReviewVideoChoiceChange("current")}
                          disabled={!reviewCurrentVideoObjectKey}
                        />
                        Keep current video
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="review-video-choice"
                          checked={reviewVideoChoice === "new"}
                          onChange={() => onReviewVideoChoiceChange("new")}
                        />
                        Keep new video
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="review-video-choice"
                          checked={reviewVideoChoice === "both"}
                          onChange={() => onReviewVideoChoiceChange("both")}
                        />
                        Keep both (new active)
                      </label>
                    </div>
                  </div>

                  {error && <div className="error">{error}</div>}

                  <div className="panel-actions split">
                    <button type="button" className="ghost" onClick={() => goToStep("select")}>
                      Back to select video
                    </button>
                    <div className="panel-action-right">
                      <button
                        type="button"
                        className="cta primary"
                        onClick={onApplyReview}
                        disabled={profileSaving}
                      >
                        {profileSaving ? "Saving..." : "Save profile update"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="hint">No review data available. Go back to select video and continue again.</p>
                  <div className="panel-actions split">
                    <button type="button" className="ghost" onClick={() => goToStep("select")}>
                      Back to select video
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </form>
      </section>
    </>
  );
}

