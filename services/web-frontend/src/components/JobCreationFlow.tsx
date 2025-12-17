import { ChangeEvent, RefObject } from "react";
import {
  CreateStep,
  RecordedTake,
  RecordingState,
  Status,
  ViewMode,
} from "../types";
import { formatDuration } from "../helpers";

type Props = {
  view: ViewMode;
  nav: JSX.Element;
  createStep: CreateStep;
  form: { title: string; location: string; description: string; companyName: string };
  transcriptText: string;
  onInputChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onTranscriptChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onGenerateFromTranscript: () => void;
  draftingFromTranscript: boolean;
  draftingError: string | null;
  goToStep: (step: CreateStep) => void;
  onSaveVideo: () => void;
  onSaveJob: (publish: boolean) => void;
  onBackToWelcome: () => void;
  recorderOpen: boolean;
  recordingState: RecordingState;
  videoUrl: string | null;
  videoObjectKey: string | null;
  liveVideoRef: RefObject<HTMLVideoElement>;
  playbackVideoRef: RefObject<HTMLVideoElement>;
  recordLabel: string | null;
  durationLabel: string | null;
  selectedTake: RecordedTake | null;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  error: string | null;
  recordedTakes: RecordedTake[];
  selectedTakeId: string | null;
  selectTake: (id: string) => void;
  handleVideoChange: (e: ChangeEvent<HTMLInputElement>) => void;
  status: Status;
  uploadProgress: number | null;
  processingMessage: string | null;
  companyId: string | null;
  jobSaving: boolean;
};

export function JobCreationFlow({
  view,
  nav,
  createStep,
  form,
  transcriptText,
  onInputChange,
  onTranscriptChange,
  onGenerateFromTranscript,
  draftingFromTranscript,
  draftingError,
  goToStep,
  onSaveVideo,
  onSaveJob,
  onBackToWelcome,
  recorderOpen,
  recordingState,
  videoUrl,
  videoObjectKey,
  liveVideoRef,
  playbackVideoRef,
  recordLabel,
  durationLabel,
  selectedTake,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  error,
  recordedTakes,
  selectedTakeId,
  selectTake,
  handleVideoChange,
  status,
  uploadProgress,
  processingMessage,
  companyId,
  jobSaving,
}: Props) {
  if (view !== "create") return null;

  const isSavingVideo = status === "presigning" || status === "uploading" || status === "confirming";
  const videoSaved = Boolean(videoObjectKey);
  const uploadPercent = typeof uploadProgress === "number" ? Math.max(0, Math.min(100, uploadProgress)) : null;
  const hasTakes = recordedTakes.length > 0;
  const hasTitle = Boolean(form.title.trim());
  const hasLocation = Boolean(form.location.trim());
  const hasCompany = Boolean(companyId || form.companyName.trim());
  const canSaveJob = videoSaved && hasTitle && hasLocation && hasCompany;
  const currentStepIndex = createStep === "record" ? 2 : createStep === "select" ? 3 : 4;
  const stepClass = (index: number) => {
    if (index === currentStepIndex) return "step active";
    if (index < currentStepIndex) return "step complete";
    return "step";
  };
  const isRecording = recordingState === "recording";
  const isPaused = recordingState === "paused";
  const isActiveRecording = isRecording || isPaused;
  const canRecord = recordingState === "idle" || recordingState === "paused";
  const canPause = recordingState === "recording";
  const canStop = recordingState === "recording" || recordingState === "paused";
  const recordActionLabel = isPaused ? "Resume" : "Start";
  const recordAction = isPaused ? resumeRecording : startRecording;

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Create Zjob</div>
        <p className="tag">Zjobly</p>
        <h1>Post a role with a video intro</h1>
        <p className="lede">
          Record a quick clip (hard stop at 3:00), select the take you want, save it, then complete and save the job details.
        </p>

        <div className="stepper">
          <div className={stepClass(1)}>
            <span className="step-id">1</span>
            <span>Homepage</span>
          </div>
          <div className={stepClass(2)}>
            <span className="step-id">2</span>
            <span>Video recording</span>
          </div>
          <div className={stepClass(3)}>
            <span className="step-id">3</span>
            <span>Select video</span>
          </div>
          <div className={stepClass(4)}>
            <span className="step-id">4</span>
            <span>Job details + save</span>
          </div>
        </div>

        <form className="upload-form" onSubmit={(event) => event.preventDefault()}>
          {createStep === "details" && (
            <div className="panel">
              <div className="field">
                <label htmlFor="title">Job title</label>
                <input
                  id="title"
                  name="title"
                  value={form.title}
                  onChange={onInputChange}
                  autoFocus
                  placeholder="e.g., Senior Backend Engineer"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="location">Location</label>
                <input
                  id="location"
                  name="location"
                  value={form.location}
                  onChange={onInputChange}
                  placeholder="e.g., Remote (EU) or Brussels"
                  required
                />
              </div>

              {!companyId && (
                <div className="field">
                  <label htmlFor="companyName">Company name</label>
                  <input
                    id="companyName"
                    name="companyName"
                    value={form.companyName}
                    onChange={onInputChange}
                    placeholder="e.g., Zjobly"
                    required
                  />
                  <p className="hint">We&apos;ll create this company and attach your job to it.</p>
                </div>
              )}
              {companyId && <p className="hint">Using your existing company (from env/local storage).</p>}

              <div className="field">
                <label htmlFor="transcript">Transcript (optional)</label>
                <textarea
                  id="transcript"
                  name="transcript"
                  value={transcriptText}
                  onChange={onTranscriptChange}
                  rows={5}
                  placeholder="Paste the spoken transcript (or wait for auto-fill) to generate the title and description."
                />
                <div className="panel-actions split">
                  <p className="hint">
                    We&apos;ll draft the posting once the transcript is ready. Paste it now to speed things up.
                  </p>
                  <button
                    type="button"
                    className="ghost"
                    onClick={onGenerateFromTranscript}
                    disabled={draftingFromTranscript || !transcriptText.trim()}
                  >
                    {draftingFromTranscript ? "Generating..." : "Generate title + description"}
                  </button>
                </div>
                {draftingError && <div className="error">{draftingError}</div>}
              </div>

              <div className="field">
                <label htmlFor="description">Job description</label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={onInputChange}
                  rows={5}
                  placeholder="Add a short pitch for the role. Generating from transcript will fill this in."
                />
              </div>

              {error && <div className="error">{error}</div>}

              <div className="panel-actions split">
                <button type="button" className="ghost" onClick={() => goToStep("select")}>
                  Back to select video
                </button>
                <div className="panel-action-right">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onSaveJob(true)}
                    disabled={!canSaveJob || jobSaving}
                  >
                    {jobSaving ? "Publishing..." : "Publish job"}
                  </button>
                  <button
                    type="button"
                    className="cta primary"
                    onClick={() => onSaveJob(false)}
                    disabled={!canSaveJob || jobSaving}
                  >
                    {jobSaving ? "Saving..." : "Save job"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {createStep === "record" && (
            <div className="fullscreen-recorder">
              <div className="record-shell">
                <div className="record-stage">
                  {recorderOpen ? (
                    <div className={`record-screen ${!isActiveRecording && videoUrl ? "playback" : ""}`}>
                      {!isActiveRecording && videoUrl ? (
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
                            <span className="record-max">/ 3:00</span>
                          </div>
                        </div>
                        <div className="overlay-bottom">
                          <div className="overlay-actions-left">
                            <button type="button" className="ghost dark" onClick={onBackToWelcome}>
                              Cancel
                            </button>
                          </div>
                          <div className="overlay-actions-right">
                            <div className="record-controls">
                              <button
                                type="button"
                                className="record-control record"
                                onClick={recordAction}
                                disabled={!canRecord}
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

                <div className="panel record-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Video recording</h2>
                      <p className="hint">Record one or more takes. You&apos;ll pick the best one next.</p>
                    </div>
                    {hasTakes && <span className="pill soft">{recordedTakes.length} takes</span>}
                  </div>

                  {!hasTakes && <p className="hint">Record a take to continue, or move on to upload one in the next step.</p>}
                  {error && <div className="error">{error}</div>}

                  <div className="panel-actions">
                    <button type="button" className="cta primary" onClick={() => goToStep("select")}>
                      Continue to select video
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {createStep === "select" && (
            <div className="fullscreen-recorder">
              <div className="record-shell">
                <div className="record-stage">
                  <div className="record-screen">
                    {videoUrl ? (
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
                      <div className="record-placeholder">
                        <p>Select a take to preview it here.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Select your video</h2>
                      <p className="hint">Choose a take or upload a file, then save it.</p>
                      {videoSaved && <span className="pill">Video saved</span>}
                    </div>
                    <button type="button" className="ghost" onClick={onBackToWelcome}>
                      Cancel
                    </button>
                  </div>

                  <div className="take-list">
                    {recordedTakes.length === 0 && <p className="hint">No takes yet. Record or upload to choose one.</p>}
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
                        <video src={take.url} controls preload="metadata" />
                      </label>
                    ))}
                  </div>

                  <div className="field">
                    <label htmlFor="video">Upload instead (max 3:00)</label>
                    <div className="upload-box">
                      <input id="video" name="video" type="file" accept="video/*" onChange={handleVideoChange} />
                      <div className="upload-copy">
                        <strong>Select a video file</strong>
                        <span>MP4, MOV, WEBM - up to 3 minutes</span>
                      </div>
                    </div>
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
                  {status === "success" && (
                    <div className="success">Video saved. You can continue to job details while we transcribe.</div>
                  )}

                  <div className="panel-actions split">
                    <button type="button" className="ghost" onClick={() => goToStep("record")}>
                      Back to recording
                    </button>
                    <div className="panel-action-right">
                      <button type="button" className="ghost" onClick={() => goToStep("details")} disabled={!videoSaved}>
                        Continue to job details
                      </button>
                      <button type="button" className="cta primary" onClick={onSaveVideo} disabled={isSavingVideo || !selectedTake}>
                        {isSavingVideo ? "Saving..." : videoSaved ? "Save again" : "Save video"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </section>
    </>
  );
}
