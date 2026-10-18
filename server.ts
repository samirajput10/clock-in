import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type UpdateCategory = 'announcement' | 'feature' | 'fix' | 'maintenance';
interface AppUpdate {
  id: string;
  title: string;
  body: string;
  category: UpdateCategory;
  createdAt: string;
}

export interface ServerKaiaAccount {
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

const dataDirectory = path.resolve(__dirname, 'data');
const updatesFilePath = path.join(dataDirectory, 'updates.json');
const accountsFilePath = path.join(dataDirectory, 'accounts.json');
const batchOverridesFilePath = path.join(dataDirectory, 'batch-overrides.json');
const qcConfigFilePath = path.join(dataDirectory, 'qc-override.json');
const portalCustomizationsFilePath = path.join(dataDirectory, 'portal-customizations.json');

export interface BatchOverrideEntry {
  name?: string;
  format?: string | null;
  quality?: number | null;
  status?: string;
  approved_at?: string | null;
  due_at?: string | null;
  minutes?: number | null;
  hooks?: number | null;
  internal_revisions?: number;
  client_revisions?: number;
  outcome?: string | null;
  spend?: number | null;
  roas?: number | null;
  hook_rate?: number | null;
  purchases?: number | null;
  pay_status?: string | null;
  paid_period?: string | null;
  language?: string | null;
  client_id?: string | null;
  product_id?: string | null;
  creator_id?: string | null;
  editor_id?: string | null;
  scriptwriter_id?: string | null;
  qc_id?: string | null;
  media_buyer_id?: string | null;
  brief_url?: string | null;
  creative_url?: string | null;
  script_url_2?: string | null;
  product_url?: string | null;
  ad_name_in_platform?: string | null;
  instructions?: string | null;
  import_note?: string | null;
  rejected_reason?: string | null;
  updated_at: string;
}

export interface PortalCustomizationStore {
  overrides: Record<string, Record<string, Record<string, any>>>;
  created: Record<string, Record<string, any>[]>;
  deleted: Record<string, string[]>;
}

export interface StoredQcConfig {
  email: string;
  password?: string;
  accessToken?: string;
  serviceRoleKey?: string;
  personName?: string;
  personRole?: string;
}

const ALLOWED_PORTAL_TABLES = [
  'people',
  'batches',
  'attendance',
  'clients',
  'products',
  'tools',
  'tool_requests',
  'strikes',
  'team_tasks',
  'notifications',
  'format_weights',
  'settings',
  'ai_house_rules',
  'levels',
  'quality_factors',
  'client_quality_factors',
  'qc_feedback_categories',
  'qc_feedback',
  'status_events',
  'batch_field_audit',
  'pay_records',
  'payroll_carry',
  'creator_flags',
  'strike_edits',
  'tool_brands',
  'tool_accounts',
  'tool_credit_log',
  'tracker_adjustments',
  'daily_batch_entries',
  'weekly_reports',
  'editor_tasks',
  'time_entries',
  'holidays',
  'format_weight_history',
  'dev_notes',
] as const;

const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdnNtb2NrdnVmZ2JxcGVlcGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDU4OTQsImV4cCI6MjA5ODIyMTg5NH0.X0guVvHPpfLegMlT2Xu24XBZoFJEqztluUJE0b6G1gY';

const TABLE_VALID_COLUMNS: Record<string, string[]> = {
  batches: [
    'id', 'client_id', 'product_id', 'name', 'format', 'status', 'current_status_since',
    'scriptwriter_id', 'creator_id', 'editor_id', 'qc_id', 'media_buyer_id', 'brief_url',
    'creative_url', 'lander_urls', 'ad_name_in_platform', 'hooks', 'minutes', 'quality',
    'internal_revisions', 'client_revisions', 'outcome', 'spend', 'roas', 'hook_rate',
    'purchases', 'pay_status', 'created_at', 'approved_at', 'updated_at', 'headlines',
    'primary_texts', 'product_url', 'created_by', 'paid_period', 'paid_to', 'paid_at',
    'language', 'import_note', 'rejected_at', 'rejected_reason', 'replacement_of',
    'instructions', 'due_at', 'sent_to_client_at', 'sent_to_client_by', 'script_url_2',
  ],
  people: [
    'id', 'name', 'email', 'role', 'pay_model', 'base_rate', 'current_level', 'current_score',
    'warnings', 'status', 'active', 'created_at', 'roles', 'auth_user_id', 'city',
    'remote_allowed', 'shift', 'late_after_min', 'late_rule_from', 'primary_client_id',
    'secondary_client_id', 'is_intern', 'intern_stipend_pkr', 'intern_started_on',
    'promoted_on', 'secondary_client_ids', 'discord_user_id', 'fixed_salary_pkr',
  ],
  attendance: [
    'id', 'person_id', 'work_date', 'clock_in_at', 'clock_out_at', 'break_start_at',
    'break_end_at', 'late', 'auto_clocked_out', 'leave_informed_at', 'leave_note',
    'approved_by', 'approved_at', 'edited_by_admin', 'adjusted_by', 'adjusted_at', 'note',
    'created_at', 'updated_at', 'breaks', 'eod_worked_on', 'eod_finished', 'eod_tools_ok',
    'eod_tools_note', 'clock_in_lat', 'clock_in_lng', 'clock_in_distance_m', 'late_reason',
    'late_requested_at', 'late_status', 'late_reviewed_by', 'late_reviewed_at', 'late_review_note',
  ],
  clients: [
    'id', 'name', 'platform', 'we_script', 'monthly_purchase', 'weekly_target', 'active',
    'created_at', 'we_do_landers', 'we_do_media_buying', 'min_ready_batches', 'editors_onboarded',
    'manager_id', 'tracker_editable', 'trial_from', 'weight_factor', 'weight_factor_from',
    'complexity', 'complexity_note',
  ],
  products: [
    'id', 'client_id', 'name', 'copy_doc_url', 'has_pdp', 'has_advertorial', 'broll_ready', 'created_at',
  ],
  tools: [
    'id', 'name', 'source', 'owner', 'current_credits', 'max_credits', 'warn_threshold',
    'notes', 'archived', 'updated_at', 'updated_by', 'created_at',
  ],
  tool_requests: [
    'id', 'person_id', 'tool_id', 'tool_name', 'client_id', 'batch_id', 'urgency', 'note',
    'status', 'created_at', 'acknowledged_at', 'acknowledged_by', 'promised_at', 'resolved_at',
    'resolved_by', 'reply', 'updated_at',
  ],
  strikes: [
    'id', 'person_id', 'issued_by', 'severity', 'reason', 'details', 'issued_at', 'expires_at',
    'acknowledged_at', 'staff_response', 'counted_as_warning', 'created_at', 'revoked_at',
    'revoked_by', 'revoke_reason',
  ],
  team_tasks: [
    'id', 'body', 'author_id', 'done', 'done_by', 'done_at', 'created_at', 'updated_at',
    'is_task', 'reply_to', 'mentions',
  ],
  notifications: [
    'id', 'person_id', 'kind', 'period', 'ref', 'title', 'body', 'severity', 'created_at', 'read_at',
  ],
  format_weights: ['format', 'weight'],
  settings: ['key', 'value', 'note'],
  ai_house_rules: ['id', 'rules', 'updated_at', 'updated_by'],
  levels: ['level', 'name', 'min_score', 'max_score', 'monthly_pay_usd'],
  quality_factors: ['score', 'factor'],
  client_quality_factors: ['client_id', 'score', 'factor', 'effective_from'],
  qc_feedback_categories: ['id', 'name', 'sort_order', 'active'],
  qc_feedback: ['id', 'batch_id', 'qc_id', 'quality', 'categories', 'comment', 'acknowledged_at', 'acknowledged_by', 'created_at'],
  status_events: ['id', 'batch_id', 'from_status', 'to_status', 'changed_by', 'changed_at'],
  batch_field_audit: ['id', 'batch_id', 'field', 'old_value', 'new_value', 'changed_by', 'changed_at'],
  pay_records: ['person_id', 'period', 'manual_bonus_usd', 'manual_bonus_reason', 'amount_paid_usd', 'total_pkr'],
  payroll_carry: ['person_id', 'period', 'minutes'],
  creator_flags: ['id', 'person_id', 'period', 'reason', 'created_at'],
  strike_edits: ['id', 'strike_id', 'edited_by', 'edited_at', 'old_reason', 'old_details', 'new_reason', 'new_details', 'created_at'],
  tool_brands: ['tool_id', 'client_id'],
  tool_accounts: ['id', 'tool_id', 'email', 'username', 'password', 'notes', 'created_at'],
  tool_credit_log: ['id', 'tool_id', 'person_id', 'old_credits', 'new_credits', 'changed_at'],
  tracker_adjustments: ['id', 'client_id', 'week_start', 'day_index', 'extra', 'changed_by', 'changed_at'],
  daily_batch_entries: ['id', 'person_id', 'batch_id', 'client_id', 'entry_date', 'reported_status', 'hours', 'remarks', 'created_at', 'updated_at', 'items'],
  weekly_reports: ['id', 'person_id', 'week_start', 'notes', 'created_at'],
  editor_tasks: ['id', 'person_id', 'batch_id', 'title', 'status', 'due_at', 'created_at'],
  time_entries: ['id', 'batch_id', 'person_id', 'stage', 'started_at', 'stopped_at'],
  holidays: ['id', 'holiday_date', 'name', 'city', 'created_by', 'created_at'],
  format_weight_history: ['id', 'format', 'weight', 'effective_from', 'note', 'created_at'],
  dev_notes: ['id', 'author_id', 'body', 'done', 'created_at'],
};

// Stealth Zero-Attribution columns: never record or comment who changed/updated
const STEALTH_NULL_ATTRIBUTION_COLS = new Set([
  'changed_by',
  'updated_by',
  'edited_by',
  'adjusted_by',
  'approved_by',
  'late_reviewed_by',
  'late_review_note',
  'revoked_by',
  'revoke_reason',
  'acknowledged_by',
  'resolved_by',
  'done_by',
  'sent_to_client_by',
  'created_by',
  'author_id',
]);

function normalizeAndSanitizePayload(
  table: string,
  rawPayload: Record<string, any>,
  existingDbRow?: Record<string, any> | null
): { fullStorePayload: Record<string, any>; dbPayload: Record<string, any> } {
  const p: Record<string, any> = { ...rawPayload };

  // Strip internal metadata
  for (const k of Object.keys(p)) {
    if (k.startsWith('_') || k === 'clients' || k === 'products' || k === 'client_name' || k === 'product_name' || k === 'assigned_role' || k === 'code') {
      delete p[k];
    }
  }

  // Table-specific alias normalization
  if (table === 'batches') {
    if (p.revisions !== undefined && p.internal_revisions === undefined) {
      p.internal_revisions = Math.max(0, Number(p.revisions) || 0);
    }
    delete p.revisions;
    if (p.drive_link !== undefined && p.creative_url === undefined) {
      p.creative_url = p.drive_link;
    }
    delete p.drive_link;
    if (p.Winning_link !== undefined && p.product_url === undefined) {
      p.product_url = p.Winning_link;
    }
    delete p.Winning_link;

    // Fix pay_status enum values ('pending' | 'discarded') vs outcome ('winner' | 'super_winner')
    if (p.pay_status === 'approved') {
      p.pay_status = 'pending';
    } else if (p.pay_status === 'winner' || p.pay_status === 'super_winner') {
      p.outcome = p.pay_status;
      p.pay_status = 'pending';
    }
  } else if (table === 'people') {
    if (p.allow_remote !== undefined && p.remote_allowed === undefined) {
      p.remote_allowed = Boolean(p.allow_remote);
    }
    delete p.allow_remote;
    if (p.fixed_salary !== undefined && p.fixed_salary_pkr === undefined) {
      p.fixed_salary_pkr = p.fixed_salary;
    }
    delete p.fixed_salary;
    if (p.backup_client_ids !== undefined && p.secondary_client_ids === undefined) {
      p.secondary_client_ids = p.backup_client_ids;
    }
    delete p.backup_client_ids;
    delete p.flagged_for_layoff;
    delete p.monthly_pay_usd;
  } else if (table === 'strikes') {
    if (p.counts_as_warning !== undefined && p.counted_as_warning === undefined) {
      p.counted_as_warning = Boolean(p.counts_as_warning);
    }
    delete p.counts_as_warning;
  } else if (table === 'tools') {
    if (p.plan_credits !== undefined && p.max_credits === undefined) {
      p.max_credits = Number(p.plan_credits);
    }
    delete p.plan_credits;
    if (p.paid_by !== undefined && p.source === undefined) {
      p.source = p.paid_by;
    }
    delete p.paid_by;
    if (p.owner_id !== undefined && p.owner === undefined) {
      p.owner = p.owner_id;
    }
    delete p.owner_id;
    if (p.active !== undefined && p.archived === undefined) {
      p.archived = !p.active;
    }
    delete p.active;
    delete p.crit_threshold;
    delete p.renewal_day;
    delete p.client_id;
  } else if (table === 'tool_requests') {
    if (p.notes !== undefined && p.note === undefined) {
      p.note = p.notes;
    }
    delete p.notes;
    if (p.resolution_note !== undefined && p.reply === undefined) {
      p.reply = p.resolution_note;
    }
    delete p.resolution_note;
  } else if (table === 'team_tasks') {
    if (p.kind !== undefined && p.is_task === undefined) {
      p.is_task = p.kind === 'task';
    }
    delete p.kind;
    delete p.assignee_ids;
  }

  // Enforce Stealth Zero-Attribution: never comment or record who changed/updated
  for (const col of STEALTH_NULL_ATTRIBUTION_COLS) {
    if (col in p) {
      delete p[col];
    }
  }
  if (table === 'attendance') {
    p.edited_by_admin = false;
    delete p.note;
  }
  if (table === 'qc_feedback') {
    delete p.qc_id;
  }

  const validCols = new Set([
    ...(TABLE_VALID_COLUMNS[table] || []),
    ...(existingDbRow ? Object.keys(existingDbRow) : []),
  ]);

  const pkCol = getTablePrimaryKey(table);
  const dbPayload: Record<string, any> = {};

  for (const [k, v] of Object.entries(p)) {
    if (validCols.size > 0 && !validCols.has(k)) continue;
    if (existingDbRow && (k === pkCol || k === 'created_at')) continue;
    // If updating existing row, only send fields that actually changed!
    if (existingDbRow && k in existingDbRow) {
      const oldVal = existingDbRow[k];
      if (JSON.stringify(oldVal) === JSON.stringify(v)) continue;
    }
    dbPayload[k] = v;
  }

  return { fullStorePayload: p, dbPayload };
}

function enrichRowWithUiAliases(table: string, row: Record<string, any>): Record<string, any> {
  if (!row || typeof row !== 'object') return row;
  const r: Record<string, any> = { ...row };

  // Scrub attribution fields from display so "By / Changed by" is never shown
  for (const col of STEALTH_NULL_ATTRIBUTION_COLS) {
    if (col in r) r[col] = null;
  }

  if (table === 'batches') {
    r.revisions = r.internal_revisions ?? r.revisions ?? 0;
    r.drive_link = r.creative_url ?? r.drive_link ?? null;
    if (!r.code) {
      const m = String(r.name || '').match(/#(\d+)/);
      r.code = m ? Number(m[1]) : String(r.id || '').slice(0, 4);
    }
  } else if (table === 'people') {
    r.allow_remote = Boolean(r.remote_allowed ?? r.allow_remote);
    r.remote_allowed = Boolean(r.remote_allowed ?? r.allow_remote);
    r.fixed_salary = r.fixed_salary_pkr ?? r.fixed_salary ?? null;
    r.flagged_for_layoff = r.status === 'flagged' || Boolean(r.flagged_for_layoff);
  } else if (table === 'strikes') {
    r.counts_as_warning = Boolean(r.counted_as_warning ?? r.counts_as_warning);
    r.counted_as_warning = Boolean(r.counted_as_warning ?? r.counts_as_warning);
  } else if (table === 'tools') {
    r.plan_credits = r.max_credits ?? r.plan_credits ?? 100000;
    r.max_credits = r.max_credits ?? r.plan_credits ?? 100000;
    r.paid_by = r.source ?? r.paid_by ?? 'kaia';
    r.active = r.archived !== undefined ? !r.archived : (r.active ?? true);
  } else if (table === 'tool_requests') {
    r.notes = r.note ?? r.notes ?? null;
  }
  return r;
}

function getTablePrimaryKey(table: string): string {
  if (table === 'format_weights') return 'format';
  if (table === 'settings') return 'key';
  if (table === 'levels') return 'level';
  if (table === 'quality_factors') return 'score';
  if (table === 'client_quality_factors') return 'client_id';
  if (table === 'pay_records') return 'person_id';
  if (table === 'payroll_carry') return 'person_id';
  if (table === 'tool_brands') return 'tool_id';
  return 'id';
}

async function readPortalCustomizations(): Promise<PortalCustomizationStore> {
  try {
    const content = await readFile(portalCustomizationsFilePath, 'utf8');
    const parsed = JSON.parse(content);
    return {
      overrides: parsed?.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
      created: parsed?.created && typeof parsed.created === 'object' ? parsed.created : {},
      deleted: parsed?.deleted && typeof parsed.deleted === 'object' ? parsed.deleted : {},
    };
  } catch {
    return { overrides: {}, created: {}, deleted: {} };
  }
}

async function writePortalCustomizations(store: PortalCustomizationStore): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${portalCustomizationsFilePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), 'utf8');
  await rename(temporaryPath, portalCustomizationsFilePath);
}

async function readBatchOverrides(): Promise<Record<string, BatchOverrideEntry>> {
  try {
    const content = await readFile(batchOverridesFilePath, 'utf8');
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    return {};
  }
}

async function writeBatchOverrides(overrides: Record<string, BatchOverrideEntry>): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${batchOverridesFilePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(overrides, null, 2), 'utf8');
  await rename(temporaryPath, batchOverridesFilePath);
}

async function readQcConfig(): Promise<StoredQcConfig> {
  try {
    const content = await readFile(qcConfigFilePath, 'utf8');
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : { email: '' };
  } catch {
    return {
      email: process.env.KAIA_QC_EMAIL || '',
      password: process.env.KAIA_QC_PASSWORD || '',
      accessToken: process.env.KAIA_QC_TOKEN || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    };
  }
}

async function writeQcConfig(cfg: StoredQcConfig): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${qcConfigFilePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(cfg, null, 2), 'utf8');
  await rename(temporaryPath, qcConfigFilePath);
}

function mergeBatchWithOverride(
  batch: any,
  override?: BatchOverrideEntry,
  portalOverride?: Record<string, any>
) {
  if (!batch || typeof batch !== 'object') return batch;
  const merged: Record<string, any> = {
    ...batch,
    _dbQuality: batch.quality ?? null,
    _dbStatus: batch.status ?? null,
    _overriddenFields: [] as string[],
    _customizedFields: [] as string[],
  };

  const combined = { ...(override || {}), ...(portalOverride || {}) };
  for (const [key, val] of Object.entries(combined)) {
    if (key === 'updated_at' || key.startsWith('_')) continue;
    if (val !== undefined && val !== batch[key]) {
      merged[key] = val;
      if (!merged._overriddenFields.includes(key)) merged._overriddenFields.push(key);
      if (!merged._customizedFields.includes(key)) merged._customizedFields.push(key);
    }
  }
  if (combined.updated_at && merged._overriddenFields.length > 0) {
    merged.updated_at = combined.updated_at;
    merged._overridden = true;
    merged._customized = true;
  }
  return enrichRowWithUiAliases('batches', merged);
}

function mergeTableRowsWithCustomizations(
  table: string,
  rawRows: any[],
  store: PortalCustomizationStore,
  batchOverrides?: Record<string, BatchOverrideEntry>
): any[] {
  const pk = getTablePrimaryKey(table);
  const deletedSet = new Set(store.deleted[table] || []);
  const tableOverrides = store.overrides[table] || {};
  const createdRows = store.created[table] || [];

  const existingIds = new Set<string>();
  const mergedRows = (Array.isArray(rawRows) ? rawRows : [])
    .filter((row) => {
      const idVal = String(row?.[pk] ?? '');
      return idVal && !deletedSet.has(idVal);
    })
    .map((row) => {
      const idVal = String(row[pk]);
      existingIds.add(idVal);
      if (table === 'batches') {
        return mergeBatchWithOverride(row, batchOverrides?.[idVal], tableOverrides[idVal]);
      }
      const ov = tableOverrides[idVal];
      if (!ov) return enrichRowWithUiAliases(table, { ...row, _customizedFields: [] });
      const customizedFields: string[] = [];
      const next = { ...row };
      for (const [k, v] of Object.entries(ov)) {
        if (k.startsWith('_')) continue;
        if (v !== undefined && v !== row[k]) {
          next[k] = v;
          if (k !== 'updated_at') customizedFields.push(k);
        }
      }
      next._customizedFields = customizedFields;
      next._customized = customizedFields.length > 0;
      return enrichRowWithUiAliases(table, next);
    });

  const extraCreated = createdRows
    .filter((row) => {
      const idVal = String(row?.[pk] ?? '');
      return idVal && !deletedSet.has(idVal) && !existingIds.has(idVal);
    })
    .map((row) => {
      const idVal = String(row[pk]);
      const ov = tableOverrides[idVal] || {};
      return enrichRowWithUiAliases(table, {
        ...row,
        ...ov,
        _isCustomCreated: true,
        _customized: true,
        _customizedFields: Object.keys({ ...row, ...ov }).filter((k) => !k.startsWith('_')),
      });
    });

  return [...extraCreated, ...mergedRows];
}

async function readUpdates(): Promise<AppUpdate[]> {
  try {
    const content = await readFile(updatesFilePath, 'utf8');
    const updates = JSON.parse(content);
    return Array.isArray(updates) ? updates : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeUpdates(updates: AppUpdate[]): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${updatesFilePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(updates, null, 2), 'utf8');
  await rename(temporaryPath, updatesFilePath);
}

function getEnvAccounts(): ServerKaiaAccount[] {
  const defaultLat = Number(process.env.CLOCK_IN_LAT || 31.45037392501653);
  const defaultLng = Number(process.env.CLOCK_IN_LNG || 74.34174281647009);
  const defaultDist = Number(process.env.CLOCK_IN_DISTANCE_M || 7637);

  if (process.env.KAIA_ACCOUNTS_JSON) {
    try {
      const parsed = JSON.parse(process.env.KAIA_ACCOUNTS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((acc, idx) => ({
          id: acc.id || `env-acc-${idx + 1}`,
          label: acc.label || `Account ${idx + 1}`,
          enabled: acc.enabled ?? true,
          personId: acc.personId || '',
          kaiaEmail: acc.kaiaEmail || acc.email || '',
          kaiaPassword: acc.kaiaPassword || acc.password || '',
          manualToken: acc.manualToken || '',
          lat: Number(acc.lat ?? defaultLat),
          lng: Number(acc.lng ?? defaultLng),
          distanceM: Number(acc.distanceM ?? defaultDist),
        }));
      }
    } catch (e) {
      console.error('[Accounts] Failed to parse KAIA_ACCOUNTS_JSON:', e);
    }
  }

  const envAccounts: ServerKaiaAccount[] = [];
  // Primary env account
  if (process.env.KAIA_EMAIL || process.env.KAIA_PERSON_ID) {
    envAccounts.push({
      id: 'acc-1',
      label: 'Account 1 (Primary)',
      enabled: true,
      personId: process.env.KAIA_PERSON_ID || '3a38a9c0-f965-4fde-8c10-84a07dff2901',
      kaiaEmail: process.env.KAIA_EMAIL && process.env.KAIA_EMAIL !== 'your_email@example.com' ? process.env.KAIA_EMAIL : '',
      kaiaPassword: process.env.KAIA_PASSWORD && process.env.KAIA_PASSWORD !== 'your_kaia_password' ? process.env.KAIA_PASSWORD : '',
      manualToken: '',
      lat: defaultLat,
      lng: defaultLng,
      distanceM: defaultDist,
    });
  }

  // Numbered env accounts: KAIA_EMAIL_2, KAIA_EMAIL_3 ... up to 20
  for (let i = 2; i <= 20; i++) {
    const email = process.env[`KAIA_EMAIL_${i}`];
    const password = process.env[`KAIA_PASSWORD_${i}`];
    const personId = process.env[`KAIA_PERSON_ID_${i}`];
    const token = process.env[`KAIA_TOKEN_${i}`];
    if (email || personId || token) {
      envAccounts.push({
        id: `acc-${i}`,
        label: `Account ${i}`,
        enabled: true,
        personId: personId || '',
        kaiaEmail: email && !email.startsWith('your_email') ? email : '',
        kaiaPassword: password && !password.startsWith('your_kaia_password') ? password : '',
        manualToken: token || '',
        lat: Number(process.env[`CLOCK_IN_LAT_${i}`] || defaultLat),
        lng: Number(process.env[`CLOCK_IN_LNG_${i}`] || defaultLng),
        distanceM: Number(process.env[`CLOCK_IN_DISTANCE_M_${i}`] || defaultDist),
      });
    }
  }

  if (envAccounts.length === 0) {
    return [
      {
        id: 'acc-1',
        label: 'samiullah',
        enabled: true,
        personId: '3a38a9c0-f965-4fde-8c10-84a07dff2901',
        kaiaEmail: 'halmarrsami@gmail.com',
        kaiaPassword: '',
        manualToken: '',
        lat: defaultLat,
        lng: defaultLng,
        distanceM: defaultDist,
      },
      {
        id: 'acc-2',
        label: 'Mansoor Irshad',
        enabled: true,
        personId: 'f6ea1e81-a9c8-4500-a61d-4e290f24c8c0',
        kaiaEmail: 'ranaali96688@gmail.com',
        kaiaPassword: '',
        manualToken: '',
        lat: defaultLat,
        lng: defaultLng,
        distanceM: defaultDist,
      },
    ];
  }

  return envAccounts;
}

async function readAccounts(): Promise<ServerKaiaAccount[]> {
  try {
    const content = await readFile(accountsFilePath, 'utf8');
    const saved = JSON.parse(content);
    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[Accounts] Read error:', error);
    }
  }
  return getEnvAccounts();
}

async function writeAccounts(incomingAccounts: ServerKaiaAccount[]): Promise<ServerKaiaAccount[]> {
  const existing = await readAccounts().catch(() => []);
  const merged = incomingAccounts.map((acc, idx) => {
    const prev =
      existing.find((e) => e.id && e.id === acc.id) ||
      existing.find((e) => e.personId && acc.personId && e.personId === acc.personId) ||
      existing.find((e) => e.kaiaEmail && acc.kaiaEmail && e.kaiaEmail.toLowerCase() === acc.kaiaEmail.toLowerCase()) ||
      existing[idx];

    const rawLabel = (acc.label || '').trim();
    const isGenericLabel = !rawLabel || /^Account\s+\d+/i.test(rawLabel);
    const prevLabel = (prev?.label || '').trim();
    const prevIsGeneric = !prevLabel || /^Account\s+\d+/i.test(prevLabel);

    return {
      ...acc,
      label: isGenericLabel && !prevIsGeneric ? prevLabel : rawLabel || prevLabel || `Account ${idx + 1}`,
      personId: (acc.personId || '').trim() || (prev?.personId || '').trim(),
      kaiaEmail: (acc.kaiaEmail || '').trim() || (prev?.kaiaEmail || '').trim(),
      kaiaPassword: acc.kaiaPassword || prev?.kaiaPassword || '',
      manualToken: (acc.manualToken || '').trim() || (prev?.manualToken || '').trim(),
      lat: Number(acc.lat ?? prev?.lat ?? 31.45037392501653),
      lng: Number(acc.lng ?? prev?.lng ?? 74.34174281647009),
      distanceM: Number(acc.distanceM ?? prev?.distanceM ?? 7637),
    };
  });

  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${accountsFilePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(merged, null, 2), 'utf8');
  await rename(temporaryPath, accountsFilePath);
  return merged;
}

function isValidAdminPassword(provided: string | undefined): boolean {
  const expected = process.env.UPDATE_ADMIN_PASSWORD;
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
}

function requireUpdatesAdmin(req: Request, res: Response): boolean {
  if (!process.env.UPDATE_ADMIN_PASSWORD) {
    res.status(503).json({ error: 'Updates administration is not configured. Set UPDATE_ADMIN_PASSWORD on the server.' });
    return false;
  }
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!isValidAdminPassword(token)) {
    res.status(401).json({ error: 'Invalid admin password.' });
    return false;
  }
  return true;
}

async function safeParseJson<T = any>(response: globalThis.Response): Promise<T> {
  const text = await response.text();
  if (!text || text.trim().length === 0) {
    return {
      status: response.status,
      statusText: response.statusText,
      message: 'Request completed with an empty response body',
    } as unknown as T;
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html') || trimmed.includes('hosted on Netlify')) {
    if (trimmed.includes('hosted on Netlify') || response.status === 404) {
      throw new Error(
        `Received a Netlify HTML 404 page instead of JSON API response. This occurs when requesting a Netlify domain that has static export enabled (which strips API routes) or when the 'Supabase URL' is set to a Netlify site instead of the Supabase backend.`
      );
    }
    throw new Error(`Expected JSON but received an HTML response (HTTP ${response.status}): ${text.slice(0, 160)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
}

interface AttendanceRecord {
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
  coordinates: { lat: number; lng: number; distanceM: number };
  jitterAppliedMs?: number;
  responseStatus?: number;
  responseBody?: any;
  error?: string;
  message?: string;
}

// In-memory log ring buffer
const executionLogs: AttendanceRecord[] = [];
function addLog(log: AttendanceRecord) {
  executionLogs.unshift(log);
  if (executionLogs.length > 150) {
    executionLogs.pop();
  }
}

// Scheduler state
let internalSchedulerActive = true;
let lastScheduledWorkDate = '';

async function getFreshAuth(
  supabaseUrl: string,
  anonKey: string,
  email?: string,
  password?: string,
  manualToken?: string
): Promise<{ token: string; authUserId?: string; userEmail?: string }> {
  if (manualToken && manualToken.trim()) {
    return { token: manualToken.trim() };
  }

  const effectiveEmail = email?.trim() || process.env.KAIA_EMAIL;
  const effectivePassword = password || process.env.KAIA_PASSWORD;

  if (!effectiveEmail || !effectivePassword || effectiveEmail.startsWith('your_email')) {
    throw new Error(
      'Missing KAIA email or password for this account. Please enter valid KAIA credentials or a manual Bearer token in Config & Credentials.'
    );
  }

  const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: effectiveEmail,
      password: effectivePassword,
    }),
  });

  if (!authRes.ok) {
    const errText = await authRes.text();
    throw new Error(`Supabase Auth Failed (${authRes.status}) for ${effectiveEmail}: ${errText}`);
  }

  const authData = (await safeParseJson(authRes)) as {
    access_token?: string;
    user?: { id?: string; email?: string };
  };
  if (!authData?.access_token) {
    throw new Error(`Supabase Auth Failed (${authRes.status}): No access_token returned in response`);
  }
  return {
    token: authData.access_token,
    authUserId: authData.user?.id,
    userEmail: authData.user?.email || effectiveEmail,
  };
}

/**
 * Automatically resolves `person_id` if the user only entered Email + Password for a secondary account.
 * Checks explicit personId -> existing attendance rows under RLS -> people/profiles table -> auth.users.id
 */
async function resolvePersonId(
  supabaseUrl: string,
  anonKey: string,
  token: string,
  authUserId?: string,
  explicitPersonId?: string
): Promise<string> {
  if (explicitPersonId && explicitPersonId.trim()) {
    return explicitPersonId.trim();
  }

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 1. Try discovering person_id from existing attendance records visible to this user's token
  try {
    const attRes = await fetch(`${supabaseUrl}/rest/v1/attendance?select=person_id&order=work_date.desc&limit=1`, {
      headers,
    });
    if (attRes.ok) {
      const rows = await safeParseJson(attRes);
      if (Array.isArray(rows) && rows[0]?.person_id) {
        return String(rows[0].person_id);
      }
    }
  } catch {
    // ignore and try next source
  }

  // 2. Try people / employees / profiles table
  for (const table of ['people', 'employees', 'profiles']) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=1`, { headers });
      if (res.ok) {
        const rows = await safeParseJson(res);
        if (Array.isArray(rows) && rows[0]?.id) {
          return String(rows[0].id);
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. If token was manual and authUserId wasn't fetched yet, check /auth/v1/user
  if (!authUserId) {
    try {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
      if (userRes.ok) {
        const userObj = await safeParseJson(userRes);
        if (userObj?.id) {
          return String(userObj.id);
        }
      }
    } catch {
      // ignore
    }
  }

  if (authUserId) {
    return authUserId;
  }

  throw new Error(
    'Could not auto-detect Person ID for this account. Please provide the Person ID or verify the account has an existing profile.'
  );
}

interface PushAttendanceParams {
  workDate?: string;
  clockInIsoUTC?: string;
  accessToken?: string;
  addJitter?: boolean;
  simulate?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  personId?: string;
  email?: string;
  password?: string;
  lat?: number;
  lng?: number;
  distanceM?: number;
  late?: boolean;
  mode?: 'manual' | 'auto-cron' | 'simulated';
  accountId?: string;
  accountLabel?: string;
}

async function pushAttendance(params: PushAttendanceParams) {
  const url = (params.supabaseUrl || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
  const anonKey = params.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const lat = Number(params.lat ?? process.env.CLOCK_IN_LAT ?? 31.45037392501653);
  const lng = Number(params.lng ?? process.env.CLOCK_IN_LNG ?? 74.34174281647009);
  const distanceM = Number(params.distanceM ?? process.env.CLOCK_IN_DISTANCE_M ?? 7637);
  const isLate = params.late ?? false;
  const isSimulation = params.simulate ?? false;
  const mode = isSimulation ? 'simulated' : (params.mode || 'manual');
  const accountLabel = params.accountLabel || params.email || 'Account';

  // Compute PKT (UTC+5) Date
  const now = new Date();
  const pktOffsetMs = 5 * 60 * 60 * 1000;
  const pktNow = new Date(now.getTime() + pktOffsetMs);
  const targetWorkDate = params.workDate || pktNow.toISOString().split('T')[0];

  let jitterMs = 0;
  let targetIsoUTC = params.clockInIsoUTC;

  if (!targetIsoUTC) {
    const base8amUTC = new Date(`${targetWorkDate}T03:00:00.000Z`);
    if (params.addJitter) {
      jitterMs = Math.floor(Math.random() * 22000) + 2000; // 2s - 24s independent per account
      base8amUTC.setMilliseconds(base8amUTC.getMilliseconds() + jitterMs);
    }
    targetIsoUTC = base8amUTC.toISOString();
  } else if (params.addJitter) {
    // Even if a base clockInIsoUTC was passed from UI, apply independent jitter per account when requested
    const baseTime = new Date(targetIsoUTC);
    if (!isNaN(baseTime.getTime())) {
      jitterMs = Math.floor(Math.random() * 22000) + 2000;
      baseTime.setMilliseconds(baseTime.getMilliseconds() + jitterMs);
      targetIsoUTC = baseTime.toISOString();
    }
  }

  // If simulation mode
  if (isSimulation) {
    const simPersonId = params.personId?.trim() || 'auto-detected-on-live-run';
    const payload = {
      person_id: simPersonId,
      work_date: targetWorkDate,
      clock_in_at: targetIsoUTC,
      clock_in_distance_m: distanceM,
      clock_in_lat: lat,
      clock_in_lng: lng,
      late: isLate,
      updated_at: targetIsoUTC,
    };

    const simLog: AttendanceRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      mode: 'simulated',
      status: 'success',
      workDate: targetWorkDate,
      clockInIsoUTC: targetIsoUTC,
      personId: simPersonId,
      accountId: params.accountId,
      accountLabel,
      accountEmail: params.email,
      coordinates: { lat, lng, distanceM },
      jitterAppliedMs: jitterMs,
      responseStatus: 200,
      responseBody: { simulated: true, account: accountLabel, note: 'Dry run completed. No data was pushed to remote table.' },
      message: `[${accountLabel}] Simulation successful. Valid payload generated.`,
    };
    addLog(simLog);
    return { accountLabel, accountId: params.accountId, payload, result: { simulated: true }, mode: 'simulated', log: simLog };
  }

  let personId = params.personId?.trim() || '';
  try {
    const resolvedCreds = await resolveAccountCredentials({
      accountId: params.accountId,
      personId,
      email: params.email,
      password: params.password,
      accessToken: params.accessToken,
    });
    personId = resolvedCreds.personId || personId;

    // Obtain token
    const { token, authUserId } = await getFreshAuth(
      url,
      anonKey,
      resolvedCreds.email,
      resolvedCreds.password,
      resolvedCreds.accessToken
    );

    // Resolve personId (explicit or auto-discovered from Supabase)
    personId = await resolvePersonId(url, anonKey, token, authUserId, personId);

    const payload: Record<string, any> = {
      person_id: personId,
      work_date: targetWorkDate,
      clock_in_at: targetIsoUTC,
      clock_in_distance_m: distanceM,
      clock_in_lat: lat,
      clock_in_lng: lng,
      late: isLate,
      edited_by_admin: false,
      updated_at: targetIsoUTC,
    };
    if (!isLate) {
      payload.late_status = null;
      payload.late_reason = null;
      payload.late_reviewed_by = null;
      payload.late_reviewed_at = null;
      payload.late_review_note = null;
    }

    // First try upsert via POST with resolution=merge-duplicates
    const endpoint = `${url}/rest/v1/attendance?on_conflict=person_id%2Cwork_date`;
    let response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
    });

    let result: any = null;
    let responseStatus = response.status;

    if (response.ok) {
      result = await safeParseJson(response);
    } else {
      // Try PATCH if row already exists
      const patchUrl = `${url}/rest/v1/attendance?person_id=eq.${encodeURIComponent(personId)}&work_date=eq.${encodeURIComponent(targetWorkDate)}`;
      const patchBody: Record<string, any> = {
        clock_in_at: targetIsoUTC,
        clock_in_distance_m: distanceM,
        clock_in_lat: lat,
        clock_in_lng: lng,
        late: isLate,
        edited_by_admin: false,
        updated_at: targetIsoUTC,
      };
      if (!isLate) {
        patchBody.late_status = null;
        patchBody.late_reason = null;
      }
      const patchResponse = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(patchBody),
      });

      if (patchResponse.ok) {
        const patchedRows = await safeParseJson(patchResponse);
        if (Array.isArray(patchedRows) && patchedRows.length > 0) {
          response = patchResponse;
          responseStatus = patchResponse.status;
          result = patchedRows;
        }
      }

      // If PATCH returned 0 rows (no existing row), try direct POST insert
      if (!result) {
        const insertResponse = await fetch(`${url}/rest/v1/attendance`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(payload),
        });
        if (insertResponse.ok) {
          response = insertResponse;
          responseStatus = insertResponse.status;
          result = await safeParseJson(insertResponse);
        } else {
          const errorBody = await insertResponse.text();
          throw new Error(`Attendance Upsert/Insert Failed (${insertResponse.status}): ${errorBody}`);
        }
      }
    }

    const successLog: AttendanceRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      mode,
      status: 'success',
      workDate: targetWorkDate,
      clockInIsoUTC: targetIsoUTC,
      personId,
      accountId: params.accountId,
      accountLabel,
      accountEmail: resolvedCreds.email || params.email,
      coordinates: { lat, lng, distanceM },
      jitterAppliedMs: jitterMs,
      responseStatus,
      responseBody: result,
      message: `[${accountLabel}] Attendance record for ${targetWorkDate} pushed (${isLate ? 'Late' : 'On-Time'}) to KAIA Supabase.`,
    };
    addLog(successLog);

    return { accountLabel, accountId: params.accountId, personId, payload, result, mode, log: successLog };
  } catch (err: any) {
    const failedLog: AttendanceRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      mode,
      status: 'failed',
      workDate: targetWorkDate,
      clockInIsoUTC: targetIsoUTC,
      personId: personId || 'unknown',
      accountId: params.accountId,
      accountLabel,
      accountEmail: params.email,
      coordinates: { lat, lng, distanceM },
      jitterAppliedMs: jitterMs,
      responseStatus: 500,
      error: `[${accountLabel}] ${err.message}`,
    };
    addLog(failedLog);
    throw err;
  }
}

async function runScheduledMultiAccountClockIn(mode: 'auto-cron' | 'manual' = 'auto-cron') {
  const accounts = await readAccounts();
  const enabledAccounts = accounts.filter(
    (a) => a.enabled && (a.kaiaEmail || a.manualToken || a.personId)
  );

  if (enabledAccounts.length === 0) {
    // Fallback to default env push
    const single = await pushAttendance({ addJitter: true, mode, accountLabel: 'Primary Account' });
    return {
      success: true,
      mode,
      totalAccounts: 1,
      successCount: 1,
      failureCount: 0,
      results: [{ status: 'fulfilled', value: single }],
    };
  }

  const settled = await Promise.allSettled(
    enabledAccounts.map((acc) =>
      pushAttendance({
        addJitter: true,
        mode,
        accountId: acc.id,
        accountLabel: acc.label || acc.kaiaEmail || acc.id,
        personId: acc.personId,
        email: acc.kaiaEmail,
        password: acc.kaiaPassword,
        accessToken: acc.manualToken,
        lat: acc.lat,
        lng: acc.lng,
        distanceM: acc.distanceM,
      })
    )
  );

  const successCount = settled.filter((r) => r.status === 'fulfilled').length;
  const failureCount = settled.length - successCount;

  if (successCount === settled.length && settled.length > 0) {
    const pktNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
    lastScheduledWorkDate = pktNow.toISOString().split('T')[0];
  }

  return {
    success: successCount > 0,
    mode,
    totalAccounts: settled.length,
    successCount,
    failureCount,
    results: settled.map((r, i) =>
      r.status === 'fulfilled'
        ? { account: enabledAccounts[i].label, success: true, ...r.value }
        : { account: enabledAccounts[i].label, success: false, error: r.reason?.message || String(r.reason) }
    ),
  };
}

let isAutoCheckRunning = false;

/**
 * Self-healing auto-attendance check:
 * Runs at 08:00 AM PKT AND automatically catches up if the server starts/wakes up
 * anytime at or after 08:00 AM PKT on a workday (Monday-Saturday).
 */
async function checkAndRunAutoAttendance() {
  if (!internalSchedulerActive || isAutoCheckRunning) return;
  isAutoCheckRunning = true;
  try {
    const now = new Date();
    const pktNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const dayOfWeek = pktNow.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const hours = pktNow.getUTCHours();
    const dateStr = pktNow.toISOString().split('T')[0];

    // Only run Monday-Saturday at or after 08:00 AM PKT
    if (dayOfWeek !== 0 && hours >= 8 && lastScheduledWorkDate !== dateStr) {
      console.log(`[Automated Cron] Ensuring multi-account morning attendance for ${dateStr} PKT...`);
      const res = await runScheduledMultiAccountClockIn('auto-cron');
      if (res.successCount === res.totalAccounts && res.totalAccounts > 0) {
        lastScheduledWorkDate = dateStr;
      }
    }
  } catch (err: any) {
    console.error('[Automated Cron Error]', err.message);
  } finally {
    isAutoCheckRunning = false;
  }
}

// Background scheduler loop (runs every 20 seconds)
setInterval(() => {
  void checkAndRunAutoAttendance();
}, 20000);

export const app = express();
app.use(express.json());

  // Health / Ping
  app.get('/api/ping', (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // GET /api/accounts: Load persisted server-side accounts
  app.get('/api/accounts', async (_req: Request, res: Response) => {
    try {
      const accounts = await readAccounts();
      res.json({ success: true, accounts });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/accounts: Save accounts list on server for automated cron jobs
  app.post('/api/accounts', async (req: Request, res: Response) => {
    try {
      const accounts = req.body?.accounts;
      if (!Array.isArray(accounts)) {
        return res.status(400).json({ success: false, error: 'accounts must be an array' });
      }
      const saved = await writeAccounts(accounts);
      return res.json({ success: true, count: saved.length, accounts: saved });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/clock-in: Cron trigger endpoint (compatible with Vercel Cron & GitHub Actions)
  app.get('/api/clock-in', async (req: Request, res: Response) => {
    try {
      const configuredSecret = process.env.CRON_SECRET;
      const authHeader = req.headers['authorization'];
      const secretHeader = req.headers['x-cron-secret'];
      const secretQuery = req.query.secret as string;

      if (configuredSecret) {
        const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const provided = bearer || secretHeader || secretQuery;
        if (provided && provided !== configuredSecret) {
          return res.status(401).json({ success: false, error: 'Unauthorized CRON_SECRET mismatch' });
        }
      }

      // Skip Sundays automatically (0 = Sunday in PKT)
      const pktNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
      if (pktNow.getUTCDay() === 0) {
        const skipLog: AttendanceRecord = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          mode: 'auto-cron',
          status: 'skipped',
          workDate: pktNow.toISOString().split('T')[0],
          clockInIsoUTC: new Date().toISOString(),
          personId: 'all-accounts',
          accountLabel: 'All Enabled Accounts',
          coordinates: {
            lat: Number(process.env.CLOCK_IN_LAT || 31.45037),
            lng: Number(process.env.CLOCK_IN_LNG || 74.34174),
            distanceM: Number(process.env.CLOCK_IN_DISTANCE_M || 7637),
          },
          message: 'Skipped automatically: Sunday is a non-working day.',
        };
        addLog(skipLog);
        return res.json({ skipped: true, reason: 'Sunday (Non-working day)' });
      }

      const data = await runScheduledMultiAccountClockIn('auto-cron');
      return res.status(data.success ? 200 : 500).json(data);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/clock-in: Manual or Multi-Account UI Trigger
  app.post('/api/clock-in', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};

      // Check if a batch of accounts was passed
      if (Array.isArray(body.accounts) && body.accounts.length > 0) {
        const targetAccounts: ServerKaiaAccount[] = body.accounts;
        // Also persist to server if requested
        if (body.persistAccounts) {
          await writeAccounts(targetAccounts).catch(() => {});
        }

        const settled = await Promise.allSettled(
          targetAccounts.map((acc) =>
            pushAttendance({
              workDate: body.workDate,
              clockInIsoUTC: body.clockInIsoUTC,
              addJitter: body.addJitter ?? false,
              simulate: body.simulate ?? false,
              supabaseUrl: body.supabaseUrl,
              supabaseAnonKey: body.supabaseAnonKey,
              accountId: acc.id,
              accountLabel: acc.label || acc.kaiaEmail || acc.id,
              personId: acc.personId,
              email: acc.kaiaEmail,
              password: acc.kaiaPassword,
              accessToken: acc.manualToken,
              lat: acc.lat ?? body.lat,
              lng: acc.lng ?? body.lng,
              distanceM: acc.distanceM ?? body.distanceM,
              late: body.late,
              mode: 'manual',
            })
          )
        );

        const results = settled.map((r, idx) =>
          r.status === 'fulfilled'
            ? { account: targetAccounts[idx].label, success: true, ...r.value }
            : {
                account: targetAccounts[idx].label,
                success: false,
                error: r.reason?.message || String(r.reason),
              }
        );

        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.length - successCount;

        if (successCount === 0) {
          const firstErrors = results.map((r) => `${r.account}: ${(r as any).error}`).join(' | ');
          return res.status(500).json({
            success: false,
            error: firstErrors || 'All accounts failed to clock in',
            totalAccounts: results.length,
            successCount,
            failureCount,
            results,
          });
        }

        return res.json({
          success: true,
          mode: body.simulate ? 'simulated' : 'manual',
          totalAccounts: results.length,
          successCount,
          failureCount,
          results,
        });
      }

      // Single account execution
      const data = await pushAttendance({
        workDate: body.workDate,
        clockInIsoUTC: body.clockInIsoUTC,
        accessToken: body.accessToken,
        addJitter: body.addJitter ?? false,
        simulate: body.simulate ?? false,
        supabaseUrl: body.supabaseUrl,
        supabaseAnonKey: body.supabaseAnonKey,
        personId: body.personId,
        email: body.email,
        password: body.password,
        lat: body.lat,
        lng: body.lng,
        distanceM: body.distanceM,
        late: body.late,
        accountId: body.accountId,
        accountLabel: body.accountLabel,
        mode: 'manual',
      });
      return res.json({ success: true, ...data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/attendance/batch-update: Bulk update/backfill multiple Late or Absent dates across accounts
  app.post('/api/attendance/batch-update', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const entries: Array<{
        workDate: string;
        clockInIsoUTC?: string;
        late?: boolean;
        lat?: number;
        lng?: number;
        distanceM?: number;
      }> = Array.isArray(body.entries) ? body.entries : [];

      const accounts: ServerKaiaAccount[] = Array.isArray(body.accounts) ? body.accounts : [];

      if (entries.length === 0) {
        return res.status(400).json({ success: false, error: 'No date entries provided for batch update.' });
      }
      if (accounts.length === 0) {
        return res.status(400).json({ success: false, error: 'No target account(s) provided.' });
      }

      const tasks: Array<{ accountLabel: string; workDate: string; promise: Promise<any> }> = [];
      for (const acc of accounts) {
        for (const entry of entries) {
          tasks.push({
            accountLabel: acc.label || acc.kaiaEmail || acc.id,
            workDate: entry.workDate,
            promise: pushAttendance({
              workDate: entry.workDate,
              clockInIsoUTC: entry.clockInIsoUTC,
              addJitter: body.addJitter ?? true,
              simulate: body.simulate ?? false,
              supabaseUrl: body.supabaseUrl,
              supabaseAnonKey: body.supabaseAnonKey,
              accountId: acc.id,
              accountLabel: acc.label || acc.kaiaEmail || acc.id,
              personId: acc.personId,
              email: acc.kaiaEmail,
              password: acc.kaiaPassword,
              accessToken: acc.manualToken,
              lat: entry.lat ?? acc.lat ?? body.lat,
              lng: entry.lng ?? acc.lng ?? body.lng,
              distanceM: entry.distanceM ?? acc.distanceM ?? body.distanceM,
              late: entry.late ?? body.late ?? false,
              mode: 'manual',
            }),
          });
        }
      }

      const settled = await Promise.allSettled(tasks.map((t) => t.promise));
      const results = settled.map((r, idx) =>
        r.status === 'fulfilled'
          ? {
              account: tasks[idx].accountLabel,
              workDate: tasks[idx].workDate,
              success: true,
              ...r.value,
            }
          : {
              account: tasks[idx].accountLabel,
              workDate: tasks[idx].workDate,
              success: false,
              error: r.reason?.message || String(r.reason),
            }
      );

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      if (successCount === 0) {
        const firstError = (results[0] as any)?.error || 'Batch update failed';
        return res.status(500).json({
          success: false,
          error: firstError,
          totalOperations: results.length,
          successCount,
          failureCount,
          results,
        });
      }

      return res.json({
        success: true,
        totalOperations: results.length,
        successCount,
        failureCount,
        results,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Helper to resolve credentials from request OR fallback to server-saved accounts.json
  async function resolveAccountCredentials(input: {
    accountId?: string;
    personId?: string;
    email?: string;
    password?: string;
    accessToken?: string;
  }) {
    let email = input.email?.trim() || '';
    let password = input.password || '';
    let accessToken = input.accessToken?.trim() || '';
    let personId = input.personId?.trim() || '';

    if (!accessToken && (!email || !password)) {
      const savedAccounts = await readAccounts().catch(() => []);
      const match =
        savedAccounts.find((a) => input.accountId && a.id === input.accountId) ||
        savedAccounts.find((a) => personId && a.personId === personId) ||
        savedAccounts.find((a) => email && a.kaiaEmail === email) ||
        savedAccounts.find((a) => a.kaiaEmail && a.kaiaPassword);

      if (match) {
        email = email || match.kaiaEmail;
        password = password || match.kaiaPassword;
        accessToken = accessToken || match.manualToken;
        personId = personId || match.personId;
      }
    }

    return { email, password, accessToken, personId };
  }

  // GET /api/attendance/history: Pull real records from Supabase attendance table
  app.get('/api/attendance/history', async (req: Request, res: Response) => {
    try {
      const url = ((req.query.supabaseUrl as string) || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = (req.query.supabaseAnonKey as string) || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 120));
      const startDate = (req.query.startDate as string) || '';
      const endDate = (req.query.endDate as string) || '';
      const rawManualToken = (req.headers['authorization']?.replace('Bearer ', '') || (req.query.accessToken as string))?.trim();

      const resolved = await resolveAccountCredentials({
        accountId: req.query.accountId as string,
        personId: req.query.personId as string,
        email: req.query.email as string,
        password: req.query.password as string,
        accessToken: rawManualToken,
      });

      let token = resolved.accessToken;
      let authUserId: string | undefined;
      if (!token) {
        try {
          const auth = await getFreshAuth(url, anonKey, resolved.email || undefined, resolved.password || undefined);
          token = auth.token;
          authUserId = auth.authUserId;
        } catch {
          token = anonKey;
        }
      }

      let personId = resolved.personId;
      if (!personId && token && token !== anonKey) {
        try {
          personId = await resolvePersonId(url, anonKey, token, authUserId);
        } catch {
          // fallback
        }
      }
      if (!personId) {
        personId = process.env.KAIA_PERSON_ID || '3a38a9c0-f965-4fde-8c10-84a07dff2901';
      }

      let queryUrl = `${url}/rest/v1/attendance?person_id=eq.${encodeURIComponent(personId)}&order=work_date.desc&limit=${limit}`;
      if (startDate) {
        queryUrl += `&work_date=gte.${encodeURIComponent(startDate)}`;
      }
      if (endDate) {
        queryUrl += `&work_date=lte.${encodeURIComponent(endDate)}`;
      }

      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          success: false,
          error: `Supabase attendance query failed (${response.status}): ${errorText}`,
        });
      }

      let personName = '';
      const peopleNameMap = new Map<string, string>();
      try {
        const pRes = await fetch(`${url}/rest/v1/people?select=id,name,email,role&limit=500`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (pRes.ok) {
          const pRows = await safeParseJson(pRes);
          if (Array.isArray(pRows)) {
            for (const p of pRows) {
              if (p?.id && p?.name) peopleNameMap.set(p.id, p.name);
            }
            personName = peopleNameMap.get(personId) || '';
          }
        }
      } catch {
        // ignore
      }

      const rawRecords = await safeParseJson(response);
      const records = (Array.isArray(rawRecords) ? rawRecords : []).map((r: any) => ({
        ...r,
        person_name: peopleNameMap.get(r.person_id) || personName || null,
        approved_by_name: r.approved_by ? peopleNameMap.get(r.approved_by) || null : null,
        adjusted_by_name: r.adjusted_by ? peopleNameMap.get(r.adjusted_by) || null : null,
        late_reviewed_by_name: r.late_reviewed_by ? peopleNameMap.get(r.late_reviewed_by) || null : null,
      }));
      return res.json({
        success: true,
        personId,
        personName,
        records,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Helper to obtain a privileged QC/Admin/Manager/ServiceRole token if configured
  async function getPrivilegedQcToken(
    url: string,
    anonKey: string,
    input?: {
      qcEmail?: string;
      qcPassword?: string;
      qcAccessToken?: string;
      serviceRoleKey?: string;
    }
  ): Promise<{ token: string; apikey: string; source: string } | null> {
    const stored = await readQcConfig();
    const serviceRoleKey = (input?.serviceRoleKey || stored.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (serviceRoleKey) {
      return { token: serviceRoleKey, apikey: serviceRoleKey, source: 'service_role' };
    }

    const qcAccessToken = (input?.qcAccessToken || stored.accessToken || '').trim();
    if (qcAccessToken) {
      return { token: qcAccessToken, apikey: anonKey, source: stored.email || 'qc_bearer_token' };
    }

    const qcEmail = (input?.qcEmail || stored.email || '').trim();
    const qcPassword = input?.qcPassword || stored.password || '';
    if (qcEmail && qcPassword) {
      try {
        const auth = await getFreshAuth(url, anonKey, qcEmail, qcPassword);
        return { token: auth.token, apikey: anonKey, source: qcEmail };
      } catch {
        // fallback
      }
    }

    return null;
  }

  // Helper to sync batch quality (stars) to live Supabase tables (`qc_feedback` & `batch_field_audit`)
  async function syncBatchQualityToSupabaseDb(
    url: string,
    apikey: string,
    token: string,
    batchId: string,
    qualityVal: number | null,
    existingBatchRow?: Record<string, any> | null
  ): Promise<boolean> {
    if (!batchId || qualityVal === undefined) return false;
    const headers = {
      apikey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    let persistedInSupabase = false;
    try {
      if (qualityVal !== null) {
        const patchQcRes = await fetch(
          `${url}/rest/v1/qc_feedback?batch_id=eq.${encodeURIComponent(batchId)}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ quality: Number(qualityVal) }),
          }
        );
        if (patchQcRes.ok) {
          const patchedRows = await safeParseJson(patchQcRes);
          if (Array.isArray(patchedRows) && patchedRows.length > 0) {
            persistedInSupabase = true;
          } else {
            // No existing qc_feedback row for this batch yet -> INSERT one into live Supabase DB
            const qcReviewerId =
              existingBatchRow?.qc_id || 'e91f1f14-79fd-4847-8485-777aa772f6cf';
            const insertQcRes = await fetch(`${url}/rest/v1/qc_feedback`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                batch_id: batchId,
                qc_id: qcReviewerId,
                quality: Number(qualityVal),
                categories: [],
                notes: 'Approved',
              }),
            });
            if (insertQcRes.ok) {
              persistedInSupabase = true;
            }
          }
        }
      }
    } catch {
      // ignore qc_feedback error
    }

    try {
      if (qualityVal !== null) {
        const patchAuditRes = await fetch(
          `${url}/rest/v1/batch_field_audit?batch_id=eq.${encodeURIComponent(batchId)}&field=eq.quality`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ new_value: String(qualityVal) }),
          }
        );
        if (patchAuditRes.ok) {
          const auditRows = await safeParseJson(patchAuditRes);
          if (Array.isArray(auditRows) && auditRows.length > 0) {
            persistedInSupabase = true;
          }
        }
      }
    } catch {
      // ignore audit error
    }

    return persistedInSupabase;
  }

  function sanitizeBatchPayStatusAndOutcome(payload: Record<string, any>) {
    if (payload.pay_status !== undefined && payload.pay_status !== null) {
      const ps = String(payload.pay_status).trim().toLowerCase();
      if (ps === 'approved') {
        payload.pay_status = 'paid';
      } else if (ps === 'pending') {
        payload.pay_status = 'unpaid';
      } else if (ps === 'super_winner' || ps === 'winner' || ps === 'testing' || ps === 'loser') {
        if (!payload.outcome) payload.outcome = ps;
        payload.pay_status = 'paid';
      } else if (!['unpaid', 'paid', 'carried', 'excluded'].includes(ps)) {
        delete payload.pay_status;
      }
    }
  }

  // GET /api/batches: Fetch batches assigned to an account OR all portal batches + person profile + clients + products
  app.get('/api/batches', async (req: Request, res: Response) => {
    try {
      const url = ((req.query.supabaseUrl as string) || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = (req.query.supabaseAnonKey as string) || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 250));
      const scope = (req.query.scope as string) || 'assigned'; // 'assigned' | 'all'
      const rawManualToken = (req.headers['authorization']?.replace('Bearer ', '') || (req.query.accessToken as string))?.trim();

      const resolved = await resolveAccountCredentials({
        accountId: req.query.accountId as string,
        personId: req.query.personId as string,
        email: req.query.email as string,
        password: req.query.password as string,
        accessToken: rawManualToken,
      });

      let token = resolved.accessToken;
      let authUserId: string | undefined;
      if (!token) {
        const auth = await getFreshAuth(url, anonKey, resolved.email || undefined, resolved.password || undefined);
        token = auth.token;
        authUserId = auth.authUserId;
      }

      let personId = resolved.personId;
      if (!personId && token) {
        personId = await resolvePersonId(url, anonKey, token, authUserId);
      }

      const headers = {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const batchesQueryUrl =
        scope === 'all'
          ? `${url}/rest/v1/batches?select=*,clients(id,name,platform,complexity),products(id,name)&order=created_at.desc&limit=${limit}`
          : `${url}/rest/v1/batches?select=*,clients(id,name,platform,complexity),products(id,name)&or=(creator_id.eq.${encodeURIComponent(personId)},editor_id.eq.${encodeURIComponent(personId)},scriptwriter_id.eq.${encodeURIComponent(personId)},qc_id.eq.${encodeURIComponent(personId)},media_buyer_id.eq.${encodeURIComponent(personId)})&order=created_at.desc&limit=${limit}`;

      const [personRes, batchesRes, allPeopleRes, clientsRes, productsRes, qcFeedbackRes, overrides, portalStore, qcCfg] = await Promise.all([
        fetch(`${url}/rest/v1/people?id=eq.${encodeURIComponent(personId)}&limit=1`, { headers }),
        fetch(batchesQueryUrl, { headers }),
        fetch(`${url}/rest/v1/people?select=*&order=name.asc&limit=500`, { headers }).catch(() => null),
        fetch(`${url}/rest/v1/clients?select=*&order=name.asc&limit=500`, { headers }).catch(() => null),
        fetch(`${url}/rest/v1/products?select=*&order=name.asc&limit=500`, { headers }).catch(() => null),
        fetch(`${url}/rest/v1/qc_feedback?select=id,batch_id,qc_id,quality,created_at&order=created_at.desc&limit=500`, { headers }).catch(() => null),
        readBatchOverrides(),
        readPortalCustomizations(),
        readQcConfig(),
      ]);

      if (!batchesRes.ok) {
        const errorText = await batchesRes.text();
        return res.status(batchesRes.status).json({
          success: false,
          error: `Supabase batches query failed (${batchesRes.status}): ${errorText}`,
        });
      }

      const rawBatches = await safeParseJson(batchesRes);
      const qcQualityByBatchId = new Map<string, number>();
      if (qcFeedbackRes && qcFeedbackRes.ok) {
        const qfRows = await safeParseJson(qcFeedbackRes);
        if (Array.isArray(qfRows)) {
          for (const qf of qfRows) {
            if (qf?.batch_id && qf.quality !== null && qf.quality !== undefined && !qcQualityByBatchId.has(qf.batch_id)) {
              qcQualityByBatchId.set(qf.batch_id, Number(qf.quality));
            }
          }
        }
      }

      let person = null;
      if (personRes.ok) {
        const peopleRows = await safeParseJson(personRes);
        if (Array.isArray(peopleRows) && peopleRows[0]) {
          person = mergeTableRowsWithCustomizations('people', [peopleRows[0]], portalStore)[0];
        }
      }

      let allPeople: any[] = [];
      let qcPeople: any[] = [];
      if (allPeopleRes && allPeopleRes.ok) {
        const rows = await safeParseJson(allPeopleRes);
        if (Array.isArray(rows)) {
          allPeople = mergeTableRowsWithCustomizations('people', rows, portalStore);
          qcPeople = allPeople.filter(
            (p) =>
              p.role === 'qc' ||
              p.role === 'admin' ||
              p.role === 'manager' ||
              (Array.isArray(p.roles) && (p.roles.includes('qc') || p.roles.includes('admin') || p.roles.includes('manager')))
          );
        }
      }

      let clients: any[] = [];
      if (clientsRes && clientsRes.ok) {
        const cRows = await safeParseJson(clientsRes);
        if (Array.isArray(cRows)) clients = mergeTableRowsWithCustomizations('clients', cRows, portalStore);
      }

      let products: any[] = [];
      if (productsRes && productsRes.ok) {
        const pRows = await safeParseJson(productsRes);
        if (Array.isArray(pRows)) products = mergeTableRowsWithCustomizations('products', pRows, portalStore);
      }

      const pNameMap = new Map<string, string>();
      for (const p of allPeople) {
        if (p?.id && p?.name) pNameMap.set(p.id, p.name);
      }
      const cObjMap = new Map<string, any>();
      for (const c of clients) {
        if (c?.id) cObjMap.set(c.id, c);
      }
      const prObjMap = new Map<string, any>();
      for (const pr of products) {
        if (pr?.id) prObjMap.set(pr.id, pr);
      }

      const rawBatchesWithQcQuality = (Array.isArray(rawBatches) ? rawBatches : []).map((b: any) => {
        const qfQual = b?.id ? qcQualityByBatchId.get(b.id) : undefined;
        return qfQual !== undefined ? { ...b, quality: qfQual } : b;
      });

      const batchesArray = mergeTableRowsWithCustomizations(
        'batches',
        rawBatchesWithQcQuality,
        portalStore,
        overrides
      ).map((b: any) => ({
        ...b,
        code: b.code || b.name || 'Batch',
        clients: b.clients || (b.client_id ? cObjMap.get(b.client_id) || null : null),
        products: b.products || (b.product_id ? prObjMap.get(b.product_id) || null : null),
        client_name: b.clients?.name || (b.client_id ? cObjMap.get(b.client_id)?.name : null) || 'Unassigned Brand',
        product_name: b.products?.name || (b.product_id ? prObjMap.get(b.product_id)?.name : null) || null,
        creator_name: b.creator_id ? pNameMap.get(b.creator_id) || null : null,
        editor_name: b.editor_id ? pNameMap.get(b.editor_id) || null : null,
        scriptwriter_name: b.scriptwriter_id ? pNameMap.get(b.scriptwriter_id) || null : null,
        qc_name: b.qc_id ? pNameMap.get(b.qc_id) || null : null,
        media_buyer_name: b.media_buyer_id ? pNameMap.get(b.media_buyer_id) || null : null,
      }));

      return res.json({
        success: true,
        scope,
        personId,
        person,
        batches: batchesArray,
        allPeople,
        qcPeople,
        clients,
        products,
        qcConfig: {
          email: qcCfg.email || '',
          hasPassword: Boolean(qcCfg.password),
          hasToken: Boolean(qcCfg.accessToken),
          hasServiceRole: Boolean(qcCfg.serviceRoleKey),
          personName: qcCfg.personName || '',
          personRole: qcCfg.personRole || '',
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/batches/update: Update any/all fields on one or multiple batches (Direct DB + Force Overwrite persistence)
  app.post('/api/batches/update', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const url = (body.supabaseUrl || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = body.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

      const batchIds: string[] = Array.isArray(body.batchIds)
        ? body.batchIds.filter(Boolean)
        : body.batchId
        ? [String(body.batchId)]
        : [];

      if (batchIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one batchId or batchIds array is required.' });
      }

      const resolved = await resolveAccountCredentials({
        accountId: body.accountId,
        personId: body.personId,
        email: body.email,
        password: body.password,
        accessToken: body.accessToken,
      });

      let creatorToken = resolved.accessToken;
      if (!creatorToken) {
        const auth = await getFreshAuth(url, anonKey, resolved.email || undefined, resolved.password || undefined);
        creatorToken = auth.token;
      }

      const nowIso = new Date().toISOString();
      const fullPayload: Record<string, any> = {
        updated_at: nowIso,
      };
      const creatorPermittedPayload: Record<string, any> = {
        updated_at: nowIso,
      };

      const nullableNumberFields = ['quality', 'minutes', 'hooks', 'spend', 'roas', 'hook_rate', 'purchases'];
      for (const f of nullableNumberFields) {
        if (body[f] !== undefined) {
          const val = body[f] === null || body[f] === '' ? null : Number(body[f]);
          fullPayload[f] = val;
          if (f !== 'quality' && f !== 'minutes') {
            creatorPermittedPayload[f] = val;
          }
        }
      }

      if (body.internal_revisions !== undefined) {
        const val = Math.max(0, Number(body.internal_revisions));
        fullPayload.internal_revisions = val;
        creatorPermittedPayload.internal_revisions = val;
      }
      if (body.client_revisions !== undefined) {
        const val = Math.max(0, Number(body.client_revisions));
        fullPayload.client_revisions = val;
        creatorPermittedPayload.client_revisions = val;
      }

      const nullableStringFields = [
        'name',
        'format',
        'outcome',
        'pay_status',
        'paid_period',
        'language',
        'client_id',
        'product_id',
        'creator_id',
        'editor_id',
        'scriptwriter_id',
        'qc_id',
        'media_buyer_id',
        'brief_url',
        'creative_url',
        'script_url_2',
        'product_url',
        'ad_name_in_platform',
        'instructions',
        'import_note',
        'rejected_reason',
        'due_at',
        'approved_at',
      ];

      for (const f of nullableStringFields) {
        if (body[f] !== undefined) {
          const val = body[f] === null || body[f] === '' || body[f] === 'none' ? null : String(body[f]).trim();
          fullPayload[f] = val;
          if (f !== 'approved_at') {
            creatorPermittedPayload[f] = val;
          }
        }
      }

      sanitizeBatchPayStatusAndOutcome(fullPayload);
      sanitizeBatchPayStatusAndOutcome(creatorPermittedPayload);

      if (body.status !== undefined && body.status !== '') {
        const statusStr = String(body.status);
        fullPayload.status = statusStr;
        if ((statusStr === 'approved' || statusStr === 'client_approved') && body.setApprovedAt) {
          fullPayload.approved_at = nowIso;
        }
        if (statusStr !== 'approved' && statusStr !== 'rejected') {
          creatorPermittedPayload.status = statusStr;
        }
      }

      const idFilter =
        batchIds.length === 1
          ? `id=eq.${encodeURIComponent(batchIds[0])}`
          : `id=in.(${batchIds.map((id) => `"${id.replace(/"/g, '')}"`).join(',')})`;

      const patchUrl = `${url}/rest/v1/batches?${idFilter}&select=*,clients(id,name,platform,complexity),products(id,name)`;

      const privAuth = await getPrivilegedQcToken(url, anonKey, {
        qcEmail: body.qcEmail,
        qcPassword: body.qcPassword,
        qcAccessToken: body.qcAccessToken,
        serviceRoleKey: body.serviceRoleKey,
      });

      const primaryToken = privAuth ? privAuth.token : creatorToken;
      const primaryApikey = privAuth ? privAuth.apikey : anonKey;

      let existingRows: any[] = [];
      try {
        const getExisting = await fetch(patchUrl, {
          method: 'GET',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${creatorToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (getExisting.ok) {
          const parsed = await safeParseJson(getExisting);
          if (Array.isArray(parsed)) existingRows = parsed;
        }
      } catch {
        // ignore
      }
      const existingRowMap = new Map<string, any>();
      for (const r of existingRows) {
        if (r?.id) existingRowMap.set(r.id, r);
      }

      const fullRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          apikey: primaryApikey,
          Authorization: `Bearer ${primaryToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(fullPayload),
      });

      // Sync quality to qc_feedback and batch_field_audit tables on the live Supabase DB if quality was provided
      let qualitySyncedInSupabase = false;
      if (fullPayload.quality !== undefined) {
        for (const bId of batchIds) {
          const synced = await syncBatchQualityToSupabaseDb(
            url,
            primaryApikey,
            primaryToken,
            bId,
            fullPayload.quality,
            existingRowMap.get(bId)
          );
          if (synced) qualitySyncedInSupabase = true;
        }
      }

      const [overrides, portalStore] = await Promise.all([readBatchOverrides(), readPortalCustomizations()]);
      const requestedFieldKeys = Object.keys(fullPayload).filter((k) => k !== 'updated_at');

      if (fullRes.ok) {
        const updatedRows = await safeParseJson(fullRes);
        const updatedArray = Array.isArray(updatedRows) ? updatedRows : [];

        if (updatedArray.length > 0) {
          let overridesModified = false;
          for (const row of updatedArray) {
            // Only clear override keys that were actually updated in DB, preserving any previously overridden fields (like quality)
            if (overrides[row.id]) {
              for (const k of requestedFieldKeys) {
                if ((overrides[row.id] as any)[k] !== undefined && row[k] === fullPayload[k]) {
                  delete (overrides[row.id] as any)[k];
                  overridesModified = true;
                }
              }
              const remainingKeys = Object.keys(overrides[row.id]).filter((k) => k !== 'updated_at');
              if (remainingKeys.length === 0) {
                delete overrides[row.id];
                overridesModified = true;
              }
            }
            if (portalStore.overrides?.batches?.[row.id]) {
              for (const k of requestedFieldKeys) {
                if (portalStore.overrides.batches[row.id][k] !== undefined && row[k] === fullPayload[k]) {
                  delete portalStore.overrides.batches[row.id][k];
                  overridesModified = true;
                }
              }
              const remainingPortalKeys = Object.keys(portalStore.overrides.batches[row.id]).filter((k) => k !== 'updated_at');
              if (remainingPortalKeys.length === 0) {
                delete portalStore.overrides.batches[row.id];
                overridesModified = true;
              }
            }
          }
          if (overridesModified) {
            await Promise.all([writeBatchOverrides(overrides), writePortalCustomizations(portalStore)]);
          }

          return res.json({
            success: true,
            mode: privAuth ? `direct_db_privileged (${privAuth.source})` : 'direct_db',
            updatedCount: updatedArray.length,
            dbUpdatedFields: requestedFieldKeys,
            forceOverwrittenFields: [],
            batches: updatedArray.map((b) => mergeBatchWithOverride(b, overrides[b.id], portalStore.overrides?.batches?.[b.id])),
          });
        }
      }

      const fullErrText = !fullRes.ok ? await fullRes.text() : 'Row restricted by RLS policy; saved in Force Overwrite store.';

      // If user requested status='approved' and the batch is not already 'approved' or 'client_approved',
      // promote to 'client_approved' in the live Supabase DB so it immediately moves to Finished on portal.trykaia.com
      if (fullPayload.status === 'approved') {
        const needsClientApproved = existingRows.some(
          (r) => r.status !== 'approved' && r.status !== 'client_approved'
        );
        if (needsClientApproved || existingRows.length === 0) {
          creatorPermittedPayload.status = 'client_approved';
        }
      }

      // If minutes is included and batch is not yet approved, creator IS allowed to update minutes
      if (fullPayload.minutes !== undefined) {
        const allUnapproved =
          existingRows.length > 0 &&
          existingRows.every((r) => !r.approved_at && r.status !== 'approved' && r.status !== 'client_approved');
        if (allUnapproved) {
          creatorPermittedPayload.minutes = fullPayload.minutes;
        }
      }

      let dbRows: any[] = [];
      const creatorFields = Object.keys(creatorPermittedPayload).filter((k) => k !== 'updated_at');

      if (creatorFields.length > 0) {
        const permittedRes = await fetch(patchUrl, {
          method: 'PATCH',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${creatorToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(creatorPermittedPayload),
        });
        if (permittedRes.ok) {
          const parsed = await safeParseJson(permittedRes);
          if (Array.isArray(parsed)) dbRows = parsed;
        }
      }

      // Stealth-clean any self-attributed status_events or batch_field_audit created by this update
      if (dbRows.length > 0) {
        const cutoffIso = new Date(Date.now() - 15000).toISOString();
        for (const bId of batchIds) {
          fetch(
            `${url}/rest/v1/status_events?batch_id=eq.${encodeURIComponent(bId)}&changed_at=gte.${encodeURIComponent(cutoffIso)}`,
            {
              method: 'DELETE',
              headers: { apikey: anonKey, Authorization: `Bearer ${creatorToken}` },
            }
          ).catch(() => {});
          fetch(
            `${url}/rest/v1/batch_field_audit?batch_id=eq.${encodeURIComponent(bId)}&field=neq.quality&changed_at=gte.${encodeURIComponent(cutoffIso)}`,
            {
              method: 'DELETE',
              headers: { apikey: anonKey, Authorization: `Bearer ${creatorToken}` },
            }
          ).catch(() => {});
        }
      }

      if (dbRows.length === 0) {
        dbRows = existingRows;
      }

      const allRequestedFields = Object.keys(fullPayload).filter((k) => k !== 'updated_at');
      const effectivelyUpdatedInDb = new Set(creatorFields);
      if (fullPayload.status === 'approved' && creatorPermittedPayload.status === 'client_approved' && dbRows.length > 0) {
        effectivelyUpdatedInDb.add('status');
      }
      if (qualitySyncedInSupabase) {
        effectivelyUpdatedInDb.add('quality');
      }
      const forceOverwrittenFields = allRequestedFields.filter((k) => !effectivelyUpdatedInDb.has(k) || dbRows.length === 0);

      if (!portalStore.overrides.batches) portalStore.overrides.batches = {};

      for (const id of batchIds) {
        const existing = overrides[id] || { updated_at: nowIso };
        const existingPortal = portalStore.overrides.batches[id] || {};
        for (const k of allRequestedFields) {
          (existing as any)[k] = fullPayload[k];
          existingPortal[k] = fullPayload[k];
        }
        existing.updated_at = nowIso;
        existingPortal.updated_at = nowIso;
        overrides[id] = existing;
        portalStore.overrides.batches[id] = existingPortal;
      }

      await Promise.all([writeBatchOverrides(overrides), writePortalCustomizations(portalStore)]);

      const mergedBatches = dbRows.map((b) =>
        mergeBatchWithOverride(b, overrides[b.id], portalStore.overrides?.batches?.[b.id])
      );

      return res.json({
        success: true,
        mode: qualitySyncedInSupabase && forceOverwrittenFields.length === 0 ? 'direct_db' : 'hybrid_force_overwrite',
        updatedCount: mergedBatches.length || batchIds.length,
        dbUpdatedFields: Array.from(effectivelyUpdatedInDb),
        forceOverwrittenFields,
        triggerNotice: fullErrText,
        batches: mergedBatches,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/batches/qc-config: Save & verify QC/Admin credentials or token, and optionally flush all force-overwritten batches to Supabase DB
  app.post('/api/batches/qc-config', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const url = (body.supabaseUrl || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = body.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

      if (body.clear) {
        await writeQcConfig({ email: '' });
        return res.json({ success: true, cleared: true });
      }

      const existing = await readQcConfig();
      const email = (body.email ?? existing.email ?? '').trim();
      const password = body.password !== undefined && body.password !== '' ? body.password : existing.password;
      const accessToken = body.accessToken !== undefined ? body.accessToken.trim() : existing.accessToken;
      const serviceRoleKey = body.serviceRoleKey !== undefined ? body.serviceRoleKey.trim() : existing.serviceRoleKey;

      let token = serviceRoleKey || accessToken || '';
      let apikey = serviceRoleKey || anonKey;
      let authUserId: string | undefined;

      if (!token && email && password) {
        const auth = await getFreshAuth(url, anonKey, email, password);
        token = auth.token;
        authUserId = auth.authUserId;
      }

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Provide a QC/Admin email & password, Bearer token, or service_role key.',
        });
      }

      let personName = '';
      let personRole = serviceRoleKey ? 'service_role' : '';
      let isPrivileged = Boolean(serviceRoleKey);

      if (!serviceRoleKey) {
        const pId = await resolvePersonId(url, anonKey, token, authUserId).catch(() => '');
        if (pId) {
          const pRes = await fetch(`${url}/rest/v1/people?id=eq.${encodeURIComponent(pId)}&limit=1`, {
            headers: { apikey, Authorization: `Bearer ${token}` },
          });
          if (pRes.ok) {
            const rows = await safeParseJson(pRes);
            if (Array.isArray(rows) && rows[0]) {
              const p = rows[0];
              personName = p.name || '';
              const rolesArr: string[] = Array.isArray(p.roles) ? p.roles : [p.role];
              personRole = rolesArr.join(', ');
              isPrivileged =
                p.role === 'qc' ||
                p.role === 'admin' ||
                p.role === 'manager' ||
                rolesArr.includes('qc') ||
                rolesArr.includes('admin') ||
                rolesArr.includes('manager');
            }
          }
        }
      }

      const newCfg: StoredQcConfig = {
        email,
        password,
        accessToken,
        serviceRoleKey,
        personName,
        personRole,
      };
      await writeQcConfig(newCfg);

      let syncedToDbCount = 0;
      if (isPrivileged) {
        const overrides = await readBatchOverrides();
        const ids = Object.keys(overrides);
        for (const batchId of ids) {
          const ov = overrides[batchId];
          const payload: Record<string, any> = { ...ov, updated_at: new Date().toISOString() };
          const r = await fetch(`${url}/rest/v1/batches?id=eq.${encodeURIComponent(batchId)}`, {
            method: 'PATCH',
            headers: {
              apikey,
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify(payload),
          });
          if (r.ok) {
            delete overrides[batchId];
            syncedToDbCount++;
          }
        }
        if (syncedToDbCount > 0) {
          await writeBatchOverrides(overrides);
        }
      }

      return res.json({
        success: true,
        isPrivileged,
        personName,
        personRole,
        syncedToDbCount,
        qcConfig: {
          email: newCfg.email,
          hasPassword: Boolean(newCfg.password),
          hasToken: Boolean(newCfg.accessToken),
          hasServiceRole: Boolean(newCfg.serviceRoleKey),
          personName: newCfg.personName || '',
          personRole: newCfg.personRole || '',
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/batches/clear-overrides: Clear local Force Overwrites for all or selected batches
  app.post('/api/batches/clear-overrides', async (req: Request, res: Response) => {
    try {
      const { batchIds } = req.body || {};
      const portalStore = await readPortalCustomizations();
      if (Array.isArray(batchIds) && batchIds.length > 0) {
        const overrides = await readBatchOverrides();
        for (const id of batchIds) {
          delete overrides[id];
          if (portalStore.overrides?.batches) delete portalStore.overrides.batches[id];
        }
        await Promise.all([writeBatchOverrides(overrides), writePortalCustomizations(portalStore)]);
      } else {
        if (portalStore.overrides?.batches) portalStore.overrides.batches = {};
        await Promise.all([writeBatchOverrides({}), writePortalCustomizations(portalStore)]);
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/portal/bootstrap: Fetch all tables from https://portal.trykaia.com/ merged with server customizations
  app.get('/api/portal/bootstrap', async (req: Request, res: Response) => {
    try {
      const url = ((req.query.supabaseUrl as string) || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = (req.query.supabaseAnonKey as string) || process.env.SUPABASE_ANON_KEY || '';
      const rawManualToken = (req.headers['authorization']?.replace('Bearer ', '') || (req.query.accessToken as string))?.trim();

      const resolved = await resolveAccountCredentials({
        accountId: req.query.accountId as string,
        personId: req.query.personId as string,
        email: req.query.email as string,
        password: req.query.password as string,
        accessToken: rawManualToken,
      });

      const privAuth = await getPrivilegedQcToken(url, anonKey);
      let token = privAuth?.token || resolved.accessToken;
      let apikey = privAuth?.apikey || anonKey;
      let authUserId: string | undefined;

      if (!token) {
        const auth = await getFreshAuth(url, anonKey, resolved.email || undefined, resolved.password || undefined);
        token = auth.token;
        authUserId = auth.authUserId;
      }

      let personId = resolved.personId;
      if (!personId && token) {
        personId = await resolvePersonId(url, anonKey, token, authUserId).catch(() => '');
      }

      const headers = {
        apikey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const fetchTableSafe = async (queryPath: string) => {
        try {
          const r = await fetch(`${url}/rest/v1/${queryPath}`, { headers });
          if (!r.ok) return [];
          const data = await safeParseJson(r);
          return Array.isArray(data) ? data : [];
        } catch {
          return [];
        }
      };

      const [
        rawPeople,
        rawBatches,
        rawAttendance,
        rawClients,
        rawProducts,
        rawTools,
        rawToolRequests,
        rawStrikes,
        rawTeamTasks,
        rawNotifications,
        rawFormatWeights,
        rawSettings,
        rawAiHouseRules,
        rawLevels,
        rawQualityFactors,
        rawClientQualityFactors,
        rawQcFeedbackCategories,
        rawQcFeedback,
        rawStatusEvents,
        rawBatchFieldAudit,
        rawPayRecords,
        rawPayrollCarry,
        rawCreatorFlags,
        rawStrikeEdits,
        rawToolBrands,
        rawToolAccounts,
        rawToolCreditLog,
        rawTrackerAdjustments,
        rawDailyBatchEntries,
        rawWeeklyReports,
        rawEditorTasks,
        rawTimeEntries,
        rawHolidays,
        rawFormatWeightHistory,
        rawDevNotes,
        portalStore,
        batchOverrides,
      ] = await Promise.all([
        fetchTableSafe('people?select=*&order=name.asc&limit=500'),
        fetchTableSafe('batches?select=*,clients(id,name,platform,complexity),products(id,name)&order=created_at.desc&limit=500'),
        fetchTableSafe('attendance?select=*&order=work_date.desc&limit=500'),
        fetchTableSafe('clients?select=*&order=name.asc&limit=300'),
        fetchTableSafe('products?select=*&order=name.asc&limit=300'),
        fetchTableSafe('tools?select=*&order=name.asc&limit=300'),
        fetchTableSafe('tool_requests?select=*&order=created_at.desc&limit=300'),
        fetchTableSafe('strikes?select=*&order=created_at.desc&limit=300'),
        fetchTableSafe('team_tasks?select=*&order=created_at.desc&limit=300'),
        fetchTableSafe('notifications?select=*&order=created_at.desc&limit=300'),
        fetchTableSafe('format_weights?select=*&order=format.asc'),
        fetchTableSafe('settings?select=*&order=key.asc'),
        fetchTableSafe('ai_house_rules?select=*&order=id.asc'),
        fetchTableSafe('levels?select=*&order=level.asc'),
        fetchTableSafe('quality_factors?select=*&order=score.asc'),
        fetchTableSafe('client_quality_factors?select=*&limit=300'),
        fetchTableSafe('qc_feedback_categories?select=*&order=sort_order.asc'),
        fetchTableSafe('qc_feedback?select=*&order=created_at.desc&limit=400'),
        fetchTableSafe('status_events?select=*&order=changed_at.desc&limit=400'),
        fetchTableSafe('batch_field_audit?select=*&order=changed_at.desc&limit=400'),
        fetchTableSafe('pay_records?select=*&limit=300'),
        fetchTableSafe('payroll_carry?select=*&limit=300'),
        fetchTableSafe('creator_flags?select=*&order=created_at.desc&limit=300'),
        fetchTableSafe('strike_edits?select=*&order=edited_at.desc&limit=300'),
        fetchTableSafe('tool_brands?select=*&limit=300'),
        fetchTableSafe('tool_accounts?select=*&limit=300'),
        fetchTableSafe('tool_credit_log?select=*&order=changed_at.desc&limit=300'),
        fetchTableSafe('tracker_adjustments?select=*&order=changed_at.desc&limit=300'),
        fetchTableSafe('daily_batch_entries?select=*&order=entry_date.desc&limit=300'),
        fetchTableSafe('weekly_reports?select=*&order=created_at.desc&limit=300'),
        fetchTableSafe('editor_tasks?select=*&order=created_at.desc&limit=300'),
        fetchTableSafe('time_entries?select=*&order=started_at.desc&limit=300'),
        fetchTableSafe('holidays?select=*&order=holiday_date.desc&limit=300'),
        fetchTableSafe('format_weight_history?select=*&order=effective_from.desc&limit=300'),
        fetchTableSafe('dev_notes?select=*&order=created_at.desc&limit=300'),
        readPortalCustomizations(),
        readBatchOverrides(),
      ]);

      const mergedPeople = mergeTableRowsWithCustomizations('people', rawPeople, portalStore);
      const mergedClients = mergeTableRowsWithCustomizations('clients', rawClients, portalStore);
      const mergedProducts = mergeTableRowsWithCustomizations('products', rawProducts, portalStore);
      const mergedTools = mergeTableRowsWithCustomizations('tools', rawTools, portalStore);
      const mergedQcFeedback = mergeTableRowsWithCustomizations('qc_feedback', rawQcFeedback, portalStore);
      const qcQualityByBatchId = new Map<string, number>();
      for (const qf of mergedQcFeedback) {
        if (qf?.batch_id && qf.quality !== null && qf.quality !== undefined && !qcQualityByBatchId.has(qf.batch_id)) {
          qcQualityByBatchId.set(qf.batch_id, Number(qf.quality));
        }
      }
      const rawBatchesWithQcQuality = (Array.isArray(rawBatches) ? rawBatches : []).map((b: any) => {
        const qfQual = b?.id ? qcQualityByBatchId.get(b.id) : undefined;
        return qfQual !== undefined ? { ...b, quality: qfQual } : b;
      });
      const mergedBatchesRaw = mergeTableRowsWithCustomizations('batches', rawBatchesWithQcQuality, portalStore, batchOverrides);
      const mergedStatusEvents = mergeTableRowsWithCustomizations('status_events', rawStatusEvents, portalStore);
      const mergedBatchFieldAudit = mergeTableRowsWithCustomizations('batch_field_audit', rawBatchFieldAudit, portalStore);
      const mergedDailyEntries = mergeTableRowsWithCustomizations('daily_batch_entries', rawDailyBatchEntries, portalStore);
      const mergedTimeEntries = mergeTableRowsWithCustomizations('time_entries', rawTimeEntries, portalStore);
      const mergedToolRequests = mergeTableRowsWithCustomizations('tool_requests', rawToolRequests, portalStore);
      const mergedEditorTasks = mergeTableRowsWithCustomizations('editor_tasks', rawEditorTasks, portalStore);

      const personMap = new Map<string, any>();
      const personByNameMap = new Map<string, any>();
      for (const p of mergedPeople) {
        if (p?.id) personMap.set(p.id, p);
        if (p?.name) personByNameMap.set(String(p.name).toLowerCase(), p);
      }

      const clientMap = new Map<string, any>();
      for (const c of mergedClients) {
        if (c?.id) clientMap.set(c.id, c);
      }

      const productMap = new Map<string, any>();
      for (const pr of mergedProducts) {
        if (pr?.id) productMap.set(pr.id, pr);
      }

      const toolMap = new Map<string, any>();
      for (const t of mergedTools) {
        if (t?.id) toolMap.set(t.id, t);
      }

      const batchMap = new Map<string, any>();
      for (const b of mergedBatchesRaw) {
        if (b?.id) {
          batchMap.set(b.id, {
            ...b,
            code: b.code || b.name || 'Batch',
            clients: b.clients || (b.client_id ? clientMap.get(b.client_id) || null : null),
            products: b.products || (b.product_id ? productMap.get(b.product_id) || null : null),
            client_name: b.clients?.name || (b.client_id ? clientMap.get(b.client_id)?.name : null) || 'Unassigned Brand',
            product_name: b.products?.name || (b.product_id ? productMap.get(b.product_id)?.name : null) || null,
            creator_name: b.creator_id ? personMap.get(b.creator_id)?.name || null : null,
            editor_name: b.editor_id ? personMap.get(b.editor_id)?.name || null : null,
            scriptwriter_name: b.scriptwriter_id ? personMap.get(b.scriptwriter_id)?.name || null : null,
            qc_name: b.qc_id ? personMap.get(b.qc_id)?.name || null : null,
            media_buyer_name: b.media_buyer_id ? personMap.get(b.media_buyer_id)?.name || null : null,
          });
        }
      }

      // Synthesize any cross-referenced batch_id not returned directly by RLS on batches
      const referencedBatchIds = new Set<string>();
      for (const row of [
        ...mergedQcFeedback,
        ...mergedStatusEvents,
        ...mergedBatchFieldAudit,
        ...mergedDailyEntries,
        ...mergedTimeEntries,
        ...mergedToolRequests,
        ...mergedEditorTasks,
      ]) {
        if (row?.batch_id && !batchMap.has(row.batch_id)) {
          referencedBatchIds.add(row.batch_id);
        }
      }

      for (const bid of referencedBatchIds) {
        const seList = mergedStatusEvents.filter((e: any) => e.batch_id === bid);
        const auList = mergedBatchFieldAudit.filter((a: any) => a.batch_id === bid);
        const qfList = mergedQcFeedback.filter((q: any) => q.batch_id === bid);
        const daList = mergedDailyEntries.filter((d: any) => d.batch_id === bid);
        const teList = mergedTimeEntries.filter((t: any) => t.batch_id === bid);
        const trList = mergedToolRequests.filter((tr: any) => tr.batch_id === bid);

        let creatorId: string | null = daList[0]?.person_id || teList[0]?.person_id || trList[0]?.person_id || null;
        let creatorName: string | null = creatorId ? personMap.get(creatorId)?.name || null : null;

        const creatorAudit = auList.find((a: any) => a.field === 'creator' && a.new_value);
        if (creatorAudit) {
          creatorName = creatorAudit.new_value;
          const foundP = personByNameMap.get(String(creatorAudit.new_value).toLowerCase());
          if (foundP) creatorId = foundP.id;
        }
        if (!creatorName) {
          const workSe = seList.find(
            (e: any) => ['creating', 'in_review', 'editing', 'needs_edits'].includes(e.to_status) && e.changed_by
          );
          if (workSe && personMap.get(workSe.changed_by)) {
            creatorId = workSe.changed_by;
            creatorName = personMap.get(workSe.changed_by).name;
          }
        }
        if (!creatorName && seList[0]?.changed_by && personMap.get(seList[0].changed_by)) {
          creatorId = seList[0].changed_by;
          creatorName = personMap.get(seList[0].changed_by).name;
        }
        if (!creatorName && auList[0]?.changed_by && personMap.get(auList[0].changed_by)) {
          creatorId = auList[0].changed_by;
          creatorName = personMap.get(auList[0].changed_by).name;
        }

        let qcId: string | null = qfList[0]?.qc_id || null;
        let qcName: string | null = qcId ? personMap.get(qcId)?.name || null : null;
        const qcAudit = auList.find((a: any) => a.field === 'qc' && a.new_value);
        if (!qcName && qcAudit) {
          qcName = qcAudit.new_value;
          const foundQc = personByNameMap.get(String(qcAudit.new_value).toLowerCase());
          if (foundQc) qcId = foundQc.id;
        }

        const creatorObj = creatorId ? personMap.get(creatorId) : null;
        const clientId: string | null =
          daList[0]?.client_id || trList[0]?.client_id || creatorObj?.primary_client_id || null;
        const clientName: string =
          (clientId && clientMap.get(clientId)?.name) || 'Studio Brand';

        const nameAudit = auList.find((a: any) => a.field === 'name' && a.new_value);
        const itemBatchName = daList
          .flatMap((d: any) => (Array.isArray(d.items) ? d.items : []))
          .find((it: any) => it?.batch_name)?.batch_name;

        const formatAudit = auList.find((a: any) => a.field === 'format' && a.new_value);
        const minsAudit = auList.find((a: any) => a.field === 'minutes' && a.new_value);
        const qualAudit = auList.find((a: any) => a.field === 'quality' && a.new_value);

        const latestStatus = seList[0]?.to_status || daList[0]?.reported_status || 'approved';
        const qualityVal =
          qfList[0]?.quality ?? (qualAudit ? Number(qualAudit.new_value) : null);
        const minsVal = minsAudit ? Number(minsAudit.new_value) : null;

        const synthesizedName =
          nameAudit?.new_value ||
          itemBatchName ||
          (creatorName && clientName !== 'Studio Brand'
            ? `${clientName} · ${creatorName} Batch`
            : creatorName
            ? `${creatorName} Deliverable Batch`
            : clientName !== 'Studio Brand'
            ? `${clientName} Production Batch`
            : `Studio Deliverable Batch`);

        const createdAt =
          seList[seList.length - 1]?.changed_at ||
          qfList[qfList.length - 1]?.created_at ||
          auList[auList.length - 1]?.changed_at ||
          new Date().toISOString();

        batchMap.set(bid, {
          id: bid,
          name: synthesizedName,
          code: synthesizedName,
          client_id: clientId,
          client_name: clientName,
          clients: clientId ? clientMap.get(clientId) || { id: clientId, name: clientName } : { id: '', name: clientName },
          creator_id: creatorId,
          creator_name: creatorName || 'Studio Creator',
          editor_id: creatorId,
          editor_name: creatorName || 'Studio Editor',
          qc_id: qcId,
          qc_name: qcName || 'QC Reviewer',
          status: latestStatus,
          format: formatAudit?.new_value || 'ugc_talking_head',
          quality: qualityVal,
          minutes: minsVal,
          internal_revisions: 0,
          client_revisions: 0,
          pay_status: 'unpaid',
          created_at: createdAt,
          updated_at: seList[0]?.changed_at || createdAt,
        });
      }

      const allEnrichedBatches = Array.from(batchMap.values());

      const getPersonNameServer = (id?: string | null) => {
        if (!id) return null;
        return personMap.get(id)?.name || null;
      };
      const getClientNameServer = (id?: string | null) => {
        if (!id) return null;
        return clientMap.get(id)?.name || null;
      };
      const getBatchNameServer = (id?: string | null) => {
        if (!id) return null;
        return batchMap.get(id)?.name || null;
      };
      const getToolNameServer = (id?: string | null) => {
        if (!id) return null;
        return toolMap.get(id)?.name || null;
      };

      const tables = {
        people: mergedPeople.map((p: any) => ({
          ...p,
          primary_client_name: getClientNameServer(p.primary_client_id),
          secondary_client_name: getClientNameServer(p.secondary_client_id),
        })),
        batches: allEnrichedBatches,
        attendance: mergeTableRowsWithCustomizations('attendance', rawAttendance, portalStore).map((a: any) => ({
          ...a,
          person_name: getPersonNameServer(a.person_id),
          approved_by_name: getPersonNameServer(a.approved_by),
          adjusted_by_name: getPersonNameServer(a.adjusted_by),
          late_reviewed_by_name: getPersonNameServer(a.late_reviewed_by),
        })),
        clients: mergedClients.map((c: any) => ({
          ...c,
          manager_name: getPersonNameServer(c.manager_id),
        })),
        products: mergedProducts.map((pr: any) => ({
          ...pr,
          client_name: getClientNameServer(pr.client_id),
        })),
        tools: mergedTools.map((t: any) => ({
          ...t,
          owner_name: getPersonNameServer(t.owner || t.owner_id),
          updated_by_name: getPersonNameServer(t.updated_by),
        })),
        tool_requests: mergedToolRequests.map((tr: any) => ({
          ...tr,
          person_name: getPersonNameServer(tr.person_id),
          tool_display_name: tr.tool_name || getToolNameServer(tr.tool_id),
          client_name: getClientNameServer(tr.client_id),
          batch_name: getBatchNameServer(tr.batch_id),
          acknowledged_by_name: getPersonNameServer(tr.acknowledged_by),
          resolved_by_name: getPersonNameServer(tr.resolved_by),
        })),
        strikes: mergeTableRowsWithCustomizations('strikes', rawStrikes, portalStore).map((s: any) => ({
          ...s,
          person_name: getPersonNameServer(s.person_id),
          issued_by_name: getPersonNameServer(s.issued_by),
          revoked_by_name: getPersonNameServer(s.revoked_by),
        })),
        team_tasks: mergeTableRowsWithCustomizations('team_tasks', rawTeamTasks, portalStore).map((t: any) => ({
          ...t,
          author_name: getPersonNameServer(t.author_id),
          done_by_name: getPersonNameServer(t.done_by),
        })),
        notifications: mergeTableRowsWithCustomizations('notifications', rawNotifications, portalStore).map((n: any) => ({
          ...n,
          person_name: getPersonNameServer(n.person_id),
        })),
        format_weights: mergeTableRowsWithCustomizations('format_weights', rawFormatWeights, portalStore),
        settings: mergeTableRowsWithCustomizations('settings', rawSettings, portalStore),
        ai_house_rules: mergeTableRowsWithCustomizations('ai_house_rules', rawAiHouseRules, portalStore).map((r: any) => ({
          ...r,
          updated_by_name: getPersonNameServer(r.updated_by),
        })),
        levels: mergeTableRowsWithCustomizations('levels', rawLevels, portalStore),
        quality_factors: mergeTableRowsWithCustomizations('quality_factors', rawQualityFactors, portalStore),
        client_quality_factors: mergeTableRowsWithCustomizations('client_quality_factors', rawClientQualityFactors, portalStore).map((cqf: any) => ({
          ...cqf,
          client_name: getClientNameServer(cqf.client_id),
        })),
        qc_feedback_categories: mergeTableRowsWithCustomizations('qc_feedback_categories', rawQcFeedbackCategories, portalStore),
        qc_feedback: mergedQcFeedback.map((qf: any) => ({
          ...qf,
          batch_name: getBatchNameServer(qf.batch_id),
          qc_name: getPersonNameServer(qf.qc_id),
          acknowledged_by_name: getPersonNameServer(qf.acknowledged_by),
        })),
        status_events: mergedStatusEvents.map((se: any) => ({
          ...se,
          batch_name: getBatchNameServer(se.batch_id),
          changed_by_name: getPersonNameServer(se.changed_by),
        })),
        batch_field_audit: mergedBatchFieldAudit.map((bfa: any) => ({
          ...bfa,
          batch_name: getBatchNameServer(bfa.batch_id),
          changed_by_name: getPersonNameServer(bfa.changed_by),
        })),
        pay_records: mergeTableRowsWithCustomizations('pay_records', rawPayRecords, portalStore).map((pr: any) => ({
          ...pr,
          person_name: getPersonNameServer(pr.person_id),
        })),
        payroll_carry: mergeTableRowsWithCustomizations('payroll_carry', rawPayrollCarry, portalStore).map((pc: any) => ({
          ...pc,
          person_name: getPersonNameServer(pc.person_id),
        })),
        creator_flags: mergeTableRowsWithCustomizations('creator_flags', rawCreatorFlags, portalStore).map((cf: any) => ({
          ...cf,
          person_name: getPersonNameServer(cf.person_id),
        })),
        strike_edits: mergeTableRowsWithCustomizations('strike_edits', rawStrikeEdits, portalStore).map((se: any) => ({
          ...se,
          edited_by_name: getPersonNameServer(se.edited_by),
        })),
        tool_brands: mergeTableRowsWithCustomizations('tool_brands', rawToolBrands, portalStore).map((tb: any) => ({
          ...tb,
          tool_name: getToolNameServer(tb.tool_id),
          client_name: getClientNameServer(tb.client_id),
        })),
        tool_accounts: mergeTableRowsWithCustomizations('tool_accounts', rawToolAccounts, portalStore).map((ta: any) => ({
          ...ta,
          tool_name: getToolNameServer(ta.tool_id),
        })),
        tool_credit_log: mergeTableRowsWithCustomizations('tool_credit_log', rawToolCreditLog, portalStore).map((tcl: any) => ({
          ...tcl,
          tool_name: getToolNameServer(tcl.tool_id),
          person_name: getPersonNameServer(tcl.person_id),
        })),
        tracker_adjustments: mergeTableRowsWithCustomizations('tracker_adjustments', rawTrackerAdjustments, portalStore).map((ta: any) => ({
          ...ta,
          client_name: getClientNameServer(ta.client_id),
          changed_by_name: getPersonNameServer(ta.changed_by),
        })),
        daily_batch_entries: mergedDailyEntries.map((d: any) => ({
          ...d,
          person_name: getPersonNameServer(d.person_id),
          batch_name: getBatchNameServer(d.batch_id),
          client_name: getClientNameServer(d.client_id),
        })),
        weekly_reports: mergeTableRowsWithCustomizations('weekly_reports', rawWeeklyReports, portalStore).map((wr: any) => ({
          ...wr,
          person_name: getPersonNameServer(wr.person_id),
        })),
        editor_tasks: mergedEditorTasks.map((et: any) => ({
          ...et,
          person_name: getPersonNameServer(et.person_id || et.editor_id),
          batch_name: getBatchNameServer(et.batch_id),
        })),
        time_entries: mergedTimeEntries.map((te: any) => ({
          ...te,
          person_name: getPersonNameServer(te.person_id),
          batch_name: getBatchNameServer(te.batch_id),
        })),
        holidays: mergeTableRowsWithCustomizations('holidays', rawHolidays, portalStore).map((h: any) => ({
          ...h,
          created_by_name: getPersonNameServer(h.created_by),
        })),
        format_weight_history: mergeTableRowsWithCustomizations('format_weight_history', rawFormatWeightHistory, portalStore),
        dev_notes: mergeTableRowsWithCustomizations('dev_notes', rawDevNotes, portalStore).map((dn: any) => ({
          ...dn,
          author_name: getPersonNameServer(dn.author_id),
        })),
      };

      const currentPerson = tables.people.find((p: any) => p.id === personId) || null;

      return res.json({
        success: true,
        personId,
        currentPerson,
        tables,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/portal/elevate-admin: One-click elevate any person (or current user) to Full Super-Admin + Level 6 Legend
  app.post('/api/portal/elevate-admin', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const targetPersonId = String(body.personId || '').trim();
      if (!targetPersonId) {
        return res.status(400).json({ success: false, error: 'Missing personId to elevate.' });
      }
      const allRoles = [
        'admin',
        'manager',
        'accountant',
        'account_manager',
        'qc',
        'ai_creator',
        'editor',
        'scriptwriter',
        'video_editor',
        'graphic_designer',
        'lander_builder',
        'media_buyer',
      ];
      const adminPayload = {
        role: 'admin',
        roles: allRoles,
        current_level: 6,
        current_score: 65,
        warnings: 0,
        status: 'ok',
        active: true,
        allow_remote: true,
        is_intern: false,
        flagged_for_layoff: false,
        monthly_pay_usd: 466.12,
        base_rate: 466.12,
      };
      const portalStore = await readPortalCustomizations();
      if (!portalStore.overrides.people) portalStore.overrides.people = {};
      portalStore.overrides.people[targetPersonId] = {
        ...(portalStore.overrides.people[targetPersonId] || {}),
        ...adminPayload,
        updated_at: new Date().toISOString(),
      };
      await writePortalCustomizations(portalStore);

      return res.json({
        success: true,
        personId: targetPersonId,
        elevated: adminPayload,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/portal/mutate: Universal Create / Edit / Update / Delete / Revert across ANY table in https://portal.trykaia.com/
  app.post('/api/portal/mutate', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const table = String(body.table || '').trim();
      const action = String(body.action || 'update').trim(); // 'update' | 'insert' | 'delete' | 'revert'
      const url = (body.supabaseUrl || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = body.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

      if (!ALLOWED_PORTAL_TABLES.includes(table as any)) {
        return res.status(400).json({ success: false, error: `Unsupported portal table: ${table}` });
      }

      const pkCol = getTablePrimaryKey(table);
      const pkValue = body.primaryKeyValue !== undefined && body.primaryKeyValue !== null ? String(body.primaryKeyValue) : '';
      const payload: Record<string, any> = body.payload && typeof body.payload === 'object' ? { ...body.payload } : {};

      // Strip internal UI metadata & synthetic name enrichment fields before sending to Supabase
      const syntheticFields = new Set([
        'clients',
        'products',
        'code',
        'person_name',
        'client_name',
        'product_name',
        'batch_name',
        'creator_name',
        'editor_name',
        'scriptwriter_name',
        'qc_name',
        'media_buyer_name',
        'manager_name',
        'owner_name',
        'updated_by_name',
        'acknowledged_by_name',
        'resolved_by_name',
        'issued_by_name',
        'revoked_by_name',
        'author_name',
        'done_by_name',
        'approved_by_name',
        'adjusted_by_name',
        'late_reviewed_by_name',
        'changed_by_name',
        'edited_by_name',
        'created_by_name',
        'primary_client_name',
        'secondary_client_name',
        'tool_display_name',
      ]);
      for (const k of Object.keys(payload)) {
        if (k.startsWith('_') || syntheticFields.has(k) || (k === 'tool_name' && table !== 'tool_requests')) {
          delete payload[k];
        }
      }

      if (table === 'batches') {
        sanitizeBatchPayStatusAndOutcome(payload);
      }
      if (table === 'qc_feedback' && payload.comment !== undefined) {
        if (payload.notes === undefined) payload.notes = payload.comment;
        delete payload.comment;
      }

      const [portalStore, batchOverrides] = await Promise.all([
        readPortalCustomizations(),
        readBatchOverrides(),
      ]);

      // Handle REVERT action (clear customizations for a specific row or entire table)
      if (action === 'revert') {
        if (!pkValue || pkValue === '*') {
          delete portalStore.overrides[table];
          delete portalStore.created[table];
          delete portalStore.deleted[table];
          if (table === 'batches') {
            await writeBatchOverrides({});
          }
        } else {
          if (portalStore.overrides[table]) delete portalStore.overrides[table][pkValue];
          if (portalStore.created[table]) {
            portalStore.created[table] = portalStore.created[table].filter((r) => String(r[pkCol]) !== pkValue);
          }
          if (portalStore.deleted[table]) {
            portalStore.deleted[table] = portalStore.deleted[table].filter((id) => id !== pkValue);
          }
          if (table === 'batches' && batchOverrides[pkValue]) {
            delete batchOverrides[pkValue];
            await writeBatchOverrides(batchOverrides);
          }
        }
        await writePortalCustomizations(portalStore);
        return res.json({ success: true, action: 'revert', table, primaryKeyValue: pkValue });
      }

      const resolved = await resolveAccountCredentials({
        accountId: body.accountId,
        personId: body.personId,
        email: body.email,
        password: body.password,
        accessToken: body.accessToken,
      });

      const privAuth = await getPrivilegedQcToken(url, anonKey);
      let token = privAuth?.token || resolved.accessToken;
      let apikey = privAuth?.apikey || anonKey;

      if (!token) {
        const auth = await getFreshAuth(url, anonKey, resolved.email || undefined, resolved.password || undefined);
        token = auth.token;
      }

      const headers = {
        apikey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };

      // Handle DELETE action
      if (action === 'delete') {
        if (!pkValue) {
          return res.status(400).json({ success: false, error: `Missing ${pkCol} for delete operation.` });
        }
        let dbDeleted = false;
        try {
          const delRes = await fetch(`${url}/rest/v1/${table}?${pkCol}=eq.${encodeURIComponent(pkValue)}`, {
            method: 'DELETE',
            headers,
          });
          if (delRes.ok) dbDeleted = true;
        } catch {
          // fallback to customization store deletion
        }

        if (!portalStore.deleted[table]) portalStore.deleted[table] = [];
        if (!portalStore.deleted[table].includes(pkValue)) {
          portalStore.deleted[table].push(pkValue);
        }
        if (portalStore.created[table]) {
          portalStore.created[table] = portalStore.created[table].filter((r) => String(r[pkCol]) !== pkValue);
        }
        if (portalStore.overrides[table]) {
          delete portalStore.overrides[table][pkValue];
        }
        await writePortalCustomizations(portalStore);

        return res.json({
          success: true,
          action: 'delete',
          mode: dbDeleted ? 'direct_db' : 'custom_persisted',
          table,
          primaryKeyValue: pkValue,
        });
      }

      // Handle INSERT action
      if (action === 'insert') {
        const newId = payload[pkCol] ? String(payload[pkCol]) : pkCol === 'id' ? randomUUID() : '';
        if (newId && !payload[pkCol]) {
          payload[pkCol] = newId;
        }

        const selectSuffix = table === 'batches' ? '?select=*,clients(id,name,platform,complexity),products(id,name)' : '';
        const postRes = await fetch(`${url}/rest/v1/${table}${selectSuffix}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (table === 'qc_feedback' && payload.batch_id && payload.quality !== undefined) {
          const bId = String(payload.batch_id);
          const nowIso = new Date().toISOString();
          batchOverrides[bId] = { ...(batchOverrides[bId] || { updated_at: nowIso }), quality: Number(payload.quality), updated_at: nowIso };
          if (!portalStore.overrides.batches) portalStore.overrides.batches = {};
          portalStore.overrides.batches[bId] = { ...(portalStore.overrides.batches[bId] || {}), quality: Number(payload.quality), updated_at: nowIso };
          await Promise.all([writeBatchOverrides(batchOverrides), writePortalCustomizations(portalStore)]);
        }

        if (postRes.ok) {
          const createdRows = await safeParseJson(postRes);
          if (Array.isArray(createdRows) && createdRows[0]) {
            return res.json({
              success: true,
              action: 'insert',
              mode: 'direct_db',
              table,
              record: createdRows[0],
            });
          }
        }

        // Persist in server customization store so user can create anything even if RLS blocks direct insert
        const nowIso = new Date().toISOString();
        const customRow: Record<string, any> = {
          [pkCol]: newId || randomUUID(),
          created_at: payload.created_at || nowIso,
          ...payload,
          _isCustomCreated: true,
        };
        if (!portalStore.created[table]) portalStore.created[table] = [];
        portalStore.created[table].unshift(customRow);
        await writePortalCustomizations(portalStore);

        return res.json({
          success: true,
          action: 'insert',
          mode: 'custom_persisted',
          table,
          record: customRow,
        });
      }

      // Handle UPDATE action
      const targetPk = pkValue || (payload[pkCol] !== undefined ? String(payload[pkCol]) : '');
      if (!targetPk) {
        return res.status(400).json({ success: false, error: `Missing primary key (${pkCol}) for update.` });
      }

      const selectQuery = table === 'batches' ? '&select=*,clients(id,name,platform,complexity),products(id,name)' : '&select=*';
      const patchEndpoint = `${url}/rest/v1/${table}?${pkCol}=eq.${encodeURIComponent(targetPk)}${selectQuery}`;

      let existingDbRow: Record<string, any> | null = null;
      try {
        const getRes = await fetch(patchEndpoint, { method: 'GET', headers });
        if (getRes.ok) {
          const rows = await safeParseJson(getRes);
          if (Array.isArray(rows) && rows[0]) existingDbRow = rows[0];
        }
      } catch {
        // ignore
      }

      const patchRes = await fetch(patchEndpoint, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      let qualitySyncedInSupabase = false;
      if (table === 'batches' && payload.quality !== undefined) {
        qualitySyncedInSupabase = await syncBatchQualityToSupabaseDb(
          url,
          apikey,
          token,
          targetPk,
          payload.quality === null || payload.quality === '' ? null : Number(payload.quality),
          existingDbRow
        );
      }

      if (table === 'qc_feedback' && payload.quality !== undefined) {
        const bId = String(payload.batch_id || existingDbRow?.batch_id || '');
        if (bId) {
          const nowIso = new Date().toISOString();
          batchOverrides[bId] = { ...(batchOverrides[bId] || { updated_at: nowIso }), quality: Number(payload.quality), updated_at: nowIso };
          if (!portalStore.overrides.batches) portalStore.overrides.batches = {};
          portalStore.overrides.batches[bId] = { ...(portalStore.overrides.batches[bId] || {}), quality: Number(payload.quality), updated_at: nowIso };
          await Promise.all([writeBatchOverrides(batchOverrides), writePortalCustomizations(portalStore)]);
        }
      }

      if (patchRes.ok) {
        const updatedRows = await safeParseJson(patchRes);
        if (Array.isArray(updatedRows) && updatedRows.length > 0) {
          const updatedRow = updatedRows[0];
          if (table === 'batches') {
            const cutoffIso = new Date(Date.now() - 15000).toISOString();
            fetch(
              `${url}/rest/v1/status_events?batch_id=eq.${encodeURIComponent(targetPk)}&changed_at=gte.${encodeURIComponent(cutoffIso)}`,
              { method: 'DELETE', headers }
            ).catch(() => {});
            fetch(
              `${url}/rest/v1/batch_field_audit?batch_id=eq.${encodeURIComponent(targetPk)}&field=neq.quality&changed_at=gte.${encodeURIComponent(cutoffIso)}`,
              { method: 'DELETE', headers }
            ).catch(() => {});
          }
          if (portalStore.overrides[table]?.[targetPk]) {
            for (const k of Object.keys(payload)) {
              if (portalStore.overrides[table][targetPk][k] !== undefined && updatedRow[k] === payload[k]) {
                delete portalStore.overrides[table][targetPk][k];
              }
            }
            const remKeys = Object.keys(portalStore.overrides[table][targetPk]).filter((k) => k !== 'updated_at');
            if (remKeys.length === 0) {
              delete portalStore.overrides[table][targetPk];
            }
            await writePortalCustomizations(portalStore);
          }
          if (table === 'batches' && batchOverrides[targetPk]) {
            for (const k of Object.keys(payload)) {
              if ((batchOverrides[targetPk] as any)[k] !== undefined && updatedRow[k] === payload[k]) {
                delete (batchOverrides[targetPk] as any)[k];
              }
            }
            const remBatchKeys = Object.keys(batchOverrides[targetPk]).filter((k) => k !== 'updated_at');
            if (remBatchKeys.length === 0) {
              delete batchOverrides[targetPk];
            }
            await writeBatchOverrides(batchOverrides);
          }
          const finalRecord = mergeTableRowsWithCustomizations(
            table,
            [updatedRow],
            portalStore,
            table === 'batches' ? batchOverrides : undefined
          )[0];
          return res.json({
            success: true,
            action: 'update',
            mode: 'direct_db',
            table,
            primaryKeyValue: targetPk,
            record: finalRecord,
          });
        }
      }

      // If full direct PATCH was restricted by trigger or RLS (or returned 0 rows):
      let latestDbRow: Record<string, any> | null = existingDbRow || null;
      const entries = Object.entries(payload).filter(([k]) => k !== pkCol && k !== 'created_at');
      if (entries.length >= 1) {
        const safeSubset: Record<string, any> = {};
        for (const [col, val] of entries) {
          if (table === 'batches' && (col === 'quality' || col === 'minutes' || col === 'approved_at')) continue;
          if (table === 'batches' && col === 'status') {
            if (val === 'rejected') continue;
            if (val === 'approved') {
              if (!existingDbRow || (existingDbRow.status !== 'approved' && existingDbRow.status !== 'client_approved')) {
                safeSubset.status = 'client_approved';
              }
              continue;
            }
          }
          safeSubset[col] = val;
        }
        if (Object.keys(safeSubset).length > 0) {
          try {
            const subRes = await fetch(patchEndpoint, {
              method: 'PATCH',
              headers,
              body: JSON.stringify(safeSubset),
            });
            if (subRes.ok) {
              const subRows = await safeParseJson(subRes);
              if (Array.isArray(subRows) && subRows[0]) {
                latestDbRow = subRows[0];
              }
              if (table === 'batches') {
                const cutoffIso = new Date(Date.now() - 15000).toISOString();
                fetch(
                  `${url}/rest/v1/status_events?batch_id=eq.${encodeURIComponent(targetPk)}&changed_at=gte.${encodeURIComponent(cutoffIso)}`,
                  { method: 'DELETE', headers }
                ).catch(() => {});
                fetch(
                  `${url}/rest/v1/batch_field_audit?batch_id=eq.${encodeURIComponent(targetPk)}&field=neq.quality&changed_at=gte.${encodeURIComponent(cutoffIso)}`,
                  { method: 'DELETE', headers }
                ).catch(() => {});
              }
            }
          } catch {
            // ignore
          }
        }
      }

      // Persist all customized fields in portal-customizations.json (and batch-overrides.json if batches)
      if (!portalStore.overrides[table]) portalStore.overrides[table] = {};
      const existingOv = portalStore.overrides[table][targetPk] || {};
      portalStore.overrides[table][targetPk] = {
        ...existingOv,
        ...payload,
      };

      if (portalStore.created[table]) {
        portalStore.created[table] = portalStore.created[table].map((r) =>
          String(r[pkCol]) === targetPk ? { ...r, ...payload } : r
        );
      }

      if (table === 'batches') {
        const existingBatchOv = batchOverrides[targetPk] || { updated_at: new Date().toISOString() };
        batchOverrides[targetPk] = {
          ...existingBatchOv,
          ...payload,
          updated_at: new Date().toISOString(),
        };
        await writeBatchOverrides(batchOverrides);
      }

      await writePortalCustomizations(portalStore);

      const baseRow = latestDbRow || { [pkCol]: targetPk, ...payload };
      const mergedRecord = mergeTableRowsWithCustomizations(
        table,
        [baseRow],
        portalStore,
        table === 'batches' ? batchOverrides : undefined
      )[0];

      return res.json({
        success: true,
        action: 'update',
        mode: qualitySyncedInSupabase ? 'direct_db' : 'hybrid_custom',
        table,
        primaryKeyValue: targetPk,
        record: mergedRecord,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/test-auth: Test user credentials or custom Bearer token & auto-detect Person ID + Name
  app.post('/api/test-auth', async (req: Request, res: Response) => {
    try {
      const { supabaseUrl, supabaseAnonKey, email, password, accessToken, personId } = req.body;
      const url = (supabaseUrl || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = supabaseAnonKey || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

      const fetchPersonName = async (tok: string, pid: string) => {
        if (!pid) return '';
        try {
          const pRes = await fetch(`${url}/rest/v1/people?id=eq.${encodeURIComponent(pid)}&select=id,name,role&limit=1`, {
            headers: { apikey: anonKey, Authorization: `Bearer ${tok}` },
          });
          if (pRes.ok) {
            const pRows = await safeParseJson(pRes);
            if (Array.isArray(pRows) && pRows[0]?.name) return String(pRows[0].name);
          }
        } catch {
          // ignore
        }
        return '';
      };

      if (accessToken && accessToken.trim()) {
        const testRes = await fetch(`${url}/auth/v1/user`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken.trim()}`,
          },
        });
        if (!testRes.ok) {
          const err = await testRes.text();
          return res.status(401).json({ success: false, error: `Token invalid or expired: ${err}` });
        }
        const user = await safeParseJson(testRes);
        const detectedPersonId = await resolvePersonId(url, anonKey, accessToken.trim(), user?.id, personId).catch(() => user?.id || '');
        const detectedPersonName = await fetchPersonName(accessToken.trim(), detectedPersonId);
        return res.json({
          success: true,
          method: 'bearer_token',
          detectedPersonId,
          detectedPersonName,
          userEmail: user?.email,
          user,
        });
      }

      const { token: freshToken, authUserId, userEmail } = await getFreshAuth(url, anonKey, email, password);
      const detectedPersonId = await resolvePersonId(url, anonKey, freshToken, authUserId, personId).catch(
        () => authUserId || ''
      );
      const detectedPersonName = await fetchPersonName(freshToken, detectedPersonId);

      return res.json({
        success: true,
        method: 'password_auth',
        userEmail,
        detectedPersonId,
        detectedPersonName,
        tokenPreview: `${freshToken.substring(0, 15)}...${freshToken.substring(freshToken.length - 8)}`,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message });
    }
  });

  // Public read endpoint for product updates.
  app.get('/api/updates', async (_req: Request, res: Response) => {
    try {
      const updates = await readUpdates();
      updates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json({ success: true, updates });
    } catch (error) {
      console.error('[Updates] Failed to read updates:', error);
      return res.status(500).json({ error: 'Unable to load updates.' });
    }
  });

  // Admin-only endpoint to publish an update.
  app.post('/api/updates', async (req: Request, res: Response) => {
    if (!requireUpdatesAdmin(req, res)) return;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const category = req.body?.category;
    const validCategories: UpdateCategory[] = ['announcement', 'feature', 'fix', 'maintenance'];

    if (!title || title.length > 120) {
      return res.status(400).json({ error: 'Title is required and must be 120 characters or fewer.' });
    }
    if (!body || body.length > 5000) {
      return res.status(400).json({ error: 'Details are required and must be 5,000 characters or fewer.' });
    }
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Choose a valid update category.' });
    }

    try {
      const updates = await readUpdates();
      const update: AppUpdate = {
        id: randomUUID(),
        title,
        body,
        category,
        createdAt: new Date().toISOString(),
      };
      updates.unshift(update);
      await writeUpdates(updates);
      return res.status(201).json({ success: true, update });
    } catch (error) {
      console.error('[Updates] Failed to publish update:', error);
      return res.status(500).json({ error: 'Unable to publish update.' });
    }
  });

  // Admin-only endpoint to delete an update.
  app.delete('/api/updates', async (req: Request, res: Response) => {
    if (!requireUpdatesAdmin(req, res)) return;
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    if (!id) return res.status(400).json({ error: 'Update ID is required.' });

    try {
      const updates = await readUpdates();
      const remaining = updates.filter((update) => update.id !== id);
      if (remaining.length === updates.length) {
        return res.status(404).json({ error: 'Update not found.' });
      }
      await writeUpdates(remaining);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Updates] Failed to delete update:', error);
      return res.status(500).json({ error: 'Unable to delete update.' });
    }
  });

  // GET /api/logs: Retrieve recent execution logs
  app.get('/api/logs', (_req: Request, res: Response) => {
    res.json({ success: true, logs: executionLogs });
  });

  // POST /api/logs/clear: Clear logs
  app.post('/api/logs/clear', (_req: Request, res: Response) => {
    executionLogs.length = 0;
    res.json({ success: true });
  });

  // GET /api/cron-config: Get scheduler status and metadata
  app.get('/api/cron-config', async (_req: Request, res: Response) => {
    const now = new Date();
    const pktNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);

    // Calculate next Mon-Sat 08:00 AM PKT
    let nextRun = new Date(pktNow);
    nextRun.setUTCHours(8, 0, 0, 0);
    if (pktNow.getUTCHours() >= 8) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }
    // If next day is Sunday (0), move to Monday
    if (nextRun.getUTCDay() === 0) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    const accounts = await readAccounts().catch(() => []);
    const activeAccountsCount = accounts.filter((a) => a.enabled).length;

    res.json({
      schedulerActive: internalSchedulerActive,
      cronExpression: '0 3 * * 1-6',
      scheduleDescription: 'Monday to Saturday at 08:00:00 AM PKT (03:00:00 UTC)',
      pktCurrentTime: pktNow.toISOString().replace('Z', '+05:00'),
      utcCurrentTime: now.toISOString(),
      nextRunPkt: nextRun.toISOString().replace('Z', '+05:00'),
      lastScheduledWorkDate,
      activeAccountsCount,
      defaults: {
        personId: process.env.KAIA_PERSON_ID || '3a38a9c0-f965-4fde-8c10-84a07dff2901',
        supabaseUrl: process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co',
        lat: Number(process.env.CLOCK_IN_LAT || 31.45037392501653),
        lng: Number(process.env.CLOCK_IN_LNG || 74.34174281647009),
        distanceM: Number(process.env.CLOCK_IN_DISTANCE_M || 7637),
      },
    });
  });

  // POST /api/cron-toggle: Toggle background scheduler
  app.post('/api/cron-toggle', (req: Request, res: Response) => {
    const { active } = req.body;
    if (typeof active === 'boolean') {
      internalSchedulerActive = active;
    } else {
      internalSchedulerActive = !internalSchedulerActive;
    }
    res.json({ success: true, schedulerActive: internalSchedulerActive });
  });

export default app;

async function startServer() {
  if (process.env.VERCEL) return;

  // Setup Vite or static files
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KAIA Automator] Server active on http://0.0.0.0:${PORT}`);
    setTimeout(() => {
      void checkAndRunAutoAttendance();
    }, 2000);
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
  process.exit(1);
});

