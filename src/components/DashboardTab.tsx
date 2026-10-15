import { useState } from 'react';
import { Users, Plus, Settings, Play } from 'lucide-react';
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
    targetAccountId?: string;
  }) => Promise<any>;
  onInspectLog: (log: ExecutionLog) => void;
  onClearLogs: () => void;
  onRefreshLogs: () => void;
  onOpenSettings: () => void;
  onOpenLateAbsent: () => void;
  onOpenBatches: () => void;
}

export function DashboardTab({
  config,
  logs,
  isClockingIn,
  onPushAttendance,
  onInspectLog,
  onClearLogs,
  onRefreshLogs,
  onOpenSettings,
  onOpenLateAbsent,
  onOpenBatches,
}: DashboardTabProps) {
  const todayPKT = getPKTDate();
  const [selectedDate, setSelectedDate] = useState(todayPKT.dateString);
  const [selectedTime, setSelectedTime] = useState('08:00:08');
  const [targetAccountId, setTargetAccountId] = useState<string>('all');
  const [addJitter, setAddJitter] = useState(config.autoJitter);
  const [simulate, setSimulate] = useState(config.simulateMode);
  const [isLate, setIsLate] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const enabledAccounts = config.accounts.filter((a) => a.enabled);

  const handleTrigger = async (overrideAccountId?: string) => {
    setStatusMessage(null);
    const effectiveTarget = overrideAccountId || targetAccountId;
    try {
      const res = await onPushAttendance({
        workDate: selectedDate,
        pktTime: selectedTime,
        addJitter,
        simulate,
        late: isLate,
        targetAccountId: effectiveTarget === 'all' ? undefined : effectiveTarget,
      });

      const countMsg =
        res?.totalAccounts && res.totalAccounts > 1
          ? `${res.successCount}/${res.totalAccounts} accounts`
          : effectiveTarget === 'all'
          ? `${enabledAccounts.length} account(s)`
          : config.accounts.find((a) => a.id === effectiveTarget)?.label || 'account';

      setStatusMessage({
        type: 'success',
        text: simulate
          ? `Simulation completed for ${countMsg} on ${selectedDate}!`
          : `Attendance successfully pushed for ${countMsg} on ${selectedDate}!`,
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

      {/* Multi-Account Roster Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Users size={18} className="text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Active KAIA Accounts ({enabledAccounts.length} of {config.accounts.length} Enabled)
              </h2>
              <p className="text-xs text-slate-400">
                Clock in all enabled accounts simultaneously or trigger individual accounts below
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onOpenBatches}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold rounded-lg border border-emerald-500/30 transition-colors cursor-pointer"
            >
              Assigned Batches &amp; Ratings
            </button>
            <button
              onClick={onOpenLateAbsent}
              className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-semibold rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
            >
              Update Previous Late &amp; Absent
            </button>
            <button
              onClick={onOpenSettings}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Add / Manage Credentials</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {config.accounts.map((acc, idx) => {
            const hasCreds = Boolean(acc.kaiaEmail.trim() || acc.manualToken.trim());
            return (
              <div
                key={acc.id}
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                  acc.enabled
                    ? 'bg-slate-950/70 border-slate-800'
                    : 'bg-slate-950/30 border-slate-800/50 opacity-60'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white truncate">
                      {acc.label || `Account ${idx + 1}`}
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        acc.enabled ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {acc.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-slate-300 truncate">
                    {acc.kaiaEmail || (acc.manualToken ? 'Using Manual JWT Token' : 'No email configured yet')}
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 truncate">
                    ID: {acc.personId ? `${acc.personId.slice(0, 14)}…` : 'Auto-detects on login'}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  {hasCreds ? (
                    <button
                      onClick={() => handleTrigger(acc.id)}
                      disabled={isClockingIn}
                      className="flex-1 py-1.5 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Play size={12} />
                      <span>Clock In {acc.label}</span>
                    </button>
                  ) : (
                    <button
                      onClick={onOpenSettings}
                      className="flex-1 py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Settings size={12} />
                      <span>Enter Credentials</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
                Trigger an immediate multi-account clock-in or dry-run simulation
              </p>
            </div>
            <div className="text-xs font-medium text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              PKT Today: <span className="text-white font-mono">{todayPKT.dateString}</span>
            </div>
          </div>

          <div className="space-y-5">
            {/* Target Account Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Account(s)
              </label>
              <select
                value={targetAccountId}
                onChange={(e) => setTargetAccountId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">
                  All Enabled Accounts ({enabledAccounts.length} active) — Staggered Jitter
                </option>
                {config.accounts.map((acc, i) => (
                  <option key={acc.id} value={acc.id}>
                    Only {acc.label || `Account ${i + 1}`} ({acc.kaiaEmail || 'No email set'})
                  </option>
                ))}
              </select>
            </div>

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
                  <div className="text-xs font-semibold text-white">Independent Jitter</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Adds unique 2–24s delay per account so timestamps never collide
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

            {/* Submit CTA */}
            <button
              onClick={() => handleTrigger()}
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
                <span>
                  Run Dry Simulation ({targetAccountId === 'all' ? `${enabledAccounts.length} Accounts` : 'Selected Account'})
                </span>
              ) : (
                <span>
                  Push Attendance Now ({targetAccountId === 'all' ? `All ${enabledAccounts.length} Enabled Accounts` : 'Selected Account'})
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Quick Diagnostics & Information (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-3">Multi-Account Upsert Mechanism</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Each enabled account authenticates independently and upserts its attendance row into KAIA&apos;s Supabase backend:
            </p>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg font-mono text-[11px] text-indigo-300 break-all mb-4">
              /rest/v1/attendance?on_conflict=person_id%2Cwork_date
            </div>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span>Configured accounts:</span>
                <span className="text-slate-200 font-mono">{config.accounts.length} total ({enabledAccounts.length} enabled)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Person ID resolution:</span>
                <span className="text-emerald-400 font-mono">Auto-detected on login</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Timestamp staggering:</span>
                <span className="text-slate-200 font-mono">Independent 2–24s jitter</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Auto-skip days:</span>
                <span className="text-slate-200">Sundays</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-2">Automated Morning Routine</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Every Monday–Saturday at <strong className="text-white">08:00 AM PKT</strong> (03:00 UTC), the server loops through all enabled accounts and clocks each one in with an independent random human jitter offset so no two accounts ever share an identical timestamp.
            </p>
            <div className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
              Schedule: 0 3 * * 1-6 (Mon–Sat · All Enabled Accounts)
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
              Recent attendance dispatches, simulations, and automated cron runs across all accounts
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
                  <th className="py-2.5 px-3">Account</th>
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
                      <td className="py-3 px-3 font-sans font-semibold text-indigo-300">
                        {log.accountLabel || 'Account 1'}
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
