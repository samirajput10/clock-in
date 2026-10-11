export type TabId = 'dashboard' | 'manual' | 'history' | 'cron' | 'settings';

interface NavbarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onQuickClockIn: () => void;
  isClockingIn: boolean;
}

export function Navbar({
  activeTab,
  onSelectTab,
  onQuickClockIn,
  isClockingIn,
}: NavbarProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
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
            KAIA Attendance Automator
          </a>
        </div>

        {/* Zone 2: Concise Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`whitespace-nowrap transition-colors py-1 ${
              activeTab === 'dashboard'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => onSelectTab('manual')}
            className={`whitespace-nowrap transition-colors py-1 ${
              activeTab === 'manual'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Manual Clock-In
          </button>
          <button
            onClick={() => onSelectTab('history')}
            className={`whitespace-nowrap transition-colors py-1 ${
              activeTab === 'history'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Attendance History
          </button>
          <button
            onClick={() => onSelectTab('cron')}
            className={`whitespace-nowrap transition-colors py-1 ${
              activeTab === 'cron'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cron & Webhooks
          </button>
          <button
            onClick={() => onSelectTab('settings')}
            className={`whitespace-nowrap transition-colors py-1 ${
              activeTab === 'settings'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Config & Credentials
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
              <>
                <span>Clock In for Today</span>
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Mobile Tab Navigation Strip */}
      <div className="flex md:hidden items-center overflow-x-auto border-t border-slate-800/80 px-4 py-2 gap-4 text-xs font-medium text-slate-400">
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`whitespace-nowrap ${activeTab === 'dashboard' ? 'text-indigo-400 font-semibold' : ''}`}
        >
          Dashboard
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
      </div>
    </header>
  );
}
