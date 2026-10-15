import { useEffect, useState } from 'react';
import { AppConfig, SupabaseAttendanceRecord } from '../types/index.ts';
import { formatToPKT, pktToUtcIso } from '../utils/time.ts';
import { safeParseJson } from '../utils/safeJson.ts';

interface AttendanceTableTabProps {
  config: AppConfig;
  onOpenLateAbsent?: () => void;
}

export function AttendanceTableTab({ config, onOpenLateAbsent }: AttendanceTableTabProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    config.accounts[0]?.id || 'acc-1'
  );
  const [records, setRecords] = useState<SupabaseAttendanceRecord[]>([]);
  const [resolvedPersonId, setResolvedPersonId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [updatingDate, setUpdatingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<SupabaseAttendanceRecord | null>(null);

  const activeAccount =
    config.accounts.find((a) => a.id === selectedAccountId) || config.accounts[0];

  const fetchRecords = async () => {
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
        limit: '120',
      });
      if (activeAccount.manualToken) {
        params.set('accessToken', activeAccount.manualToken);
      }

      const res = await fetch(`/api/attendance/history?${params.toString()}`);
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResolvedPersonId(data.personId || activeAccount.personId || '');
      setRecords(data.records || []);
    } catch (err: any) {
      setError(err.message || 'Failed to query attendance history from Supabase');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [selectedAccountId, activeAccount?.personId, activeAccount?.kaiaEmail]);

  const handleQuickRowUpdate = async (workDate: string, markLate: boolean) => {
    if (!activeAccount) return;
    setUpdatingDate(workDate);
    setNotice(null);
    try {
      const pktTime = markLate ? '08:35:10' : '08:00:08';
      const clockInIsoUTC = pktToUtcIso(workDate, pktTime);
      const res = await fetch('/api/attendance/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: config.supabaseUrl,
          supabaseAnonKey: config.supabaseAnonKey,
          addJitter: true,
          simulate: false,
          lat: activeAccount.lat ?? config.lat,
          lng: activeAccount.lng ?? config.lng,
          distanceM: activeAccount.distanceM ?? config.distanceM,
          accounts: [activeAccount],
          entries: [
            {
              workDate,
              clockInIsoUTC,
              late: markLate,
            },
          ],
        }),
      });
      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to update ${workDate}`);
      }
      setNotice({
        type: 'success',
        text: `Updated ${workDate} to ${markLate ? 'Late (08:35 PKT)' : 'On-Time (08:00 PKT)'} for ${activeAccount.label}!`,
      });
      await fetchRecords();
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: `Failed to update ${workDate}: ${err.message}`,
      });
    } finally {
      setUpdatingDate(null);
    }
  };

  const filteredRecords = records.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.work_date?.toLowerCase().includes(q) ||
      r.clock_in_at?.toLowerCase().includes(q)
    );
  });

  const onTimeCount = records.filter((r) => !r.late).length;
  const lateCount = records.filter((r) => r.late).length;
  const onTimeRate = records.length ? Math.round((onTimeCount / records.length) * 100) : 100;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Live Supabase Attendance Table</h2>
          <p className="text-xs text-slate-400 mt-1">
            Directly queried records from table <code className="text-indigo-400">attendance</code> for{' '}
            <span className="text-white font-semibold">{activeAccount?.label}</span>
            {resolvedPersonId ? (
              <span className="text-slate-400 font-mono"> ({resolvedPersonId.slice(0, 8)}…)</span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onOpenLateAbsent && (
            <button
              onClick={onOpenLateAbsent}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded-lg border border-amber-500/30 transition-all cursor-pointer"
            >
              Open Late &amp; Absent Updater {lateCount > 0 ? `(${lateCount} Late)` : ''}
            </button>
          )}
          <button
            onClick={fetchRecords}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 text-white rounded-lg border border-slate-700 transition-all flex items-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Querying Supabase...</span>
              </>
            ) : (
              <span>Refresh Records</span>
            )}
          </button>
        </div>
      </div>

      {/* Account Switcher Segmented Control */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-xl">
        <span className="text-xs font-medium text-slate-400 px-2">Inspect Account:</span>
        {config.accounts.map((acc, idx) => (
          <button
            key={acc.id}
            onClick={() => setSelectedAccountId(acc.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              selectedAccountId === acc.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {acc.label || `Account ${idx + 1}`}
            {acc.kaiaEmail ? ` (${acc.kaiaEmail})` : ''}
          </button>
        ))}
      </div>

      {/* Notice banner */}
      {notice && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            notice.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">Total Synced Records</div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {records.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Queried from Supabase REST API</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">On-Time Punctuality</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {onTimeRate}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {onTimeCount} on-time · {lateCount} late of {records.length} total entries
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">Latest Recorded Work Date</div>
          <div className="text-2xl font-bold text-indigo-400 font-mono tabular-nums">
            {records[0]?.work_date || 'None'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {records[0] ? formatToPKT(records[0].clock_in_at) : 'No entries logged yet'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search by date (e.g. 2026-10)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="text-xs text-slate-400 font-mono tabular-nums">
          Showing {filteredRecords.length} of {records.length} rows
        </div>
      </div>

      {/* Error notification if query fails */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-500/40 p-4 rounded-xl text-xs text-rose-200 space-y-1">
          <div className="font-semibold">Supabase Query Notice:</div>
          <p className="font-mono">{error}</p>
          <p className="text-slate-400 text-[11px] mt-2">
            Tip: Ensure KAIA login credentials or a manual JWT token are configured for {activeAccount?.label} in the Config tab.
          </p>
        </div>
      )}

      {/* Records Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading && records.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <svg className="animate-spin h-5 w-5 text-indigo-500 mx-auto mb-2" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Loading attendance records from Supabase...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="text-sm font-semibold text-slate-300">No attendance records found</div>
            <p className="text-xs mt-1">
              {searchQuery
                ? 'No records matched your search query.'
                : `No attendance records found for ${activeAccount?.label} yet.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Work Date</th>
                  <th className="py-3 px-4">Clock-In (PKT Time)</th>
                  <th className="py-3 px-4">Distance</th>
                  <th className="py-3 px-4">Coordinates</th>
                  <th className="py-3 px-4">Punctuality</th>
                  <th className="py-3 px-4 text-right">Quick Update / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredRecords.map((record) => {
                  const isUpdating = updatingDate === record.work_date;
                  return (
                    <tr key={record.work_date} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {record.work_date}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 tabular-nums">
                        {formatToPKT(record.clock_in_at)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 tabular-nums">
                        {record.clock_in_distance_m} m
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 tabular-nums">
                        {Number(record.clock_in_lat || 0).toFixed(4)}, {Number(record.clock_in_lng || 0).toFixed(4)}
                      </td>
                      <td className="py-3.5 px-4 font-sans">
                        {record.late ? (
                          <span className="text-amber-400 font-semibold">Late</span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">On-Time</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-sans">
                        <div className="flex items-center justify-end gap-2">
                          {record.late ? (
                            <button
                              disabled={isUpdating}
                              onClick={() => handleQuickRowUpdate(record.work_date, false)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isUpdating ? 'Updating...' : 'Fix to On-Time'}
                            </button>
                          ) : (
                            <button
                              disabled={isUpdating}
                              onClick={() => handleQuickRowUpdate(record.work_date, true)}
                              className="px-2.5 py-1 text-[11px] font-medium bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-500/30 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isUpdating ? 'Updating...' : 'Update as Late'}
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedRecord(record)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            View JSON
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

      {/* Selected Record Modal / Details */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                Attendance Record: {selectedRecord.work_date} ({activeAccount?.label})
              </h3>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                Close
              </button>
            </div>
            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-300 overflow-x-auto max-h-96">
              {JSON.stringify(selectedRecord, null, 2)}
            </pre>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedRecord, null, 2))}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
              >
                Copy JSON
              </button>
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
