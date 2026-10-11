import { useState } from 'react';
import { AppConfig, ExecutionLog } from '../types/index.ts';
import { getPKTDate } from '../utils/time.ts';

interface DashboardTabProps {
  config: AppConfig;
  logs: ExecutionLog[];
  isClockingIn: boolean;
  onPushAttendance: (params: {
    workDate?: string;
    pktTime?: string;
    addJitter: boolean;
    simulate: boolean;
    late: boolean;
  }) => Promise<void>;
  onInspectLog: (log: ExecutionLog) => void;
  onClearLogs: () => void;
  onRefreshLogs: () => void;
}

export function DashboardTab({
  config,
  logs,
  isClockingIn,
  onPushAttendance,
  onInspectLog,
  onClearLogs,
  onRefreshLogs,
}: DashboardTabProps) {
  const todayPKT = getPKTDate();
  const [selectedDate, setSelectedDate] = useState(todayPKT.dateString);
  const [selectedTime, setSelectedTime] = useState('08:00:08');
  const [addJitter, setAddJitter] = useState(config.autoJitter);
  const [simulate, setSimulate] = useState(config.simulateMode);
  const [isLate, setIsLate] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleTrigger = async () => {
    setStatusMessage(null);
    try {
      await onPushAttendance({
        workDate: selectedDate,
        pktTime: selectedTime,
        addJitter,
        simulate,
        late: isLate,
      });
      setStatusMessage({
        type: 'success',
        text: simulate
          ? `Simulation completed successfully for ${selectedDate}!`
          : `Attendance record successfully pushed to Supabase for ${selectedDate}!`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to dispatch attendance',
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner Alert (if triggered) */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start justify-between gap-4 transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="font-semibold">
              {statusMessage.type === 'success' ? 'Dispatched:' : 'Error:'}
            </span>
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-75 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary KPI & System Parameters Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">Target Person ID</div>
          <div className="text-sm font-bold text-white font-mono truncate" title={config.personId}>
            {config.personId}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Foreign key for KAIA Supabase attendance
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">Target Schedule</div>
          <div className="text-sm font-bold text-white font-mono">
            08:00 AM PKT (03:00 UTC)
          </div>
          <div className="text-[11px] text-emerald-400 mt-2">
            Non-late target window (Mon–Sat)
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">Office Coordinates</div>
          <div className="text-sm font-bold text-white font-mono tabular-nums">
            {config.lat.toFixed(5)}, {config.lng.toFixed(5)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Distance: {config.distanceM}m (Office Perimeter)
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-xs font-medium text-slate-400 mb-1">Supabase Endpoint</div>
          <div className="text-sm font-bold text-indigo-300 font-mono truncate" title={config.supabaseUrl}>
            {config.supabaseUrl.replace('https://', '')}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Table: <code className="text-slate-300">attendance</code> (upsert)
          </div>
        </div>
      </div>

      {/* Main Grid: Clock-In Dispatch Console & Live State */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Dispatch Card (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">Attendance Dispatch Console</h2>
              <p className="text-xs text-slate-400">
                Trigger an immediate clock-in upsert or dry-run simulation
              </p>
            </div>
            <div className="text-xs font-medium text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              PKT Today: <span className="text-white font-mono">{todayPKT.dateString}</span>
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Work Date (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Target Clock-In Time (PKT)
                </label>
                <input
                  type="time"
                  step="1"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Options Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <label className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={addJitter}
                  onChange={(e) => setAddJitter(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Human Jitter</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Adds 2–24s random delay to prevent bot fingerprinting
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={simulate}
                  onChange={(e) => setSimulate(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Simulation Mode</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Dry run test payload without writing to remote Supabase
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={isLate}
                  onChange={(e) => setIsLate(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Mark as Late</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Explicitly sets <code className="text-slate-300">late: true</code> (defaults to false)
                  </div>
                </div>
              </label>
            </div>

            {/* Pre-flight Info */}
            <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center justify-between">
              <div>
                <span>Resolved UTC Timestamp: </span>
                <span className="text-white font-mono">
                  {new Date(`${selectedDate}T${selectedTime.length === 5 ? selectedTime + ':00' : selectedTime}+05:00`).toISOString()}
                </span>
              </div>
              <span className="text-indigo-400 font-mono">UTC+5 Offset</span>
            </div>

            {/* Submit CTA */}
            <button
              onClick={handleTrigger}
              disabled={isClockingIn}
              className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                simulate
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              } disabled:opacity-50`}
            >
              {isClockingIn ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Processing Upsert Request...</span>
                </>
              ) : simulate ? (
                <span>Run Dry Simulation (Safe Test)</span>
              ) : (
                <span>Push Attendance to Supabase Now</span>
              )}
            </button>
          </div>
        </div>

        {/* Quick Diagnostics & Information (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-3">Supabase Upsert Mechanism</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Attendance records are stored in KAIA's Supabase backend. The automator issues an HTTP POST to:
            </p>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg font-mono text-[11px] text-indigo-300 break-all mb-4">
              /rest/v1/attendance?on_conflict=person_id%2Cwork_date
            </div>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span>Conflict resolution:</span>
                <span className="text-slate-200 font-mono">merge-duplicates</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Distance from office:</span>
                <span className="text-slate-200 font-mono">{config.distanceM} meters</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Coordinates:</span>
                <span className="text-slate-200 font-mono">{config.lat.toFixed(4)}, {config.lng.toFixed(4)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Auto-skip days:</span>
                <span className="text-slate-200">Sundays</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-2">Automated Cron Routine</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              The automator is programmed for <strong className="text-white">08:00 AM PKT</strong> (03:00 UTC). To prevent pattern detection by administrative monitoring tools, each automated run applies a non-linear human jitter delay between 2,000ms and 24,000ms.
            </p>
            <div className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
              Schedule: 0 3 * * 1-6 (Mon–Sat)
            </div>
          </div>
        </div>
      </div>

      {/* Execution Audit Log Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">Execution Audit Log</h3>
            <p className="text-xs text-slate-400">
              Recent attendance dispatches, simulations, and automated cron runs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onRefreshLogs}
              className="text-xs font-medium text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
            >
              Refresh
            </button>
            <button
              onClick={onClearLogs}
              className="text-xs font-medium text-slate-400 hover:text-rose-400 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
            >
              Clear Logs
            </button>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="text-sm font-medium text-slate-300">No execution logs yet</div>
            <p className="text-xs mt-1">
              Trigger a manual clock-in or run a simulation to see execution telemetry.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (PKT)</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Work Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Clock-In UTC</th>
                  <th className="py-2.5 px-3">Jitter</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((log) => {
                  const statusColors =
                    log.status === 'success'
                      ? 'text-emerald-400'
                      : log.status === 'skipped'
                      ? 'text-amber-400'
                      : 'text-rose-400';

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 text-slate-300 tabular-nums">
                        {new Date(log.timestamp).toLocaleTimeString('en-US', {
                          timeZone: 'Asia/Karachi',
                          hour12: false,
                        })}
                      </td>
                      <td className="py-3 px-3 font-sans">
                        <span className="text-slate-300 uppercase text-[10px] tracking-wide font-medium">
                          {log.mode}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-white font-semibold">{log.workDate}</td>
                      <td className="py-3 px-3">
                        <span className={`font-semibold capitalize ${statusColors}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400 truncate max-w-[180px]">
                        {log.clockInIsoUTC.substring(11, 19)} UTC
                      </td>
                      <td className="py-3 px-3 text-slate-400 tabular-nums">
                        {log.jitterAppliedMs ? `+${(log.jitterAppliedMs / 1000).toFixed(1)}s` : '0s'}
                      </td>
                      <td className="py-3 px-3 text-right font-sans">
                        <button
                          onClick={() => onInspectLog(log)}
                          className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer"
                        >
                          Inspect JSON
                        </button>
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
