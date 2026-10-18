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
  kaiaPassword?: string;
  manualToken?: string;
  lat: number;
  lng: number;
  distanceM: number;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  workDate: string;
  pktClockInTime?: string;
  utcIsoTimestamp?: string;
  clockInIsoUTC?: string;
  jitterAppliedMs?: number;
  mode: 'manual' | 'cron' | 'webhook' | 'simulated' | 'late-override';
  status: 'success' | 'error' | 'skipped';
  responseStatus?: number;
  message?: string;
  error?: string;
  payload?: AttendancePayload | Record<string, any>;
  response?: any;
  accountId?: string;
  accountLabel?: string;
}

export type LogEntry = ExecutionLog;

export interface CronStatus {
  schedulerRunning: boolean;
  schedulerActive?: boolean;
  scheduleExpression: string;
  timezone: string;
  nextScheduledDescription: string;
  lastExecution: ExecutionLog | null;
  serverTimeUtc: string;
  serverTimePkt: string;
  currentPktDate: string;
}

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accounts: KaiaAccount[];
  personId: string;
  kaiaEmail: string;
  kaiaPassword?: string;
  manualToken?: string;
  bearerToken?: string;
  lat: number;
  lng: number;
  distanceM: number;
  defaultLat?: number;
  defaultLng?: number;
  defaultDistanceM?: number;
  cronSecret: string;
  autoJitter: boolean;
  simulateMode: boolean;
  cronSchedule?: string;
  cronEnabled?: boolean;
}

export interface LateRecordItem {
  id?: string;
  person_id: string;
  person_name?: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at?: string | null;
  clock_in_distance_m?: number | null;
  clock_in_lat?: number | null;
  clock_in_lng?: number | null;
  late: boolean;
  late_status?: string | null;
  late_reason?: string | null;
  late_reviewed_by?: string | null;
  late_reviewed_by_name?: string | null;
  late_reviewed_at?: string | null;
  approved_by?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  breaks?: unknown[];
  notes?: string | null;
  updated_at?: string | null;
  record_Status?: 'late' | 'absent' | 'on_time';
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export type SupabaseAttendanceRecord = LateRecordItem;

export interface KaiaPersonProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  roles: string[];
  active: boolean;
  current_level: number;
  current_score: number;
  warnings: number;
  status: string;
  pay_model?: string | null;
  base_rate?: number | null;
  fixed_salary?: number | null;
  city?: string | null;
  shift?: string | null;
  is_intern?: boolean;
  promoted_on?: string | null;
  allow_remote?: boolean;
  flagged_for_layoff?: boolean;
  primary_client_id?: string | null;
  backup_client_ids?: string[] | null;
  avatar_url?: string | null;
  discord_handle?: string | null;
  phone?: string | null;
  joined_on?: string | null;
  auth_user_id?: string | null;
  created_at?: string;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaClient {
  id: string;
  name: string;
  active: boolean;
  platform?: string | null;
  handles_at_kaia?: string | null;
  weekly_target?: number | null;
  manager_id?: string | null;
  created_at?: string;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaProduct {
  id: string;
  client_id: string;
  name: string;
  active: boolean;
  created_at?: string;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaBatch {
  id: string;
  code: number;
  name: string;
  client_id: string | null;
  client_name?: string;
  clients?: { id?: string; name?: string } | null;
  product_id: string | null;
  product_name?: string;
  products?: { id?: string; name?: string } | null;
  format: string | null;
  type: string | null;
  batch_type: string | null;
  angle: string | null;
  language?: string | null;
  outcome?: string | null;
  hooks?: number | null;
  spend?: number | null;
  roas?: number | null;
  hook_rate?: number | null;
  purchases?: number | null;
  brief_url: string | null;
  script_url_2?: string | null;
  drive_link: string | null;
  creative_url?: string | null;
  product_url?: string | null;
  ad_name_in_platform?: string | null;
  Winning_link: string | null;
  instructions: string | null;
  status: string;
  pay_status: string | null;
  quality: number | null;
  minutes: number | null;
  revisions: number | null;
  internal_revisions?: number | null;
  client_revisions?: number | null;
  variation_count: number | null;
  scriptwriter_id: string | null;
  scriptwriter_name?: string;
  creator_id: string | null;
  creator_name?: string;
  editor_id: string | null;
  editor_name?: string;
  qc_id: string | null;
  qc_name?: string;
  media_buyer_id: string | null;
  media_buyer_name?: string;
  assigned_role: string;
  due_at: string | null;
  delivered_at: string | null;
  approved_at: string | null;
  sent_to_client_at?: string | null;
  client_decision_at: string | null;
  learning_note: string | null;
  paid_period: string | null;
  paid_to: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  _overridden?: boolean;
  _overriddenAt?: string;
  _overrideMode?: 'supabase' | 'local-override';
  _overriddenFields?: string[];
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaTool {
  id: string;
  name: string;
  paid_by: string | null;
  client_id: string | null;
  plan_credits: number | null;
  current_credits: number | null;
  warn_threshold: number | null;
  crit_threshold: number | null;
  renewal_day: number | null;
  owner_id: string | null;
  notes: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaToolRequest {
  id: string;
  person_id: string;
  person_name?: string;
  client_id: string | null;
  client_name?: string;
  batch_id: string | null;
  batch_name?: string;
  tool_id?: string | null;
  tool_name: string;
  reason?: string | null;
  urgency: string;
  notes: string | null;
  status: string;
  created_at: string;
  picked_up_by: string | null;
  picked_up_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaStrike {
  id: string;
  person_id: string;
  issued_by: string | null;
  reason: string;
  details: string | null;
  created_at: string;
  acknowledged_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  counts_as_warning: boolean;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaTeamTask {
  id: string;
  kind: string;
  body: string;
  author_id: string | null;
  assignee_ids: string[];
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  created_at: string;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaNotification {
  id: string;
  person_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  batch_id: string | null;
  read_at: string | null;
  created_at: string;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaFormatWeight {
  format: string;
  weight: number;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaSetting {
  key: string;
  value: number | string | boolean;
  note: string | null;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaAiHouseRule {
  id: string;
  position: number;
  body: string;
  active: boolean;
  updated_by: string | null;
  updated_at: string;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaLevel {
  level: number;
  name: string;
  min_score: number;
  max_score: number | null;
  monthly_pay_usd: number;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaQualityFactor {
  score: number;
  factor: number;
  _customized?: boolean;
  _customizedAt?: string;
  _customizedMode?: 'supabase' | 'local-override';
}

export interface KaiaClientQualityFactor {
  client_id: string;
  score: number;
  factor: number;
  effective_from: string;
  _customized?: boolean;
}

export interface KaiaQcFeedbackCategory {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  _customized?: boolean;
}

export interface KaiaQcFeedback {
  id: string;
  batch_id: string;
  qc_id: string | null;
  quality: number;
  categories: string[];
  comment: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  _customized?: boolean;
}

export interface KaiaStatusEvent {
  id: string;
  batch_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
  _customized?: boolean;
}

export interface KaiaBatchFieldAudit {
  id: string;
  batch_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
  _customized?: boolean;
}

export interface KaiaPayRecord {
  id?: string;
  person_id: string;
  period?: string;
  manual_bonus_usd?: number | null;
  manual_bonus_reason?: string | null;
  amount_paid_usd?: number | null;
  total_pkr?: number | null;
  created_at?: string;
  _customized?: boolean;
}

export interface KaiaPayrollCarry {
  person_id: string;
  period?: string;
  minutes: number;
  _customized?: boolean;
}

export interface KaiaCreatorFlag {
  id: string;
  person_id: string;
  period?: string;
  reason: string;
  created_at: string;
  _customized?: boolean;
}

export interface KaiaStrikeEdit {
  id: string;
  strike_id: string;
  edited_by: string | null;
  edited_at: string;
  old_reason: string | null;
  old_details: string | null;
  new_reason: string | null;
  new_details: string | null;
  created_at: string;
  _customized?: boolean;
}

export interface KaiaToolBrand {
  tool_id: string;
  client_id: string;
  _customized?: boolean;
}

export interface KaiaToolAccount {
  id: string;
  tool_id: string;
  email?: string | null;
  username?: string | null;
  password?: string | null;
  notes?: string | null;
  created_at?: string;
  _customized?: boolean;
}

export interface KaiaToolCreditLog {
  id: string;
  tool_id: string;
  person_id: string | null;
  old_credits: number | null;
  new_credits: number | null;
  changed_at: string;
  _customized?: boolean;
}

export interface KaiaTrackerAdjustment {
  id: string;
  client_id: string;
  week_start: string;
  day_index: number;
  extra: number;
  changed_by: string | null;
  changed_at: string;
  _customized?: boolean;
}

export interface KaiaDailyBatchEntry {
  id: string;
  person_id: string;
  batch_id: string | null;
  client_id: string | null;
  entry_date: string;
  reported_status: string;
  hours: number | null;
  remarks: string | null;
  items: unknown[];
  created_at: string;
  updated_at: string;
  _customized?: boolean;
}

export interface KaiaWeeklyReport {
  id: string;
  person_id: string;
  week_start?: string;
  notes?: string | null;
  created_at?: string;
  _customized?: boolean;
}

export interface KaiaEditorTask {
  id: string;
  person_id?: string | null;
  batch_id?: string | null;
  title?: string;
  status?: string;
  due_at?: string | null;
  created_at?: string;
  _customized?: boolean;
}

export interface KaiaTimeEntry {
  id: string;
  batch_id: string;
  person_id: string;
  stage: string;
  started_at: string;
  stopped_at: string | null;
  _customized?: boolean;
}

export interface KaiaHoliday {
  id: string;
  holiday_date: string;
  name: string;
  city: string | null;
  created_by: string | null;
  created_at: string;
  _customized?: boolean;
}

export interface KaiaFormatWeightHistory {
  id: string;
  format: string;
  weight: number;
  effective_from: string;
  note: string | null;
  created_at: string;
  _customized?: boolean;
}

export interface KaiaDevNote {
  id: string;
  author_id?: string | null;
  body: string;
  done?: boolean;
  created_at: string;
  _customized?: boolean;
}

export type PortalTableName =
  | 'people'
  | 'batches'
  | 'attendance'
  | 'clients'
  | 'products'
  | 'tools'
  | 'tool_requests'
  | 'strikes'
  | 'team_tasks'
  | 'notifications'
  | 'format_weights'
  | 'settings'
  | 'ai_house_rules'
  | 'levels'
  | 'quality_factors'
  | 'client_quality_factors'
  | 'qc_feedback_categories'
  | 'qc_feedback'
  | 'status_events'
  | 'batch_field_audit'
  | 'pay_records'
  | 'payroll_carry'
  | 'creator_flags'
  | 'strike_edits'
  | 'tool_brands'
  | 'tool_accounts'
  | 'tool_credit_log'
  | 'tracker_adjustments'
  | 'daily_batch_entries'
  | 'weekly_reports'
  | 'editor_tasks'
  | 'time_entries'
  | 'holidays'
  | 'format_weight_history'
  | 'dev_notes';

export interface PortalBootstrapResponse {
  person: KaiaPersonProfile | null;
  people: KaiaPersonProfile[];
  batches: KaiaBatch[];
  attendance: LateRecordItem[];
  clients: KaiaClient[];
  products: KaiaProduct[];
  tools: KaiaTool[];
  tool_requests: KaiaToolRequest[];
  strikes: KaiaStrike[];
  team_tasks: KaiaTeamTask[];
  notifications: KaiaNotification[];
  format_weights: KaiaFormatWeight[];
  settings: KaiaSetting[];
  ai_house_rules: KaiaAiHouseRule[];
  levels: KaiaLevel[];
  quality_factors: KaiaQualityFactor[];
  client_quality_factors: KaiaClientQualityFactor[];
  qc_feedback_categories: KaiaQcFeedbackCategory[];
  qc_feedback: KaiaQcFeedback[];
  status_events: KaiaStatusEvent[];
  batch_field_audit: KaiaBatchFieldAudit[];
  pay_records: KaiaPayRecord[];
  payroll_carry: KaiaPayrollCarry[];
  creator_flags: KaiaCreatorFlag[];
  strike_edits: KaiaStrikeEdit[];
  tool_brands: KaiaToolBrand[];
  tool_accounts: KaiaToolAccount[];
  tool_credit_log: KaiaToolCreditLog[];
  tracker_adjustments: KaiaTrackerAdjustment[];
  daily_batch_entries: KaiaDailyBatchEntry[];
  weekly_reports: KaiaWeeklyReport[];
  editor_tasks: KaiaEditorTask[];
  time_entries: KaiaTimeEntry[];
  holidays: KaiaHoliday[];
  format_weight_history: KaiaFormatWeightHistory[];
  dev_notes: KaiaDevNote[];
  customizationCount: number;
}
