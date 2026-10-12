/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Navbar, TabId } from './components/Navbar.tsx';
import { ClockBanner } from './components/ClockBanner.tsx';
import { DashboardTab } from './components/DashboardTab.tsx';
import { ManualDispatchTab } from './components/ManualDispatchTab.tsx';
import { AttendanceTableTab } from './components/AttendanceTableTab.tsx';
import { CronAutomatorTab } from './components/CronAutomatorTab.tsx';
import { SettingsTab } from './components/SettingsTab.tsx';
import { UpdatesTab } from './components/UpdatesTab.tsx';
import { LogModal } from './components/LogModal.tsx';
import { AppConfig, CronStatus, ExecutionLog } from './types/index.ts';
import { getPKTDate, loadStoredConfig, pktToUtcIso, saveStoredConfig } from './utils/time.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [config, setConfig] = useState<AppConfig>(loadStoredConfig);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [isClockingIn, setIsClockingIn] = useState(false);
  const [inspectedLog, setInspectedLog] = useState<ExecutionLog | null>(null);

  // Load logs and cron status
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
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
        const data = await res.json();
        setCronStatus(data);
      }
    } catch (e) {
      console.error('Failed to load cron status', e);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchCronStatus();
    const interval = setInterval(() => {
      fetchLogs();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveConfig = (updated: AppConfig) => {
    setConfig(updated);
    saveStoredConfig(updated);
  };

  const handleToggleScheduler = async () => {
    try {
      const res = await fetch('/api/cron-toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
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

  // Push attendance core handler
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
  }) => {
    setIsClockingIn(true);
    try {
      const todayPkt = getPKTDate();
      const targetWorkDate = workDate || todayPkt.dateString;

      let resolvedUtc = clockInIsoUTC;
      if (!resolvedUtc && pktTime) {
        resolvedUtc = pktToUtcIso(targetWorkDate, pktTime);
      }

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
          personId: config.personId,
          email: config.kaiaEmail || undefined,
          password: config.kaiaPassword || undefined,
          accessToken: accessToken || config.manualToken || undefined,
          lat: lat ?? config.lat,
          lng: lng ?? config.lng,
          distanceM: distanceM ?? config.distanceM,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await fetchLogs();
      return data;
    } finally {
      setIsClockingIn(false);
    }
  };

  // Quick clock in from header button
  const handleQuickClockIn = async () => {
    try {
      const today = getPKTDate();
      await handlePushAttendance({
        workDate: today.dateString,
        pktTime: '08:00:08',
        addJitter: true,
        simulate: false,
        late: false,
      });
    } catch (err: any) {
      alert(`Clock-in failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 3-Zone Navigation Header */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onQuickClockIn={handleQuickClockIn}
        isClockingIn={isClockingIn}
      />

      {/* Live Precision Ticking Clocks & Timezone Strip */}
      <ClockBanner
        schedulerActive={cronStatus?.schedulerActive ?? true}
        onToggleScheduler={handleToggleScheduler}
      />

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
          />
        )}

        {activeTab === 'manual' && (
          <ManualDispatchTab
            config={config}
            onDispatch={handlePushAttendance}
          />
        )}

        {activeTab === 'history' && (
          <AttendanceTableTab config={config} />
        )}

        {activeTab === 'cron' && (
          <CronAutomatorTab
            config={config}
            cronStatus={cronStatus}
            onToggleScheduler={handleToggleScheduler}
            onRefreshCronStatus={fetchCronStatus}
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
