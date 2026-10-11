import { useEffect, useState } from 'react';
import { getNextCronCountdown, getPKTDate } from '../utils/time.ts';

interface ClockBannerProps {
  schedulerActive: boolean;
  onToggleScheduler: () => void;
}

export function ClockBanner({
  schedulerActive,
  onToggleScheduler,
}: ClockBannerProps) {
  const [now, setNow] = useState(new Date());
  const [countdown, setCountdown] = useState(getNextCronCountdown());

  useEffect(() => {
    const interval = setInterval(() => {
      const current = new Date();
      setNow(current);
      setCountdown(getNextCronCountdown());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const pktInfo = getPKTDate(now);
  const utcString = now.toISOString().replace('T', ' ').substring(0, 19);

  return (
    <div className="bg-slate-900 border-b border-slate-800/80 py-4 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Real-time clocks */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-8 items-center">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-0.5">
              Pakistan Time (PKT / UTC+5)
            </div>
            <div className="text-xl font-bold text-white font-mono tabular-nums tracking-tight">
              {pktInfo.timeString}
            </div>
            <div className="text-xs text-slate-400">
              {pktInfo.dayName}, {pktInfo.dateString}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-0.5">
              Coordinated Universal (UTC)
            </div>
            <div className="text-xl font-medium text-slate-300 font-mono tabular-nums tracking-tight">
              {utcString.substring(11)}
            </div>
            <div className="text-xs text-slate-400">
              {utcString.substring(0, 10)} UTC
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-0.5">
              Target Clock-In Schedule
            </div>
            <div className="text-sm font-semibold text-white font-mono tabular-nums">
              08:00:00 AM PKT (03:00 UTC)
            </div>
            <div className="text-xs text-slate-400">
              Mon–Sat · Sundays Skipped
            </div>
          </div>
        </div>

        {/* Countdown & Scheduler Toggle */}
        <div className="flex items-center gap-4 bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
          <div>
            <div className="text-[11px] font-medium text-slate-400">
              Next Scheduled Dispatch
            </div>
            <div className="text-sm font-bold text-indigo-400 font-mono tabular-nums">
              {countdown.formatted}
            </div>
            <div className="text-[11px] text-slate-400">
              Target: {countdown.nextDateString}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          <div className="flex flex-col items-end">
            <span className="text-[11px] text-slate-400 mb-1">Server Scheduler</span>
            <button
              onClick={onToggleScheduler}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                schedulerActive
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              {schedulerActive ? 'Active (Auto-Running)' : 'Paused'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
