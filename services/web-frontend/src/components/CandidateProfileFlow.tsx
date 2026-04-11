import { ChangeEvent, ReactNode, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { formatDuration } from "../helpers";
import { getQuestionSet, VIDEO_QUESTION_CONFIG } from "../config/videoQuestions";
import { runtimeConfig } from "../config/runtimeConfig";
import {
  CandidateProfileInput,
  CandidateDetailedSignal,
  CandidateReviewChoice,
  CandidateReviewEditable,
  CandidateReviewField,
  CandidateReviewSide,
  CandidateReviewVideoChoice,
  CandidateStep,
  DetailedQuestionWindow,
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
  recordDurationSec: number;
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
  removedKeywords: string[];
  onSaveVideo: (options?: {
    showBlockingOverlay?: boolean;
    detailedQuestionWindows?: DetailedQuestionWindow[];
  }) => void | Promise<void>;
  profile: CandidateProfileInput;
  onProfileChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSaveProfile: () => void;
  profileSaving: boolean;
  profileSaved: boolean;
  canSaveProfile: boolean;
  showValidation: boolean;
  detailedSignals: CandidateDetailedSignal[];
  onDetailedSignalValueChange: (index: number, value: string) => void;
  onProfileMoveKeyword: (from: "keep" | "remove", keyword: string) => void;
  onViewJobs: () => void;
  reviewCurrent: CandidateReviewEditable | null;
  reviewNew: CandidateReviewEditable | null;
  reviewChoices: Record<CandidateReviewField, CandidateReviewChoice>;
  reviewDetailedSignalChoices: Record<string, CandidateReviewChoice>;
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
  onReviewDetailedSignalChoiceChange: (key: string, choice: CandidateReviewChoice) => void;
  onReviewDetailedSignalValueChange: (side: CandidateReviewSide, key: string, value: string) => void;
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
  recordDurationSec,
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
  removedKeywords,
  onSaveVideo,
  profile,
  onProfileChange,
  onSaveProfile,
  profileSaving,
  profileSaved,
  canSaveProfile,
  showValidation,
  detailedSignals,
  onDetailedSignalValueChange,
  onProfileMoveKeyword,
  onViewJobs,
  reviewCurrent,
  reviewNew,
  reviewChoices,
  reviewDetailedSignalChoices,
  reviewVideoChoice,
  reviewCurrentVideoUrl,
  reviewCurrentVideoObjectKey,
  reviewNewVideoUrl,
  onReviewTextChange,
  onReviewChoiceChange,
  onReviewDetailedSignalChoiceChange,
  onReviewDetailedSignalValueChange,
  onReviewVideoChoiceChange,
  onReviewMoveKeyword,
  onApplyReview,
}: Props) {
  const isFindView = view === "find";

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
  const candidateQuestionSet = getQuestionSet(VIDEO_QUESTION_CONFIG.candidateProfile);
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
  const showDetailedReviewSection = useGuidedQuestions;
  const reviewBackStep: CandidateStep = showDetailedReviewSection ? "record" : "select";
  const reviewBackLabel = showDetailedReviewSection ? "Back to recording" : "Back to select video";
  const showDetailedBottomAction = canShowDetailedQuestionActions && !showDetailedAutoProcessingOverlay;
  const showNav = !(!isAuthenticated && (candidateStep === "intro" || candidateStep === "record"));
  const heroClassName =
    candidateStep === "select" && !isAuthenticated ? "hero hero-select-loggedout" : "hero";
  const editableDetailedSignals = useMemo(
    () =>
      (Array.isArray(detailedSignals) ? detailedSignals : []).filter(
        (signal): signal is CandidateDetailedSignal =>
          Boolean(signal?.question_id && signal?.goal && signal?.value),
      ),
    [detailedSignals],
  );
  const detailedSignalKey = (signal: { question_id: string; goal: string }) =>
    `${(signal.question_id || "").toString().trim().toLowerCase()}::${(signal.goal || "")
      .toString()
      .trim()
      .toLowerCase()}`;
  const detailedSignalPairs = useMemo(() => {
    if (!showDetailedReviewSection || !reviewCurrent || !reviewNew) return [];
    const currentSignals = Array.isArray(reviewCurrent.detailedSignals)
      ? reviewCurrent.detailedSignals.filter(
          (signal): signal is CandidateDetailedSignal =>
            Boolean(signal?.question_id && signal?.goal && signal?.value),
        )
      : [];
    const nextSignals = Array.isArray(reviewNew.detailedSignals)
      ? reviewNew.detailedSignals.filter(
          (signal): signal is CandidateDetailedSignal =>
            Boolean(signal?.question_id && signal?.goal && signal?.value),
        )
      : [];
    const byKey = new Map<
      string,
      {
        key: string;
        questionId: string;
        signalKey: string | null;
        goal: string;
        questionText: string | null;
        current: CandidateDetailedSignal | null;
        next: CandidateDetailedSignal | null;
      }
    >();
    currentSignals.forEach((signal) => {
      const key = detailedSignalKey(signal);
      if (!key) return;
      byKey.set(key, {
        key,
        questionId: signal.question_id,
        signalKey: signal.signal_key ?? null,
        goal: signal.goal,
        questionText: signal.question_text ?? null,
        current: signal,
        next: byKey.get(key)?.next ?? null,
      });
    });
    nextSignals.forEach((signal) => {
      const key = detailedSignalKey(signal);
      if (!key) return;
      const existing = byKey.get(key);
      byKey.set(key, {
        key,
        questionId: signal.question_id,
        signalKey: signal.signal_key ?? existing?.signalKey ?? null,
        goal: signal.goal,
        questionText: signal.question_text ?? existing?.questionText ?? null,
        current: existing?.current ?? null,
        next: signal,
      });
    });
    return Array.from(byKey.values());
  }, [showDetailedReviewSection, reviewCurrent, reviewNew]);
  const [detailedQuestionWindows, setDetailedQuestionWindows] = useState<DetailedQuestionWindow[]>([]);
  const activeQuestionStartSecRef = useRef<number | null>(null);
  const normalizeWindowTime = (value: number) =>
    Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0;
  const upsertDetailedQuestionWindow = (
    questionId: string,
    startSeconds: number,
    endSeconds: number,
  ) => {
    const normalizedQuestionId = (questionId || "").trim();
    if (!normalizedQuestionId) return;
    const start = normalizeWindowTime(Math.min(startSeconds, endSeconds));
    const end = normalizeWindowTime(Math.max(startSeconds, endSeconds));
    if (end <= start) return;
    setDetailedQuestionWindows((prev) => {
      const existing = prev.find((item) => item.question_id === normalizedQuestionId);
      if (!existing) {
        return [...prev, { question_id: normalizedQuestionId, start_sec: start, end_sec: end }];
      }
      return prev.map((item) =>
        item.question_id === normalizedQuestionId
          ? {
              ...item,
              start_sec: Math.min(item.start_sec, start),
              end_sec: Math.max(item.end_sec, end),
            }
          : item,
      );
    });
  };
  const closeActiveQuestionWindow = (questionId: string | undefined | null, endSeconds: number) => {
    const startSeconds = activeQuestionStartSecRef.current;
    if (startSeconds === null) return;
    activeQuestionStartSecRef.current = null;
    const normalizedQuestionId = (questionId || "").trim();
    if (!normalizedQuestionId) return;
    upsertDetailedQuestionWindow(normalizedQuestionId, startSeconds, endSeconds);
  };
  const handleStartDetailedFlow = () => {
    if (!hasCandidateQuestions || recordingState !== "idle") return;
    setCandidateQuestionIndex(0);
    setQuestionCountdown(null);
    setDetailedAutoSavePending(false);
    setDetailedQuestionWindows([]);
    activeQuestionStartSecRef.current = null;
    setDetailedFlowStarted(true);
    setDetailedAwaitingContinue(true);
  };
  const handleContinueDetailedQuestion = () => {
    if (!hasCandidateQuestions || !detailedAwaitingContinue || questionCountdown !== null) return;
    setQuestionCountdown(questionCountdownSeconds);
  };
  const handlePreviousDetailedQuestion = () => {
    if (!hasCandidateQuestions || !canPrevCandidateQuestion) return;
    closeActiveQuestionWindow(candidateQuestion?.id, recordDurationSec);
    if (recordingState === "recording") {
      pauseRecording();
    }
    setQuestionCountdown(null);
    setCandidateQuestionIndex((prev) => Math.max(0, prev - 1));
    setDetailedAwaitingContinue(true);
  };
  const handleNextQuestion = () => {
    if (!canNextCandidateQuestion) {
      closeActiveQuestionWindow(candidateQuestion?.id, recordDurationSec);
      setQuestionCountdown(null);
      setDetailedAwaitingContinue(false);
      setDetailedAutoSaveTakeCount(recordedTakes.length);
      setDetailedAutoSavePending(true);
      stopRecording();
      return;
    }
    closeActiveQuestionWindow(candidateQuestion?.id, recordDurationSec);
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
      closeActiveQuestionWindow(candidateQuestion?.id, recordDurationSec);
      setQuestionCountdown(null);
      setIntroCountdown(null);
      setIntroStartPending(false);
      setDetailedFlowStarted(false);
      setDetailedAwaitingContinue(false);
      setDetailedAutoSavePending(false);
      setDetailedAutoSaveTakeCount(0);
      setDetailedQuestionWindows([]);
      activeQuestionStartSecRef.current = null;
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
    setDetailedQuestionWindows([]);
    activeQuestionStartSecRef.current = null;
  }, [candidateStep, candidateQuestionSet?.variant.id]);
  useEffect(() => {
    if (!hasCandidateQuestions || !detailedFlowStarted || detailedAwaitingContinue) {
      closeActiveQuestionWindow(candidateQuestion?.id, recordDurationSec);
      return;
    }
    if (recordingState === "recording") {
      if (activeQuestionStartSecRef.current === null) {
        activeQuestionStartSecRef.current = normalizeWindowTime(recordDurationSec);
      }
      return;
    }
    closeActiveQuestionWindow(candidateQuestion?.id, recordDurationSec);
  }, [
    hasCandidateQuestions,
    detailedFlowStarted,
    detailedAwaitingContinue,
    recordingState,
    candidateQuestion?.id,
    recordDurationSec,
  ]);
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
    void onSaveVideo({
      showBlockingOverlay: true,
      detailedQuestionWindows,
    });
  }, [
    detailedAutoSavePending,
    recordingState,
    recordedTakes.length,
    detailedAutoSaveTakeCount,
    onSaveVideo,
    detailedQuestionWindows,
  ]);
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
  const autoSizeTextarea = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };
  const renderSignalMetadata = (signal: CandidateDetailedSignal | null | undefined) => {
    if (!signal) return null;
    const hasStructuredData =
      Boolean(signal.structured_data) &&
      typeof signal.structured_data === "object" &&
      !Array.isArray(signal.structured_data) &&
      Object.keys(signal.structured_data as Record<string, unknown>).length > 0;
    if (!hasStructuredData) return null;
    return (
      <div className="signal-metadata">
        {hasStructuredData && (
          <div className="field">
            <label>Structured data</label>
            <pre className="signal-structured-json">
              {JSON.stringify(signal.structured_data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };
  const renderDetailedSignals = () => {
    if (detailedSignalPairs.length === 0) {
      return <p className="hint">No detailed signals.</p>;
    }
    return (
      <div className="review-detail-signals">
        {detailedSignalPairs.map((pair) => {
          const selectedChoice =
            reviewDetailedSignalChoices[pair.key] ?? (pair.next ? "new" : "current");
          const canChooseCurrent = Boolean(pair.current);
          const canChooseNew = Boolean(pair.next);
          return (
            <div key={pair.key} className="review-signal-card">
              <div className="review-signal-header">
                <span className="pill soft">{pair.goal}</span>
                <span className="hint">{pair.signalKey || pair.questionId}</span>
              </div>
              {pair.questionText && <p className="hint review-signal-question">{pair.questionText}</p>}
              {canChooseCurrent && canChooseNew && (
                <div className="review-choice review-choice-inline">
                  <label>
                    <input
                      type="radio"
                      name={`detailed-choice-${pair.key}`}
                      checked={selectedChoice === "current"}
                      onChange={() => onReviewDetailedSignalChoiceChange(pair.key, "current")}
                    />
                    Use current
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`detailed-choice-${pair.key}`}
                      checked={selectedChoice === "new"}
                      onChange={() => onReviewDetailedSignalChoiceChange(pair.key, "new")}
                    />
                    Use new
                  </label>
                </div>
              )}
              <div className="review-grid">
                <div className="field">
                  <label>Current value</label>
                  {pair.current ? (
                    <textarea
                      rows={1}
                      className="autosize-textarea"
                      ref={(element) => autoSizeTextarea(element)}
                      value={pair.current.value}
                      onChange={(event) => {
                        onReviewDetailedSignalValueChange("current", pair.key, event.target.value);
                        autoSizeTextarea(event.currentTarget);
                      }}
                    />
                  ) : (
                    <p className="hint">No current value.</p>
                  )}
                  {renderSignalMetadata(pair.current)}
                </div>
                <div className="field">
                  <label>New value</label>
                  {pair.next ? (
                    <textarea
                      rows={1}
                      className="autosize-textarea"
                      ref={(element) => autoSizeTextarea(element)}
                      value={pair.next.value}
                      onChange={(event) => {
                        onReviewDetailedSignalValueChange("new", pair.key, event.target.value);
                        autoSizeTextarea(event.currentTarget);
                      }}
                    />
                  ) : (
                    <p className="hint">No new value.</p>
                  )}
                  {renderSignalMetadata(pair.next)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isFindView) return null;

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
                {isAuthenticated && isEditingProfile ? (
                  <div className="profile-keyword-grid">
                    <div className="field">
                      <label>Keep</label>
                      <div className="keyword-chips review-keyword-chips">
                        {keywords.length > 0 ? (
                          keywords.map((keyword) => (
                            <button
                              key={`profile-keep-keyword-${keyword}`}
                              type="button"
                              className="keyword-chip keyword-chip-move"
                              onClick={() => onProfileMoveKeyword("keep", keyword)}
                              title="Move to Remove"
                            >
                              {keyword} &rarr;
                            </button>
                          ))
                        ) : (
                          <p className="hint">No keywords to keep.</p>
                        )}
                      </div>
                    </div>
                    <div className="field">
                      <label>Remove</label>
                      <div className="keyword-chips review-keyword-chips">
                        {removedKeywords.length > 0 ? (
                          removedKeywords.map((keyword) => (
                            <button
                              key={`profile-remove-keyword-${keyword}`}
                              type="button"
                              className="keyword-chip keyword-chip-move"
                              onClick={() => onProfileMoveKeyword("remove", keyword)}
                              title="Move back to Keep"
                            >
                              &larr; {keyword}
                            </button>
                          ))
                        ) : (
                          <p className="hint">No removed keywords.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : keywords.length > 0 ? (
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
              {isAuthenticated && isEditingProfile && (
                <div className="field">
                  <label>Detailed profile data</label>
                  {editableDetailedSignals.length > 0 ? (
                    <div className="review-detail-signals">
                      {editableDetailedSignals.map((signal, index) => (
                        <div
                          key={`editable-detailed-signal-${signal.question_id}-${signal.goal}-${index}`}
                          className="review-signal-card"
                        >
                          <div className="review-signal-header">
                            <span className="pill soft">{signal.goal}</span>
                            <span className="hint">{signal.signal_key || signal.question_id}</span>
                          </div>
                          {signal.question_text && <p className="hint review-signal-question">{signal.question_text}</p>}
                          <div className="field">
                            <label htmlFor={`detailed-signal-value-${index}`}>Value</label>
                            <textarea
                              id={`detailed-signal-value-${index}`}
                              rows={1}
                              className="autosize-textarea"
                              ref={(element) => autoSizeTextarea(element)}
                              value={signal.value}
                              onChange={(event) => {
                                onDetailedSignalValueChange(index, event.target.value);
                                autoSizeTextarea(event.currentTarget);
                              }}
                            />
                            {renderSignalMetadata(signal)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">No detailed profile data yet. Use Build detailed profile to add it.</p>
                  )}
                </div>
              )}

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
                              {candidateQuestion?.helperText && (
                                <p className="question-helper-text">{candidateQuestion.helperText}</p>
                              )}
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
                          className={`overlay-bottom ${
                            isSimpleRecordingFlow || showDetailedBottomAction ? "overlay-bottom-centered" : ""
                          }`}
                        >
                          {showDetailedBottomAction ? (
                            <div className="overlay-actions-centered">
                              <button type="button" className="cta primary question-cta" onClick={handleNextQuestion}>
                                {questionActionLabel}
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="overlay-actions-left" />
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
                            </>
                          )}
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
                      <h2>{showDetailedReviewSection ? "Review detailed profile update" : "Current vs New"}</h2>
                      <p className="hint">
                        {showDetailedReviewSection
                          ? "Review the new detailed information. Your basic profile video and basic fields stay unchanged."
                          : "Edit either side, then choose what to keep for each field."}
                      </p>
                    </div>
                  </div>

                  {!showDetailedReviewSection && (
                    <>
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
                    </>
                  )}

                  {showDetailedReviewSection ? (
                    <>
                      <div className="review-block">
                        <div className="review-block-header">
                          <h2>Keyword picker</h2>
                        </div>
                        <div className="review-grid">
                          <div className="field">
                            <label>Existing keywords</label>
                            <div className="keyword-chips review-keyword-chips">
                              {reviewCurrent.keywords.length > 0 ? (
                                reviewCurrent.keywords.map((keyword) => (
                                  <button
                                    key={`review-detailed-current-keyword-${keyword}`}
                                    type="button"
                                    className="keyword-chip keyword-chip-move"
                                    onClick={() => onReviewMoveKeyword("current", keyword)}
                                    title="Move to Keywords to add"
                                  >
                                    {keyword} &rarr;
                                  </button>
                                ))
                              ) : (
                                <p className="hint">No existing keywords.</p>
                              )}
                            </div>
                          </div>
                          <div className="field">
                            <label>Keywords to add</label>
                            <div className="keyword-chips review-keyword-chips">
                              {reviewNew.keywords.length > 0 ? (
                                reviewNew.keywords.map((keyword) => (
                                  <button
                                    key={`review-detailed-new-keyword-${keyword}`}
                                    type="button"
                                    className="keyword-chip keyword-chip-move"
                                    onClick={() => onReviewMoveKeyword("new", keyword)}
                                    title="Move to Existing keywords"
                                  >
                                    &larr; {keyword}
                                  </button>
                                ))
                              ) : (
                                <p className="hint">No keywords to add.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="review-block">
                        <div className="review-block-header">
                          <h2>New detailed info</h2>
                        </div>
                        <div className="field">
                          <label>Extracted from this detailed recording</label>
                          {renderDetailedSignals()}
                        </div>
                      </div>
                    </>
                  ) : (
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
                  )}

                  {error && <div className="error">{error}</div>}

                  <div className="panel-actions split">
                    <button type="button" className="ghost" onClick={() => goToStep(reviewBackStep)}>
                      {reviewBackLabel}
                    </button>
                    <div className="panel-action-right">
                      <button
                        type="button"
                        className="cta primary"
                        onClick={onApplyReview}
                        disabled={profileSaving}
                      >
                        {profileSaving ? "Saving..." : showDetailedReviewSection ? "Apply detailed update" : "Save profile update"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="hint">
                    No review data available. Go back and continue again.
                  </p>
                  <div className="panel-actions split">
                    <button type="button" className="ghost" onClick={() => goToStep(reviewBackStep)}>
                      {reviewBackLabel}
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

