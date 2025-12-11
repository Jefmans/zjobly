export type Status = 'idle' | 'submitting' | 'success';
export type RecordingState = 'idle' | 'recording';
export type PermissionState = 'unknown' | 'granted' | 'denied';
export type ViewMode = 'welcome' | 'create' | 'find' | 'jobs' | 'jobDetail';
export type CreateStep = 'details' | 'record' | 'select';

export type RecordedTake = {
  id: string;
  file: File;
  url: string;
  duration: number;
  label: string;
  source: 'recording' | 'upload';
};

export type Job = {
  id: string;
  title: string;
  location: string;
  status: 'published' | 'draft';
  videoLabel?: string;
};
