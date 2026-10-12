import { useState } from 'react';
import { AppConfig } from '../types/index.ts';
import { DEFAULT_CONFIG } from '../utils/time.ts';
import { safeParseJson } from '../utils/safeJson.ts';

interface SettingsTabProps {
  config: AppConfig;
  onSaveConfig: (updated: AppConfig) => void;
}

export function SettingsTab({ config, onSaveConfig }: SettingsTabProps) {
  const [form, setForm] = useState<AppConfig>({ ...config });
  const [showPassword, setShowPassword] = useState(false);
  const [testingAuth, setTestingAuth] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleTestAuth = async () => {
    setTestingAuth(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: form.supabaseUrl,
          supabaseAnonKey: form.supabaseAnonKey,
          email: form.kaiaEmail,
          password: form.kaiaPassword,
          accessToken: form.manualToken,
        }),
      });
      const data = await safeParseJson(res);
      setTestResult({ status: res.status, ok: res.ok, ...data });
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTestingAuth(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(form);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleReset = () => {
    setForm({ ...DEFAULT_CONFIG });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white">System Configuration & Credentials</h2>
        <p className="text-xs text-slate-400 mt-1">
          Manage your KAIA credentials, Supabase connection details, and spoofed geolocation defaults.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supabase Core */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-400">
            Supabase Project Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Supabase URL
                </label>
                {form.supabaseUrl !== DEFAULT_CONFIG.supabaseUrl && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, supabaseUrl: DEFAULT_CONFIG.supabaseUrl })}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
              <input
                type="text"
                value={form.supabaseUrl}
                onChange={(e) => setForm({ ...form, supabaseUrl: e.target.value })}
                className={`w-full bg-slate-950 border ${
                  form.supabaseUrl.includes('netlify')
                    ? 'border-amber-500 text-amber-200'
                    : 'border-slate-700 text-white'
                } rounded-lg px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:outline-none`}
              />
              {form.supabaseUrl.includes('netlify') && (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[11px] leading-relaxed">
                  <div className="font-semibold mb-1 flex items-center justify-between">
                    <span>⚠️ Netlify Frontend URL Detected</span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, supabaseUrl: DEFAULT_CONFIG.supabaseUrl })}
                      className="text-white bg-amber-600 hover:bg-amber-500 px-2 py-0.5 rounded text-[10px] cursor-pointer"
                    >
                      Use Official Supabase URL
                    </button>
                  </div>
                  Netlify hosts the frontend web application, which returns an HTML 404 page for backend auth requests. The Supabase URL must point to your Supabase project: <code className="font-mono text-white">https://llvsmockvufgbqpeepbm.supabase.co</code>.
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                KAIA Person ID (Foreign Key)
              </label>
              <input
                type="text"
                value={form.personId}
                onChange={(e) => setForm({ ...form, personId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Supabase Public Anon Key
            </label>
            <textarea
              rows={2}
              value={form.supabaseAnonKey}
              onChange={(e) => setForm({ ...form, supabaseAnonKey: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* KAIA User Account & Token */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-400">
              KAIA Account Authentication
            </h3>
            <button
              type="button"
              onClick={handleTestAuth}
              disabled={testingAuth}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 text-white rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            >
              {testingAuth ? 'Testing Auth...' : 'Test Login & Token'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                KAIA Login Email
              </label>
              <input
                type="email"
                placeholder="your_email@example.com"
                value={form.kaiaEmail}
                onChange={(e) => setForm({ ...form, kaiaEmail: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  KAIA Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={form.kaiaPassword}
                onChange={(e) => setForm({ ...form, kaiaPassword: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Override Bearer Token (Optional JWT Override)
            </label>
            <input
              type="password"
              placeholder="eyJhbGciOiJFUzI1NiIs..."
              value={form.manualToken}
              onChange={(e) => setForm({ ...form, manualToken: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              If you don&apos;t want to enter your password, you can copy the active JWT token from your browser network request and paste it here.
            </p>
          </div>

          {/* Test auth result */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-mono ${
                testResult.ok
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
            >
              <div className="font-sans font-semibold mb-1">
                {testResult.ok ? 'Authentication Verified:' : 'Authentication Failed:'}
              </div>
              <pre className="overflow-x-auto max-h-36">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Geolocation & Protection Secret */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-400">
            Geolocation & Security
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Default Latitude
              </label>
              <input
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Default Longitude
              </label>
              <input
                type="number"
                step="any"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Distance (meters)
              </label>
              <input
                type="number"
                value={form.distanceM}
                onChange={(e) => setForm({ ...form, distanceM: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              CRON Secret (Endpoint Protection)
            </label>
            <input
              type="text"
              value={form.cronSecret}
              onChange={(e) => setForm({ ...form, cronSecret: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer transition-colors"
          >
            Reset to Defaults
          </button>

          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="text-xs text-emerald-400 font-semibold">
                Saved to LocalStorage!
              </span>
            )}
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-sm cursor-pointer transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
