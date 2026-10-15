export interface AttendancePayload {
  person_id: string;
  work_date: string;
  clock_in_at: string;
  clock_in_distance_m: number;
  clock_in_lat: number;
  clock_in_lng: number;
  late: boolean;
  updated_at: string;
}

export interface KaiaAccount {
  id: string;
  label: string;
  enabled: boolean;
  personId: string;
  kaiaEmail: string;
  kaiaPassword: string;
  manualToken: string;
  lat: number;
  lng: number;
  distanceM: number;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  mode: 'manual' | 'auto-cron' | 'simulated';
  status: 'success' | 'failed' | 'skipped';
  workDate: string;
  clockInIsoUTC: string;
  personId: string;
  accountId?: string;
  accountLabel?: string;
  accountEmail?: string;
  coordinates: {
    lat: number;
    lng: number;
    distanceM: number;
  };
  jitterAppliedMs?: number;
  responseStatus?: number;
  responseBody?: any;
  error?: string;
  message?: string;
}

export interface SupabaseAttendanceRecord {
  id?: string;
  person_id: string;
  work_date: string;
  clock_in_at: string;
  clock_in_distance_m: number;
  clock_in_lat: number;
  clock_in_lng: number;
  late: boolean;
  updated_at?: string;
  created_at?: string;
}

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accounts: KaiaAccount[];
  personId: string;
  kaiaEmail: string;
  kaiaPassword: string;
  manualToken: string;
  lat: number;
  lng: number;
  distanceM: number;
  cronSecret: string;
  autoJitter: boolean;
  simulateMode: boolean;
}

export interface CronStatus {
  schedulerActive: boolean;
  cronExpression: string;
  scheduleDescription: string;
  pktCurrentTime: string;
  utcCurrentTime: string;
  nextRunPkt: string;
  lastScheduledWorkDate: string;
  activeAccountsCount?: number;
  defaults: {
    personId: string;
    supabaseUrl: string;
    lat: number;
    lng: number;
    distanceM: number;
  };
}

export interface KaiaPersonProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
  pay_model?: string;
  base_rate?: number;
  current_level?: number;
  current_score?: number;
  warnings?: number;
  status?: string;
  active?: boolean;
  shift?: string;
}

export interface KaiaBatch {
  id: string;
  client_id: string | null;
  product_id: string | null;
  name: string;
  format: string | null;
  status: string;
  current_status_since: string | null;
  scriptwriter_id: string | null;
  creator_id: string | null;
  editor_id: string | null;
  qc_id: string | null;
  media_buyer_id: string | null;
  brief_url: string | null;
  creative_url: string | null;
  hooks: number | null;
  minutes: number | null;
  quality: number | null;
  internal_revisions: number;
  client_revisions: number;
  pay_status: string | null;
  language: string | null;
  created_at: string;
  approved_at: string | null;
  updated_at: string | null;
  due_at: string | null;
  clients?: {
    id: string;
    name: string;
    platform?: string | null;
    complexity?: number | null;
  } | null;
  products?: {
    id: string;
    name: string;
  } | null;
}

