import { ChangeEvent, FormEvent, RefObject } from "react";
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
  form: { title: string; location: string; description: string };
  onInputChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  goToStep: (step: CreateStep) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  recorderOpen: boolean;
  recordingState: RecordingState;
  videoUrl: string | null;
  liveVideoRef: RefObject<HTMLVideoElement>;
  playbackVideoRef: RefObject<HTMLVideoElement>;
  recordLabel: string | null;
  durationLabel: string | null;
  selectedTake: RecordedTake | null;
  startRecording: () => void;
  stopRecording: () => void;
  error: string | null;
  recordedTakes: RecordedTake[];
  selectedTakeId: string | null;
  selectTake: (id: string) => void;
  handleVideoChange: (e: ChangeEvent<HTMLInputElement>) => void;
  status: Status;
  uploadProgress: number | null;
};

export function JobCreationFlow({
  view,
  nav,
  createStep,
  form,
  onInputChange,
  goToStep,
  handleSubmit,
  recorderOpen,
  recordingState,
  videoUrl,
  liveVideoRef,
  playbackVideoRef,
  recordLabel,
  durationLabel,
  selectedTake,
  startRecording,
  stopRecording,
  error,
  recordedTakes,
  selectedTakeId,
  selectTake,
  handleVideoChange,
  status,
  uploadProgress,
}: Props) {
  if (view !== "create") return null;

  const isSubmitting = status === "presigning" || status === "uploading" || status === "confirming";
  const uploadPercent = typeof uploadProgress === "number" ? Math.max(0, Math.min(100, uploadProgress)) : null;

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Create Zjob</div>
        <p className="tag">Zjobly</p>
        <h1>Post a role with a video intro</h1>
        <p className="lede">
          Follow the steps: add the role, record a quick clip (hard stop at 3:00), then choose the video to publish.
        </p>

        <div className="stepper">
          <div className={`step ${createStep === "details" ? "active" : ""}`}>
            <span className="step-id">1</span>
            <span>Role details</span>
          </div>
          <div className={`step ${createStep === "record" ? "active" : ""}`}>
            <span className="step-id">2</span>
            <span>Record</span>
          </div>
          <div className={`step ${createStep === "select" ? "active" : ""}`}>
            <span className="step-id">3</span>
            <span>Choose video & publish</span>
          </div>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
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

              <div className="panel-actions">
                <button
                  type="button"
                  className="cta primary"
                  onClick={() => goToStep("record")}
                  disabled={!form.title || !form.location}
                >
                  Continue to recording
                </button>
              </div>
            </div>
          )}

          {createStep === "record" && (
            <div className="fullscreen-recorder">
              <div className="record-shell">
                <div className="record-stage">
                  {recorderOpen ? (
                    <div className={`record-screen ${recordingState !== "recording" && videoUrl ? "playback" : ""}`}>
                      {recordingState !== "recording" && videoUrl ? (
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
                          <span className={`status-pill ${recordingState === "recording" ? "live" : "idle"}`}>
                            {recordingState === "recording" ? "Recording" : "Camera ready"}
                          </span>
                          <div className="record-timer">
                            <span>
                              {recordingState === "recording"
                                ? recordLabel ?? "0:00"
                                : durationLabel ?? recordLabel ?? "0:00"}
                            </span>
                            <span className="record-max">/ 3:00</span>
                          </div>
                        </div>
                        <div className="overlay-bottom">
                          <div className="overlay-actions-left">
                            <button type="button" className="ghost dark" onClick={() => goToStep("details")}>
                              Back
                            </button>
                          </div>
                          <div className="overlay-actions-right">
                            {recordingState !== "recording" && selectedTake && (
                              <button type="button" className="cta primary" onClick={() => goToStep("select")}>
                                Continue
                              </button>
                            )}
                            <button
                              type="button"
                              className={`record-btn ${recordingState === "recording" ? "stop" : "start"}`}
                              onClick={recordingState === "recording" ? stopRecording : startRecording}
                            >
                              {recordingState === "recording" ? "Stop recording" : "Start recording"}
                            </button>
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

                {error && <div className="error floating">{error}</div>}
              </div>
            </div>
          )}

          {createStep === "select" && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Choose a video for publication</h2>
                  <p className="hint">Pick one of your takes. We'll add multi-take editing next.</p>
                </div>
                <button type="button" className="ghost" onClick={() => goToStep("record")}>
                  Back to record
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
              {status === "success" && (
                <div className="success">Upload queued! We&apos;ll transcribe and process the video next.</div>
              )}

              <div className="panel-actions split">
                <button type="button" className="ghost" onClick={() => goToStep("record")} disabled={isSubmitting}>
                  Back
                </button>
                <button type="submit" disabled={isSubmitting || !selectedTake}>
                  {status === "presigning"
                    ? "Requesting upload..."
                    : status === "uploading"
                      ? `Uploading${uploadPercent !== null ? ` ${uploadPercent}%` : "..."}`
                      : status === "confirming"
                        ? "Confirming..."
                        : status === "success"
                          ? "Published"
                          : "Publish job"}
                </button>
              </div>
            </div>
          )}
        </form>
      </section>
    </>
  );
}
