import { useCallback, useEffect, useState } from 'react';
import { BellRing, CalendarDays, CheckCircle2, CircleAlert, LoaderCircle, Megaphone, Plus, Trash2 } from 'lucide-react';
import { safeParseJson } from '../utils/safeJson.ts';

type UpdateCategory = 'announcement' | 'feature' | 'fix' | 'maintenance';

interface AppUpdate {
  id: string;
  title: string;
  body: string;
  category: UpdateCategory;
  createdAt: string;
}

const categoryStyles: Record<UpdateCategory, string> = {
  announcement: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  feature: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  fix: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  maintenance: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

export function UpdatesTab() {
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<UpdateCategory>('announcement');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadUpdates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/updates');
      const data = await safeParseJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not load updates.');
      setUpdates(Array.isArray(data.updates) ? data.updates : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load updates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUpdates();
  }, [loadUpdates]);

  const adminRequest = (method: 'POST' | 'DELETE', payload: Record<string, string>) =>
    fetch('/api/updates', {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminPassword}`,
      },
      body: JSON.stringify(payload),
    });

  const handlePublish = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setPublishing(true);
    try {
      const response = await adminRequest('POST', { title: title.trim(), body: body.trim(), category });
      const data = await safeParseJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not publish update.');
      setUpdates((current) => [data.update, ...current].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
      setTitle('');
      setBody('');
      setCategory('announcement');
      setNotice('Update published successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish update.');
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this update? This cannot be undone.')) return;
    setError('');
    setNotice('');
    try {
      const response = await adminRequest('DELETE', { id });
      const data = await safeParseJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not delete update.');
      setUpdates((current) => current.filter((item) => item.id !== id));
      setNotice('Update deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete update.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
          <BellRing size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Product Updates</h2>
          <p className="mt-1 text-sm text-slate-400">Announcements, improvements, fixes, and maintenance notes.</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <Megaphone size={17} className="text-indigo-300" />
          <h3 className="text-sm font-bold text-white">Publish an update</h3>
        </div>
        <form onSubmit={handlePublish} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="update-title" className="mb-1.5 block text-xs font-medium text-slate-300">Title</label>
              <input
                id="update-title"
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Attendance history improvements"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="update-category" className="mb-1.5 block text-xs font-medium text-slate-300">Category</label>
              <select
                id="update-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as UpdateCategory)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
              >
                <option value="announcement">Announcement</option>
                <option value="feature">New feature</option>
                <option value="fix">Bug fix</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="update-body" className="mb-1.5 block text-xs font-medium text-slate-300">Details</label>
            <textarea
              id="update-body"
              required
              maxLength={5000}
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Describe what changed and anything users need to know..."
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-right text-[11px] text-slate-500">{body.length}/5000</p>
          </div>
          <div>
            <label htmlFor="update-admin-password" className="mb-1.5 block text-xs font-medium text-slate-300">Admin password</label>
            <input
              id="update-admin-password"
              required
              type="password"
              autoComplete="current-password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="Password configured on the server"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500 sm:max-w-md"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">Set UPDATE_ADMIN_PASSWORD in your server environment. The password is not saved in the browser.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={publishing || !adminPassword.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
              {publishing ? 'Publishing…' : 'Publish update'}
            </button>
            {notice && <span role="status" className="text-xs text-emerald-300">{notice}</span>}
          </div>
        </form>
        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <CircleAlert size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Published updates</h3>
            <p className="mt-1 text-xs text-slate-500">{updates.length} {updates.length === 1 ? 'update' : 'updates'}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadUpdates()}
            disabled={loading}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
            <LoaderCircle size={16} className="animate-spin" /> Loading updates…
          </div>
        ) : updates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-10 text-center">
            <BellRing size={24} className="mx-auto text-slate-500" />
            <p className="mt-3 text-sm font-semibold text-slate-300">No updates published yet</p>
            <p className="mt-1 text-xs text-slate-500">Published announcements will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {updates.map((update) => (
              <article key={update.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${categoryStyles[update.category] || categoryStyles.announcement}`}>
                        {update.category}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                        <CalendarDays size={12} />
                        {new Date(update.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <h4 className="text-base font-semibold text-white">{update.title}</h4>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{update.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(update.id)}
                    disabled={!adminPassword.trim()}
                    title="Enter the admin password above to delete an update"
                    className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {notice && <p role="status" className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={14} />{notice}</p>}
      </section>
    </div>
  );
}
