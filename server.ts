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

const updatesDirectory = path.resolve(__dirname, 'data');
const updatesFilePath = path.join(updatesDirectory, 'updates.json');

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
  await mkdir(updatesDirectory, { recursive: true });
  const temporaryPath = `${updatesFilePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(updates, null, 2), 'utf8');
  await rename(temporaryPath, updatesFilePath);
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
  if (executionLogs.length > 100) {
    executionLogs.pop();
  }
}

// Scheduler state
let internalSchedulerActive = true;
let lastScheduledWorkDate = '';

async function getFreshAccessToken(
  supabaseUrl: string,
  anonKey: string,
  email?: string,
  password?: string,
  manualToken?: string
): Promise<string> {
  if (manualToken && manualToken.trim()) {
    return manualToken.trim();
  }

  const effectiveEmail = email || process.env.KAIA_EMAIL;
  const effectivePassword = password || process.env.KAIA_PASSWORD;

  if (!effectiveEmail || !effectivePassword || effectiveEmail === 'your_email@example.com') {
    throw new Error(
      'Missing KAIA email or password. Please provide valid KAIA credentials or enter a manual Bearer token in the configuration tab.'
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
    throw new Error(`Supabase Auth Failed (${authRes.status}): ${errText}`);
  }

  const authData = (await safeParseJson(authRes)) as { access_token?: string };
  if (!authData?.access_token) {
    throw new Error(`Supabase Auth Failed (${authRes.status}): No access_token returned in response`);
  }
  return authData.access_token;
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
}

async function pushAttendance(params: PushAttendanceParams) {
  const url = (params.supabaseUrl || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
  const anonKey = params.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || '';
  const personId = params.personId || process.env.KAIA_PERSON_ID || '3a38a9c0-f965-4fde-8c10-84a07dff2901';
  const lat = Number(params.lat ?? process.env.CLOCK_IN_LAT ?? 31.45037392501653);
  const lng = Number(params.lng ?? process.env.CLOCK_IN_LNG ?? 74.34174281647009);
  const distanceM = Number(params.distanceM ?? process.env.CLOCK_IN_DISTANCE_M ?? 7637);
  const isLate = params.late ?? false;
  const isSimulation = params.simulate ?? false;
  const mode = isSimulation ? 'simulated' : (params.mode || 'manual');

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
      jitterMs = Math.floor(Math.random() * 22000) + 2000; // 2s - 24s
      base8amUTC.setMilliseconds(base8amUTC.getMilliseconds() + jitterMs);
    }
    targetIsoUTC = base8amUTC.toISOString();
  }

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

  // If simulation mode
  if (isSimulation) {
    const simLog: AttendanceRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      mode: 'simulated',
      status: 'success',
      workDate: targetWorkDate,
      clockInIsoUTC: targetIsoUTC,
      personId,
      coordinates: { lat, lng, distanceM },
      jitterAppliedMs: jitterMs,
      responseStatus: 200,
      responseBody: { simulated: true, note: 'Dry run completed. No data was pushed to remote table.' },
      message: 'Simulation successful. Valid payload generated and ready for production dispatch.',
    };
    addLog(simLog);
    return { payload, result: { simulated: true }, mode: 'simulated', log: simLog };
  }

  // Obtain token
  const token = await getFreshAccessToken(
    url,
    anonKey,
    params.email,
    params.password,
    params.accessToken
  );

  const endpoint = `${url}/rest/v1/attendance?on_conflict=person_id%2Cwork_date`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  const responseStatus = response.status;
  if (!response.ok) {
    const errorBody = await response.text();
    const failedLog: AttendanceRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      mode,
      status: 'failed',
      workDate: targetWorkDate,
      clockInIsoUTC: targetIsoUTC,
      personId,
      coordinates: { lat, lng, distanceM },
      jitterAppliedMs: jitterMs,
      responseStatus,
      error: `Attendance Upsert Failed (${responseStatus}): ${errorBody}`,
    };
    addLog(failedLog);
    throw new Error(`Attendance Upsert Failed (${responseStatus}): ${errorBody}`);
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
    coordinates: { lat, lng, distanceM },
    jitterAppliedMs: jitterMs,
    responseStatus,
    responseBody: result,
    message: 'Attendance record successfully upserted into KAIA Supabase attendance table.',
  };
  addLog(successLog);

  return { payload, result, mode, log: successLog };
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
        console.log(`[Automated Cron] Executing morning clock-in for ${dateStr} PKT...`);
        await pushAttendance({ addJitter: true, mode: 'auto-cron' });
      }
    }
  } catch (err: any) {
    console.error('[Automated Cron Error]', err.message);
  }
}, 30000);

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health / Ping
  app.get('/api/ping', (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
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
          personId: process.env.KAIA_PERSON_ID || '',
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

      const data = await pushAttendance({ addJitter: true, mode: 'auto-cron' });
      return res.json({ success: true, ...data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/clock-in: Manual or UI Trigger
  app.post('/api/clock-in', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
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
        mode: 'manual',
      });
      return res.json({ success: true, ...data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/attendance/history: Pull real records from Supabase attendance table
  app.get('/api/attendance/history', async (req: Request, res: Response) => {
    try {
      const url = ((req.query.supabaseUrl as string) || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = (req.query.supabaseAnonKey as string) || process.env.SUPABASE_ANON_KEY || '';
      const personId = (req.query.personId as string) || process.env.KAIA_PERSON_ID || '3a38a9c0-f965-4fde-8c10-84a07dff2901';
      const manualToken = (req.headers['authorization']?.replace('Bearer ', '') || (req.query.accessToken as string))?.trim();

      // Retrieve access token
      let token = manualToken;
      if (!token) {
        try {
          token = await getFreshAccessToken(url, anonKey);
        } catch {
          // Fall back to querying with anonKey
          token = anonKey;
        }
      }

      const queryUrl = `${url}/rest/v1/attendance?person_id=eq.${encodeURIComponent(personId)}&order=work_date.desc&limit=30`;
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
      return res.json({ success: true, records: Array.isArray(records) ? records : [] });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/test-auth: Test user credentials or custom Bearer token
  app.post('/api/test-auth', async (req: Request, res: Response) => {
    try {
      const { supabaseUrl, supabaseAnonKey, email, password, accessToken } = req.body;
      const url = (supabaseUrl || process.env.SUPABASE_URL || 'https://llvsmockvufgbqpeepbm.supabase.co').replace(/\/$/, '');
      const anonKey = supabaseAnonKey || process.env.SUPABASE_ANON_KEY || '';

      if (accessToken && accessToken.trim()) {
        // Test token validity with user profile endpoint
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
        return res.json({ success: true, method: 'bearer_token', user });
      }

      const freshToken = await getFreshAccessToken(url, anonKey, email, password);
      return res.json({
        success: true,
        method: 'password_auth',
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
  app.get('/api/cron-config', (_req: Request, res: Response) => {
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

    res.json({
      schedulerActive: internalSchedulerActive,
      cronExpression: '0 3 * * 1-6',
      scheduleDescription: 'Monday to Saturday at 08:00:00 AM PKT (03:00:00 UTC)',
      pktCurrentTime: pktNow.toISOString().replace('Z', '+05:00'),
      utcCurrentTime: now.toISOString(),
      nextRunPkt: nextRun.toISOString().replace('Z', '+05:00'),
      lastScheduledWorkDate,
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
