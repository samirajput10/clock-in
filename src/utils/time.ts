import { AppConfig, KaiaAccount } from '../types/index.ts';

export const DEFAULT_ACCOUNTS: KaiaAccount[] = [
  {
    id: 'acc-1',
    label: 'samiullah',
    enabled: true,
    personId: '3a38a9c0-f965-4fde-8c10-84a07dff2901',
    kaiaEmail: 'halmarrsami@gmail.com',
    kaiaPassword: '',
    manualToken: '',
    lat: 31.45037392501653,
    lng: 74.34174281647009,
    distanceM: 7637,
  },
  {
    id: 'acc-2',
    label: 'Mansoor Irshad',
    enabled: true,
    personId: 'f6ea1e81-a9c8-4500-a61d-4e290f24c8c0',
    kaiaEmail: 'ranaali96688@gmail.com',
    kaiaPassword: '',
    manualToken: '',
    lat: 31.45037392501653,
    lng: 74.34174281647009,
    distanceM: 7637,
  },
];

export const DEFAULT_CONFIG: AppConfig = {
  supabaseUrl: 'https://llvsmockvufgbqpeepbm.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdnNtb2NrdnVmZ2JxcGVlcGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDU4OTQsImV4cCI6MjA5ODIyMTg5NH0.X0guVvHPpfLegMlT2Xu24XBZoFJEqztluUJE0b6G1gY',
  accounts: DEFAULT_ACCOUNTS,
  personId: '3a38a9c0-f965-4fde-8c10-84a07dff2901',
  kaiaEmail: 'halmarrsami@gmail.com',
  kaiaPassword: '',
  manualToken: '',
  lat: 31.45037392501653,
  lng: 74.34174281647009,
  distanceM: 7637,
  cronSecret: 'my_super_secret_key_123',
  autoJitter: true,
  simulateMode: false,
};

export function createEmptyAccount(index: number, defaults?: { lat: number; lng: number; distanceM: number }): KaiaAccount {
  return {
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: `Account ${index}`,
    enabled: true,
    personId: '',
    kaiaEmail: '',
    kaiaPassword: '',
    manualToken: '',
    lat: defaults?.lat ?? 31.45037392501653,
    lng: defaults?.lng ?? 74.34174281647009,
    distanceM: defaults?.distanceM ?? 7637,
  };
}

export function loadStoredConfig(): AppConfig {
  try {
    const raw = localStorage.getItem('kaia_automator_config');
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    let mutated = false;
    // If the user's browser cached the previous corrupted key with the typo, automatically upgrade it!
    if (parsed.supabaseAnonKey && parsed.supabaseAnonKey.includes('MjA5ODIymTG5NH0')) {
      parsed.supabaseAnonKey = DEFAULT_CONFIG.supabaseAnonKey;
      mutated = true;
    }
    // If the user's browser saved a Netlify frontend URL into Supabase URL, auto-restore the real Supabase endpoint!
    if (parsed.supabaseUrl && (parsed.supabaseUrl.includes('netlify.app') || !parsed.supabaseUrl.includes('supabase.co'))) {
      parsed.supabaseUrl = DEFAULT_CONFIG.supabaseUrl;
      mutated = true;
    }
    // Migrate legacy single-account config into accounts array if not present
    if (!Array.isArray(parsed.accounts) || parsed.accounts.length === 0) {
      parsed.accounts = [
        {
          id: 'acc-1',
          label: 'samiullah',
          enabled: true,
          personId: parsed.personId || DEFAULT_CONFIG.personId,
          kaiaEmail: parsed.kaiaEmail || 'halmarrsami@gmail.com',
          kaiaPassword: parsed.kaiaPassword || '',
          manualToken: parsed.manualToken || '',
          lat: Number(parsed.lat ?? DEFAULT_CONFIG.lat),
          lng: Number(parsed.lng ?? DEFAULT_CONFIG.lng),
          distanceM: Number(parsed.distanceM ?? DEFAULT_CONFIG.distanceM),
        },
        {
          id: 'acc-2',
          label: 'Mansoor Irshad',
          enabled: true,
          personId: 'f6ea1e81-a9c8-4500-a61d-4e290f24c8c0',
          kaiaEmail: 'ranaali96688@gmail.com',
          kaiaPassword: '',
          manualToken: '',
          lat: Number(parsed.lat ?? DEFAULT_CONFIG.lat),
          lng: Number(parsed.lng ?? DEFAULT_CONFIG.lng),
          distanceM: Number(parsed.distanceM ?? DEFAULT_CONFIG.distanceM),
        },
      ];
      mutated = true;
    } else {
      // Upgrade generic Account 1 / Account 2 labels to real names
      for (const acc of parsed.accounts) {
        if (acc.id === 'acc-1' && (!acc.label || acc.label.startsWith('Account 1'))) {
          acc.label = 'samiullah';
          mutated = true;
        }
        if (acc.id === 'acc-2' && (!acc.label || acc.label.startsWith('Account 2'))) {
          acc.label = 'Mansoor Irshad';
          mutated = true;
        }
      }
    }
    if (mutated) {
      localStorage.setItem('kaia_automator_config', JSON.stringify({ ...DEFAULT_CONFIG, ...parsed }));
    }
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveStoredConfig(config: AppConfig) {
  try {
    // Keep top-level personId/email synced with primary account for legacy consumers
    const primary = config.accounts[0];
    const normalized: AppConfig = {
      ...config,
      personId: primary?.personId || config.personId,
      kaiaEmail: primary?.kaiaEmail || config.kaiaEmail,
      kaiaPassword: primary?.kaiaPassword || config.kaiaPassword,
      manualToken: primary?.manualToken || config.manualToken,
    };
    localStorage.setItem('kaia_automator_config', JSON.stringify(normalized));
  } catch (e) {
    console.error('Failed to save config to localStorage', e);
  }
}

/**
 * Returns current Date in Pakistan Time (PKT, UTC+5)
 */
export function getPKTDate(date = new Date()): {
  year: number;
  month: string;
  day: string;
  dateString: string;
  timeString: string;
  isSunday: boolean;
  dayName: string;
} {
  const pktMs = date.getTime() + 5 * 60 * 60 * 1000;
  const pktDate = new Date(pktMs);

  const year = pktDate.getUTCFullYear();
  const m = String(pktDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pktDate.getUTCDate()).padStart(2, '0');
  const dateString = `${year}-${m}-${d}`;

  const hh = String(pktDate.getUTCHours()).padStart(2, '0');
  const mm = String(pktDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(pktDate.getUTCSeconds()).padStart(2, '0');
  const timeString = `${hh}:${mm}:${ss}`;

  const dayOfWeek = pktDate.getUTCDay();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    year,
    month: m,
    day: d,
    dateString,
    timeString,
    isSunday: dayOfWeek === 0,
    dayName: dayNames[dayOfWeek],
  };
}

/**
 * Convert PKT (UTC+5) date and time strings into UTC ISO string
 */
export function pktToUtcIso(workDate: string, pktTime: string): string {
  // ISO format with explicit +05:00 offset: YYYY-MM-DDTHH:MM:SS+05:00
  const normalizedTime = pktTime.length === 5 ? `${pktTime}:00` : pktTime;
  const dateTimeWithOffset = `${workDate}T${normalizedTime}+05:00`;
  const d = new Date(dateTimeWithOffset);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date/time combination: ${dateTimeWithOffset}`);
  }
  return d.toISOString();
}

/**
 * Format ISO string into readable PKT string
 */
export function formatToPKT(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      timeZone: 'Asia/Karachi',
      dateStyle: 'medium',
      timeStyle: 'medium',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

/**
 * Calculate countdown until next 08:00 AM PKT (Monday - Saturday)
 */
export function getNextCronCountdown(): {
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
  nextDateString: string;
} {
  const now = new Date();
  const pktMs = now.getTime() + 5 * 60 * 60 * 1000;
  const pktNow = new Date(pktMs);

  let targetPkt = new Date(pktNow);
  targetPkt.setUTCHours(8, 0, 0, 0);

  // If already past 8:00 AM PKT today, target tomorrow
  if (pktNow.getUTCHours() >= 8) {
    targetPkt.setUTCDate(targetPkt.getUTCDate() + 1);
  }

  // If Sunday (0), target Monday
  if (targetPkt.getUTCDay() === 0) {
    targetPkt.setUTCDate(targetPkt.getUTCDate() + 1);
  }

  // Difference in milliseconds
  const diffMs = Math.max(0, targetPkt.getTime() - pktNow.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const m = String(targetPkt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(targetPkt.getUTCDate()).padStart(2, '0');
  const nextDateString = `${targetPkt.getUTCFullYear()}-${m}-${d}`;

  return {
    hours,
    minutes,
    seconds,
    formatted: `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`,
    nextDateString,
  };
}
