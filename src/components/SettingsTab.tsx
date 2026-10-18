import { useEffect, useState } from 'react';
import { Plus, Trash2, CheckCircle2, CircleAlert, ChevronDown, ChevronUp, Copy, UserCheck } from 'lucide-react';
import { AppConfig, KaiaAccount } from '../types/index.ts';
import { createEmptyAccount, DEFAULT_CONFIG } from '../utils/time.ts';
import { safeParseJson } from '../utils/safeJson.ts';

interface SettingsTabProps {
  config: AppConfig;
  onSaveConfig: (updated: AppConfig) => void;
}

export function SettingsTab({ config, onSaveConfig }: SettingsTabProps) {
  const [form, setForm] = useState<AppConfig>({ ...config });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({});
  const [testingAccountIds, setTestingAccountIds] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedEnvJson, setCopiedEnvJson] = useState(false);

  useEffect(() => {
    setForm({ ...config });
  }, [config]);

  const updateAccount = (accountId: string, patch: Partial<KaiaAccount>) => {
    setForm((prev) => ({
      ...prev,
      accounts: prev.accounts.map((acc) => (acc.id === accountId ? { ...acc, ...patch } : acc)),
    }));
  };

  const handleAddAccount = () => {
    const nextIndex = form.accounts.length + 1;
    const newAcc = createEmptyAccount(nextIndex, {
      lat: form.lat,
      lng: form.lng,
      distanceM: form.distanceM,
    });
    const updatedAccounts = [...form.accounts, newAcc];
    const updatedForm = { ...form, accounts: updatedAccounts };
    setForm(updatedForm);
    onSaveConfig(updatedForm);
  };

  const handleRemoveAccount = (accountId: string) => {
    if (form.accounts.length <= 1) return;
    const updatedAccounts = form.accounts.filter((acc) => acc.id !== accountId);
    const updatedForm = { ...form, accounts: updatedAccounts };
    setForm(updatedForm);
    onSaveConfig(updatedForm);
  };

  const handleTestAccountAuth = async (account: KaiaAccount) => {
    setTestingAccountIds((prev) => ({ ...prev, [account.id]: true }));
    setTestResults((prev) => ({ ...prev, [account.id]: null }));

    try {
      const res = await fetch('/api/test-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: form.supabaseUrl,
          supabaseAnonKey: form.supabaseAnonKey,
          email: account.kaiaEmail,
          password: account.kaiaPassword,
          accessToken: account.manualToken,
          personId: account.personId,
        }),
      });
      const data = await safeParseJson(res);

      // If Supabase returned a detectedPersonId and the account didn't have one yet, auto-fill it!
      if (res.ok && data.detectedPersonId && !account.personId.trim()) {
        const updatedAccounts = form.accounts.map((acc) =>
          acc.id === account.id ? { ...acc, personId: data.detectedPersonId } : acc
        );
        const updatedForm = { ...form, accounts: updatedAccounts };
        setForm(updatedForm);
        onSaveConfig(updatedForm);
      }

      setTestResults((prev) => ({
        ...prev,
        [account.id]: { status: res.status, ok: res.ok, ...data },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [account.id]: { ok: false, error: err.message },
      }));
    } finally {
      setTestingAccountIds((prev) => ({ ...prev, [account.id]: false }));
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
    onSaveConfig({ ...DEFAULT_CONFIG });
  };

  const handleCopyEnvJson = () => {
    const minimal = form.accounts.map((a) => ({
      label: a.label,
      enabled: a.enabled,
      personId: a.personId,
      email: a.kaiaEmail,
      password: a.kaiaPassword,
      lat: a.lat,
      lng: a.lng,
      distanceM: a.distanceM,
    }));
    navigator.clipboard.writeText(`KAIA_ACCOUNTS_JSON='${JSON.stringify(minimal)}'`);
    setCopiedEnvJson(true);
    setTimeout(() => setCopiedEnvJson(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Multi-Account Configuration & Credentials</h2>
          <p className="text-xs text-slate-400 mt-1">
            Add as many KAIA accounts as you need. Just enter Email &amp; Password for each account—Person ID is auto-detected on login.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddAccount}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-xs font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Plus size={15} />
          <span>Add Another Account</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Multi-Account List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Configured KAIA Accounts ({form.accounts.length})
            </h3>
            <span className="text-xs text-slate-400">
              {form.accounts.filter((a) => a.enabled).length} enabled for automated &amp; batch clock-in
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {form.accounts.map((account, index) => {
              const isTesting = !!testingAccountIds[account.id];
              const testRes = testResults[account.id];
              const showPass = !!showPasswords[account.id];
              const isAdvancedOpen = !!expandedAdvanced[account.id];

              return (
                <div
                  key={account.id}
                  className={`bg-slate-900 border rounded-2xl p-6 transition-colors ${
                    account.enabled ? 'border-slate-800' : 'border-slate-800/50 opacity-75'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800 mb-5">
                    <div className="flex items-center gap-3 flex-1 min-w-[220px]">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-400 font-mono shrink-0">
                        #{index + 1}
                      </div>
                      <input
                        type="text"
                        value={account.label}
                        onChange={(e) => updateAccount(account.id, { label: e.target.value })}
                        placeholder={`Account ${index + 1}`}
                        className="bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-sm font-bold text-white focus:outline-none w-full max-w-xs"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                        <input
                          type="checkbox"
                          checked={account.enabled}
                          onChange={(e) => updateAccount(account.id, { enabled: e.target.checked })}
                          className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                        />
                        <span>{account.enabled ? 'Enabled' : 'Disabled'}</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleTestAccountAuth(account)}
                        disabled={isTesting}
                        className="px-3 py-1.5 text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <UserCheck size={14} />
                        <span>{isTesting ? 'Verifying...' : 'Test Login & Auto-Detect ID'}</span>
                      </button>

                      {form.accounts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAccount(account.id)}
                          title="Remove this account"
                          className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-950 hover:bg-rose-950/30 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Primary Credentials: Email & Password */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        KAIA Login Email
                      </label>
                      <input
                        type="email"
                        placeholder={`user${index + 1}@example.com`}
                        value={account.kaiaEmail}
                        onChange={(e) => updateAccount(account.id, { kaiaEmail: e.target.value })}
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
                          onClick={() =>
                            setShowPasswords((prev) => ({ ...prev, [account.id]: !prev[account.id] }))
                          }
                          className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                        >
                          {showPass ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <input
                        type={showPass ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={account.kaiaPassword}
                        onChange={(e) => updateAccount(account.id, { kaiaPassword: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Collapsible Advanced / Optional Per-Account Overrides */}
                  <div className="mt-4 pt-3 border-t border-slate-800/70">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAdvanced((prev) => ({
                          ...prev,
                          [account.id]: !prev[account.id],
                        }))
                      }
                      className="flex items-center justify-between w-full text-left text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span>Advanced Account Options (Profile, JWT Override, Custom Coordinates)</span>
                        {(testRes?.detectedPersonName || account.label) && (
                          <span className="font-semibold text-[11px] text-indigo-400">
                            · Profile: {testRes?.detectedPersonName || account.label}
                          </span>
                        )}
                      </div>
                      {isAdvancedOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>

                    {isAdvancedOpen && (
                      <div className="mt-4 space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              KAIA Person ID <span className="text-slate-500">(Auto-detected if blank)</span>
                            </label>
                            <input
                              type="text"
                              placeholder="Auto-detected from login or enter UUID"
                              value={account.personId}
                              onChange={(e) => updateAccount(account.id, { personId: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Manual Bearer Token <span className="text-slate-500">(Optional JWT Override)</span>
                            </label>
                            <input
                              type="password"
                              placeholder="eyJhbGciOiJFUzI1NiIs..."
                              value={account.manualToken}
                              onChange={(e) => updateAccount(account.id, { manualToken: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Latitude</label>
                            <input
                              type="number"
                              step="any"
                              value={account.lat}
                              onChange={(e) => updateAccount(account.id, { lat: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Longitude</label>
                            <input
                              type="number"
                              step="any"
                              value={account.lng}
                              onChange={(e) => updateAccount(account.id, { lng: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Distance (meters)</label>
                            <input
                              type="number"
                              value={account.distanceM}
                              onChange={(e) => updateAccount(account.id, { distanceM: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Per-Account Auth Test Result */}
                  {testRes && (
                    <div
                      className={`mt-4 p-3 rounded-xl border text-xs font-mono ${
                        testRes.ok
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                          : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      <div className="font-sans font-semibold mb-1 flex items-center gap-1.5">
                        {testRes.ok ? (
                          <>
                            <CheckCircle2 size={14} />
                            <span>
                              Authentication Verified for {testRes.detectedPersonName || account.label}
                              {testRes.userEmail ? ` (${testRes.userEmail})` : ''}
                            </span>
                          </>
                        ) : (
                          <>
                            <CircleAlert size={14} />
                            <span>Authentication Failed for {account.label}</span>
                          </>
                        )}
                      </div>
                      <pre className="overflow-x-auto max-h-32 text-[11px]">
                        {JSON.stringify(testRes, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Add Account Button */}
          <button
            type="button"
            onClick={handleAddAccount}
            className="w-full py-3 border border-dashed border-slate-700 hover:border-indigo-500/60 bg-slate-900/40 hover:bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus size={15} />
            <span>Add Another KAIA Account</span>
          </button>
        </div>

        {/* Shared Supabase Project & Security Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Global Supabase &amp; Cron Settings
            </h3>
            <button
              type="button"
              onClick={handleCopyEnvJson}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Copy size={13} />
              <span>{copiedEnvJson ? 'Copied KAIA_ACCOUNTS_JSON!' : 'Copy KAIA_ACCOUNTS_JSON for .env'}</span>
            </button>
          </div>

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
                    <span>Netlify Frontend URL Detected</span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, supabaseUrl: DEFAULT_CONFIG.supabaseUrl })}
                      className="text-white bg-amber-600 hover:bg-amber-500 px-2 py-0.5 rounded text-[10px] cursor-pointer"
                    >
                      Use Official Supabase URL
                    </button>
                  </div>
                  The Supabase URL must point to your Supabase project: <code className="font-mono text-white">https://llvsmockvufgbqpeepbm.supabase.co</code>.
                </div>
              )}
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

        {/* Save / Reset Buttons */}
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
                Saved &amp; Synced with Server!
              </span>
            )}
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-sm cursor-pointer transition-colors"
            >
              Save All Accounts &amp; Configuration
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
