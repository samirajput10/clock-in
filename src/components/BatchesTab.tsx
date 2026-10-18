import { useEffect, useMemo, useState } from 'react';
import { AppConfig, KaiaBatch, KaiaClient, KaiaPersonProfile, KaiaProduct } from '../types/index.ts';
import { formatToPKT } from '../utils/time.ts';
import { safeParseJson } from '../utils/safeJson.ts';

interface BatchesTabProps {
  config: AppConfig;
  onOpenPortalStudio?: () => void;
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'text-slate-300' },
  { value: 'ready_to_create', label: 'Ready to Create', color: 'text-sky-300' },
  { value: 'creating', label: 'Creating', color: 'text-indigo-300' },
  { value: 'in_review', label: 'In Review', color: 'text-amber-300' },
  { value: 'needs_edits', label: 'Needs Edits', color: 'text-orange-300' },
  { value: 'approved', label: 'Approved', color: 'text-emerald-300' },
  { value: 'client_approved', label: 'Client Approved', color: 'text-teal-300' },
  { value: 'discarded', label: 'Discarded', color: 'text-rose-300' },
];

function getStatusInfo(status: string) {
  const found = STATUS_OPTIONS.find((s) => s.value === status);
  if (found) return found;
  return {
    value: status,
    label: status ? status.replace(/_/g, ' ') : 'Unknown',
    color: 'text-slate-300',
  };
}

export function BatchesTab({ config, onOpenPortalStudio }: BatchesTabProps) {
  const accounts = config.accounts || [];
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  const [scope, setScope] = useState<'assigned' | 'all'>('assigned');
  const [batches, setBatches] = useState<KaiaBatch[]>([]);
  const [allPeople, setAllPeople] = useState<KaiaPersonProfile[]>([]);
  const [clients, setClients] = useState<KaiaClient[]>([]);
  const [products, setProducts] = useState<KaiaProduct[]>([]);
  const [person, setPerson] = useState<KaiaPersonProfile | null>(null);
  const [resolvedPersonId, setResolvedPersonId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<string>('all');

  // Selection & Bulk Update state
  const [selectedBatchIds, setSelectedBatchIds] = useState<Record<string, boolean>>({});
  const [bulkRating, setBulkRating] = useState<number>(5);
  const [bulkResetRevisions, setBulkResetRevisions] = useState<boolean>(false);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkOutcome, setBulkOutcome] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Single row updating state
  const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);

  // Comprehensive Edit Modal state (every batch field editable)
  const [editingBatch, setEditingBatch] = useState<KaiaBatch | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  const fetchBatches = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        supabaseUrl: config.supabaseUrl,
        supabaseAnonKey: config.supabaseAnonKey,
        accountId: selectedAccount.id,
        personId: selectedAccount.personId || '',
        email: selectedAccount.kaiaEmail || '',
        password: selectedAccount.kaiaPassword || '',
        scope,
        limit: '300',
      });

      const headers: Record<string, string> = {};
      if (selectedAccount.manualToken) {
        headers['Authorization'] = `Bearer ${selectedAccount.manualToken}`;
      }

      const res = await fetch(`/api/batches?${params.toString()}`, { headers });
      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to load batches (HTTP ${res.status})`);
      }

      setBatches(Array.isArray(data.batches) ? data.batches : []);
      setAllPeople(Array.isArray(data.allPeople) ? data.allPeople : []);
      setClients(Array.isArray(data.clients) ? data.clients : []);
      setProducts(Array.isArray(data.products) ? data.products : []);
      setPerson(data.person || null);
      setResolvedPersonId(data.personId || selectedAccount.personId || '');
      setSelectedBatchIds({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBatches();
  }, [selectedAccountId, scope, config.supabaseUrl]);

  // Filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = b.name?.toLowerCase().includes(q);
        const matchClient = b.clients?.name?.toLowerCase().includes(q);
        const matchFormat = b.format?.toLowerCase().includes(q);
        if (!matchName && !matchClient && !matchFormat) return false;
      }

      if (statusFilter !== 'all' && b.status !== statusFilter) {
        return false;
      }

      if (ratingFilter !== 'all') {
        if (ratingFilter === 'unrated' && b.quality !== null && b.quality !== undefined) return false;
        if (ratingFilter === 'needs_boost' && (b.quality === 5 || b.quality === null || b.quality === undefined)) {
          return false;
        }
        if (ratingFilter === 'under_5' && b.quality === 5) return false;
        if (['1', '2', '3', '4', '5'].includes(ratingFilter) && b.quality !== Number(ratingFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [batches, searchQuery, statusFilter, ratingFilter]);

  // Summary metrics
  const stats = useMemo(() => {
    const total = batches.length;
    const ratedBatches = batches.filter((b) => typeof b.quality === 'number' && b.quality > 0);
    const ratedCount = ratedBatches.length;
    const unratedCount = total - ratedCount;
    const avgRating =
      ratedCount > 0
        ? ratedBatches.reduce((sum, b) => sum + (b.quality || 0), 0) / ratedCount
        : 0;
    const fiveStarCount = ratedBatches.filter((b) => b.quality === 5).length;
    const underFiveCount = batches.filter((b) => b.quality !== 5).length;
    const approvedCount = batches.filter(
      (b) => b.status === 'approved' || b.status === 'client_approved'
    ).length;
    const totalMinutes = batches.reduce((sum, b) => sum + (Number(b.minutes) || 0), 0);

    return {
      total,
      ratedCount,
      unratedCount,
      avgRating,
      fiveStarCount,
      underFiveCount,
      approvedCount,
      totalMinutes,
    };
  }, [batches]);

  const peopleNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPeople) {
      if (p.id && p.name) map.set(p.id, p.name);
    }
    if (person?.id && person?.name) map.set(person.id, person.name);
    return map;
  }, [allPeople, person]);

  const getPersonDisplayName = (id?: string | null, fallbackName?: string | null) => {
    if (fallbackName && fallbackName.trim()) return fallbackName;
    if (!id) return null;
    return peopleNameMap.get(id) || null;
  };

  // Determine roles assigned to current person on a batch
  const getAssignedRoles = (batch: KaiaBatch) => {
    const pid = resolvedPersonId || selectedAccount?.personId;
    if (!pid) return ['Assigned'];
    const roles: string[] = [];
    if (batch.creator_id === pid) roles.push('Creator');
    if (batch.editor_id === pid) roles.push('Editor');
    if (batch.scriptwriter_id === pid) roles.push('Scriptwriter');
    if (batch.qc_id === pid) roles.push('QC');
    if (batch.media_buyer_id === pid) roles.push('Media Buyer');
    return roles.length > 0 ? roles : ['Portal Batch'];
  };

  // Quick update single batch rating or fields
  const handleQuickUpdateBatch = async (
    batch: KaiaBatch,
    updates: Record<string, any>
  ) => {
    if (!selectedAccount) return;
    setUpdatingBatchId(batch.id);
    setFeedback(null);

    try {
      const res = await fetch('/api/batches/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: config.supabaseUrl,
          supabaseAnonKey: config.supabaseAnonKey,
          accountId: selectedAccount.id,
          personId: selectedAccount.personId,
          email: selectedAccount.kaiaEmail,
          password: selectedAccount.kaiaPassword,
          accessToken: selectedAccount.manualToken,
          batchId: batch.id,
          ...updates,
        }),
      });

      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const updatedRow = data.batches?.[0];
      setBatches((prev) =>
        prev.map((item) =>
          item.id === batch.id
            ? {
                ...item,
                ...updates,
                ...(updatedRow || {}),
              }
            : item
        )
      );

      const ratingLabel =
        updates.quality !== undefined
          ? updates.quality === null
            ? 'Unrated'
            : `${updates.quality}★`
          : null;

      setFeedback({
        type: 'success',
        text: `Updated "${updates.name || batch.name}"${ratingLabel ? ` rating to ${ratingLabel}` : ''} (${
          data.mode === 'direct_db' ? 'Direct Supabase DB' : 'Saved & Force-Overwritten'
        }).`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Failed to update "${batch.name}": ${err.message}`,
      });
    } finally {
      setUpdatingBatchId(null);
    }
  };

  // Bulk update selected batches
  const selectedIdsList = Object.keys(selectedBatchIds).filter((id) => selectedBatchIds[id]);

  const handleBulkUpdate = async () => {
    if (!selectedAccount || selectedIdsList.length === 0) return;
    setIsBulkUpdating(true);
    setFeedback(null);

    try {
      const payload: Record<string, any> = {
        supabaseUrl: config.supabaseUrl,
        supabaseAnonKey: config.supabaseAnonKey,
        accountId: selectedAccount.id,
        personId: selectedAccount.personId,
        email: selectedAccount.kaiaEmail,
        password: selectedAccount.kaiaPassword,
        accessToken: selectedAccount.manualToken,
        batchIds: selectedIdsList,
        quality: bulkRating === 0 ? null : bulkRating,
      };

      if (bulkResetRevisions) {
        payload.internal_revisions = 0;
        payload.client_revisions = 0;
      }
      if (bulkStatus) {
        payload.status = bulkStatus;
      }
      if (bulkOutcome) {
        payload.outcome = bulkOutcome;
      }

      const res = await fetch('/api/batches/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const updatedMap = new Map<string, KaiaBatch>();
      if (Array.isArray(data.batches)) {
        data.batches.forEach((b: KaiaBatch) => updatedMap.set(b.id, b));
      }

      setBatches((prev) =>
        prev.map((item) => {
          if (!selectedBatchIds[item.id]) return item;
          const fromServer = updatedMap.get(item.id);
          return {
            ...item,
            quality: bulkRating === 0 ? null : bulkRating,
            ...(bulkResetRevisions ? { internal_revisions: 0, client_revisions: 0 } : {}),
            ...(bulkStatus ? { status: bulkStatus } : {}),
            ...(bulkOutcome ? { outcome: bulkOutcome === 'none' ? null : bulkOutcome } : {}),
            ...(fromServer || {}),
          };
        })
      );

      setFeedback({
        type: 'success',
        text: `Bulk updated ${selectedIdsList.length} batch(es) to ${
          bulkRating === 0 ? 'Unrated' : `${bulkRating}★ Rating`
        }${bulkResetRevisions ? ' (Revisions reset to 0)' : ''}!`,
      });
      setSelectedBatchIds({});
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Bulk update failed: ${err.message}`,
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const selectByCondition = (predicate: (b: KaiaBatch) => boolean) => {
    const next: Record<string, boolean> = {};
    filteredBatches.forEach((b) => {
      if (predicate(b)) {
        next[b.id] = true;
      }
    });
    setSelectedBatchIds(next);
  };

  const openEditModal = (batch: KaiaBatch) => {
    setEditingBatch(batch);
    setEditForm({
      name: batch.name || '',
      format: batch.format || '',
      quality: batch.quality !== null && batch.quality !== undefined ? String(batch.quality) : '',
      status: batch.status || 'approved',
      outcome: batch.outcome || '',
      pay_status: batch.pay_status || '',
      paid_period: batch.paid_period || '',
      language: batch.language || 'English',
      internal_revisions: batch.internal_revisions ?? 0,
      client_revisions: batch.client_revisions ?? 0,
      minutes: batch.minutes !== null && batch.minutes !== undefined ? String(batch.minutes) : '',
      hooks: batch.hooks !== null && batch.hooks !== undefined ? String(batch.hooks) : '',
      spend: batch.spend !== null && batch.spend !== undefined ? String(batch.spend) : '',
      roas: batch.roas !== null && batch.roas !== undefined ? String(batch.roas) : '',
      hook_rate: batch.hook_rate !== null && batch.hook_rate !== undefined ? String(batch.hook_rate) : '',
      purchases: batch.purchases !== null && batch.purchases !== undefined ? String(batch.purchases) : '',
      client_id: batch.client_id || '',
      product_id: batch.product_id || '',
      creator_id: batch.creator_id || '',
      editor_id: batch.editor_id || '',
      scriptwriter_id: batch.scriptwriter_id || '',
      qc_id: batch.qc_id || '',
      media_buyer_id: batch.media_buyer_id || '',
      brief_url: batch.brief_url || '',
      creative_url: batch.creative_url || '',
      script_url_2: batch.script_url_2 || '',
      product_url: batch.product_url || '',
      ad_name_in_platform: batch.ad_name_in_platform || '',
      instructions: batch.instructions || '',
      due_at: batch.due_at || '',
      approved_at: batch.approved_at || '',
    });
  };

  const handleSaveModalEdit = async () => {
    if (!editingBatch) return;
    await handleQuickUpdateBatch(editingBatch, {
      name: editForm.name,
      format: editForm.format || null,
      quality: editForm.quality === '' ? null : Number(editForm.quality),
      status: editForm.status,
      outcome: editForm.outcome || null,
      pay_status: editForm.pay_status || null,
      paid_period: editForm.paid_period || null,
      language: editForm.language || null,
      internal_revisions: Number(editForm.internal_revisions) || 0,
      client_revisions: Number(editForm.client_revisions) || 0,
      minutes: editForm.minutes === '' ? null : Number(editForm.minutes),
      hooks: editForm.hooks === '' ? null : Number(editForm.hooks),
      spend: editForm.spend === '' ? null : Number(editForm.spend),
      roas: editForm.roas === '' ? null : Number(editForm.roas),
      hook_rate: editForm.hook_rate === '' ? null : Number(editForm.hook_rate),
      purchases: editForm.purchases === '' ? null : Number(editForm.purchases),
      client_id: editForm.client_id || null,
      product_id: editForm.product_id || null,
      creator_id: editForm.creator_id || null,
      editor_id: editForm.editor_id || null,
      scriptwriter_id: editForm.scriptwriter_id || null,
      qc_id: editForm.qc_id || null,
      media_buyer_id: editForm.media_buyer_id || null,
      brief_url: editForm.brief_url || null,
      creative_url: editForm.creative_url || null,
      script_url_2: editForm.script_url_2 || null,
      product_url: editForm.product_url || null,
      ad_name_in_platform: editForm.ad_name_in_platform || null,
      instructions: editForm.instructions || null,
      due_at: editForm.due_at || null,
      approved_at: editForm.approved_at || null,
    });
    setEditingBatch(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Account Selector */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-indigo-300 font-medium">
              <span>KAIA Batches &amp; Quality Ratings</span>
              {person && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-300 font-mono">
                    {person.name} · {person.role} · Level {person.current_level ?? 1} · Score{' '}
                    {person.current_score ?? 0}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-1.5">
              Batches &amp; Full Rating Customizer
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              View and customize batches assigned to your account or across the entire{' '}
              <code className="text-indigo-300 font-mono">portal.trykaia.com</code> workspace — edit
              ratings (1★–5★), revisions, minutes, hooks, outcomes, ROAS, and assignments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Scope Toggle: Assigned vs All Portal Batches */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setScope('assigned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  scope === 'assigned'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Assigned to Me
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  scope === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Portal Batches
              </button>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-400 font-medium">Account:</span>
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                    {acc.label} {acc.kaiaEmail ? `(${acc.kaiaEmail})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {onOpenPortalStudio && (
              <button
                type="button"
                onClick={onOpenPortalStudio}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
              >
                Open Full Portal Studio
              </button>
            )}

            <button
              onClick={fetchBatches}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 pt-5">
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              {scope === 'all' ? 'Portal Batches' : 'Assigned Batches'}
            </span>
            <div className="text-2xl font-bold text-white mt-1 font-mono">{stats.total}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {stats.approvedCount} Approved / Client Approved
            </span>
          </div>

          <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-4">
            <span className="text-[11px] font-medium text-amber-300 uppercase tracking-wider">Average Rating</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-amber-300 font-mono">
                {stats.ratedCount > 0 ? stats.avgRating.toFixed(2) : '—'}
              </span>
              <span className="text-sm text-amber-400">★ / 5.0</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Across {stats.ratedCount} rated batch(es)
            </span>
          </div>

          <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-4">
            <span className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider">5★ Rated Batches</span>
            <div className="text-2xl font-bold text-emerald-300 mt-1 font-mono">{stats.fiveStarCount}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {stats.unratedCount} currently unrated
            </span>
          </div>

          <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-4">
            <span className="text-[11px] font-medium text-indigo-300 uppercase tracking-wider">Can Boost to 5★</span>
            <div className="text-2xl font-bold text-indigo-300 mt-1 font-mono">{stats.underFiveCount}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Batches rated &lt; 5★ or unrated
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-4 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Produced</span>
            <div className="text-2xl font-bold text-white mt-1 font-mono">
              {stats.totalMinutes.toFixed(1)} <span className="text-xs font-normal text-slate-400">min</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Creator:{' '}
              <span className="font-semibold text-emerald-300">
                {person?.name || selectedAccount?.label || 'Studio Account'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
          }`}
        >
          <span className="font-medium">{feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200">
          <strong className="font-semibold">Error loading batches:</strong> {error}
        </div>
      )}

      {/* Bulk Rating Action Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Bulk Rating &amp; Batch Customizer
              </span>
              <span className="text-[11px] font-mono text-indigo-300">
                ({selectedIdsList.length} selected)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => selectByCondition((b) => b.quality !== null && b.quality < 5)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 cursor-pointer"
              >
                Select Rated &lt; 5★
              </button>
              <button
                type="button"
                onClick={() => selectByCondition((b) => b.quality !== 5)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 cursor-pointer"
              >
                Select All Under 5★ / Unrated
              </button>
              <button
                type="button"
                onClick={() =>
                  selectByCondition((b) => b.status === 'approved' || b.status === 'client_approved')
                }
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 cursor-pointer"
              >
                Select All Approved
              </button>
              <button
                type="button"
                onClick={() => selectByCondition(() => true)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
              >
                Select All Visible ({filteredBatches.length})
              </button>
              {selectedIdsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedBatchIds({})}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-400">Set Rating:</span>
              <select
                value={bulkRating}
                onChange={(e) => setBulkRating(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-amber-300 focus:outline-none cursor-pointer"
              >
                <option value={5} className="bg-slate-900 text-amber-300">5 ★ (Top Quality)</option>
                <option value={4} className="bg-slate-900 text-amber-300">4 ★ (Good)</option>
                <option value={3} className="bg-slate-900 text-amber-300">3 ★ (Average)</option>
                <option value={2} className="bg-slate-900 text-amber-300">2 ★ (Below Avg)</option>
                <option value={1} className="bg-slate-900 text-amber-300">1 ★ (Low)</option>
                <option value={0} className="bg-slate-900 text-slate-400">Clear Rating (null)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-400">Status:</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-slate-400">Keep Current</option>
                {STATUS_OPTIONS.map((st) => (
                  <option key={st.value} value={st.value} className="bg-slate-900 text-white">
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-400">Outcome:</span>
              <select
                value={bulkOutcome}
                onChange={(e) => setBulkOutcome(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-slate-400">Keep Current</option>
                <option value="winner" className="bg-slate-900 text-emerald-300">Winner</option>
                <option value="testing" className="bg-slate-900 text-sky-300">Testing</option>
                <option value="loser" className="bg-slate-900 text-rose-300">Loser</option>
                <option value="none" className="bg-slate-900 text-slate-400">Clear Outcome</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bulkResetRevisions}
                onChange={(e) => setBulkResetRevisions(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Reset Revisions to 0</span>
            </label>

            <button
              type="button"
              onClick={handleBulkUpdate}
              disabled={isBulkUpdating || selectedIdsList.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all shadow-sm cursor-pointer"
            >
              {isBulkUpdating
                ? 'Updating Batches...'
                : `Update ${selectedIdsList.length || ''} Selected`}
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar + Batches Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by batch name, client (e.g. Vital Horse), or format..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Statuses ({batches.length})</option>
              {STATUS_OPTIONS.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>

            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Ratings</option>
              <option value="needs_boost">Rated &lt; 5★ (Needs Boost)</option>
              <option value="under_5">All Under 5★ or Unrated</option>
              <option value="unrated">Unrated Only</option>
              <option value="5">5 ★ Only</option>
              <option value="4">4 ★ Only</option>
              <option value="3">3 ★ Only</option>
              <option value="2">2 ★ Only</option>
              <option value="1">1 ★ Only</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="py-3.5 pl-5 pr-2 w-9">
                  <input
                    type="checkbox"
                    checked={
                      filteredBatches.length > 0 &&
                      filteredBatches.every((b) => Boolean(selectedBatchIds[b.id]))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectByCondition(() => true);
                      } else {
                        setSelectedBatchIds({});
                      }
                    }}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="py-3.5 px-3">Batch &amp; Links</th>
                <th className="py-3.5 px-3">Client &amp; Role</th>
                <th className="py-3.5 px-3">Status &amp; Outcome</th>
                <th className="py-3.5 px-3">Metrics &amp; Revisions</th>
                <th className="py-3.5 px-3">Batch Rating (Click to Update)</th>
                <th className="py-3.5 pl-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {loading && batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Loading batches from KAIA Supabase...
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No batches match the current filters.
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const statusInfo = getStatusInfo(batch.status);
                  const roles = getAssignedRoles(batch);
                  const isRowUpdating = updatingBatchId === batch.id;
                  const isSelected = Boolean(selectedBatchIds[batch.id]);
                  const hasOverride = (batch._overriddenFields?.length || 0) > 0;

                  return (
                    <tr
                      key={batch.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-indigo-950/25' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 pl-5 pr-2 align-middle">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) =>
                            setSelectedBatchIds((prev) => ({
                              ...prev,
                              [batch.id]: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Batch Name, Format, Dates & Links */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="font-semibold text-white text-sm flex items-center gap-2">
                          <span>{batch.name}</span>
                          {hasOverride && (
                            <span className="text-[11px] font-normal text-amber-300">
                              · Customized
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-400">
                          {batch.format && <span className="font-mono text-slate-300">{batch.format}</span>}
                          <span aria-hidden="true">·</span>
                          <span>Created: {formatToPKT(batch.created_at).split(',')[0]}</span>
                          {batch.brief_url && (
                            <a
                              href={batch.brief_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 underline"
                            >
                              Brief
                            </a>
                          )}
                          {batch.creative_url && (
                            <a
                              href={batch.creative_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 underline"
                            >
                              Creative
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Client & Assigned Role */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="font-medium text-slate-200">
                          {batch.clients?.name || (batch as any).client_name || 'Unassigned Client'}
                          {(batch.products?.name || (batch as any).product_name) && (
                            <span className="text-slate-400 font-normal">
                              {' '}
                              · {batch.products?.name || (batch as any).product_name}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-indigo-300 mt-0.5">
                          {roles.join(' · ')}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {getPersonDisplayName(batch.creator_id, (batch as any).creator_name) && (
                            <span>
                              Creator: {getPersonDisplayName(batch.creator_id, (batch as any).creator_name)}
                            </span>
                          )}
                          {getPersonDisplayName(batch.qc_id, (batch as any).qc_name) && (
                            <span>
                              {' '}
                              · QC: {getPersonDisplayName(batch.qc_id, (batch as any).qc_name)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status & Outcome */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className={`font-semibold capitalize ${statusInfo.color}`}>
                          {statusInfo.label}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Outcome: {batch.outcome || '—'} · Pay: {batch.pay_status || 'unpaid'}
                        </div>
                      </td>

                      {/* Metrics & Revisions */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="flex items-center gap-2 text-slate-300 font-mono text-[11px]">
                          <span>
                            {batch.minutes ? `${Number(batch.minutes).toFixed(2)}m` : '— min'}
                          </span>
                          <span>·</span>
                          <span>{batch.hooks ?? '—'} hooks</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px]">
                          <span
                            className={
                              (batch.internal_revisions ?? 0) > 0
                                ? 'text-amber-300 font-medium'
                                : 'text-slate-400'
                            }
                          >
                            Int Rev: {batch.internal_revisions ?? 0}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span
                            className={
                              (batch.client_revisions ?? 0) > 0
                                ? 'text-rose-300 font-medium'
                                : 'text-slate-400'
                            }
                          >
                            Client Rev: {batch.client_revisions ?? 0}
                          </span>
                          {((batch.internal_revisions ?? 0) > 0 || (batch.client_revisions ?? 0) > 0) && (
                            <button
                              type="button"
                              disabled={isRowUpdating}
                              onClick={() =>
                                handleQuickUpdateBatch(batch, {
                                  internal_revisions: 0,
                                  client_revisions: 0,
                                })
                              }
                              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-emerald-300 border border-slate-700 cursor-pointer"
                            >
                              Reset 0
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Direct 1-5 Star Rating Selector */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((star) => {
                            const active = (batch.quality || 0) >= star;
                            const isCurrent = batch.quality === star;
                            return (
                              <button
                                key={star}
                                type="button"
                                disabled={isRowUpdating}
                                onClick={() => handleQuickUpdateBatch(batch, { quality: star })}
                                title={`Set "${batch.name}" rating to ${star} ★`}
                                className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center border transition-all cursor-pointer disabled:opacity-40 ${
                                  isCurrent
                                    ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-sm scale-105'
                                    : active
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-amber-300 hover:border-amber-500/40'
                                }`}
                              >
                                {star}★
                              </button>
                            );
                          })}

                          <span className="ml-1.5 text-[11px] font-mono">
                            {isRowUpdating ? (
                              <span className="text-indigo-400 animate-pulse">Saving...</span>
                            ) : batch.quality ? (
                              <span
                                className={`font-bold ${
                                  batch.quality === 5
                                    ? 'text-emerald-400'
                                    : batch.quality >= 4
                                    ? 'text-amber-300'
                                    : 'text-rose-300'
                                }`}
                              >
                                {batch.quality}/5
                              </span>
                            ) : (
                              <span className="text-slate-500">Unrated</span>
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 pl-3 pr-5 align-middle text-right">
                        <div className="flex items-center justify-end gap-2">
                          {batch.quality !== 5 && (
                            <button
                              type="button"
                              disabled={isRowUpdating}
                              onClick={() => handleQuickUpdateBatch(batch, { quality: 5 })}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              Set 5★
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(batch)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                          >
                            Edit All Fields
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Batch Customizer Modal */}
      {editingBatch && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Full Batch Customizer — {editingBatch.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Edit any property, assignment, rating, metric, or link for this batch.
                </p>
              </div>
              <button
                onClick={() => setEditingBatch(null)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-slate-400 font-medium mb-1">Batch Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Format</label>
                <input
                  type="text"
                  value={editForm.format}
                  onChange={(e) => setEditForm({ ...editForm, format: e.target.value })}
                  placeholder="ugc_talking_head"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Batch Rating (quality)
                </label>
                <select
                  value={editForm.quality}
                  onChange={(e) => setEditForm({ ...editForm, quality: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unrated (null)</option>
                  <option value="5">5 ★ (Excellent)</option>
                  <option value="4">4 ★ (Good)</option>
                  <option value="3">3 ★ (Average)</option>
                  <option value="2">2 ★ (Below Average)</option>
                  <option value="1">1 ★ (Poor)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Outcome</label>
                <select
                  value={editForm.outcome}
                  onChange={(e) => setEditForm({ ...editForm, outcome: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">None</option>
                  <option value="winner">Winner</option>
                  <option value="testing">Testing</option>
                  <option value="loser">Loser</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Internal Revisions</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.internal_revisions}
                  onChange={(e) =>
                    setEditForm({ ...editForm, internal_revisions: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Client Revisions</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.client_revisions}
                  onChange={(e) =>
                    setEditForm({ ...editForm, client_revisions: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Duration (Minutes)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.minutes}
                  onChange={(e) => setEditForm({ ...editForm, minutes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Hooks Count</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.hooks}
                  onChange={(e) => setEditForm({ ...editForm, hooks: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Pay Status</label>
                <input
                  type="text"
                  value={editForm.pay_status}
                  onChange={(e) => setEditForm({ ...editForm, pay_status: e.target.value })}
                  placeholder="paid / unpaid"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Spend ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.spend}
                  onChange={(e) => setEditForm({ ...editForm, spend: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">ROAS</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.roas}
                  onChange={(e) => setEditForm({ ...editForm, roas: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Hook Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.hook_rate}
                  onChange={(e) => setEditForm({ ...editForm, hook_rate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Purchases</label>
                <input
                  type="number"
                  value={editForm.purchases}
                  onChange={(e) => setEditForm({ ...editForm, purchases: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Client Brand</label>
                <select
                  value={editForm.client_id}
                  onChange={(e) => setEditForm({ ...editForm, client_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Product</label>
                <select
                  value={editForm.product_id}
                  onChange={(e) => setEditForm({ ...editForm, product_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">No Product</option>
                  {products.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Creator</label>
                <select
                  value={editForm.creator_id}
                  onChange={(e) => setEditForm({ ...editForm, creator_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {allPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Editor</label>
                <select
                  value={editForm.editor_id}
                  onChange={(e) => setEditForm({ ...editForm, editor_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {allPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Scriptwriter</label>
                <select
                  value={editForm.scriptwriter_id}
                  onChange={(e) => setEditForm({ ...editForm, scriptwriter_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {allPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">QC Reviewer</label>
                <select
                  value={editForm.qc_id}
                  onChange={(e) => setEditForm({ ...editForm, qc_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {allPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Media Buyer</label>
                <select
                  value={editForm.media_buyer_id}
                  onChange={(e) => setEditForm({ ...editForm, media_buyer_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {allPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-slate-400 font-medium mb-1">Brief URL</label>
                <input
                  type="text"
                  value={editForm.brief_url}
                  onChange={(e) => setEditForm({ ...editForm, brief_url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-slate-400 font-medium mb-1">Creative / Frame.io URL</label>
                <input
                  type="text"
                  value={editForm.creative_url}
                  onChange={(e) => setEditForm({ ...editForm, creative_url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-slate-400 font-medium mb-1">Instructions / Notes</label>
                <textarea
                  rows={2}
                  value={editForm.instructions}
                  onChange={(e) => setEditForm({ ...editForm, instructions: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModalEdit}
                disabled={updatingBatchId === editingBatch.id}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
              >
                {updatingBatchId === editingBatch.id ? 'Saving...' : 'Save Batch Customizations'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
