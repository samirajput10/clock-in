import { useEffect, useMemo, useState } from 'react';
import { AppConfig, SupabaseAttendanceRecord } from '../types/index.ts';
import { formatToPKT, getPKTDate, pktToUtcIso } from '../utils/time.ts';
import { safeParseJson } from '../utils/safeJson.ts';

interface LateAbsentTabProps {
  config: AppConfig;
  onRefreshLogs: () => void;
}

type DayCategory = 'absent' | 'late' | 'on-time';
type FilterMode = 'issues' | 'late' | 'absent' | 'all';

interface ScannedDayEntry {
  workDate: string;
  dayName: string;
  isSunday: boolean;
  category: DayCategory;
  existingRecord?: SupabaseAttendanceRecord;
  customPktTime: string;
  customLate: boolean;
}

function getDayNameFromDateStr(dateStr: string): { dayName: string; isSunday: boolean } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dow = dt.getUTCDay();
  return { dayName: names[dow] || '', isSunday: dow === 0 };
}

function generateDateRange(startDate: string, endDate: string, includeSundays: boolean): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  if (!sy || !ey) return dates;

  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return dates;

  const cursor = new Date(end);
  let safety = 0;
  while (cursor >= start && safety < 366) {
    safety++;
    const dow = cursor.getUTCDay();
    if (includeSundays || dow !== 0) {
      const y = cursor.getUTCFullYear();
      const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cursor.getUTCDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates;
}

function extractPktTimeFromIso(isoString?: string): string {
  if (!isoString) return '08:00:08';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '08:00:08';
    const pktMs = d.getTime() + 5 * 60 * 60 * 1000;
    const pkt = new Date(pktMs);
    const hh = String(pkt.getUTCHours()).padStart(2, '0');
    const mm = String(pkt.getUTCMinutes()).padStart(2, '0');
    const ss = String(pkt.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return '08:00:08';
  }
}

export function LateAbsentTab({ config, onRefreshLogs }: LateAbsentTabProps) {
  const todayPkt = getPKTDate();

  // Default scan range: last 30 days up to today PKT
  const defaultStart = useMemo(() => {
    const [y, m, d] = todayPkt.dateString.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 29);
    return dt.toISOString().split('T')[0];
  }, [todayPkt.dateString]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    config.accounts[0]?.id || 'acc-1'
  );
  const [applyToAllAccounts, setApplyToAllAccounts] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(todayPkt.dateString);
  const [includeSundays, setIncludeSundays] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('issues');

  // Target update parameters for bulk & default action
  const [targetPktTime, setTargetPktTime] = useState<string>('08:00:08');
  const [targetLateStatus, setTargetLateStatus] = useState<boolean>(false);
  const [addJitter, setAddJitter] = useState<boolean>(true);
  const [lat, setLat] = useState<number>(config.lat);
  const [lng, setLng] = useState<number>(config.lng);
  const [distanceM, setDistanceM] = useState<number>(config.distanceM);

  // Fetched records & selection state
  const [records, setRecords] = useState<SupabaseAttendanceRecord[]>([]);
  const [resolvedPersonId, setResolvedPersonId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [updatingDates, setUpdatingDates] = useState<Record<string, boolean>>({});
  const [isBulkUpdating, setIsBulkUpdating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Per-row overrides & selected checkboxes
  const [selectedDates, setSelectedDates] = useState<Record<string, boolean>>({});
  const [rowOverrides, setRowOverrides] = useState<
    Record<string, { pktTime: string; late: boolean }>
  >({});

  // Quick single-date manual addition
  const [manualQuickDate, setManualQuickDate] = useState<string>(todayPkt.dateString);

  const activeAccount =
    config.accounts.find((a) => a.id === selectedAccountId) || config.accounts[0];

  const fetchHistoryForRange = async () => {
    if (!activeAccount) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        personId: activeAccount.personId || '',
        email: activeAccount.kaiaEmail || '',
        password: activeAccount.kaiaPassword || '',
        supabaseUrl: config.supabaseUrl,
        supabaseAnonKey: config.supabaseAnonKey,
        limit: '300',
        startDate,
        endDate,
      });
      if (activeAccount.manualToken) {
        params.set('accessToken', activeAccount.manualToken);
      }

      const res = await fetch(`/api/attendance/history?${params.toString()}`);
      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResolvedPersonId(data.personId || activeAccount.personId || '');
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (err: any) {
      setError(err.message || 'Failed to scan attendance records from Supabase');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoryForRange();
  }, [selectedAccountId, startDate, endDate, activeAccount?.personId, activeAccount?.kaiaEmail]);

  // Build map of work_date -> SupabaseAttendanceRecord
  const recordsByDate = useMemo(() => {
    const map = new Map<string, SupabaseAttendanceRecord>();
    for (const r of records) {
      if (r.work_date) {
        map.set(r.work_date, r);
      }
    }
    return map;
  }, [records]);

  // Combine calendar working days in [startDate, endDate] with any recorded dates
  const scannedDays: ScannedDayEntry[] = useMemo(() => {
    const calendarDates = generateDateRange(startDate, endDate, includeSundays);
    const dateSet = new Set<string>(calendarDates);
    // Also ensure any recorded row within range is included even if Sunday
    for (const r of records) {
      if (r.work_date && r.work_date >= startDate && r.work_date <= endDate) {
        dateSet.add(r.work_date);
      }
    }

    const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

    return sortedDates.map((workDate) => {
      const existing = recordsByDate.get(workDate);
      const { dayName, isSunday } = getDayNameFromDateStr(workDate);

      let category: DayCategory = 'absent';
      if (existing && existing.clock_in_at) {
        const pktTimeStr = extractPktTimeFromIso(existing.clock_in_at);
        // Consider late if existing.late is true OR clock_in_at is after 08:15:00 PKT
        const isAfterThreshold = pktTimeStr > '08:15:00';
        category = existing.late || isAfterThreshold ? 'late' : 'on-time';
      } else {
        category = 'absent';
      }

      const override = rowOverrides[workDate];
      return {
        workDate,
        dayName,
        isSunday,
        category,
        existingRecord: existing,
        customPktTime: override?.pktTime ?? targetPktTime,
        customLate: override?.late ?? targetLateStatus,
      };
    });
  }, [startDate, endDate, includeSundays, records, recordsByDate, rowOverrides, targetPktTime, targetLateStatus]);

  // Auto-select all Late & Absent rows when scan completes
  useEffect(() => {
    const nextSelection: Record<string, boolean> = {};
    for (const day of scannedDays) {
      if (day.category === 'late' || day.category === 'absent') {
        nextSelection[day.workDate] = true;
      }
    }
    setSelectedDates(nextSelection);
  }, [records, startDate, endDate, includeSundays]);

  const lateCount = scannedDays.filter((d) => d.category === 'late').length;
  const absentCount = scannedDays.filter((d) => d.category === 'absent').length;
  const onTimeCount = scannedDays.filter((d) => d.category === 'on-time').length;

  const displayedDays = useMemo(() => {
    return scannedDays.filter((d) => {
      if (filterMode === 'issues') return d.category === 'late' || d.category === 'absent';
      if (filterMode === 'late') return d.category === 'late';
      if (filterMode === 'absent') return d.category === 'absent';
      return true;
    });
  }, [scannedDays, filterMode]);

  const selectedCount = Object.values(selectedDates).filter(Boolean).length;

  const handleDatePreset = (daysBack: number | 'month') => {
    const [y, m, d] = todayPkt.dateString.split('-').map(Number);
    if (daysBack === 'month') {
      setStartDate(`${y}-${String(m).padStart(2, '0')}-01`);
      setEndDate(todayPkt.dateString);
      return;
    }
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - (daysBack - 1));
    setStartDate(dt.toISOString().split('T')[0]);
    setEndDate(todayPkt.dateString);
  };

  const handleApplyModePreset = (mode: 'fix-on-time' | 'mark-late-830' | 'mark-late-900') => {
    if (mode === 'fix-on-time') {
      setTargetPktTime('08:00:08');
      setTargetLateStatus(false);
      setRowOverrides({});
    } else if (mode === 'mark-late-830') {
      setTargetPktTime('08:32:15');
      setTargetLateStatus(true);
      setRowOverrides({});
    } else if (mode === 'mark-late-900') {
      setTargetPktTime('09:05:10');
      setTargetLateStatus(true);
      setRowOverrides({});
    }
  };

  const updateSingleDay = async (
    workDate: string,
    pktTime: string,
    lateStatus: boolean
  ) => {
    setUpdatingDates((prev) => ({ ...prev, [workDate]: true }));
    setFeedback(null);
    try {
      const clockInIsoUTC = pktToUtcIso(workDate, pktTime);
      const targetAccounts = applyToAllAccounts
        ? config.accounts.filter((a) => a.enabled)
        : [activeAccount].filter(Boolean);

      const res = await fetch('/api/attendance/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: config.supabaseUrl,
          supabaseAnonKey: config.supabaseAnonKey,
          addJitter,
          simulate: false,
          lat,
          lng,
          distanceM,
          accounts: targetAccounts,
          entries: [
            {
              workDate,
              clockInIsoUTC,
              late: lateStatus,
              lat,
              lng,
              distanceM,
            },
          ],
        }),
      });

      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to update ${workDate}`);
      }

      setFeedback({
        type: 'success',
        message: `Updated ${workDate} to ${lateStatus ? 'Late' : 'On-Time'} (${pktTime} PKT) for ${
          targetAccounts.length > 1 ? `${targetAccounts.length} accounts` : activeAccount?.label
        }.`,
      });
      await fetchHistoryForRange();
      onRefreshLogs();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Update failed for ${workDate}: ${err.message}`,
      });
    } finally {
      setUpdatingDates((prev) => ({ ...prev, [workDate]: false }));
    }
  };

  const handleBulkUpdate = async () => {
    const datesToUpdate = scannedDays.filter((d) => selectedDates[d.workDate]);
    if (datesToUpdate.length === 0) return;

    setIsBulkUpdating(true);
    setFeedback(null);
    try {
      const targetAccounts = applyToAllAccounts
        ? config.accounts.filter((a) => a.enabled)
        : [activeAccount].filter(Boolean);

      const entries = datesToUpdate.map((d) => ({
        workDate: d.workDate,
        clockInIsoUTC: pktToUtcIso(d.workDate, d.customPktTime),
        late: d.customLate,
        lat,
        lng,
        distanceM,
      }));

      const res = await fetch('/api/attendance/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: config.supabaseUrl,
          supabaseAnonKey: config.supabaseAnonKey,
          addJitter,
          simulate: false,
          lat,
          lng,
          distanceM,
          accounts: targetAccounts,
          entries,
        }),
      });

      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Bulk update failed');
      }

      setFeedback({
        type: 'success',
        message: `Successfully updated ${data.successCount} of ${data.totalOperations} attendance record(s) across ${targetAccounts.length} account(s)!`,
      });
      await fetchHistoryForRange();
      onRefreshLogs();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Bulk update error: ${err.message}`,
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const toggleSelectAllDisplayed = (checked: boolean) => {
    const next = { ...selectedDates };
    for (const d of displayedDays) {
      next[d.workDate] = checked;
    }
    setSelectedDates(next);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">
            Late &amp; Absent Attendance Updater
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Scan previous working days to detect recorded <span className="text-amber-300 font-medium">Late</span> entries or missing <span className="text-rose-300 font-medium">Absent</span> dates, and update them individually or in bulk.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchHistoryForRange}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Scanning Supabase...' : 'Re-Scan Date Range'}
          </button>
        </div>
      </div>

      {/* Account Selector & Scope Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400 mr-1">Inspect Account:</span>
          {config.accounts.map((acc, idx) => (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                selectedAccountId === acc.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {acc.label || `Account ${idx + 1}`}
              {acc.kaiaEmail ? ` (${acc.kaiaEmail})` : ''}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-lg">
          <input
            type="checkbox"
            checked={applyToAllAccounts}
            onChange={(e) => setApplyToAllAccounts(e.target.checked)}
            className="rounded border-slate-700 text-indigo-600 focus:ring-0"
          />
          <span>
            Apply updates to <strong>All Enabled Accounts ({config.accounts.filter((a) => a.enabled).length})</strong> simultaneously
          </span>
        </label>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">Recorded Late Days</div>
          <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums">
            {lateCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Marked <code className="text-amber-300">late: true</code> or &gt; 08:15 PKT
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">Absent / Missing Days</div>
          <div className="text-2xl font-bold text-rose-400 font-mono tabular-nums">
            {absentCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Working days with no attendance row
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">On-Time Days</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {onTimeCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Verified <code className="text-emerald-300">late: false</code> in range
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">Selected to Update</div>
          <div className="text-2xl font-bold text-indigo-400 font-mono tabular-nums">
            {selectedCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Ready for 1-click batch update
          </div>
        </div>
      </div>

      {/* Control Grid: Scan Window + Target Update Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Scan Window & Quick Date (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">1. Date Range Scanner</h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleDatePreset(14)}
                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
              >
                14d
              </button>
              <button
                type="button"
                onClick={() => handleDatePreset(30)}
                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
              >
                30d
              </button>
              <button
                type="button"
                onClick={() => handleDatePreset(60)}
                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
              >
                60d
              </button>
              <button
                type="button"
                onClick={() => handleDatePreset('month')}
                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
              >
                This Month
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSundays}
              onChange={(e) => setIncludeSundays(e.target.checked)}
              className="rounded border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span>Include Sundays in absent check</span>
          </label>

          {/* Direct Specific Past Date Updater */}
          <div className="pt-4 border-t border-slate-800 space-y-2.5">
            <label className="block text-xs font-semibold text-slate-300">
              Quick Update Any Specific Past Date
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={manualQuickDate}
                onChange={(e) => setManualQuickDate(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={updatingDates[manualQuickDate]}
                onClick={() => updateSingleDay(manualQuickDate, '08:00:08', false)}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                Set On-Time
              </button>
              <button
                type="button"
                disabled={updatingDates[manualQuickDate]}
                onClick={() => updateSingleDay(manualQuickDate, '08:35:10', true)}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                Set Late
              </button>
            </div>
          </div>
        </div>

        {/* Right: Update Target Settings & Bulk Action (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white">
              2. Target Update Values (For Selected Late &amp; Absent Days)
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Presets:</span>
              <button
                type="button"
                onClick={() => handleApplyModePreset('fix-on-time')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer transition-colors ${
                  !targetLateStatus
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Fix to On-Time (08:00 AM)
              </button>
              <button
                type="button"
                onClick={() => handleApplyModePreset('mark-late-830')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer transition-colors ${
                  targetLateStatus && targetPktTime.startsWith('08:3')
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Update as Late (08:32 AM)
              </button>
              <button
                type="button"
                onClick={() => handleApplyModePreset('mark-late-900')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer transition-colors ${
                  targetLateStatus && targetPktTime.startsWith('09:')
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Update as Late (09:05 AM)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                New Clock-In Time (PKT)
              </label>
              <input
                type="time"
                step="1"
                value={targetPktTime}
                onChange={(e) => setTargetPktTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                New Punctuality Status
              </label>
              <select
                value={targetLateStatus ? 'late' : 'on-time'}
                onChange={(e) => setTargetLateStatus(e.target.value === 'late')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="on-time">On-Time (late: false)</option>
                <option value="late">Late (late: true)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Distance (meters)
              </label>
              <input
                type="number"
                value={distanceM}
                onChange={(e) => setDistanceM(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={addJitter}
                onChange={(e) => setAddJitter(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-0"
              />
              <span>Add natural random seconds jitter (+2s to +24s) to each updated day</span>
            </label>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBulkUpdate}
              disabled={isBulkUpdating || selectedCount === 0}
              className="flex-1 py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-all cursor-pointer"
            >
              {isBulkUpdating
                ? `Updating ${selectedCount} Day(s) in Supabase...`
                : `Update Selected Days (${selectedCount}) as ${
                    targetLateStatus ? 'Late' : 'On-Time'
                  } (${targetPktTime} PKT)`}
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-950/40 border border-rose-500/40 p-4 rounded-xl text-xs text-rose-200">
          <div className="font-semibold mb-1">Supabase Query Notice:</div>
          <p className="font-mono">{error}</p>
        </div>
      )}

      {/* Filter Bar & Bulk Selection Controls */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilterMode('issues')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              filterMode === 'issues'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Late &amp; Absent ({lateCount + absentCount})
          </button>
          <button
            onClick={() => setFilterMode('late')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              filterMode === 'late'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Recorded Late Only ({lateCount})
          </button>
          <button
            onClick={() => setFilterMode('absent')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              filterMode === 'absent'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Absent / Missing Only ({absentCount})
          </button>
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              filterMode === 'all'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            All Working Days ({scannedDays.length})
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => toggleSelectAllDisplayed(true)}
            className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            Select Visible ({displayedDays.length})
          </button>
          <span className="text-slate-700">·</span>
          <button
            type="button"
            onClick={() => toggleSelectAllDisplayed(false)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Clear Selection
          </button>
        </div>
      </div>

      {/* Scanned Days Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading && records.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            Scanning Supabase attendance history for {activeAccount?.label}...
          </div>
        ) : displayedDays.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-1">
            <div className="text-sm font-semibold text-emerald-400">
              No {filterMode === 'issues' ? 'Late or Absent' : filterMode} days found in this range!
            </div>
            <p className="text-xs text-slate-400">
              Switch to &quot;All Working Days&quot; or expand the date range above to inspect more dates.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={
                        displayedDays.length > 0 &&
                        displayedDays.every((d) => selectedDates[d.workDate])
                      }
                      onChange={(e) => toggleSelectAllDisplayed(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </th>
                  <th className="py-3 px-4">Work Date</th>
                  <th className="py-3 px-4">Current Status</th>
                  <th className="py-3 px-4">Recorded Clock-In (PKT)</th>
                  <th className="py-3 px-4">New Time (PKT)</th>
                  <th className="py-3 px-4">New Status</th>
                  <th className="py-3 px-4 text-right">Quick Update Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayedDays.map((day) => {
                  const isRowUpdating = Boolean(updatingDates[day.workDate]);
                  return (
                    <tr
                      key={day.workDate}
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedDates[day.workDate])}
                          onChange={(e) =>
                            setSelectedDates((prev) => ({
                              ...prev,
                              [day.workDate]: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="font-semibold text-white">{day.workDate}</div>
                        <div className="text-[11px] text-slate-400 font-sans">
                          {day.dayName}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {day.category === 'absent' && (
                          <span className="text-rose-400 font-semibold">
                            Absent (No Record)
                          </span>
                        )}
                        {day.category === 'late' && (
                          <span className="text-amber-400 font-semibold">
                            Late (Recorded)
                          </span>
                        )}
                        {day.category === 'on-time' && (
                          <span className="text-emerald-400 font-semibold">
                            On-Time
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300 tabular-nums">
                        {day.existingRecord?.clock_in_at ? (
                          <div>
                            <div>{formatToPKT(day.existingRecord.clock_in_at)}</div>
                            <div className="text-[10px] text-slate-500">
                              late: {String(Boolean(day.existingRecord.late))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-sans">
                            — Missing Clock-In —
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <input
                          type="time"
                          step="1"
                          value={day.customPktTime}
                          onChange={(e) =>
                            setRowOverrides((prev) => ({
                              ...prev,
                              [day.workDate]: {
                                pktTime: e.target.value,
                                late: day.customLate,
                              },
                            }))
                          }
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={day.customLate ? 'late' : 'on-time'}
                          onChange={(e) =>
                            setRowOverrides((prev) => ({
                              ...prev,
                              [day.workDate]: {
                                pktTime: day.customPktTime,
                                late: e.target.value === 'late',
                              },
                            }))
                          }
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="on-time">On-Time (late: false)</option>
                          <option value="late">Late (late: true)</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isRowUpdating}
                            onClick={() =>
                              updateSingleDay(
                                day.workDate,
                                day.customPktTime,
                                day.customLate
                              )
                            }
                            className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isRowUpdating ? 'Updating...' : 'Apply Custom'}
                          </button>
                          <button
                            type="button"
                            disabled={isRowUpdating}
                            onClick={() =>
                              updateSingleDay(day.workDate, '08:00:08', false)
                            }
                            className="px-2.5 py-1 text-[11px] font-medium bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Fix On-Time
                          </button>
                          <button
                            type="button"
                            disabled={isRowUpdating}
                            onClick={() =>
                              updateSingleDay(day.workDate, '08:35:10', true)
                            }
                            className="px-2.5 py-1 text-[11px] font-medium bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-500/30 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Mark Late
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
