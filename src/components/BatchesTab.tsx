import { useEffect, useMemo, useState } from 'react';
import { AppConfig, KaiaBatch, KaiaClient, KaiaPersonProfile, KaiaProduct } from '../types/index.ts';
import { formatToPKT } from '../utils/time.ts';
import { safeParseJson } from '../utils/safeJson.ts';

interface BatchesTabProps {
  config: AppConfig;
  initialSubTab?: 'batches' | 'approved_creatives' | 'leaderboard';
  onOpenPortalStudio?: () => void;
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'text-slate-300' },
  { value: 'ready_to_create', label: 'Ready to Create', color: 'text-sky-300' },
  { value: 'creating', label: 'Creating', color: 'text-indigo-300' },
  { value: 'in_review', label: 'In Review', color: 'text-amber-300' },
  { value: 'needs_edits', label: 'Needs Edits', color: 'text-orange-300' },
  { value: 'approved', label: 'Approved', color: 'text-emerald-300' },
  { value: 'client_approved', label: 'Client Approved (Approved)', color: 'text-teal-300' },
  { value: 'discarded', label: 'Discarded', color: 'text-rose-300' },
];

const DEFAULT_QUALITY_FACTORS: Record<number, number> = {
  1: 0.7,
  2: 0.85,
  2.5: 1.0,
  3: 1.1,
  4: 1.2,
  5: 1.3,
};

const DEFAULT_FORMAT_WEIGHTS: Record<string, number> = {
  animation: 1.3,
  vsl: 1.0,
  ugc_talking_head: 1.0,
  long_form_ugc: 1.0,
  product_demo_broll: 1.0,
  podcast_clip: 1.0,
  static_image: 0.15,
};

function interpolateQualityFactor(quality: number, curve: Record<number, number> = DEFAULT_QUALITY_FACTORS): number {
  const keys = Object.keys(curve)
    .map(Number)
    .filter((k) => !Number.isNaN(k))
    .sort((a, b) => a - b);
  if (keys.length === 0) return 1;
  if (quality <= keys[0]) return curve[keys[0]];
  if (quality >= keys[keys.length - 1]) return curve[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const k1 = keys[i];
    const k2 = keys[i + 1];
    if (quality >= k1 && quality <= k2) {
      if (k1 === k2) return curve[k1];
      const t = (quality - k1) / (k2 - k1);
      return curve[k1] + t * (curve[k2] - curve[k1]);
    }
  }
  return 1;
}

function getStatusInfo(status: string) {
  const found = STATUS_OPTIONS.find((s) => s.value === status);
  if (found) return found;
  return {
    value: status,
    label: status ? status.replace(/_/g, ' ') : 'Unknown',
    color: 'text-slate-300',
  };
}

export function BatchesTab({
  config,
  initialSubTab = 'batches',
  onOpenPortalStudio,
}: BatchesTabProps) {
  const accounts = config.accounts || [];
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  const [activeSubTab, setActiveSubTab] = useState<'batches' | 'approved_creatives' | 'leaderboard'>(
    initialSubTab
  );
  const [scope, setScope] = useState<'assigned' | 'all'>('all');
  const [batches, setBatches] = useState<KaiaBatch[]>([]);
  const [allPeople, setAllPeople] = useState<KaiaPersonProfile[]>([]);
  const [clients, setClients] = useState<KaiaClient[]>([]);
  const [products, setProducts] = useState<KaiaProduct[]>([]);
  const [person, setPerson] = useState<KaiaPersonProfile | null>(null);
  const [resolvedPersonId, setResolvedPersonId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Main Batches Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<string>('all');

  // Approved Creatives Tab Filters & Sorting
  const [approvedPersonFilter, setApprovedPersonFilter] = useState<string>('all');
  const [approvedBrandFilter, setApprovedBrandFilter] = useState<string>('all');
  const [approvedCreativeFilter, setApprovedCreativeFilter] = useState<'all' | 'with_creative' | 'missing_creative'>('all');
  const [approvedSortBy, setApprovedSortBy] = useState<
    | 'person_asc'
    | 'person_count'
    | 'brand_asc'
    | 'brand_count'
    | 'date_desc'
    | 'rating_desc'
    | 'minutes_desc'
  >('person_asc');
  const [approvedViewMode, setApprovedViewMode] = useState<'table' | 'by_person' | 'by_brand'>('table');
  const [inlineCreativeEditId, setInlineCreativeEditId] = useState<string | null>(null);
  const [inlineCreativeUrl, setInlineCreativeUrl] = useState<string>('');
  const [inlineBriefUrl, setInlineBriefUrl] = useState<string>('');

  // Leaderboard period filter & expanded creator drawer
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'month' | 'last_month' | 'week' | 'all'>('month');
  const [expandedCreatorId, setExpandedCreatorId] = useState<string | null>(null);
  const [portalFormatWeights, setPortalFormatWeights] = useState<Record<string, number>>(DEFAULT_FORMAT_WEIGHTS);
  const [portalQualityFactors, setPortalQualityFactors] = useState<Record<number, number>>(DEFAULT_QUALITY_FACTORS);

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

  // Automatically switch to 'all' scope when viewing Approved Creatives (All Staff) or Leaderboard
  const handleSelectSubTab = (tab: 'batches' | 'approved_creatives' | 'leaderboard') => {
    setActiveSubTab(tab);
    if (tab === 'approved_creatives' || tab === 'leaderboard') {
      setScope('all');
    }
  };

  const fetchBatches = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError(null);
    try {
      // Always fetch scope='all' with limit='2500' so all 2,030 real studio batches are loaded
      const params = new URLSearchParams({
        supabaseUrl: config.supabaseUrl,
        supabaseAnonKey: config.supabaseAnonKey,
        accountId: selectedAccount.id,
        personId: selectedAccount.personId || '',
        email: selectedAccount.kaiaEmail || '',
        password: selectedAccount.kaiaPassword || '',
        scope: 'all',
        limit: '2500',
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
      if (Array.isArray(data.formatWeights) && data.formatWeights.length > 0) {
        const fwMap: Record<string, number> = { ...DEFAULT_FORMAT_WEIGHTS };
        for (const fw of data.formatWeights) {
          if (fw?.format && fw.weight !== undefined) fwMap[String(fw.format)] = Number(fw.weight);
        }
        setPortalFormatWeights(fwMap);
      }
      if (Array.isArray(data.qualityFactors) && data.qualityFactors.length > 0) {
        const qfMap: Record<number, number> = { ...DEFAULT_QUALITY_FACTORS };
        for (const qf of data.qualityFactors) {
          if (qf?.score !== undefined && qf.factor !== undefined) qfMap[Number(qf.score)] = Number(qf.factor);
        }
        setPortalQualityFactors(qfMap);
      }
      setSelectedBatchIds({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBatches();
  }, [selectedAccountId, config.supabaseUrl]);

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

  const getBrandDisplayName = (batch: KaiaBatch) => {
    return (
      batch.clients?.name ||
      (batch as any).client_name ||
      clients.find((c) => c.id === batch.client_id)?.name ||
      'Unassigned Brand'
    );
  };

  const getEffectivePersonName = (batch: KaiaBatch) => {
    return (
      getPersonDisplayName(batch.creator_id, (batch as any).creator_name) ||
      getPersonDisplayName(batch.editor_id, (batch as any).editor_name) ||
      getPersonDisplayName(batch.scriptwriter_id, (batch as any).scriptwriter_name) ||
      'Unassigned Creator'
    );
  };

  const getEffectivePersonId = (batch: KaiaBatch) => {
    return batch.creator_id || batch.editor_id || batch.scriptwriter_id || 'unassigned';
  };

  // Batches scoped to current view (Assigned to Me vs All Portal Batches)
  const scopedBatches = useMemo(() => {
    const pid = resolvedPersonId || selectedAccount?.personId || '';
    if (scope === 'assigned' && activeSubTab === 'batches' && pid) {
      return batches.filter(
        (b) =>
          b.creator_id === pid ||
          b.editor_id === pid ||
          b.scriptwriter_id === pid ||
          b.media_buyer_id === pid
      );
    }
    return batches;
  }, [batches, scope, activeSubTab, resolvedPersonId, selectedAccount?.personId]);

  // Filtered batches for main Batches tab
  const filteredBatches = useMemo(() => {
    return scopedBatches.filter((b) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = b.name?.toLowerCase().includes(q);
        const matchClient = getBrandDisplayName(b).toLowerCase().includes(q);
        const matchPerson = getEffectivePersonName(b).toLowerCase().includes(q);
        const matchFormat = b.format?.toLowerCase().includes(q);
        if (!matchName && !matchClient && !matchPerson && !matchFormat) return false;
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'approved') {
          if (b.status !== 'approved' && b.status !== 'client_approved') return false;
        } else if (b.status !== statusFilter) {
          return false;
        }
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
  }, [scopedBatches, searchQuery, statusFilter, ratingFilter, peopleNameMap, clients]);

  // All Approved Batches across all persons (for the Approved Creatives tab)
  const allApprovedBatches = useMemo(() => {
    return batches.filter((b) => b.status === 'approved' || b.status === 'client_approved');
  }, [batches]);

  // Per-Person and Per-Brand counts among Approved Batches
  const approvedPersonSummary = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; count: number; withCreative: number; qualitySum: number; qualityCnt: number; minutesSum: number }
    >();
    for (const b of allApprovedBatches) {
      const pid = getEffectivePersonId(b);
      const pname = getEffectivePersonName(b);
      const curr = map.get(pid) || {
        id: pid,
        name: pname,
        count: 0,
        withCreative: 0,
        qualitySum: 0,
        qualityCnt: 0,
        minutesSum: 0,
      };
      curr.count += 1;
      if (b.creative_url || (b as any).drive_link || b.brief_url) curr.withCreative += 1;
      if (typeof b.quality === 'number' && b.quality > 0) {
        curr.qualitySum += b.quality;
        curr.qualityCnt += 1;
      }
      curr.minutesSum += Number(b.minutes) || 0;
      map.set(pid, curr);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [allApprovedBatches, peopleNameMap]);

  const approvedBrandSummary = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; count: number; withCreative: number; minutesSum: number }
    >();
    for (const b of allApprovedBatches) {
      const cid = b.client_id || 'unassigned';
      const cname = getBrandDisplayName(b);
      const curr = map.get(cid) || {
        id: cid,
        name: cname,
        count: 0,
        withCreative: 0,
        minutesSum: 0,
      };
      curr.count += 1;
      if (b.creative_url || (b as any).drive_link || b.brief_url) curr.withCreative += 1;
      curr.minutesSum += Number(b.minutes) || 0;
      map.set(cid, curr);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [allApprovedBatches, clients]);

  // Filtered and Sorted Approved Batches for the Approved Creatives tab
  const filteredAndSortedApprovedBatches = useMemo(() => {
    const personCountMap = new Map<string, number>();
    for (const p of approvedPersonSummary) personCountMap.set(p.id, p.count);

    const brandCountMap = new Map<string, number>();
    for (const c of approvedBrandSummary) brandCountMap.set(c.id, c.count);

    const filtered = allApprovedBatches.filter((b) => {
      if (approvedPersonFilter !== 'all') {
        const pid = getEffectivePersonId(b);
        if (
          pid !== approvedPersonFilter &&
          b.creator_id !== approvedPersonFilter &&
          b.editor_id !== approvedPersonFilter &&
          b.qc_id !== approvedPersonFilter
        ) {
          return false;
        }
      }
      if (approvedBrandFilter !== 'all') {
        const cid = b.client_id || 'unassigned';
        if (cid !== approvedBrandFilter) return false;
      }
      if (approvedCreativeFilter === 'with_creative') {
        if (!b.creative_url && !(b as any).drive_link && !b.brief_url) return false;
      } else if (approvedCreativeFilter === 'missing_creative') {
        if (b.creative_url || (b as any).drive_link) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = b.name?.toLowerCase().includes(q);
        const matchClient = getBrandDisplayName(b).toLowerCase().includes(q);
        const matchPerson = getEffectivePersonName(b).toLowerCase().includes(q);
        const matchFormat = b.format?.toLowerCase().includes(q);
        const matchUrl = (b.creative_url || b.brief_url || '').toLowerCase().includes(q);
        if (!matchName && !matchClient && !matchPerson && !matchFormat && !matchUrl) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const personA = getEffectivePersonName(a);
      const personB = getEffectivePersonName(b);
      const brandA = getBrandDisplayName(a);
      const brandB = getBrandDisplayName(b);
      const dateA = String(a.approved_at || a.created_at || '');
      const dateB = String(b.approved_at || b.created_at || '');

      if (approvedSortBy === 'person_asc') {
        const cmp = personA.localeCompare(personB);
        if (cmp !== 0) return cmp;
        return dateB.localeCompare(dateA);
      }
      if (approvedSortBy === 'person_count') {
        const cntA = personCountMap.get(getEffectivePersonId(a)) || 0;
        const cntB = personCountMap.get(getEffectivePersonId(b)) || 0;
        if (cntB !== cntA) return cntB - cntA;
        const cmp = personA.localeCompare(personB);
        if (cmp !== 0) return cmp;
        return dateB.localeCompare(dateA);
      }
      if (approvedSortBy === 'brand_asc') {
        const cmp = brandA.localeCompare(brandB);
        if (cmp !== 0) return cmp;
        return personA.localeCompare(personB);
      }
      if (approvedSortBy === 'brand_count') {
        const cntA = brandCountMap.get(a.client_id || 'unassigned') || 0;
        const cntB = brandCountMap.get(b.client_id || 'unassigned') || 0;
        if (cntB !== cntA) return cntB - cntA;
        const cmp = brandA.localeCompare(brandB);
        if (cmp !== 0) return cmp;
        return personA.localeCompare(personB);
      }
      if (approvedSortBy === 'rating_desc') {
        const qA = Number(a.quality) || 0;
        const qB = Number(b.quality) || 0;
        if (qB !== qA) return qB - qA;
        return dateB.localeCompare(dateA);
      }
      if (approvedSortBy === 'minutes_desc') {
        const mA = Number(a.minutes) || 0;
        const mB = Number(b.minutes) || 0;
        if (mB !== mA) return mB - mA;
        return dateB.localeCompare(dateA);
      }
      return dateB.localeCompare(dateA);
    });
  }, [
    allApprovedBatches,
    approvedPersonFilter,
    approvedBrandFilter,
    approvedCreativeFilter,
    approvedSortBy,
    searchQuery,
    approvedPersonSummary,
    approvedBrandSummary,
  ]);

  // Live Leaderboard calculation matching portal.trykaia.com `useLeaderboard-KVKBt4Y_.js` & `index-BpZth3q2.js`
  const leaderboardRows = useMemo(() => {
    const now = new Date();
    let startIso: string | null = null;
    let endIso: string | null = null;
    if (leaderboardPeriod === 'month') {
      startIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      endIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
    } else if (leaderboardPeriod === 'last_month') {
      startIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
      endIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    } else if (leaderboardPeriod === 'week') {
      const day = now.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      startIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff)).toISOString();
    }

    const CREATOR_ROLES = new Set(['editor', 'ai_creator', 'scriptwriter', 'lander_builder']);

    const byCreator = new Map<
      string,
      {
        personId: string;
        name: string;
        role: string;
        level: number;
        approvedCount: number;
        rawMinutes: number;
        weightedMinutes: number;
        rawWeightedContribution: number;
        internalRevisionsSum: number;
        revisionFactor: number;
        qualitySum: number;
        qualityCount: number;
        winners: number;
        superWinners: number;
        points: number;
        batches: KaiaBatch[];
      }
    >();

    // Seed all active creator/editor staff just like portal.trykaia.com useLeaderboard
    for (const p of allPeople) {
      if (!p?.id || p.active === false) continue;
      const pRoles = Array.isArray(p.roles) && p.roles.length > 0 ? p.roles : [p.role];
      if (!pRoles.some((r) => CREATOR_ROLES.has(String(r)))) continue;
      byCreator.set(p.id, {
        personId: p.id,
        name: p.name || 'Creator',
        role: p.role || 'ai_creator',
        level: p.current_level ?? 1,
        approvedCount: 0,
        rawMinutes: 0,
        weightedMinutes: 0,
        rawWeightedContribution: 0,
        internalRevisionsSum: 0,
        revisionFactor: 1,
        qualitySum: 0,
        qualityCount: 0,
        winners: 0,
        superWinners: 0,
        points: 0,
        batches: [],
      });
    }

    for (const b of allApprovedBatches) {
      const cid = b.creator_id || b.editor_id;
      if (!cid || b.status === 'discarded') continue;
      const dt = b.approved_at || b.created_at;
      if (startIso && (!dt || dt < startIso)) continue;
      if (endIso && dt && dt >= endIso) continue;

      const personProfile = allPeople.find((p) => p.id === cid);
      const name = getPersonDisplayName(cid, (b as any).creator_name) || personProfile?.name || 'Creator';
      const entry = byCreator.get(cid) || {
        personId: cid,
        name,
        role: personProfile?.role || 'ai_creator',
        level: personProfile?.current_level ?? 1,
        approvedCount: 0,
        rawMinutes: 0,
        weightedMinutes: 0,
        rawWeightedContribution: 0,
        internalRevisionsSum: 0,
        revisionFactor: 1,
        qualitySum: 0,
        qualityCount: 0,
        winners: 0,
        superWinners: 0,
        points: 0,
        batches: [],
      };

      const rawMins = Number(b.minutes) || 0;
      // Diminishing returns Qw: static_image = 0.4m, >4m = 4 + (m - 4) * 0.9
      const effMins =
        b.format === 'static_image'
          ? 0.4
          : rawMins <= 4
          ? rawMins
          : 4 + (rawMins - 4) * 0.9;

      const fmtWeight =
        String(b.language || '').toLowerCase() === 'non_english'
          ? 1.5
          : portalFormatWeights[b.format || ''] ?? 1.0;

      const q = b.quality !== null && b.quality !== undefined && Number(b.quality) > 0 ? Number(b.quality) : null;
      const qFactor = q !== null ? interpolateQualityFactor(q, portalQualityFactors) : 1.0;
      const statusFactor = b.status === 'client_rejected' ? 0.2 : 1.0;
      const batchContribution = statusFactor * effMins * fmtWeight * qFactor;

      entry.approvedCount += 1;
      entry.rawMinutes += rawMins;
      entry.weightedMinutes += batchContribution;
      entry.rawWeightedContribution += batchContribution;
      entry.internalRevisionsSum += Number(b.internal_revisions) || 0;
      if (q !== null) {
        entry.qualitySum += q;
        entry.qualityCount += 1;
      }
      if (b.outcome === 'winner') entry.winners += 1;
      if (b.outcome === 'super_winner') entry.superWinners += 1;
      entry.batches.push(b);
      byCreator.set(cid, entry);
    }

    return Array.from(byCreator.values())
      .map((r) => {
        const avgRevs = r.approvedCount > 0 ? r.internalRevisionsSum / r.approvedCount : 0;
        const revFactor =
          r.approvedCount === 0
            ? 1.0
            : avgRevs <= 0.3
            ? 1.05
            : avgRevs <= 0.8
            ? 1.0
            : avgRevs <= 1.5
            ? 0.95
            : 0.9;
        const portalScore = Math.round(r.rawWeightedContribution * revFactor);
        const avgQuality = r.qualityCount > 0 ? Number((r.qualitySum / r.qualityCount).toFixed(2)) : 0;
        return {
          ...r,
          avgQuality,
          revisionFactor: revFactor,
          points: portalScore,
          weightedMinutes: Number((r.rawWeightedContribution * revFactor).toFixed(1)),
          rawMinutes: Number(r.rawMinutes.toFixed(1)),
        };
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.avgQuality - a.avgQuality ||
          b.rawMinutes - a.rawMinutes ||
          a.name.localeCompare(b.name)
      );
  }, [allApprovedBatches, allPeople, leaderboardPeriod, peopleNameMap, portalFormatWeights, portalQualityFactors]);

  // Summary metrics
  const stats = useMemo(() => {
    const targetList = activeSubTab === 'batches' ? scopedBatches : batches;
    const total = targetList.length;
    const ratedBatches = targetList.filter((b) => typeof b.quality === 'number' && b.quality > 0);
    const ratedCount = ratedBatches.length;
    const unratedCount = total - ratedCount;
    const avgRating =
      ratedCount > 0
        ? ratedBatches.reduce((sum, b) => sum + (b.quality || 0), 0) / ratedCount
        : 0;
    const fiveStarCount = ratedBatches.filter((b) => b.quality === 5).length;
    const underFiveCount = targetList.filter((b) => b.quality !== 5).length;
    const approvedCount = targetList.filter(
      (b) => b.status === 'approved' || b.status === 'client_approved'
    ).length;
    const totalMinutes = targetList.reduce((sum, b) => sum + (Number(b.minutes) || 0), 0);

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
  }, [batches, scopedBatches, activeSubTab]);

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

  // Quick update single batch rating or fields (automatically restores creator_id if putting back to Approved)
  const handleQuickUpdateBatch = async (
    batch: KaiaBatch,
    updates: Record<string, any>
  ) => {
    if (!selectedAccount) return;
    setUpdatingBatchId(batch.id);
    setFeedback(null);

    const finalUpdates = { ...updates };
    // If putting a batch back to approved/client_approved and creator_id was cleared when pulled out, restore creator_id!
    if (
      (finalUpdates.status === 'approved' || finalUpdates.status === 'client_approved') &&
      !batch.creator_id &&
      !finalUpdates.creator_id
    ) {
      finalUpdates.creator_id = batch.editor_id || resolvedPersonId || selectedAccount.personId;
    }

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
          ...finalUpdates,
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
                ...finalUpdates,
                ...(updatedRow || {}),
              }
            : item
        )
      );

      const ratingLabel =
        finalUpdates.quality !== undefined
          ? finalUpdates.quality === null
            ? 'Unrated'
            : `${finalUpdates.quality}★`
          : null;

      setFeedback({
        type: 'success',
        text: `Updated "${finalUpdates.name || batch.name}"${
          ratingLabel ? ` rating to ${ratingLabel}` : ''
        }${finalUpdates.status ? ` · status → ${finalUpdates.status}` : ''} (${
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
        if (['approved', 'client_approved', 'winner', 'super_winner', 'testing', 'edits_from_client'].includes(bulkStatus)) {
          payload.setApprovedAt = true;
        }
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

  // Bulk update all batches for a specific creator directly from the Leaderboard tab
  const handleBulkCreatorStarUpdate = async (creatorBatches: KaiaBatch[], starRating: number, creatorName: string) => {
    if (!selectedAccount || creatorBatches.length === 0) return;
    setIsBulkUpdating(true);
    setFeedback(null);
    const targetIds = creatorBatches.map((b) => b.id);
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
          batchIds: targetIds,
          quality: starRating,
        }),
      });
      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const targetSet = new Set(targetIds);
      setBatches((prev) =>
        prev.map((item) => (targetSet.has(item.id) ? { ...item, quality: starRating } : item))
      );
      setFeedback({
        type: 'success',
        text: `Updated all ${targetIds.length} leaderboard batch(es) for ${creatorName} to ${starRating}★ — Leaderboard rank & points recalculated!`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Failed to update creator batches: ${err.message}`,
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
    const defaultCreatorId =
      batch.creator_id || batch.editor_id || resolvedPersonId || selectedAccount?.personId || '';
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
      creator_id: defaultCreatorId,
      editor_id: batch.editor_id || defaultCreatorId,
      scriptwriter_id: batch.scriptwriter_id || '',
      qc_id: batch.qc_id || '',
      media_buyer_id: batch.media_buyer_id || '',
      brief_url: batch.brief_url || '',
      creative_url: batch.creative_url || (batch as any).drive_link || '',
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
    const candidate: Record<string, any> = {
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
      approved_at:
        editForm.approved_at ||
        (['approved', 'client_approved', 'winner', 'super_winner', 'testing', 'edits_from_client'].includes(editForm.status)
          ? editingBatch.approved_at || new Date().toISOString()
          : null),
    };

    const diffed: Record<string, any> = {};
    for (const [k, v] of Object.entries(candidate)) {
      const orig = (editingBatch as any)[k] ?? null;
      const normOrig = orig === '' ? null : orig;
      const normVal = v === '' ? null : v;
      if (normOrig !== normVal) {
        diffed[k] = v;
      }
    }
    if (
      ['approved', 'client_approved', 'winner', 'super_winner', 'testing', 'edits_from_client'].includes(editForm.status) &&
      !editingBatch.approved_at
    ) {
      diffed.setApprovedAt = true;
      diffed.approved_at = candidate.approved_at;
    }

    await handleQuickUpdateBatch(
      editingBatch,
      Object.keys(diffed).length > 0 ? diffed : { name: editForm.name }
    );
    setEditingBatch(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Tab Switcher */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-indigo-300 font-medium">
              <span>KAIA Batches, Approved Creatives &amp; Leaderboard</span>
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
              {activeSubTab === 'approved_creatives'
                ? 'Approved Batches & Creatives Directory (All Staff & Brands)'
                : activeSubTab === 'leaderboard'
                ? 'Live Creator Leaderboard & Star Rating Calculator'
                : 'Batches & Full Rating Customizer'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {activeSubTab === 'approved_creatives'
                ? 'View every approved batch across all persons in the studio with their Creative / Frame.io / Drive deliverables, and sort or group by Person or Brand.'
                : activeSubTab === 'leaderboard'
                ? 'Real-time creator leaderboard rankings, average star ratings (1★–5★), weighted minutes, and points.'
                : 'View and customize batches assigned to your account or across the entire portal — put pulled batches back into Approved, or edit ratings (1★–5★), revisions, minutes, and creatives.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/portal-live"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition cursor-pointer"
            >
              🌐 Open Live Portal (/portal-live)
            </a>
            {/* Scope Toggle: Assigned vs All Portal Batches */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setScope('assigned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  scope === 'assigned' && activeSubTab === 'batches'
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
                  scope === 'all' || activeSubTab !== 'batches'
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

        {/* Dedicated 3-Tab Mode Switcher inside Batches */}
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => handleSelectSubTab('batches')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'batches'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <span>All Batches &amp; Ratings Customizer</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-900/70 text-[10px] font-mono">
              {batches.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSubTab('approved_creatives')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'approved_creatives'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/25'
                : 'bg-slate-950 text-teal-300 hover:text-white border border-teal-500/30'
            }`}
          >
            <span>🎬 Approved Batches &amp; Creatives (All Persons · Sort by Person / Brand)</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-900/70 text-[10px] font-mono">
              {allApprovedBatches.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSubTab('leaderboard')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'leaderboard'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/25'
                : 'bg-slate-950 text-amber-300 hover:text-white border border-amber-500/30'
            }`}
          >
            <span>🏆 Live Creator Leaderboard &amp; Star Ratings</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-900/70 text-[10px] font-mono">
              {leaderboardRows.length} Creators
            </span>
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 pt-5">
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              {scope === 'all' || activeSubTab !== 'batches' ? 'Portal Batches' : 'Assigned Batches'}
            </span>
            <div className="text-2xl font-bold text-white mt-1 font-mono">{stats.total}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {stats.approvedCount} Approved / Client Approved
            </span>
          </div>

          <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-4">
            <span className="text-[11px] font-medium text-amber-300 uppercase tracking-wider">Average Rating</span>
            <div className="text-2xl font-bold text-amber-300 mt-1 font-mono flex items-center gap-1.5">
              <span>{stats.avgRating > 0 ? stats.avgRating.toFixed(2) : '—'}</span>
              <span className="text-base">★</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Across {stats.ratedCount} rated batch(es)
            </span>
          </div>

          <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-4">
            <span className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider">5★ Rated Batches</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{stats.fiveStarCount}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {stats.total > 0 ? `${Math.round((stats.fiveStarCount / stats.total) * 100)}%` : '0%'} of total
            </span>
          </div>

          <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-4">
            <span className="text-[11px] font-medium text-indigo-300 uppercase tracking-wider">Under 5★ / Unrated</span>
            <div className="text-2xl font-bold text-indigo-300 mt-1 font-mono">{stats.underFiveCount}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {stats.unratedCount} unrated · {stats.underFiveCount - stats.unratedCount} rated &lt; 5★
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-4 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Video Mins</span>
            <div className="text-2xl font-bold text-white mt-1 font-mono">
              {stats.totalMinutes.toFixed(1)}m
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Cumulative batch duration</span>
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
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs">
          {error}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 1: APPROVED CREATIVES DIRECTORY (ALL STAFF & BRANDS)
      ===================================================================== */}
      {activeSubTab === 'approved_creatives' && (
        <div className="space-y-5">
          {/* Person & Brand Filter + Sort Control Bar */}
          <div className="bg-slate-900/90 border border-teal-500/30 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>All Approved Batches &amp; Creatives ({filteredAndSortedApprovedBatches.length})</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    {approvedPersonSummary.length} Persons · {approvedBrandSummary.length} Brands
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Filter or sort all approved batches across the entire studio by <strong className="text-slate-200">Person (Creator)</strong> or <strong className="text-slate-200">Brand (Client)</strong>, and open or attach Creative deliverable links.
                </p>
              </div>

              {/* View Mode Switcher */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setApprovedViewMode('table')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      approvedViewMode === 'table'
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All Approved Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setApprovedViewMode('by_person')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      approvedViewMode === 'by_person'
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Grouped by Person
                  </button>
                  <button
                    type="button"
                    onClick={() => setApprovedViewMode('by_brand')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      approvedViewMode === 'by_brand'
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Grouped by Brand
                  </button>
                </div>
              </div>
            </div>

            {/* Filters & Sort Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-800/80">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Search Batch / Person / Brand
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search batch, creator, brand, link..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-teal-300 mb-1">
                  Filter by Person (Creator)
                </label>
                <select
                  value={approvedPersonFilter}
                  onChange={(e) => setApprovedPersonFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                  <option value="all">All Persons ({allApprovedBatches.length} Approved)</option>
                  {approvedPersonSummary.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.count} approved · {p.qualityCnt > 0 ? `${(p.qualitySum / p.qualityCnt).toFixed(1)}★` : 'unrated'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-indigo-300 mb-1">
                  Filter by Brand (Client)
                </label>
                <select
                  value={approvedBrandFilter}
                  onChange={(e) => setApprovedBrandFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">All Brands ({approvedBrandSummary.length} Brands)</option>
                  {approvedBrandSummary.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.count} approved)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-300 mb-1">
                  Sort Approved Batches By
                </label>
                <select
                  value={approvedSortBy}
                  onChange={(e) => setApprovedSortBy(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-amber-300 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="person_asc">Person Name (A → Z)</option>
                  <option value="person_count">Person (Most Approved First)</option>
                  <option value="brand_asc">Brand Name (A → Z)</option>
                  <option value="brand_count">Brand (Most Approved First)</option>
                  <option value="date_desc">Approved Date (Newest First)</option>
                  <option value="rating_desc">Star Rating (5★ → 1★)</option>
                  <option value="minutes_desc">Duration (Longest First)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Creative Link Filter
                </label>
                <select
                  value={approvedCreativeFilter}
                  onChange={(e) => setApprovedCreativeFilter(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                  <option value="all">All Approved Batches</option>
                  <option value="with_creative">Has Creative / Brief Link</option>
                  <option value="missing_creative">Missing Creative Link</option>
                </select>
              </div>
            </div>

            {/* Quick Clickable Person & Brand Filter Pills */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2">
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300">
                    Quick Filter by Person ({approvedPersonSummary.length})
                  </span>
                  {approvedPersonFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setApprovedPersonFilter('all')}
                      className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Show All Persons
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {approvedPersonSummary.map((p) => {
                    const active = approvedPersonFilter === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setApprovedPersonFilter(active ? 'all' : p.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                          active
                            ? 'bg-teal-600 text-white border-teal-400 shadow-sm'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        <span>{p.name}</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-950/70 text-[10px] font-mono text-teal-300">
                          {p.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                    Quick Filter by Brand ({approvedBrandSummary.length})
                  </span>
                  {approvedBrandFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setApprovedBrandFilter('all')}
                      className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Show All Brands
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {approvedBrandSummary.map((c) => {
                    const active = approvedBrandFilter === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setApprovedBrandFilter(active ? 'all' : c.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        <span>{c.name}</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-950/70 text-[10px] font-mono text-indigo-300">
                          {c.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* GROUPED BY PERSON VIEW */}
          {approvedViewMode === 'by_person' && (
            <div className="space-y-4">
              {approvedPersonSummary
                .filter((p) => approvedPersonFilter === 'all' || p.id === approvedPersonFilter)
                .map((personGroup) => {
                  const personBatches = filteredAndSortedApprovedBatches.filter(
                    (b) => getEffectivePersonId(b) === personGroup.id
                  );
                  if (personBatches.length === 0) return null;
                  return (
                    <div
                      key={personGroup.id}
                      className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl"
                    >
                      <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-white">{personGroup.name}</span>
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-mono bg-teal-500/20 text-teal-300 border border-teal-500/30">
                            {personBatches.length} Approved Batches
                          </span>
                          {personGroup.qualityCnt > 0 && (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Avg {(personGroup.qualitySum / personGroup.qualityCnt).toFixed(2)}★
                            </span>
                          )}
                          <span className="text-xs text-slate-400 font-mono">
                            {personGroup.minutesSum.toFixed(1)} total mins
                          </span>
                        </div>
                      </div>
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {personBatches.map((b) => {
                          const creativeLink = b.creative_url || (b as any).drive_link || '';
                          return (
                            <div
                              key={b.id}
                              className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between gap-3"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="font-bold text-white text-xs">{b.name}</div>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 shrink-0">
                                    {b.quality ? `${b.quality}★` : 'Unrated'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
                                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                                    {getBrandDisplayName(b)}
                                  </span>
                                  <span className="text-slate-400 font-mono">{b.format || 'standard'}</span>
                                  <span className="text-slate-500">·</span>
                                  <span className="text-slate-300 font-mono">
                                    {b.minutes ? `${Number(b.minutes).toFixed(2)}m` : '—'}
                                  </span>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {creativeLink ? (
                                    <a
                                      href={creativeLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                                    >
                                      ▶ Open Creative
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-slate-500 italic">No creative URL</span>
                                  )}
                                  {b.brief_url && (
                                    <a
                                      href={b.brief_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-indigo-300"
                                    >
                                      Brief
                                    </a>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(b)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* GROUPED BY BRAND VIEW */}
          {approvedViewMode === 'by_brand' && (
            <div className="space-y-4">
              {approvedBrandSummary
                .filter((c) => approvedBrandFilter === 'all' || c.id === approvedBrandFilter)
                .map((brandGroup) => {
                  const brandBatches = filteredAndSortedApprovedBatches.filter(
                    (b) => (b.client_id || 'unassigned') === brandGroup.id
                  );
                  if (brandBatches.length === 0) return null;
                  return (
                    <div
                      key={brandGroup.id}
                      className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl"
                    >
                      <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-white">{brandGroup.name}</span>
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {brandBatches.length} Approved Batches
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {brandGroup.minutesSum.toFixed(1)} total mins
                          </span>
                        </div>
                      </div>
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {brandBatches.map((b) => {
                          const creativeLink = b.creative_url || (b as any).drive_link || '';
                          return (
                            <div
                              key={b.id}
                              className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between gap-3"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="font-bold text-white text-xs">{b.name}</div>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 shrink-0">
                                    {b.quality ? `${b.quality}★` : 'Unrated'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
                                  <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-semibold">
                                    Person: {getEffectivePersonName(b)}
                                  </span>
                                  <span className="text-slate-400 font-mono">{b.format || 'standard'}</span>
                                  <span className="text-slate-500">·</span>
                                  <span className="text-slate-300 font-mono">
                                    {b.minutes ? `${Number(b.minutes).toFixed(2)}m` : '—'}
                                  </span>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {creativeLink ? (
                                    <a
                                      href={creativeLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                                    >
                                      ▶ Open Creative
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-slate-500 italic">No creative URL</span>
                                  )}
                                  {b.brief_url && (
                                    <a
                                      href={b.brief_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-indigo-300"
                                    >
                                      Brief
                                    </a>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(b)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* FLAT SORTABLE TABLE VIEW OF ALL APPROVED BATCHES & CREATIVES */}
          {approvedViewMode === 'table' && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="py-3.5 pl-5 pr-3">
                        <button
                          type="button"
                          onClick={() =>
                            setApprovedSortBy(
                              approvedSortBy === 'person_asc' ? 'person_count' : 'person_asc'
                            )
                          }
                          className="flex items-center gap-1 text-teal-300 hover:text-white cursor-pointer"
                        >
                          <span>Person (Creator / Editor)</span>
                          <span>↕</span>
                        </button>
                      </th>
                      <th className="py-3.5 px-3">
                        <button
                          type="button"
                          onClick={() =>
                            setApprovedSortBy(
                              approvedSortBy === 'brand_asc' ? 'brand_count' : 'brand_asc'
                            )
                          }
                          className="flex items-center gap-1 text-indigo-300 hover:text-white cursor-pointer"
                        >
                          <span>Brand (Client)</span>
                          <span>↕</span>
                        </button>
                      </th>
                      <th className="py-3.5 px-3">Approved Batch &amp; Format</th>
                      <th className="py-3.5 px-3">Creative Deliverable &amp; Brief Links</th>
                      <th className="py-3.5 px-3">
                        <button
                          type="button"
                          onClick={() => setApprovedSortBy('rating_desc')}
                          className="flex items-center gap-1 text-amber-300 hover:text-white cursor-pointer"
                        >
                          <span>Rating &amp; Mins</span>
                          <span>↕</span>
                        </button>
                      </th>
                      <th className="py-3.5 pl-3 pr-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {filteredAndSortedApprovedBatches.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          No approved batches match the selected Person or Brand filters.
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedApprovedBatches.map((batch) => {
                        const personName = getEffectivePersonName(batch);
                        const brandName = getBrandDisplayName(batch);
                        const creativeLink = batch.creative_url || (batch as any).drive_link || '';
                        const isEditingLink = inlineCreativeEditId === batch.id;
                        const isRowUpdating = updatingBatchId === batch.id;

                        return (
                          <tr key={batch.id} className="hover:bg-slate-800/40 transition-colors">
                            {/* Person */}
                            <td className="py-3.5 pl-5 pr-3 align-middle">
                              <button
                                type="button"
                                onClick={() =>
                                  setApprovedPersonFilter(
                                    approvedPersonFilter === getEffectivePersonId(batch)
                                      ? 'all'
                                      : getEffectivePersonId(batch)
                                  )
                                }
                                className="font-bold text-teal-300 hover:text-teal-200 text-left cursor-pointer"
                              >
                                {personName}
                              </button>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {batch.editor_id && batch.editor_id !== batch.creator_id
                                  ? `Editor: ${getPersonDisplayName(batch.editor_id, (batch as any).editor_name) || '—'}`
                                  : 'Creator & Editor'}
                              </div>
                            </td>

                            {/* Brand */}
                            <td className="py-3.5 px-3 align-middle">
                              <button
                                type="button"
                                onClick={() =>
                                  setApprovedBrandFilter(
                                    approvedBrandFilter === (batch.client_id || 'unassigned')
                                      ? 'all'
                                      : batch.client_id || 'unassigned'
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 font-semibold cursor-pointer"
                              >
                                {brandName}
                              </button>
                            </td>

                            {/* Batch Name & Format */}
                            <td className="py-3.5 px-3 align-middle">
                              <div className="font-semibold text-white">{batch.name}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-slate-300">{batch.format || 'standard'}</span>
                                <span>·</span>
                                <span className="text-emerald-400 font-semibold uppercase text-[10px]">
                                  {batch.status === 'client_approved' ? 'Approved (Client)' : 'Approved'}
                                </span>
                                {(batch.approved_at || batch.created_at) && (
                                  <>
                                    <span>·</span>
                                    <span>
                                      {formatToPKT(batch.approved_at || batch.created_at).split(',')[0]}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Creative Deliverable Links */}
                            <td className="py-3.5 px-3 align-middle">
                              {isEditingLink ? (
                                <div className="space-y-1.5 min-w-[240px]">
                                  <input
                                    type="text"
                                    value={inlineCreativeUrl}
                                    onChange={(e) => setInlineCreativeUrl(e.target.value)}
                                    placeholder="Creative URL (Frame.io / Drive)..."
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                                  />
                                  <input
                                    type="text"
                                    value={inlineBriefUrl}
                                    onChange={(e) => setInlineBriefUrl(e.target.value)}
                                    placeholder="Brief URL (Google Docs)..."
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                                  />
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={isRowUpdating}
                                      onClick={async () => {
                                        await handleQuickUpdateBatch(batch, {
                                          creative_url: inlineCreativeUrl.trim() || null,
                                          brief_url: inlineBriefUrl.trim() || null,
                                        });
                                        setInlineCreativeEditId(null);
                                      }}
                                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                                    >
                                      Save Links
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setInlineCreativeEditId(null)}
                                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px] cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {creativeLink ? (
                                    <a
                                      href={creativeLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 font-semibold text-[11px] flex items-center gap-1"
                                    >
                                      <span>▶ Open Creative</span>
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-slate-500">No Creative URL</span>
                                  )}

                                  {batch.brief_url && (
                                    <a
                                      href={batch.brief_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px]"
                                    >
                                      Brief
                                    </a>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInlineCreativeEditId(batch.id);
                                      setInlineCreativeUrl(creativeLink);
                                      setInlineBriefUrl(batch.brief_url || '');
                                    }}
                                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                                  >
                                    {creativeLink ? 'Edit Link' : '+ Add Creative'}
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Rating & Minutes */}
                            <td className="py-3.5 px-3 align-middle">
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    disabled={isRowUpdating}
                                    onClick={() => handleQuickUpdateBatch(batch, { quality: star })}
                                    className={`w-6 h-6 rounded text-[11px] font-bold border transition cursor-pointer ${
                                      batch.quality === star
                                        ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                                        : (batch.quality || 0) >= star
                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                        : 'bg-slate-950 border-slate-800 text-slate-500'
                                    }`}
                                  >
                                    {star}★
                                  </button>
                                ))}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-1">
                                {batch.minutes ? `${Number(batch.minutes).toFixed(2)} mins` : '— mins'}
                                {batch.outcome ? ` · ${batch.outcome}` : ''}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 pl-3 pr-5 align-middle text-right">
                              <button
                                type="button"
                                onClick={() => openEditModal(batch)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                              >
                                Edit Batch
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: LIVE CREATOR LEADERBOARD & STAR RATING CALCULATOR
      ===================================================================== */}
      {activeSubTab === 'leaderboard' && (
        <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">
                🏆 Live KAIA Creator Leaderboard &amp; Star Rating Updater
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Exact <span className="font-mono text-amber-300">portal.trykaia.com</span> formula (1★=0.7x, 2★=0.85x, 3★=1.1x, 4★=1.2x, 5★=1.3x · Animation=1.3x · Rev Factor 0.90x–1.05x). Click any creator or star button below to update batch stars and immediately recalculate leaderboard rank &amp; score with zero attribution.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                {(['month', 'last_month', 'week', 'all'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setLeaderboardPeriod(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      leaderboardPeriod === p
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {p === 'month'
                      ? 'This Month'
                      : p === 'last_month'
                      ? 'Last Month'
                      : p === 'week'
                      ? 'This Week'
                      : 'All Time'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Creator</th>
                  <th className="py-2.5 px-3">Batches</th>
                  <th className="py-2.5 px-3">Average Star Rating</th>
                  <th className="py-2.5 px-3">Raw → Weighted Mins</th>
                  <th className="py-2.5 px-3">Rev Factor</th>
                  <th className="py-2.5 px-3">Quick Batch Star Update</th>
                  <th className="py-2.5 px-3 text-right">Leaderboard Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {leaderboardRows.map((row, idx) => {
                  const isExpanded = expandedCreatorId === row.personId;
                  const isCurrentUser =
                    row.personId === (resolvedPersonId || selectedAccount?.personId);
                  return (
                    <>
                      <tr
                        key={row.personId}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isCurrentUser ? 'bg-amber-500/5' : ''
                        }`}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-amber-300">
                          #{idx + 1}
                        </td>
                        <td className="py-3 px-3 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCreatorId(isExpanded ? null : row.personId)
                              }
                              className="hover:text-amber-300 flex items-center gap-1.5 cursor-pointer text-left"
                            >
                              <span>{row.name}</span>
                              {isCurrentUser && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                                  YOU
                                </span>
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-emerald-400 font-bold">
                          {row.approvedCount}
                        </td>
                        <td className="py-3 px-3 font-mono">
                          <span className="px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                            {row.avgQuality > 0 ? `${row.avgQuality.toFixed(2)} ★` : '—'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {row.rawMinutes}m →{' '}
                          <span className="text-indigo-300 font-bold">{row.weightedMinutes}m</span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {row.revisionFactor.toFixed(2)}x
                        </td>
                        <td className="py-3 px-3">
                          {row.batches.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1">
                              {[3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  disabled={isBulkUpdating}
                                  onClick={() =>
                                    handleBulkCreatorStarUpdate(row.batches, star, row.name)
                                  }
                                  className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-bold cursor-pointer disabled:opacity-40"
                                  title={`Set all ${row.batches.length} batch(es) for ${row.name} to ${star}★`}
                                >
                                  All {star}★
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedCreatorId(isExpanded ? null : row.personId)
                                }
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium cursor-pointer"
                              >
                                {isExpanded ? 'Hide Batches ▲' : `Edit ${row.batches.length} Batches ▼`}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[11px]">No batches in period</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-300 text-sm">
                          {row.points} pts
                        </td>
                      </tr>
                      {isExpanded && row.batches.length > 0 && (
                        <tr key={`${row.personId}-batches`} className="bg-slate-950/90">
                          <td colSpan={8} className="p-4 border-b border-slate-800">
                            <div className="flex items-center justify-between mb-2.5">
                              <span className="text-xs font-bold text-amber-300">
                                {row.name}&apos;s Leaderboard Batches ({row.batches.length}) — Click any star (1★–5★) to update batch rating &amp; leaderboard score immediately
                              </span>
                              <button
                                type="button"
                                onClick={() => setExpandedCreatorId(null)}
                                className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                              >
                                Close
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {row.batches.map((b) => {
                                const isUpdatingThis = updatingBatchId === b.id;
                                return (
                                  <div
                                    key={b.id}
                                    className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-semibold text-white truncate">
                                        {b.name}
                                      </div>
                                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                        {getBrandDisplayName(b)} · {b.format || 'ugc_talking_head'} ·{' '}
                                        {Number(b.minutes || 0).toFixed(2)}m · Revs:{' '}
                                        {b.internal_revisions ?? 0}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                          key={star}
                                          type="button"
                                          disabled={isUpdatingThis}
                                          onClick={() =>
                                            handleQuickUpdateBatch(b, { quality: star })
                                          }
                                          className={`w-6 h-6 rounded text-[11px] font-bold border transition cursor-pointer disabled:opacity-40 ${
                                            b.quality === star
                                              ? 'bg-amber-500/30 border-amber-400 text-amber-200 scale-105'
                                              : (b.quality || 0) >= star
                                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-amber-300'
                                          }`}
                                        >
                                          {star}★
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: ALL BATCHES & RATINGS CUSTOMIZER
      ===================================================================== */}
      {activeSubTab === 'batches' && (
        <>
          {/* Bulk Rating & Quick Selection Control Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-300 mr-1">Quick Select:</span>
                <button
                  type="button"
                  onClick={() => selectByCondition(() => true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                >
                  Select All Visible ({filteredBatches.length})
                </button>
                <button
                  type="button"
                  onClick={() => selectByCondition((b) => b.quality !== 5)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 cursor-pointer"
                >
                  Select All Under 5★ ({filteredBatches.filter((b) => b.quality !== 5).length})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    selectByCondition((b) => b.quality === null || b.quality === undefined)
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 cursor-pointer"
                >
                  Select Unrated (
                  {filteredBatches.filter((b) => b.quality === null || b.quality === undefined).length})
                </button>
                {selectedIdsList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedBatchIds({})}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 cursor-pointer"
                  >
                    Clear Selection ({selectedIdsList.length})
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3 xl:pt-0 border-t xl:border-t-0 border-slate-800">
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-xs text-slate-400">Set Rating:</span>
                  <select
                    value={bulkRating}
                    onChange={(e) => setBulkRating(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-amber-300 focus:outline-none cursor-pointer"
                  >
                    <option value={5} className="bg-slate-900 text-amber-300">5 ★ (Max Quality)</option>
                    <option value={4} className="bg-slate-900 text-amber-300">4 ★ (Good)</option>
                    <option value={3} className="bg-slate-900 text-amber-300">3 ★ (Standard)</option>
                    <option value={2} className="bg-slate-900 text-amber-300">2 ★ (Low)</option>
                    <option value={1} className="bg-slate-900 text-amber-300">1 ★ (Minimum)</option>
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
                    <option value="super_winner" className="bg-slate-900 text-amber-300">Super Winner</option>
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
                  placeholder="Search by batch name, person, client (e.g. Vital Horse), or format..."
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
                    <th className="py-3.5 px-3">Batch &amp; Creative Links</th>
                    <th className="py-3.5 px-3">Client &amp; Person</th>
                    <th className="py-3.5 px-3">Status &amp; Put Back to Approved</th>
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
                      const isApproved =
                        batch.status === 'approved' || batch.status === 'client_approved';
                      const creativeLink = batch.creative_url || (batch as any).drive_link || '';

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
                              {batch.format && (
                                <span className="font-mono text-slate-300">{batch.format}</span>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>Created: {formatToPKT(batch.created_at).split(',')[0]}</span>
                              {creativeLink && (
                                <a
                                  href={creativeLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 font-semibold"
                                >
                                  ▶ Creative
                                </a>
                              )}
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
                            </div>
                          </td>

                          {/* Client & Assigned Role */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="font-medium text-slate-200">
                              {getBrandDisplayName(batch)}
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
                              <span>Creator: {getEffectivePersonName(batch)}</span>
                            </div>
                          </td>

                          {/* Status & Put Back in Approved */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={batch.status}
                                disabled={isRowUpdating}
                                onChange={(e) => {
                                  const nextStatus = e.target.value;
                                  const isApproving = [
                                    'approved',
                                    'client_approved',
                                    'winner',
                                    'super_winner',
                                    'testing',
                                    'edits_from_client',
                                  ].includes(nextStatus);
                                  handleQuickUpdateBatch(batch, {
                                    status: nextStatus,
                                    creator_id:
                                      batch.creator_id ||
                                      batch.editor_id ||
                                      resolvedPersonId ||
                                      selectedAccount?.personId,
                                    ...(isApproving
                                      ? {
                                          setApprovedAt: true,
                                          quality: batch.quality && batch.quality > 0 ? batch.quality : 5,
                                        }
                                      : {}),
                                  });
                                }}
                                className={`bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-semibold ${statusInfo.color} focus:outline-none cursor-pointer`}
                              >
                                {STATUS_OPTIONS.map((st) => (
                                  <option key={st.value} value={st.value} className="bg-slate-900 text-white">
                                    {st.label}
                                  </option>
                                ))}
                              </select>

                              {(!isApproved || !batch.creator_id) && (
                                <button
                                  type="button"
                                  disabled={isRowUpdating}
                                  onClick={() =>
                                    handleQuickUpdateBatch(batch, {
                                      status: 'approved',
                                      creator_id:
                                        batch.creator_id ||
                                        batch.editor_id ||
                                        resolvedPersonId ||
                                        selectedAccount?.personId,
                                      setApprovedAt: true,
                                    })
                                  }
                                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm cursor-pointer"
                                  title="Put batch back into Approved and restore creator assignment"
                                >
                                  ✓ Put Back in Approved
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1">
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
                              {((batch.internal_revisions ?? 0) > 0 ||
                                (batch.client_revisions ?? 0) > 0) && (
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
        </>
      )}

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
                  Edit any property, assignment, rating, metric, or creative link for this batch.
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
                  <option value="super_winner">Super Winner (+$50)</option>
                  <option value="winner">Winner (+$25)</option>
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
                <select
                  value={editForm.pay_status}
                  onChange={(e) => setEditForm({ ...editForm, pay_status: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                >
                  <option value="">None</option>
                  <option value="pending">pending (Unpaid)</option>
                  <option value="paid">paid</option>
                </select>
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
                <label className="block text-slate-400 font-medium mb-1">Creative / Frame.io / Google Drive URL</label>
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
