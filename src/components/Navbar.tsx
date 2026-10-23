export type TabId =
  | 'dashboard'
  | 'portal'
  | 'batches'
  | 'approved-creatives'
  | 'passwords'
  | 'late-absent'
  | 'manual'
  | 'history'
  | 'cron'
  | 'settings'
  | 'updates';

interface NavbarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onQuickClockIn: () => void;
  isClockingIn: boolean;
  enabledAccountsCount?: number;
}

export function Navbar({
  activeTab,
  onSelectTab,
  onQuickClockIn,
  isClockingIn,
  enabledAccountsCount = 1,
}: NavbarProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold tracking-tight text-sm">
            KA
          </div>
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('dashboard');
            }}
            className="text-base font-bold tracking-tight text-white whitespace-nowrap hover:text-indigo-300 transition-colors"
          >
            KAIA Ops &amp; Automator
          </a>
        </div>

        {/* Zone 2: Concise Nav Links */}
        <nav className="hidden lg:flex items-center gap-4 text-xs font-medium">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'dashboard'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => onSelectTab('portal')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'portal'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-indigo-300 hover:text-indigo-200 font-semibold'
            }`}
          >
            Admin Portal (All Access)
          </button>
          <button
            onClick={() => onSelectTab('batches')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'batches'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-emerald-300 hover:text-emerald-200'
            }`}
          >
            Batches &amp; Ratings
          </button>
          <button
            onClick={() => onSelectTab('approved-creatives')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'approved-creatives'
                ? 'text-white border-b-2 border-teal-400 font-semibold'
                : 'text-teal-300 hover:text-teal-200 font-semibold'
            }`}
          >
            Approved Creatives
          </button>
          <button
            onClick={() => onSelectTab('passwords')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'passwords'
                ? 'text-white border-b-2 border-amber-400 font-semibold'
                : 'text-amber-300 hover:text-amber-200 font-semibold'
            }`}
          >
            Emails &amp; Passwords
          </button>
          <button
            onClick={() => onSelectTab('late-absent')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'late-absent'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Late &amp; Absent
          </button>
          <button
            onClick={() => onSelectTab('manual')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'manual'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Manual Clock-In
          </button>
          <button
            onClick={() => onSelectTab('history')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'history'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Attendance History
          </button>
          <button
            onClick={() => onSelectTab('cron')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'cron'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cron &amp; Webhooks
          </button>
          <button
            onClick={() => onSelectTab('settings')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'settings'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Config &amp; Credentials
          </button>
          <button
            onClick={() => onSelectTab('updates')}
            className={`whitespace-nowrap transition-colors py-1 cursor-pointer ${
              activeTab === 'updates'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Updates
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onQuickClockIn}
            disabled={isClockingIn}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 rounded-lg transition-all shadow-sm flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isClockingIn ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Pushing Attendance...</span>
              </>
            ) : (
              <span>
                {enabledAccountsCount > 1
                  ? `Clock In All (${enabledAccountsCount})`
                  : 'Clock In for Today'}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Tab Navigation Strip */}
      <div className="flex lg:hidden items-center overflow-x-auto border-t border-slate-800/80 px-4 py-2 gap-4 text-xs font-medium text-slate-400">
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`whitespace-nowrap ${activeTab === 'dashboard' ? 'text-indigo-400 font-semibold' : ''}`}
        >
          Dashboard
        </button>
        <button
          onClick={() => onSelectTab('portal')}
          className={`whitespace-nowrap ${activeTab === 'portal' ? 'text-indigo-400 font-semibold' : 'text-indigo-300 font-semibold'}`}
        >
          Admin Portal (All Access)
        </button>
        <button
          onClick={() => onSelectTab('batches')}
          className={`whitespace-nowrap ${activeTab === 'batches' ? 'text-indigo-400 font-semibold' : 'text-emerald-300'}`}
        >
          Batches &amp; Ratings
        </button>
        <button
          onClick={() => onSelectTab('approved-creatives')}
          className={`whitespace-nowrap ${activeTab === 'approved-creatives' ? 'text-teal-400 font-semibold' : 'text-teal-300 font-semibold'}`}
        >
          Approved Creatives
        </button>
        <button
          onClick={() => onSelectTab('passwords')}
          className={`whitespace-nowrap ${activeTab === 'passwords' ? 'text-amber-400 font-semibold' : 'text-amber-300 font-semibold'}`}
        >
          Emails &amp; Passwords
        </button>
        <button
          onClick={() => onSelectTab('late-absent')}
          className={`whitespace-nowrap ${activeTab === 'late-absent' ? 'text-indigo-400 font-semibold' : 'text-slate-300'}`}
        >
          Late &amp; Absent
        </button>
        <button
          onClick={() => onSelectTab('manual')}
          className={`whitespace-nowrap ${activeTab === 'manual' ? 'text-indigo-400 font-semibold' : ''}`}
        >
          Manual
        </button>
        <button
          onClick={() => onSelectTab('history')}
          className={`whitespace-nowrap ${activeTab === 'history' ? 'text-indigo-400 font-semibold' : ''}`}
        >
          History
        </button>
        <button
          onClick={() => onSelectTab('cron')}
          className={`whitespace-nowrap ${activeTab === 'cron' ? 'text-indigo-400 font-semibold' : ''}`}
        >
          Cron
        </button>
        <button
          onClick={() => onSelectTab('settings')}
          className={`whitespace-nowrap ${activeTab === 'settings' ? 'text-indigo-400 font-semibold' : ''}`}
        >
          Config
        </button>
        <button
          onClick={() => onSelectTab('updates')}
          className={`whitespace-nowrap ${activeTab === 'updates' ? 'text-indigo-400 font-semibold' : ''}`}
        >
          Updates
        </button>
      </div>
    </header>
  );
}
