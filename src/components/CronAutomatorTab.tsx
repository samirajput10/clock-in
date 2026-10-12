import { useState } from 'react';
import { AppConfig, CronStatus } from '../types/index.ts';
import { safeParseJson } from '../utils/safeJson.ts';

interface CronAutomatorTabProps {
  config: AppConfig;
  cronStatus: CronStatus | null;
  onToggleScheduler: () => void;
  onRefreshCronStatus: () => void;
}

export function CronAutomatorTab({
  config,
  cronStatus,
  onToggleScheduler,
  onRefreshCronStatus,
}: CronAutomatorTabProps) {
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<any>(null);
  const [activeSnippetTab, setActiveSnippetTab] = useState<'vercel' | 'github' | 'curl'>('vercel');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const testWebhookEndpoint = async () => {
    setTestingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await fetch(`/api/clock-in?secret=${encodeURIComponent(config.cronSecret)}`);
      const data = await safeParseJson(res);
      setWebhookResult(data);
      onRefreshCronStatus();
    } catch (err: any) {
      setWebhookResult({ error: err.message });
    } finally {
      setTestingWebhook(false);
    }
  };

  const vercelJsonSnippet = `{
  "crons": [
    {
      "path": "/api/clock-in",
      "schedule": "0 3 * * 1-6"
    }
  ]
}`;

  const githubActionsSnippet = `name: KAIA Daily Morning Clock-In

on:
  schedule:
    # 03:00 UTC = 08:00 AM Pakistan Standard Time (PKT)
    # 1-6 = Monday to Saturday (Sundays excluded)
    - cron: '0 3 * * 1-6'
  workflow_dispatch: # Allows manual trigger from GitHub UI

jobs:
  clock-in:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger KAIA Clock-In
        run: |
          curl -s -f -X GET "\\\${{ secrets.APP_URL }}/api/clock-in" \\
            -H "Authorization: Bearer \\\${{ secrets.CRON_SECRET }}" \\
            -H "Content-Type: application/json"
`;

  const curlSnippet = `# Linux / macOS crontab line (crontab -e)
0 3 * * 1-6 curl -s "https://your-domain.com/api/clock-in?secret=${config.cronSecret || 'my_super_secret_key_123'}" > /tmp/kaia_cron.log 2>&1`;

  const currentSnippet =
    activeSnippetTab === 'vercel'
      ? vercelJsonSnippet
      : activeSnippetTab === 'github'
      ? githubActionsSnippet
      : curlSnippet;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white">Cron Scheduling & Automation Hub</h2>
        <p className="text-xs text-slate-400 mt-1">
          Automate daily morning attendance at 08:00:00 AM PKT (03:00 UTC) with built-in server timers, Vercel Crons, or GitHub Actions.
        </p>
      </div>

      {/* Main Status & Schedule Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-400">
              Internal Server Scheduler
            </h3>
            <button
              onClick={onToggleScheduler}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                cronStatus?.schedulerActive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              {cronStatus?.schedulerActive ? 'Scheduler Active (Enabled)' : 'Scheduler Paused (Disabled)'}
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            The server includes an active background interval loop. When active, it automatically triggers attendance on Monday through Saturday between 08:00:00 AM and 08:00:24 AM PKT with randomized human jitter.
          </p>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Cron Schedule:</span>
              <span className="font-mono text-indigo-400 font-semibold">0 3 * * 1-6</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">PKT Workday Timing:</span>
              <span className="font-mono text-white">08:00 AM (Monday to Saturday)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Sunday Rule:</span>
              <span className="text-emerald-400 font-medium">Automatically Skipped</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">Human Jitter Range:</span>
              <span className="font-mono text-slate-200">+2,000ms to +24,000ms</span>
            </div>
          </div>
        </div>

        {/* Webhook Endpoint Tester */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-400">
              External Webhook Trigger
            </h3>
            <span className="text-xs font-mono text-slate-400">GET /api/clock-in</span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            External schedulers (like Vercel Cron or GitHub Actions) trigger this URL daily. If today is Sunday, the endpoint safely skips attendance.
          </p>

          <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg font-mono text-xs text-slate-300 break-all">
            GET /api/clock-in?secret={config.cronSecret || 'my_super_secret_key_123'}
          </div>

          <button
            onClick={testWebhookEndpoint}
            disabled={testingWebhook}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-colors border border-slate-700 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {testingWebhook ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Triggering GET /api/clock-in...</span>
              </>
            ) : (
              <span>Simulate External Webhook Trigger Now</span>
            )}
          </button>

          {webhookResult && (
            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-indigo-300 overflow-x-auto max-h-40">
              {JSON.stringify(webhookResult, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Deployment Templates / Export Snippets */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Deployment Snippets & Configurations</h3>
            <p className="text-xs text-slate-400">
              Copy-ready configurations to schedule attendance on your cloud provider of choice
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveSnippetTab('vercel')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeSnippetTab === 'vercel'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                vercel.json
              </button>
              <button
                onClick={() => setActiveSnippetTab('github')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeSnippetTab === 'github'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                GitHub Actions
              </button>
              <button
                onClick={() => setActiveSnippetTab('curl')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeSnippetTab === 'curl'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Linux Crontab
              </button>
            </div>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              {copiedSnippet ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-300 overflow-x-auto max-h-72">
          {currentSnippet}
        </pre>
      </div>
    </div>
  );
}
