/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Navbar, TabId } from './components/Navbar.tsx';
import { ClockBanner } from './components/ClockBanner.tsx';
import { DashboardTab } from './components/DashboardTab.tsx';
import { KaiaPortalTab } from './components/KaiaPortalTab.tsx';
import { BatchesTab } from './components/BatchesTab.tsx';
import { LateAbsentTab } from './components/LateAbsentTab.tsx';
import { ManualDispatchTab } from './components/ManualDispatchTab.tsx';
import { AttendanceTableTab } from './components/AttendanceTableTab.tsx';
import { CronAutomatorTab } from './components/CronAutomatorTab.tsx';
import { SettingsTab } from './components/SettingsTab.tsx';
import { UpdatesTab } from './components/UpdatesTab.tsx';
import { LogModal } from './components/LogModal.tsx';
import { AppConfig, CronStatus, ExecutionLog } from './types/index.ts';
import { getPKTDate, loadStoredConfig, pktToUtcIso, saveStoredConfig } from './utils/time.ts';
import { safeParseJson } from './utils/safeJson.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('portal');
  const [config, setConfig] = useState<AppConfig>(loadStoredConfig);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [isClockingIn, setIsClockingIn] = useState(false);
  const [inspectedLog, setInspectedLog] = useState<ExecutionLog | null>(null);
  const [globalNotice, setGlobalNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync accounts to backend server so automated cron jobs have the latest list
  const syncAccountsToServer = async (accounts = config.accounts) => {
    try {
      await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
      });
    } catch (e) {
      console.error('Failed to sync accounts to server', e);
    }
  };

  // Hydrate server-saved accounts and merge credentials so local state never wipes server passwords
  const hydrateOrSyncAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await safeParseJson(res);
        if (Array.isArray(data.accounts) && data.accounts.length > 0) {
          const mergedAccounts = data.accounts.map((srvAcc: any, idx: number) => {
            const loc =
              config.accounts.find((a) => a.id === srvAcc.id) ||
              config.accounts.find((a) => a.personId && a.personId === srvAcc.personId) ||
              config.accounts[idx];

            const locLabel = (loc?.label || '').trim();
            const isLocGeneric = !locLabel || /^Account\s+\d+/i.test(locLabel);

            return {
              ...srvAcc,
              label: !isLocGeneric ? locLabel : srvAcc.label || locLabel || `Account ${idx + 1}`,
              personId: loc?.personId?.trim() || srvAcc.personId || '',
              kaiaEmail: loc?.kaiaEmail?.trim() || srvAcc.kaiaEmail || '',
              kaiaPassword: loc?.kaiaPassword || srvAcc.kaiaPassword || '',
              manualToken: loc?.manualToken?.trim() || srvAcc.manualToken || '',
              enabled: loc?.enabled ?? srvAcc.enabled ?? true,
            };
          });
          const mergedConfig: AppConfig = { ...config, accounts: mergedAccounts };
          setConfig(mergedConfig);
          saveStoredConfig(mergedConfig);
          await syncAccountsToServer(mergedAccounts);
          return;
        }
      }
      await syncAccountsToServer(config.accounts);
    } catch (e) {
      console.error('Account hydration error', e);
    }
  };

  // Load logs and cron status
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await safeParseJson(res);
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Failed to load logs', e);
    }
  };

  const fetchCronStatus = async () => {
    try {
      const res = await fetch('/api/cron-config');
      if (res.ok) {
        const data = await safeParseJson(res);
        setCronStatus(data);
      }
    } catch (e) {
      console.error('Failed to load cron status', e);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchCronStatus();
    void hydrateOrSyncAccounts();
    const interval = setInterval(() => {
      fetchLogs();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveConfig = (updated: AppConfig) => {
    setConfig(updated);
    saveStoredConfig(updated);
    void syncAccountsToServer(updated.accounts);
  };

  const handleToggleScheduler = async () => {
    try {
      const res = await fetch('/api/cron-toggle', { method: 'POST' });
      if (res.ok) {
        const data = await safeParseJson(res);
        if (cronStatus) {
          setCronStatus({ ...cronStatus, schedulerActive: data.schedulerActive });
        }
      }
    } catch (e) {
      console.error('Failed to toggle scheduler', e);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/logs/clear', { method: 'POST' });
      setLogs([]);
    } catch (e) {
      console.error('Failed to clear logs', e);
    }
  };

  // Push attendance core handler (supports batch multi-account or single target account)
  const handlePushAttendance = async ({
    workDate,
    pktTime,
    clockInIsoUTC,
    addJitter = true,
    simulate = false,
    late = false,
    lat,
    lng,
    distanceM,
    accessToken,
    targetAccountId,
  }: {
    workDate?: string;
    pktTime?: string;
    clockInIsoUTC?: string;
    addJitter?: boolean;
    simulate?: boolean;
    late?: boolean;
    lat?: number;
    lng?: number;
    distanceM?: number;
    accessToken?: string;
    targetAccountId?: string;
  }) => {
    setIsClockingIn(true);
    try {
      const todayPkt = getPKTDate();
      const targetWorkDate = workDate || todayPkt.dateString;

      let resolvedUtc = clockInIsoUTC;
      if (!resolvedUtc && pktTime) {
        resolvedUtc = pktToUtcIso(targetWorkDate, pktTime);
      }

      const targetAccounts = targetAccountId
        ? config.accounts.filter((a) => a.id === targetAccountId)
        : config.accounts.filter((a) => a.enabled);

      // If a one-time accessToken override was supplied for a single account
      const accountsPayload = targetAccounts.map((acc) => ({
        ...acc,
        manualToken: accessToken || acc.manualToken,
        lat: lat ?? acc.lat ?? config.lat,
        lng: lng ?? acc.lng ?? config.lng,
        distanceM: distanceM ?? acc.distanceM ?? config.distanceM,
      }));

      const res = await fetch('/api/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDate: targetWorkDate,
          clockInIsoUTC: resolvedUtc,
          addJitter,
          simulate,
          late,
          supabaseUrl: config.supabaseUrl,
          supabaseAnonKey: config.supabaseAnonKey,
          accounts: accountsPayload,
          persistAccounts: !targetAccountId,
          lat: lat ?? config.lat,
          lng: lng ?? config.lng,
          distanceM: distanceM ?? config.distanceM,
        }),
      });

      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await fetchLogs();
      return data;
    } finally {
      setIsClockingIn(false);
    }
  };

  // Quick clock in from header button (clocks in all enabled accounts)
  const handleQuickClockIn = async () => {
    setGlobalNotice(null);
    try {
      const today = getPKTDate();
      const res = await handlePushAttendance({
        workDate: today.dateString,
        pktTime: '08:00:08',
        addJitter: true,
        simulate: false,
        late: false,
      });
      setGlobalNotice({
        type: 'success',
        text: `Clocked in ${res.successCount ?? 1} of ${res.totalAccounts ?? 1} enabled account(s) for ${today.dateString}!`,
      });
    } catch (err: any) {
      setGlobalNotice({
        type: 'error',
        text: `Clock-in failed: ${err.message}`,
      });
    }
  };

  const enabledAccountsCount = config.accounts.filter((a) => a.enabled).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 3-Zone Navigation Header */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onQuickClockIn={handleQuickClockIn}
        isClockingIn={isClockingIn}
        enabledAccountsCount={enabledAccountsCount}
      />

      {/* Live Precision Ticking Clocks & Timezone Strip */}
      <ClockBanner
        schedulerActive={cronStatus?.schedulerActive ?? true}
        onToggleScheduler={handleToggleScheduler}
      />

      {/* Global Quick-Action Toast */}
      {globalNotice && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-4 ${
              globalNotice.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
            }`}
          >
            <span>{globalNotice.text}</span>
            <button
              onClick={() => setGlobalNotice(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <DashboardTab
            config={config}
            logs={logs}
            isClockingIn={isClockingIn}
            onPushAttendance={handlePushAttendance}
            onInspectLog={setInspectedLog}
            onClearLogs={handleClearLogs}
            onRefreshLogs={fetchLogs}
            onOpenSettings={() => setActiveTab('settings')}
            onOpenLateAbsent={() => setActiveTab('late-absent')}
            onOpenBatches={() => setActiveTab('batches')}
            onOpenPortalStudio={() => setActiveTab('portal')}
          />
        )}

        {activeTab === 'portal' && <KaiaPortalTab config={config} />}

        {activeTab === 'batches' && (
          <BatchesTab
            config={config}
            onOpenPortalStudio={() => setActiveTab('portal')}
          />
        )}

        {activeTab === 'late-absent' && (
          <LateAbsentTab
            config={config}
            onRefreshLogs={fetchLogs}
          />
        )}

        {activeTab === 'manual' && (
          <ManualDispatchTab
            config={config}
            onDispatch={handlePushAttendance}
          />
        )}

        {activeTab === 'history' && (
          <AttendanceTableTab
            config={config}
            onOpenLateAbsent={() => setActiveTab('late-absent')}
          />
        )}

        {activeTab === 'cron' && (
          <CronAutomatorTab
            config={config}
            cronStatus={cronStatus}
            onToggleScheduler={handleToggleScheduler}
            onRefreshCronStatus={() => {
              fetchCronStatus();
              fetchLogs();
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            config={config}
            onSaveConfig={handleSaveConfig}
          />
        )}

        {activeTab === 'updates' && <UpdatesTab />}
      </main>

      {/* Telemetry Log Modal */}
      <LogModal log={inspectedLog} onClose={() => setInspectedLog(null)} />

      {/* Quiet, Clean Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>KAIA Attendance Automator</span>
            <span aria-hidden="true">·</span>
            <span>{enabledAccountsCount} Enabled Account(s)</span>
            <span aria-hidden="true">·</span>
            <span>Target: 08:00 AM PKT</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-400">0 3 * * 1-6</span>
          </div>
          <div>
            <span>PostgREST conflict resolution: </span>
            <code className="text-slate-300 font-mono">person_id, work_date</code>
          </div>
        </div>
      </footer>
    </div>
  );
}
