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

  return (
    <>
      {nav}
      <section className="hero">
        <div className="view-pill">Create Zjob</div>
        <p className="tag">Zjobly</p>
        <h1>Post a role with a video intro</h1>
        <p className="lede">
          Record a quick clip (hard stop at 3:00), review the drafted details, then choose to publish or save.
        </p>

        <div className="stepper">
          <div className={`step ${createStep === "record" ? "active" : ""}`}>
            <span className="step-id">1</span>
            <span>Video</span>
          </div>
          <div className={`step ${createStep === "details" ? "active" : ""}`}>
            <span className="step-id">2</span>
            <span>Job details</span>
          </div>
          <div className={`step ${createStep === "publish" ? "active" : ""}`}>
            <span className="step-id">3</span>
            <span>Publish</span>
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
                <button type="button" className="ghost" onClick={() => goToStep("record")}>
                  Back to video
                </button>
                <button
                  type="button"
                  className="cta primary"
                  onClick={() => goToStep("publish")}
                  disabled={!form.title || !form.location || (!companyId && !form.companyName) || !videoSaved}
                >
                  Continue to publish
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
                            <button type="button" className="ghost dark" onClick={onBackToWelcome}>
                              Cancel
                            </button>
                          </div>
                          <div className="overlay-actions-right">
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

                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Save your video</h2>
                      <p className="hint">Pick one of your takes or upload a file, then save it.</p>
                    </div>
                    {videoSaved && <span className="pill">Video saved</span>}
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
                    <div className="success">Video saved. You can continue to details while we transcribe.</div>
                  )}

                  <div className="panel-actions split">
                    <button type="button" className="ghost" onClick={onBackToWelcome}>
                      Cancel
                    </button>
                    <div className="panel-action-right">
                      <button type="button" className="ghost" onClick={() => goToStep("details")} disabled={!videoSaved}>
                        Continue to details
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

          {createStep === "publish" && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Publish or save</h2>
                  <p className="hint">Choose whether to publish now or keep this job as a draft.</p>
                </div>
                <button type="button" className="ghost" onClick={() => goToStep("details")}>
                  Back to details
                </button>
              </div>

              <div className="job-summary">
                <div className="job-summary-row">
                  <span className="job-summary-label">Title</span>
                  <span>{form.title || "Untitled role"}</span>
                </div>
                <div className="job-summary-row">
                  <span className="job-summary-label">Location</span>
                  <span>{form.location || "Location TBD"}</span>
                </div>
                <div className="job-summary-row">
                  <span className="job-summary-label">Company</span>
                  <span>{form.companyName || "Existing company"}</span>
                </div>
                {form.description && (
                  <div className="job-summary-row">
                    <span className="job-summary-label">Description</span>
                    <span>{form.description}</span>
                  </div>
                )}
              </div>

              {videoUrl && (
                <div className="job-video-preview">
                  <video className="job-detail-video" src={videoUrl} controls preload="metadata" />
                </div>
              )}

              {error && <div className="error">{error}</div>}

              <div className="panel-actions split">
                <button type="button" className="ghost" onClick={() => onSaveJob(false)} disabled={jobSaving}>
                  {jobSaving ? "Saving..." : "Save draft"}
                </button>
                <button type="button" className="cta primary" onClick={() => onSaveJob(true)} disabled={jobSaving}>
                  {jobSaving ? "Publishing..." : "Publish job"}
                </button>
              </div>
            </div>
          )}
        </form>
      </section>
    </>
  );
}
