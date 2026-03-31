# Candidate Flow Test Plan (Handoff for Junior)

Last updated: 2026-03-31
Scope: Candidate journey in `services/web-frontend`

## 1. Environment and Development Navigation Setup

1. Start stack from repo root:
   - `docker compose up --build`
2. Open app at:
   - `http://localhost`
3. Confirm the development helpers are visible:
   - `Development navigation` panel appears at the top (enabled by `config/runtime.json` -> `ui.showDevelopmentNavigation: true`).
4. In the Development navigation panel set:
   - `Auth preview`: use `Real auth` for full flow tests.
   - `Company`: select a company when testing employer-created data dependencies.
   - `Candidate`: select the candidate test user you will run the flow with.
5. Browser permissions:
   - Allow camera and microphone when testing record flows.

Notes:
- In dev mode, a clickable screen label appears top-left (for example `Screen:FindZjob/JobsList/LoggedIn`). Use it to confirm you are on the expected screen.
- Candidate flow navigation is available from `Find Zjob`, `Browse jobs`, `My applications`, `My invitations`, `My profile`.

## 2. Candidate Test Data Prerequisites

Before executing the test suite, prepare these fixtures:

1. `candidate_new`: candidate account with no profile and no applications.
2. `candidate_ready`: candidate account with completed profile and intro video.
3. `job_open`: published job with video.
4. `job_closed`: previously published job now unpublished/closed.
5. `invitation_pending`: pending invitation for `candidate_ready`.

Fast setup path (UI):
1. As employer: create and publish one job (`job_open`).
2. As employer: unpublish one job (`job_closed`) after publishing.
3. As candidate: complete profile once (`candidate_ready`).
4. As employer: invite candidate once to create `invitation_pending`.

## 3. Manual Candidate Flow Test Cases

Use this severity scale when logging issues: `Blocker`, `High`, `Medium`, `Low`.

### CF-001 Candidate Entry From Welcome
- Screen: `Screen:Welcome/*`
- Precondition: app loaded.
- Steps:
  1. Click `Find Zjob`.
- Expected:
  1. Role switches to candidate.
  2. Screen label becomes `Screen:FindZjob/RecordVideo/*`.
  3. Candidate recording flow is visible.

### CF-002 Record Intro Video Controls
- Screen: `Screen:FindZjob/RecordVideo/*`
- Precondition: camera permission granted.
- Steps:
  1. Click `Start`.
  2. Click `Pause`.
  3. Click `Resume`.
  4. Click `Stop`.
- Expected:
  1. Status pill changes correctly (`Recording` -> `Paused` -> `Recording` -> idle/playback).
  2. Timer increases while recording.
  3. New take appears in take list count.

### CF-003 Candidate Question Prompts While Recording
- Screen: `Screen:FindZjob/RecordVideo/*`
- Precondition: candidate questions configured (default config is active).
- Steps:
  1. Start recording.
  2. Use `Previous` and `Next question` controls.
- Expected:
  1. Question index and text update.
  2. Countdown appears before recording resumes.
  3. Last question action changes to `End video`.

### CF-004 Select and Save Candidate Video
- Screen: `Screen:FindZjob/SelectVideo/*`
- Precondition: at least one take exists.
- Steps:
  1. Click `Continue to select video`.
  2. Select a take via radio button.
  3. Click `Save video`.
- Expected:
  1. Selected take preview appears.
  2. Save button enabled only when a take is selected.
  3. Upload/confirm notices appear and clear.

### CF-005 Upload Alternative Video File
- Screen: `Screen:FindZjob/SelectVideo/*`
- Precondition: candidate is on select step.
- Steps:
  1. Use `Upload instead` and select a short valid video file.
  2. Save video.
- Expected:
  1. Uploaded file appears as a take.
  2. Upload progress appears.
  3. Video can be previewed and saved.

### CF-006 Profile Detail Required Fields
- Screen: `Screen:FindZjob/ProfileDetail/*`
- Precondition: reach profile step.
- Steps:
  1. Leave `Headline`, `Location`, `Summary` empty.
  2. Click `Save profile`.
- Expected:
  1. Required errors are shown.
  2. Save blocked until fields are completed.

### CF-007 Save Candidate Profile and Discoverable Toggle
- Screen: `Screen:FindZjob/ProfileDetail/*`
- Precondition: valid profile fields entered.
- Steps:
  1. Toggle discoverable off, save profile.
  2. Toggle discoverable on, save again.
- Expected:
  1. Success message appears.
  2. Discoverable value persists when reopening profile.

### CF-008 Transcript and Keyword Feedback
- Screen: `Screen:FindZjob/ProfileDetail/*`
- Precondition: saved video exists.
- Steps:
  1. Wait for transcript/keyword processing.
  2. Observe transcript placeholder then resolved text.
- Expected:
  1. Pending text is shown during processing.
  2. Transcript and keyword chips appear when ready.

### CF-009 Open My Profile View
- Screen: `Screen:MyProfile/Detail/LoggedIn`
- Precondition: candidate is authenticated.
- Steps:
  1. Click `My profile` in primary nav.
- Expected:
  1. Profile detail screen loads.
  2. Headline, location, discoverable, summary, intro video, keywords are rendered.
  3. `Edit profile` returns to `Screen:FindZjob/ProfileDetail/LoggedIn`.

### CF-010 Browse Jobs List
- Screen: `Screen:FindZjob/JobsList/*`
- Precondition: at least one published job exists.
- Steps:
  1. Open `Browse jobs`.
  2. Change `Sort by` values.
- Expected:
  1. Jobs load without error.
  2. List updates with chosen sort.
  3. Applied status badge appears if candidate already applied.

### CF-011 Job Detail and Apply CTA (Logged Out)
- Screen: `Screen:FindZjob/JobDetail/LoggedOut`
- Precondition: use `Auth preview = Force logged out` or real logged-out state.
- Steps:
  1. Open a published job detail.
  2. Click `Create account to apply`.
- Expected:
  1. Auth prompt appears.
  2. After successful auth, user can continue to apply flow.

### CF-012 Job Detail Closed Job Behavior
- Screen: `Screen:FindZjob/JobDetail/*`
- Precondition: select `job_closed`.
- Steps:
  1. Open closed job detail.
- Expected:
  1. Message `This job is not open anymore` is shown.
  2. Apply controls are not available.
  3. `Back to jobs` works.

### CF-013 Application Recording Screen
- Screen: `Screen:FindZjob/ApplyVideo/LoggedIn`
- Precondition: open job, logged in, job is open.
- Steps:
  1. Click `Apply with video`.
  2. Record application video (start/pause/stop).
- Expected:
  1. Application recorder opens.
  2. Question card appears (if configured).
  3. Local preview is shown after stop.

### CF-014 Send Application
- Screen: `Screen:FindZjob/ApplyVideo/LoggedIn`
- Precondition: recorded or uploaded application video present.
- Steps:
  1. Click `Send application`.
- Expected:
  1. Presigning/upload/confirm/saving states appear.
  2. Success message `Application sent...` appears.
  3. Returning to job detail shows status badge and submitted video if available.

### CF-015 Prevent Duplicate Apply
- Screen: `Screen:FindZjob/JobDetail/LoggedIn`
- Precondition: candidate already applied to current job.
- Steps:
  1. Reopen same job detail.
- Expected:
  1. Panel shows `Your application` instead of apply form.
  2. Apply button is disabled/replaced.

### CF-016 My Applications List
- Screen: `Screen:FindZjob/MyApplications/LoggedIn`
- Precondition: at least one application exists.
- Steps:
  1. Open `My applications`.
  2. Expand/collapse an application card.
- Expected:
  1. Job title, location, status, apply date shown.
  2. Candidate application video and job video are rendered when available.

### CF-017 Candidate Invitations Empty State
- Screen: `Screen:MyInvitations/List/LoggedIn`
- Precondition: candidate has no invitations.
- Steps:
  1. Open `My invitations`.
- Expected:
  1. `No invitations yet.` is shown.

### CF-018 Accept Invitation
- Screen: `Screen:MyInvitations/List/LoggedIn`
- Precondition: pending invitation exists.
- Steps:
  1. Click `Accept` on a pending invitation.
- Expected:
  1. Row status changes from `Pending` to `Accepted`.
  2. Action buttons are replaced by read-only status text.

### CF-019 Reject Invitation
- Screen: `Screen:MyInvitations/List/LoggedIn`
- Precondition: separate pending invitation exists.
- Steps:
  1. Click `Reject`.
- Expected:
  1. Row status changes to `Rejected`.
  2. Buttons are no longer available.

### CF-020 Auth Preview Sanity Check (Dev Only)
- Screen: any candidate screen
- Precondition: development navigation visible.
- Steps:
  1. Set `Auth preview = Force logged out`.
  2. Verify gated actions (My profile, My applications, apply) request auth.
  3. Set `Auth preview = Force logged in`.
- Expected:
  1. Logged-out preview blocks authenticated actions.
  2. Logged-in preview unlocks UI paths for quick exploratory checks.

## 4. Defect Logging Template (Use for each failure)

- Test ID:
- Screen label:
- Build/date:
- Repro steps:
- Actual result:
- Expected result:
- Severity:
- Suggested fix:
- Screenshot/video link:

## 5. Automation Plan

Yes, this can be automated. Recommended approach: Playwright E2E for candidate smoke + regression flows.

### 5.1 What to Automate First (Week 1)

1. Navigation smoke:
   - Welcome -> Find Zjob -> Jobs list -> Job detail -> My applications -> My invitations.
2. Auth gating checks:
   - Logged-out user sees auth prompt when applying/viewing protected areas.
3. Happy path apply using file upload:
   - Prefer file upload path over camera recording for deterministic CI.
4. Invitations response:
   - Accept/reject transitions on pending invite.

### 5.2 What to Keep Manual Initially

1. Real camera/microphone recording reliability across browsers.
2. Long-running transcript/keyword processing edge cases.
3. UX polish checks (copy, alignment, animation quality).

### 5.3 Technical Approach

1. Add Playwright to `services/web-frontend`.
2. Run tests against the docker stack at `http://localhost`.
3. Seed deterministic fixtures before tests:
   - preferred: API seeding script (create users/job/applications/invitations).
   - fallback: SQL seed file executed against postgres.
4. Use stable selectors:
   - short term: role/text selectors.
   - medium term: add `data-testid` on critical buttons/forms.
5. Use screen labels as assertions in dev:
   - example: assert `Screen:FindZjob/JobsList/LoggedIn` when navigation completes.

### 5.4 Suggested Playwright Suite Layout

- `e2e/candidate-smoke.spec.ts`
  - CF-001, CF-009, CF-010, CF-016, CF-017
- `e2e/candidate-apply.spec.ts`
  - CF-011, CF-013, CF-014, CF-015
- `e2e/candidate-invitations.spec.ts`
  - CF-018, CF-019

### 5.5 CI Execution Strategy

1. Pull request pipeline:
   - run candidate smoke only.
2. Nightly pipeline:
   - run full candidate E2E suite.
3. On failure:
   - collect Playwright trace + screenshot + video.

### 5.6 Definition of Done for Junior

1. All `CF-001` to `CF-020` executed.
2. Defects logged with required template fields.
3. No blocker/high issue left untriaged.
4. Candidate smoke automation running locally and in CI.
