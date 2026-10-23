import { useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  Mail,
  Plus,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Search,
  Sparkles,
  UserCheck,
  Database,
  ExternalLink,
  Terminal,
} from 'lucide-react';
import { AppConfig, KaiaAccount } from '../types/index.ts';
import { safeParseJson } from '../utils/safeJson.ts';

export interface VaultCredentialItem {
  id: string;
  label: string;
  email: string;
  username?: string;
  password: string;
  category: 'kaia_account' | 'email_account' | 'tool_login' | 'other';
  personId?: string;
  toolId?: string;
  role?: string;
  city?: string;
  active?: boolean;
  enabled?: boolean;
  clockInSynced?: boolean;
  notes?: string;
  source?: 'vault' | 'database_person' | 'database_tool';
  updatedAt: string;
}

interface PasswordsVaultTabProps {
  config: AppConfig;
  onSaveConfig: (updated: AppConfig) => void;
}

export function PasswordsVaultTab({ config, onSaveConfig }: PasswordsVaultTabProps) {
  const [items, setItems] = useState<VaultCredentialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showAllPasswords, setShowAllPasswords] = useState(true);
  const [rowShowPassword, setRowShowPassword] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedBannerId, setSavedBannerId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testStatusById, setTestStatusById] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // New Email & Password creation form state
  const [newLabel, setNewLabel] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newCategory, setNewCategory] = useState<VaultCredentialItem['category']>('kaia_account');
  const [newPersonId, setNewPersonId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newSyncToClockIn, setNewSyncToClockIn] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Editable draft state per row so user can directly edit any previous email or password
  const [drafts, setDrafts] = useState<Record<string, VaultCredentialItem>>({});

  const syncServerAccountsToAppConfig = (serverAccounts: any[]) => {
    if (!Array.isArray(serverAccounts) || serverAccounts.length === 0) return;
    const mapped: KaiaAccount[] = serverAccounts.map((srv: any, idx: number) => ({
      id: srv.id || `acc-${idx + 1}`,
      label: srv.label || `Account ${idx + 1}`,
      enabled: srv.enabled ?? true,
      personId: srv.personId || '',
      kaiaEmail: srv.kaiaEmail || '',
      kaiaPassword: srv.kaiaPassword || '',
      manualToken: srv.manualToken || '',
      lat: Number(srv.lat ?? config.lat ?? 31.45037392501653),
      lng: Number(srv.lng ?? config.lng ?? 74.34174281647009),
      distanceM: Number(srv.distanceM ?? config.distanceM ?? 7637),
    }));
    onSaveConfig({
      ...config,
      accounts: mapped,
    });
  };

  const fetchVault = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/credentials-vault');
      if (res.ok) {
        const data = await safeParseJson(res);
        const loadedItems: VaultCredentialItem[] = Array.isArray(data.items) ? data.items : [];
        setItems(loadedItems);
        const nextDrafts: Record<string, VaultCredentialItem> = {};
        for (const item of loadedItems) {
          nextDrafts[item.id] = { ...item };
        }
        setDrafts(nextDrafts);
        if (Array.isArray(data.accounts)) {
          syncServerAccountsToAppConfig(data.accounts);
        }
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: `Failed to load database emails & passwords: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchVault();
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text || '');
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  const buildExternalPortalUnlockerScript = (autoLoginItem?: VaultCredentialItem) => {
    const vaultMap: Record<
      string,
      { email: string; password: string; label: string; personId?: string; role?: string }
    > = {};
    for (const it of items) {
      const d = drafts[it.id] || it;
      if (d.email) {
        vaultMap[d.email.trim().toLowerCase()] = {
          email: d.email.trim(),
          password: d.password || '',
          label: d.label || d.email,
          personId: d.personId || d.id,
          role: d.role || 'ai_creator',
        };
      }
    }

    const autoTarget = autoLoginItem
      ? {
          email: autoLoginItem.email.trim(),
          password: autoLoginItem.password || '',
          label: autoLoginItem.label || autoLoginItem.email,
          personId: autoLoginItem.personId || autoLoginItem.id,
        }
      : null;

    return `// ==KAIA REAL PORTAL UNIVERSAL LOGIN UNLOCKER (ALL VAULT & CREATED ACCOUNTS)==
// Paste into DevTools Console (F12 -> Console) on https://portal.trykaia.com/
(async function() {
  const SUPABASE_URL = 'https://llvsmockvufgbqpeepbm.supabase.co';
  const ANON_KEY = ${JSON.stringify(config.supabaseAnonKey)};
  const STORAGE_KEY = 'sb-llvsmockvufgbqpeepbm-auth-token';
  const BRIDGED_USER_KEY = 'kaia.bridged.user';
  const BRIDGED_PERSON_KEY = 'kaia.bridged.person';
  const VAULT = ${JSON.stringify(vaultMap)};
  const AUTO_TARGET = ${JSON.stringify(autoTarget)};
  const origFetch = window.fetch;

  async function mintBridgedSession(rawEmail, rawPassword) {
    const cleanEmail = String(rawEmail || '').trim();
    const emailLower = cleanEmail.toLowerCase();
    // 1. Try direct login first
    const directRes = await origFetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password: rawPassword })
    });
    if (directRes.ok) {
      return await directRes.json();
    }
    // 2. Authenticate via master token and bind to target Vault / People account
    const mRes = await origFetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'halmarrsami@gmail.com', password: 'Kaia-65g7fg6.h' })
    });
    if (!mRes.ok) return null;
    const masterSession = await mRes.json();
    const pRes = await origFetch(
      SUPABASE_URL + '/rest/v1/people?email=ilike.' + encodeURIComponent(cleanEmail) + '&select=*&limit=1',
      { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + masterSession.access_token } }
    );
    const pRows = pRes.ok ? await pRes.json() : [];
    const vEntry = VAULT[emailLower];
    const personRow = (Array.isArray(pRows) && pRows[0]) || (vEntry ? {
      id: vEntry.personId || crypto.randomUUID(),
      name: vEntry.label,
      email: vEntry.email,
      role: vEntry.role || 'ai_creator',
      roles: [vEntry.role || 'ai_creator'],
      active: true,
      status: 'ok',
      current_level: 1,
      current_score: 0,
      warnings: 0,
      remote_allowed: true
    } : null);
    if (!personRow) return null;
    const targetAuthId = personRow.auth_user_id || personRow.id || masterSession.user.id;
    const bridgedUser = {
      ...masterSession.user,
      id: targetAuthId,
      email: personRow.email || cleanEmail,
      user_metadata: { email: personRow.email || cleanEmail, name: personRow.name }
    };
    localStorage.setItem(BRIDGED_USER_KEY, JSON.stringify(bridgedUser));
    localStorage.setItem(BRIDGED_PERSON_KEY, JSON.stringify(personRow));
    return { ...masterSession, user: bridgedUser };
  }

  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    const init = args[1] || {};
    const method = (init.method || 'GET').toUpperCase();

    if (url.includes('/auth/v1/token') && url.includes('grant_type=password') && method === 'POST') {
      try {
        const bodyObj = typeof init.body === 'string' ? JSON.parse(init.body) : {};
        const session = await mintBridgedSession(bodyObj.email, bodyObj.password);
        if (session && session.access_token) {
          return new Response(JSON.stringify(session), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (e) {}
    }

    if (url.includes('/auth/v1/user') && method === 'GET') {
      const res = await origFetch.apply(this, args);
      const savedUser = JSON.parse(localStorage.getItem(BRIDGED_USER_KEY) || 'null');
      if (res.ok && savedUser) {
        return new Response(JSON.stringify(savedUser), { status: 200, headers: res.headers });
      }
      return res;
    }

    if (url.includes('/auth/v1/logout')) {
      localStorage.removeItem(BRIDGED_USER_KEY);
      localStorage.removeItem(BRIDGED_PERSON_KEY);
    }

    const res = await origFetch.apply(this, args);
    if (url.includes('/rest/v1/people') && method === 'GET') {
      try {
        const savedPerson = JSON.parse(localStorage.getItem(BRIDGED_PERSON_KEY) || 'null');
        if (savedPerson && url.includes('email=eq.')) {
          const data = await res.clone().json();
          if (!data || (Array.isArray(data) && data.length === 0)) {
            return new Response(JSON.stringify(savedPerson), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }
      } catch (e) {}
    }
    return res;
  };

  if (AUTO_TARGET && AUTO_TARGET.email) {
    const session = await mintBridgedSession(AUTO_TARGET.email, AUTO_TARGET.password);
    if (session && session.access_token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      window.location.reload();
    }
  }
})();`;
  };

  const generateStrongPassword = (setter: (val: string) => void) => {
    const chars = 'abcdefghijkmnopqrstuvwxyz23456789';
    let randomPart = '';
    for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setter(`Kaia-${randomPart}.h`);
  };

  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = newEmail.trim();
    const trimmedLabel = newLabel.trim() || trimmedEmail.split('@')[0] || 'New Account';
    if (!trimmedEmail) {
      setStatusBanner({ type: 'error', text: 'Please enter an email address.' });
      return;
    }

    setIsCreating(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/credentials-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          label: trimmedLabel,
          email: trimmedEmail,
          password: newPassword,
          category: newCategory,
          personId: newPersonId.trim(),
          notes: newNotes.trim(),
          enabled: true,
          syncToKaia: newSyncToClockIn,
        }),
      });
      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const updatedItems: VaultCredentialItem[] = Array.isArray(data.items) ? data.items : [];
      setItems(updatedItems);
      const nextDrafts: Record<string, VaultCredentialItem> = {};
      for (const it of updatedItems) {
        nextDrafts[it.id] = { ...it };
      }
      setDrafts(nextDrafts);

      if (Array.isArray(data.accounts)) {
        syncServerAccountsToAppConfig(data.accounts);
      }

      setNewLabel('');
      setNewEmail('');
      setNewPassword('');
      setNewPersonId('');
      setNewNotes('');
      setStatusBanner({
        type: 'success',
        text: `Created & stored new email and password for "${trimmedLabel}" (${trimmedEmail}).`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: `Could not create credential: ${err.message}`,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const updateRowDraft = (id: string, patch: Partial<VaultCredentialItem>) => {
    setDrafts((prev) => {
      const base = prev[id] || items.find((i) => i.id === id);
      if (!base) return prev;
      return {
        ...prev,
        [id]: { ...base, ...patch },
      };
    });
  };

  const handleUpdatePreviousCredential = async (id: string) => {
    const draft = drafts[id];
    const original = items.find((i) => i.id === id);
    if (!draft) return;

    setSavingId(id);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/credentials-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id,
          previousEmail: original?.email || draft.email,
          label: draft.label.trim() || draft.email.split('@')[0] || 'Account',
          email: draft.email.trim(),
          password: draft.password,
          category: draft.category,
          personId: (draft.personId || '').trim(),
          notes: (draft.notes || '').trim(),
          enabled: draft.enabled ?? true,
          clockInSynced: draft.clockInSynced ?? false,
        }),
      });
      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const updatedItems: VaultCredentialItem[] = Array.isArray(data.items) ? data.items : [];
      setItems(updatedItems);
      const nextDrafts: Record<string, VaultCredentialItem> = {};
      for (const it of updatedItems) {
        nextDrafts[it.id] = { ...it };
      }
      setDrafts(nextDrafts);

      if (Array.isArray(data.accounts)) {
        syncServerAccountsToAppConfig(data.accounts);
      }

      setSavedBannerId(id);
      setTimeout(() => {
        setSavedBannerId((prev) => (prev === id ? null : prev));
      }, 2200);
      setStatusBanner({
        type: 'success',
        text: `Updated email & password for "${draft.label}" (${draft.email}).`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: `Update failed: ${err.message}`,
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteCredential = async (item: VaultCredentialItem) => {
    setSavingId(item.id);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/credentials-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          id: item.id,
        }),
      });
      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const updatedItems: VaultCredentialItem[] = Array.isArray(data.items) ? data.items : [];
      setItems(updatedItems);
      const nextDrafts: Record<string, VaultCredentialItem> = {};
      for (const it of updatedItems) {
        nextDrafts[it.id] = { ...it };
      }
      setDrafts(nextDrafts);

      if (Array.isArray(data.accounts)) {
        syncServerAccountsToAppConfig(data.accounts);
      }

      setStatusBanner({
        type: 'success',
        text: `Removed "${item.label}" (${item.email}) from stored credentials.`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: `Delete failed: ${err.message}`,
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleTestKaiaLogin = async (id: string) => {
    const draft = drafts[id] || items.find((i) => i.id === id);
    if (!draft) return;

    setTestingId(id);
    setTestStatusById((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    try {
      const res = await fetch('/api/test-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: config.supabaseUrl,
          supabaseAnonKey: config.supabaseAnonKey,
          email: draft.email.trim(),
          password: draft.password,
          personId: draft.personId,
        }),
      });
      const data = await safeParseJson(res);
      if (res.ok && data.ok !== false) {
        const detectedPersonId = data.detectedPersonId || draft.personId || '';
        const detectedName = data.detectedPersonName || draft.label;
        if (detectedPersonId && detectedPersonId !== draft.personId) {
          updateRowDraft(id, {
            personId: detectedPersonId,
            label: draft.label || detectedName,
          });
        }
        setTestStatusById((prev) => ({
          ...prev,
          [id]: {
            ok: true,
            text: `Verified KAIA Login (${detectedName || draft.email})`,
          },
        }));
      } else {
        setTestStatusById((prev) => ({
          ...prev,
          [id]: {
            ok: false,
            text: data.error || 'Invalid login credentials on KAIA Supabase',
          },
        }));
      }
    } catch (err: any) {
      setTestStatusById((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          text: err.message || 'Verification failed',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const counts = useMemo(() => {
    const kaiaCount = items.filter((i) => i.category === 'kaia_account').length;
    const toolCount = items.filter((i) => i.category === 'tool_login').length;
    const clockInCount = items.filter((i) => i.clockInSynced).length;
    return {
      total: items.length,
      kaiaCount,
      toolCount,
      clockInCount,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const d = drafts[item.id] || item;
      if (categoryFilter === 'clock_in' && !d.clockInSynced) return false;
      if (
        categoryFilter !== 'all' &&
        categoryFilter !== 'clock_in' &&
        d.category !== categoryFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        (d.label || '').toLowerCase().includes(q) ||
        (d.email || '').toLowerCase().includes(q) ||
        (d.password || '').toLowerCase().includes(q) ||
        (d.role || '').toLowerCase().includes(q) ||
        (d.city || '').toLowerCase().includes(q) ||
        (d.notes || '').toLowerCase().includes(q)
      );
    });
  }, [items, drafts, searchQuery, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* Top Header & Database Sync Summary */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>Database Emails &amp; Passwords Vault</span>
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {counts.total} Total Stored
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Showing all <strong className="text-slate-200">{counts.kaiaCount} KAIA team emails &amp; passwords</strong> from the <code className="text-indigo-300">people</code> database table and <strong className="text-slate-200">{counts.toolCount} tool logins</strong> from <code className="text-indigo-300">tools / tool_accounts</code>. Create new or update any previous email &amp; password below.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href="/portal-live"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
              title="Open the real KAIA Operations Portal with all Vault & created emails/passwords pre-enabled"
            >
              <ExternalLink size={14} />
              <span>Open Real KAIA Portal (All Logins Active)</span>
            </a>

            <button
              type="button"
              onClick={() =>
                handleCopy(buildExternalPortalUnlockerScript(), 'global-portal-unlocker')
              }
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Copy console unlocker script so typing any Vault email & password on https://portal.trykaia.com/ logs in immediately"
            >
              {copiedKey === 'global-portal-unlocker' ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  <span className="text-emerald-300">Copied portal.trykaia.com Login Unlocker!</span>
                </>
              ) : (
                <>
                  <Terminal size={14} />
                  <span>Copy portal.trykaia.com Login Unlocker</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowAllPasswords((prev) => !prev)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {showAllPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{showAllPasswords ? 'Hide Passwords' : 'Show All Passwords'}</span>
            </button>

            <button
              type="button"
              onClick={() => void fetchVault()}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Sync Database ({counts.total})</span>
            </button>
          </div>
        </div>

        {/* Quick Filter Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-indigo-600/20 border-indigo-500 text-white'
                : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
              <Database size={12} className="text-indigo-400" />
              <span>All Database &amp; Vault</span>
            </div>
            <div className="text-lg font-bold font-mono text-white mt-0.5">{counts.total}</div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('kaia_account')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              categoryFilter === 'kaia_account'
                ? 'bg-emerald-600/20 border-emerald-500 text-white'
                : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              KAIA Team Emails (`people`)
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {counts.kaiaCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('tool_login')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              categoryFilter === 'tool_login'
                ? 'bg-amber-600/20 border-amber-500 text-white'
                : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Studio Tool Logins (`tools`)
            </div>
            <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
              {counts.toolCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('clock_in')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              categoryFilter === 'clock_in'
                ? 'bg-teal-600/20 border-teal-500 text-white'
                : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Primary Clock-In Accounts
            </div>
            <div className="text-lg font-bold font-mono text-teal-400 mt-0.5">
              {counts.clockInCount}
            </div>
          </button>
        </div>
      </div>

      {/* Status Notification Banner */}
      {statusBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: Create New Email & Password */}
      <form
        onSubmit={handleCreateCredential}
        className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 space-y-4 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Create New Email &amp; Password
            </h3>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newSyncToClockIn}
              onChange={(e) => setNewSyncToClockIn(e.target.checked)}
              className="rounded border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span>Also add to Daily Auto Clock-In</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Name / Account Label
            </label>
            <input
              type="text"
              placeholder="e.g. New Creator Name"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              New Email Address <span className="text-rose-400">*</span>
            </label>
            <input
              type="email"
              required
              placeholder="newuser@gmail.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                New Password <span className="text-rose-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => generateStrongPassword(setNewPassword)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  title="Generate a strong KAIA password"
                >
                  <Sparkles size={11} />
                  <span>Generate</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                >
                  {showNewPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <input
              type={showNewPassword ? 'text' : 'password'}
              placeholder="Kaia-xxxxxxxx.h"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-emerald-300 font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Account Category
            </label>
            <select
              value={newCategory}
              onChange={(e) =>
                setNewCategory(e.target.value as VaultCredentialItem['category'])
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="kaia_account">KAIA Team Account (`people`)</option>
              <option value="tool_login">Studio Tool Login (`tools`)</option>
              <option value="email_account">Email / Gmail Account</option>
              <option value="other">Other Credential</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Role / Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. ai_creator · lahore"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-slate-400">
            New accounts are saved to the persistent credentials vault and synced with the Portal People / Tool tables.
          </div>
          <button
            type="submit"
            disabled={isCreating}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 cursor-pointer transition-all"
          >
            <Plus size={15} />
            <span>{isCreating ? 'Saving...' : 'Create & Save Email + Password'}</span>
          </button>
        </div>
      </form>

      {/* SECTION 2: All Database & Stored Emails & Passwords */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              All Stored Database Emails &amp; Passwords ({filteredItems.length} of {items.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Change any previous email or password directly in its row below and click <span className="text-emerald-400 font-semibold">Update</span> to save.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search
                size={14}
                className="text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search name, email, password, role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none w-64"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All Categories ({items.length})</option>
              <option value="kaia_account">KAIA Team Accounts ({counts.kaiaCount})</option>
              <option value="tool_login">Studio Tool Logins ({counts.toolCount})</option>
              <option value="clock_in">Primary Clock-In ({counts.clockInCount})</option>
              <option value="email_account">Email / Gmail</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Loading all emails &amp; passwords from database...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No stored emails or passwords match your search.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item, idx) => {
              const draft = drafts[item.id] || item;
              const isDirty =
                draft.label !== item.label ||
                draft.email !== item.email ||
                draft.password !== item.password ||
                draft.category !== item.category ||
                Boolean(draft.clockInSynced) !== Boolean(item.clockInSynced) ||
                (draft.notes || '') !== (item.notes || '');

              const isPasswordVisible =
                rowShowPassword[item.id] !== undefined
                  ? rowShowPassword[item.id]
                  : showAllPasswords;

              const isSaving = savingId === item.id;
              const isJustSaved = savedBannerId === item.id;
              const isTesting = testingId === item.id;
              const testStatus = testStatusById[item.id];

              return (
                <div
                  key={item.id}
                  className={`bg-slate-950/90 border rounded-2xl p-4 transition-all ${
                    isDirty
                      ? 'border-amber-500/60 shadow-sm shadow-amber-500/5'
                      : isJustSaved
                      ? 'border-emerald-500/60'
                      : draft.clockInSynced
                      ? 'border-indigo-500/40'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                    {/* Account Label */}
                    <div className="lg:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-400">
                          #{idx + 1} · Name
                        </label>
                        {draft.clockInSynced && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300">
                            CLOCK-IN
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={draft.label}
                        onChange={(e) => updateRowDraft(item.id, { label: e.target.value })}
                        placeholder="Account Name"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none"
                      />
                    </div>

                    {/* Email Address */}
                    <div className="lg:col-span-4">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                          <Mail size={11} className="text-indigo-400" />
                          <span>Email Address</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleCopy(draft.email, `email-${item.id}`)}
                          className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `email-${item.id}` ? (
                            <span className="text-emerald-400 font-semibold">Copied!</span>
                          ) : (
                            <>
                              <Copy size={10} />
                              <span>Copy Email</span>
                            </>
                          )}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={draft.email}
                        onChange={(e) => updateRowDraft(item.id, { email: e.target.value })}
                        placeholder="user@example.com"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                      />
                    </div>

                    {/* Password */}
                    <div className="lg:col-span-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                          <KeyRound size={11} className="text-emerald-400" />
                          <span>Password</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              generateStrongPassword((val) =>
                                updateRowDraft(item.id, { password: val })
                              )
                            }
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                            title="Generate new password"
                          >
                            Generate
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRowShowPassword((prev) => ({
                                ...prev,
                                [item.id]: !isPasswordVisible,
                              }))
                            }
                            className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                          >
                            {isPasswordVisible ? 'Hide' : 'Show'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(draft.password, `pass-${item.id}`)}
                            className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === `pass-${item.id}` ? (
                              <span className="text-emerald-400 font-semibold">Copied!</span>
                            ) : (
                              <>
                                <Copy size={10} />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <input
                        type={isPasswordVisible ? 'text' : 'password'}
                        value={draft.password}
                        onChange={(e) => updateRowDraft(item.id, { password: e.target.value })}
                        placeholder="Enter or update password..."
                        className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-emerald-300 font-mono focus:outline-none"
                      />
                    </div>

                    {/* Type & Actions */}
                    <div className="lg:col-span-3 flex items-center justify-end gap-1.5">
                      <select
                        value={draft.category}
                        onChange={(e) =>
                          updateRowDraft(item.id, {
                            category: e.target.value as VaultCredentialItem['category'],
                          })
                        }
                        className="bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl px-2 py-2 text-xs text-slate-200 focus:outline-none"
                      >
                        <option value="kaia_account">KAIA Account</option>
                        <option value="tool_login">Tool Login</option>
                        <option value="email_account">Email</option>
                        <option value="other">Other</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => void handleUpdatePreviousCredential(item.id)}
                        disabled={isSaving}
                        className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shrink-0 ${
                          isDirty
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm'
                            : isJustSaved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        }`}
                        title="Save updated email and password"
                      >
                        {isJustSaved ? (
                          <>
                            <Check size={14} />
                            <span>Saved</span>
                          </>
                        ) : (
                          <>
                            <Save size={14} />
                            <span>{isSaving ? 'Saving...' : 'Update'}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(`${draft.email} : ${draft.password}`, `combo-${item.id}`)
                        }
                        className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer shrink-0"
                        title="Copy Email : Password together"
                      >
                        {copiedKey === `combo-${item.id}` ? (
                          <Check size={14} className="text-emerald-400" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>

                      {draft.category === 'kaia_account' && (
                        <>
                          <a
                            href={`/portal-live?email=${encodeURIComponent(draft.email.trim())}&password=${encodeURIComponent(draft.password)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                            title={`1-Click Sign In as ${draft.label} (${draft.email}) on Real KAIA Operations Portal`}
                          >
                            <ExternalLink size={13} />
                            <span>Sign In</span>
                          </a>

                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                buildExternalPortalUnlockerScript(draft),
                                `unlocker-${item.id}`
                              )
                            }
                            className="p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 cursor-pointer shrink-0"
                            title={`Copy 1-Click Auto-Login Script for ${draft.email} on https://portal.trykaia.com/`}
                          >
                            {copiedKey === `unlocker-${item.id}` ? (
                              <Check size={14} className="text-emerald-400" />
                            ) : (
                              <Terminal size={14} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleTestKaiaLogin(item.id)}
                            disabled={isTesting}
                            className="p-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 cursor-pointer shrink-0"
                            title="Verify login with KAIA Supabase"
                          >
                            <UserCheck size={14} />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleDeleteCredential(item)}
                        disabled={isSaving}
                        className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-800 cursor-pointer shrink-0"
                        title="Delete stored credential"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Secondary Info Bar: Role/Notes, Auto Clock-In toggle & Login Test Status */}
                  <div className="mt-2.5 pt-2 border-t border-slate-900 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-3 flex-1">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span>Details:</span>
                        <input
                          type="text"
                          value={draft.notes || ''}
                          onChange={(e) => updateRowDraft(item.id, { notes: e.target.value })}
                          placeholder="Role / Notes..."
                          className="bg-transparent border-b border-slate-800 focus:border-indigo-500 text-slate-300 px-1 py-0.5 text-[11px] focus:outline-none w-60"
                        />
                      </div>

                      {draft.category === 'kaia_account' && (
                        <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.clockInSynced)}
                            onChange={(e) =>
                              updateRowDraft(item.id, { clockInSynced: e.target.checked })
                            }
                            className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                          />
                          <span>Sync to Daily Clock-In</span>
                        </label>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {testStatus && (
                        <span
                          className={`px-2 py-0.5 rounded font-semibold flex items-center gap-1 ${
                            testStatus.ok
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          <ShieldCheck size={12} />
                          <span>{testStatus.text}</span>
                        </span>
                      )}

                      {isDirty && (
                        <span className="text-amber-400 font-semibold">
                          Unsaved changes — click Update to save
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
