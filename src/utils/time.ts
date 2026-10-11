import { AppConfig } from '../types/index.ts';

export const DEFAULT_CONFIG: AppConfig = {
  supabaseUrl: 'https://llvsmockvufgbqpeepbm.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdnNtb2NrdnVmZ2JxcGVlcGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDU4OTQsImV4cCI6MjA5ODIymTG5NH0.X0guVvHPpfLegMlT2Xu24XBZoFJEqztluUJE0b6G1gY',
  personId: '3a38a9c0-f965-4fde-8c10-84a07dff2901',
  kaiaEmail: '',
  kaiaPassword: '',
  manualToken: '',
  lat: 31.45037392501653,
  lng: 74.34174281647009,
  distanceM: 7637,
  cronSecret: 'my_super_secret_key_123',
  autoJitter: true,
  simulateMode: false,
};

export function loadStoredConfig(): AppConfig {
  try {
    const raw = localStorage.getItem('kaia_automator_config');
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveStoredConfig(config: AppConfig) {
  try {
    localStorage.setItem('kaia_automator_config', JSON.stringify(config));
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
export function formatToPKT(isoString: string): string {
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
