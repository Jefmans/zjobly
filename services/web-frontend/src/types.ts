export type Status = 'idle' | 'presigning' | 'uploading' | 'confirming' | 'processing' | 'success' | 'error';
export type RecordingState = 'idle' | 'recording';
export type PermissionState = 'unknown' | 'granted' | 'denied';
export type ViewMode = 'welcome' | 'create' | 'find' | 'jobs' | 'jobDetail';
export type CreateStep = 'record' | 'select' | 'details';
export type UserRole = 'candidate' | 'employer';

export type MembershipRole = 'admin' | 'recruiter' | 'viewer';

export type User = {
  id: string;
  email?: string | null;
  full_name?: string | null;
};

export type RecordedTake = {
  id: string;
  file: File;
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

export type CompanyMembership = {
  id: string;
  user_id: string;
  company_id: string;
  role: MembershipRole;
  is_default: boolean;
};

export type CandidateProfileInput = {
  headline?: string | null;
  location?: string | null;
  summary?: string | null;
  discoverable: boolean;
};

export type CandidateProfile = CandidateProfileInput & {
  id: string;
  user_id: string;
};

export type JobStatus = 'draft' | 'open' | 'closed' | 'published';
export type JobVisibility = 'public' | 'private';

export type Job = {
  id: string;
  company_id?: string;
  title: string;
  location?: string;
  description?: string | null;
  status: JobStatus;
  visibility?: JobVisibility;
  videoLabel?: string;
  videoUrl?: string;
  video_object_key?: string | null;
  playback_url?: string | null;
  created_at?: string;
  updated_at?: string;
};
