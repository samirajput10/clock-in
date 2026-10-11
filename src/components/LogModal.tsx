import { ExecutionLog } from '../types/index.ts';

interface LogModalProps {
  log: ExecutionLog | null;
  onClose: () => void;
}

export function LogModal({ log, onClose }: LogModalProps) {
  if (!log) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white">Execution Event Telemetry</h3>
            <p className="text-xs text-slate-400">
              ID: <span className="font-mono text-slate-300">{log.id}</span> · Mode: <span className="uppercase text-slate-200">{log.mode}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 mb-0.5">Status</div>
            <div
              className={`font-semibold capitalize ${
                log.status === 'success'
                  ? 'text-emerald-400'
                  : log.status === 'skipped'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {log.status}
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 mb-0.5">Work Date</div>
            <div className="font-semibold text-white font-mono">{log.workDate}</div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 mb-0.5">Human Jitter</div>
            <div className="font-semibold text-slate-300 font-mono">
              {log.jitterAppliedMs ? `+${(log.jitterAppliedMs / 1000).toFixed(2)}s` : '0s'}
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-slate-400 mb-0.5">HTTP Code</div>
            <div className="font-semibold text-indigo-400 font-mono">
              {log.responseStatus || 200}
            </div>
          </div>
        </div>

        {log.message && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
            <span className="font-semibold text-slate-400">Message: </span>
            {log.message}
          </div>
        )}

        {log.error && (
          <div className="p-3 bg-rose-950/40 rounded-xl border border-rose-500/40 text-xs text-rose-300 font-mono">
            <span className="font-semibold">Error: </span>
            {log.error}
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-slate-300 mb-1.5">Raw JSON Record:</div>
          <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-64">
            {JSON.stringify(log, null, 2)}
          </pre>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => navigator.clipboard.writeText(JSON.stringify(log, null, 2))}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
          >
            Copy JSON
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
