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

export interface ExecutionLog {
  id: string;
  timestamp: string;
  mode: 'manual' | 'auto-cron' | 'simulated';
  status: 'success' | 'failed' | 'skipped';
  workDate: string;
  clockInIsoUTC: string;
  personId: string;
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
  defaults: {
    personId: string;
    supabaseUrl: string;
    lat: number;
    lng: number;
    distanceM: number;
  };
}
