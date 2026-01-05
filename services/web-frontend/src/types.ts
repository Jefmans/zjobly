export type Status = 'idle' | 'presigning' | 'uploading' | 'confirming' | 'processing' | 'success' | 'error';
export type RecordingState = 'idle' | 'recording' | 'paused';
export type ViewMode =
  | 'welcome'
  | 'create'
  | 'find'
  | 'profile'
  | 'jobs'
  | 'jobDetail'
  | 'apply'
  | 'applications'
  | 'candidates';
export type CreateStep = 'record' | 'select' | 'details';
export type CandidateStep = 'record' | 'select' | 'profile';
export type UserRole = 'candidate' | 'employer';

export type RecordedTake = {
  id: string;
  file: File;
  audioSessionId?: string;
  url: string;
  duration: number;
  label: string;
  source: 'recording' | 'upload';
};

export type Company = {
  id: string;
  name: string;
  website?: string | null;
};

export type CompanyDev = {
  id: string;
  name: string;
  website?: string | null;
  default_user_id?: string | null;
  default_user_email?: string | null;
};

export type LocationDetails = {
  id: string;
  name: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: string | null;
  longitude?: string | null;
};

export type CandidateProfileInput = {
  headline?: string | null;
  location?: string | null;
  location_id?: string | null;
  summary?: string | null;
  keywords?: string[] | null;
  video_object_key?: string | null;
  discoverable: boolean;
};

export type CandidateProfile = CandidateProfileInput & {
  id: string;
  user_id: string;
  location_details?: LocationDetails | null;
  playback_url?: string | null;
};

export type JobStatus = 'draft' | 'open' | 'closed' | 'published';
export type JobVisibility = 'public' | 'private';
export type ApplicationStatus = 'applied' | 'reviewing' | 'rejected' | 'hired';

export type Job = {
  id: string;
  company_id?: string;
  title: string;
  location?: string;
  location_id?: string | null;
  location_details?: LocationDetails | null;
  description?: string | null;
  keywords?: string[] | null;
  status: JobStatus;
  visibility?: JobVisibility;
  videoLabel?: string;
  videoUrl?: string;
  video_object_key?: string | null;
  playback_url?: string | null;
  created_at?: string;
  updated_at?: string;
  applications_count?: number | null;
  withheld_count?: number | null;
};

export type JobApplication = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: ApplicationStatus;
  video_object_key?: string | null;
  applied_at?: string;
  updated_at?: string;
};

export type JobApplicationDetail = JobApplication & {
  playback_url?: string | null;
  candidate_profile: CandidateProfile;
};

export type CandidateApplication = JobApplication & {
  playback_url?: string | null;
  job: Job;
};
