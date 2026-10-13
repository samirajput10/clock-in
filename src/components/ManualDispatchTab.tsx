import { useState } from 'react';
import { AppConfig } from '../types/index.ts';
import { getPKTDate, pktToUtcIso } from '../utils/time.ts';

interface ManualDispatchTabProps {
  config: AppConfig;
  onDispatch: (params: {
    workDate: string;
    clockInIsoUTC: string;
    accessToken?: string;
    addJitter: boolean;
    simulate: boolean;
    lat: number;
    lng: number;
    distanceM: number;
    late: boolean;
    targetAccountId?: string;
  }) => Promise<any>;
}

export function ManualDispatchTab({ config, onDispatch }: ManualDispatchTabProps) {
  const todayPkt = getPKTDate();
  const [workDate, setWorkDate] = useState(todayPkt.dateString);
  const [pktTime, setPktTime] = useState('08:00:08');
  const [targetAccountId, setTargetAccountId] = useState<string>('all');
  const [lat, setLat] = useState(config.lat);
  const [lng, setLng] = useState(config.lng);
  const [distanceM, setDistanceM] = useState(config.distanceM);
  const [late, setLate] = useState(false);
  const [addJitter, setAddJitter] = useState(true);
  const [manualToken, setManualToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [responseLog, setResponseLog] = useState<string>('');

  // Calculate live preview UTC
  let previewIsoUTC = '';
  try {
    previewIsoUTC = pktToUtcIso(workDate, pktTime);
  } catch {
    previewIsoUTC = 'Invalid date/time';
  }

  const targetAccounts =
    targetAccountId === 'all'
      ? config.accounts.filter((a) => a.enabled)
      : config.accounts.filter((a) => a.id === targetAccountId);

  const payloadPreview = targetAccounts.map((acc) => ({
    account: acc.label,
    payload: {
      person_id: acc.personId || '(auto-detected-from-login)',
      work_date: workDate,
      clock_in_at: previewIsoUTC,
      clock_in_distance_m: Number(distanceM),
      clock_in_lat: Number(lat),
      clock_in_lng: Number(lng),
      late,
      updated_at: previewIsoUTC,
    },
  }));

  const handleApplyPreset = (name: string) => {
    if (name === 'lahore-default') {
      setLat(31.45037392501653);
      setLng(74.34174281647009);
      setDistanceM(7637);
    } else if (name === 'office-entrance') {
      setLat(31.45037392501653);
      setLng(74.34174281647009);
      setDistanceM(45);
    } else if (name === 'remote') {
      setLat(31.45037392501653);
      setLng(74.34174281647009);
      setDistanceM(14200);
    }
  };

  const handleSend = async (simulate = false) => {
    setIsSubmitting(true);
    setResponseLog('Sending request to backend...');
    try {
      const result = await onDispatch({
        workDate,
        clockInIsoUTC: previewIsoUTC,
        accessToken: manualToken.trim() || undefined,
        addJitter,
        simulate,
        lat: Number(lat),
        lng: Number(lng),
        distanceM: Number(distanceM),
        late,
        targetAccountId: targetAccountId === 'all' ? undefined : targetAccountId,
      });
      setResponseLog(JSON.stringify(result, null, 2));
    } catch (err: any) {
      setResponseLog(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white">Manual Dispatch &amp; Backfill Studio</h2>
        <p className="text-xs text-slate-400 mt-1">
          Craft custom clock-in attendance payloads for any specific date across all enabled accounts or a single selected account.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Controls (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Attendance Parameters
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Target Account(s)
            </label>
            <select
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">
                All Enabled Accounts ({config.accounts.filter((a) => a.enabled).length} accounts)
              </option>
              {config.accounts.map((acc, idx) => (
                <option key={acc.id} value={acc.id}>
                  Only {acc.label || `Account ${idx + 1}`} ({acc.kaiaEmail || 'No email set'})
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
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Primary conflict key (person_id, work_date)
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Clock-In Time in PKT (UTC+5)
              </label>
              <input
                type="time"
                step="1"
                value={pktTime}
                onChange={(e) => setPktTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Recommended: 08:00:08 (On-Time)
              </span>
            </div>
          </div>

          {/* Coordinates & Presets */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Geolocation &amp; Distance
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Presets:</span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('lahore-default')}
                  className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer transition-colors"
                >
                  Lahore (7637m)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('office-entrance')}
                  className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer transition-colors"
                >
                  Perimeter (45m)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => setLng(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Distance (meters)</label>
                <input
                  type="number"
                  value={distanceM}
                  onChange={(e) => setDistanceM(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Token Override & Late Status */}
          <div className="space-y-4 pt-2">
            {targetAccountId !== 'all' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Optional One-Time Override Bearer Token (JWT)
                </label>
                <input
                  type="password"
                  placeholder="Paste Supabase JWT access token or leave blank to use account credentials"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={late}
                  onChange={(e) => setLate(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span className="text-xs text-slate-300">Mark Attendance as Late</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addJitter}
                  onChange={(e) => setAddJitter(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span className="text-xs text-slate-300">Add Independent Jitter Per Account</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => handleSend(false)}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-all cursor-pointer"
            >
              {isSubmitting
                ? 'Upserting Record(s)...'
                : targetAccountId === 'all'
                ? `Upsert All Enabled (${targetAccounts.length})`
                : 'Upsert Selected Account'}
            </button>

            <button
              onClick={() => handleSend(true)}
              disabled={isSubmitting}
              className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:scale-[0.99] disabled:opacity-50 text-slate-200 font-semibold rounded-xl text-sm transition-all cursor-pointer border border-slate-700"
            >
              Dry Run
            </button>
          </div>
        </div>

        {/* Live Payload Preview & Response Console (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Pre-Flight Payload Preview ({payloadPreview.length})
              </h3>
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(payloadPreview, null, 2))}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
              >
                Copy JSON
              </button>
            </div>
            <pre className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-72">
              {JSON.stringify(payloadPreview, null, 2)}
            </pre>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Response Console
              </h3>
              {responseLog && (
                <button
                  onClick={() => setResponseLog('')}
                  className="text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            {responseLog ? (
              <pre className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                {responseLog}
              </pre>
            ) : (
              <div className="text-center py-8 text-xs text-slate-400">
                Click &quot;Upsert&quot; or &quot;Dry Run&quot; to inspect the server response.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
