import { useEffect, useState } from 'react';
import { AppConfig, SupabaseAttendanceRecord } from '../types/index.ts';
import { formatToPKT } from '../utils/time.ts';

interface AttendanceTableTabProps {
  config: AppConfig;
}

export function AttendanceTableTab({ config }: AttendanceTableTabProps) {
  const [records, setRecords] = useState<SupabaseAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<SupabaseAttendanceRecord | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        personId: config.personId,
        supabaseUrl: config.supabaseUrl,
        supabaseAnonKey: config.supabaseAnonKey,
      });
      if (config.manualToken) {
        params.set('accessToken', config.manualToken);
      }

      const res = await fetch(`/api/attendance/history?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setRecords(data.records || []);
    } catch (err: any) {
      setError(err.message || 'Failed to query attendance history from Supabase');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [config.personId]);

  const filteredRecords = records.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.work_date?.toLowerCase().includes(q) ||
      r.clock_in_at?.toLowerCase().includes(q)
    );
  });

  const onTimeCount = records.filter((r) => !r.late).length;
  const onTimeRate = records.length ? Math.round((onTimeCount / records.length) * 100) : 100;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Live Supabase Attendance Table</h2>
          <p className="text-xs text-slate-400 mt-1">
            Directly queried records from table <code className="text-indigo-400">attendance</code> for Person ID <span className="text-white font-mono">{config.personId.substring(0, 8)}...</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            {onTimeCount} on-time of {records.length} total entries
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
            Tip: If Row Level Security (RLS) is active on the attendance table, ensure your KAIA credentials or manual JWT token are configured in the Config tab so the request carries an authenticated Bearer token.
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
                : 'Click "Clock In for Today" or "Manual Clock-In" to create your first attendance row in Supabase.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Work Date</th>
                  <th className="py-3 px-4">Clock-In (PKT Time)</th>
                  <th className="py-3 px-4">Clock-In (UTC)</th>
                  <th className="py-3 px-4">Distance</th>
                  <th className="py-3 px-4">Coordinates</th>
                  <th className="py-3 px-4">Punctuality</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredRecords.map((record) => (
                  <tr key={record.work_date} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {record.work_date}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 tabular-nums">
                      {formatToPKT(record.clock_in_at)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 tabular-nums truncate max-w-[140px]">
                      {record.clock_in_at}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 tabular-nums">
                      {record.clock_in_distance_m} m
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 tabular-nums">
                      {Number(record.clock_in_lat || 0).toFixed(4)}, {Number(record.clock_in_lng || 0).toFixed(4)}
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      {record.late ? (
                        <span className="text-rose-400 font-medium">Late</span>
                      ) : (
                        <span className="text-emerald-400 font-medium">On-Time</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-sans">
                      <button
                        onClick={() => setSelectedRecord(record)}
                        className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer"
                      >
                        View JSON
                      </button>
                    </td>
                  </tr>
                ))}
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
                Attendance Record: {selectedRecord.work_date}
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
