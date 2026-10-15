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

async function writeAccounts(accounts: ServerKaiaAccount[]): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${accountsFilePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(accounts, null, 2), 'utf8');
  await rename(temporaryPath, accountsFilePath);
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
  const anonKey = params.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || '';
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
    // Obtain token
    const { token, authUserId } = await getFreshAuth(
      url,
      anonKey,
      params.email,
      params.password,
      params.accessToken
    );

    // Resolve personId (explicit or auto-discovered from Supabase)
    personId = await resolvePersonId(url, anonKey, token, authUserId, personId);

    const payload = {
      person_id: personId,
      work_date: targetWorkDate,
      clock_in_at: targetIsoUTC,
      clock_in_distance_m: distanceM,
      clock_in_lat: lat,
      clock_in_lng: lng,
      late: isLate,
      updated_at: targetIsoUTC,
    };

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

    // If POST upsert fails (e.g. RLS policy requires PATCH for existing rows), try PATCH by person_id & work_date
    if (!response.ok) {
      const patchUrl = `${url}/rest/v1/attendance?person_id=eq.${encodeURIComponent(personId)}&work_date=eq.${encodeURIComponent(targetWorkDate)}`;
      const patchResponse = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          clock_in_at: targetIsoUTC,
          clock_in_distance_m: distanceM,
          clock_in_lat: lat,
          clock_in_lng: lng,
          late: isLate,
          updated_at: new Date().toISOString(),
        }),
      });
      if (patchResponse.ok) {
        response = patchResponse;
      }
    }

    const responseStatus = response.status;
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Attendance Upsert/Update Failed (${responseStatus}): ${errorBody}`);
    }

    const result = await safeParseJson(response);

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
      accountEmail: params.email,
      coordinates: { lat, lng, distanceM },
      jitterAppliedMs: jitterMs,
      responseStatus,
      responseBody: result,
      message: `[${accountLabel}] Attendance record for ${targetWorkDate} updated (${isLate ? 'Late' : 'On-Time'}) in KAIA Supabase.`,
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

// Background scheduler loop (runs every 30 seconds)
setInterval(async () => {
  if (!internalSchedulerActive) return;

  try {
    // Current time in PKT (UTC+5)
    const now = new Date();
    const pktNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const dayOfWeek = pktNow.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const hours = pktNow.getUTCHours();
    const minutes = pktNow.getUTCMinutes();
    const dateStr = pktNow.toISOString().split('T')[0];

    // Trigger window: 08:00 AM PKT on Mon-Sat (1 to 6)
    if (dayOfWeek !== 0 && hours === 8 && minutes === 0) {
      if (lastScheduledWorkDate !== dateStr) {
        lastScheduledWorkDate = dateStr;
        console.log(`[Automated Cron] Executing multi-account morning clock-in for ${dateStr} PKT...`);
        await runScheduledMultiAccountClockIn('auto-cron');
      }
    }
  } catch (err: any) {
    console.error('[Automated Cron Error]', err.message);
  }
}, 30000);

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
      await writeAccounts(accounts);
      return res.json({ success: true, count: accounts.length, accounts });
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

  // GET /api/attendance/history: Pull real records from Supabase attendance table
  app.get('/api/attendance/history', async (req: Request, res: Response) => {
    try {
      const url = ((req.query.supabaseUrl as string) || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = (req.query.supabaseAnonKey as string) || process.env.SUPABASE_ANON_KEY || '';
      const rawPersonId = (req.query.personId as string) || '';
      const email = (req.query.email as string) || '';
      const password = (req.query.password as string) || '';
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 120));
      const startDate = (req.query.startDate as string) || '';
      const endDate = (req.query.endDate as string) || '';
      const manualToken = (req.headers['authorization']?.replace('Bearer ', '') || (req.query.accessToken as string))?.trim();

      let token = manualToken;
      let authUserId: string | undefined;
      if (!token) {
        try {
          const auth = await getFreshAuth(url, anonKey, email || undefined, password || undefined);
          token = auth.token;
          authUserId = auth.authUserId;
        } catch {
          token = anonKey;
        }
      }

      let personId = rawPersonId.trim();
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

      const records = await safeParseJson(response);
      return res.json({ success: true, personId, records: Array.isArray(records) ? records : [] });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/test-auth: Test user credentials or custom Bearer token & auto-detect Person ID
  app.post('/api/test-auth', async (req: Request, res: Response) => {
    try {
      const { supabaseUrl, supabaseAnonKey, email, password, accessToken, personId } = req.body;
      const url = (supabaseUrl || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = supabaseAnonKey || process.env.SUPABASE_ANON_KEY || '';

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
        return res.json({
          success: true,
          method: 'bearer_token',
          detectedPersonId,
          userEmail: user?.email,
          user,
        });
      }

      const { token: freshToken, authUserId, userEmail } = await getFreshAuth(url, anonKey, email, password);
      const detectedPersonId = await resolvePersonId(url, anonKey, freshToken, authUserId, personId).catch(
        () => authUserId || ''
      );

      return res.json({
        success: true,
        method: 'password_auth',
        userEmail,
        detectedPersonId,
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
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
  process.exit(1);
});

