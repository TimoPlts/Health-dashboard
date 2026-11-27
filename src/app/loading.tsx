/** Shown while a page's server data loads (e.g. over Tailscale on a slow connection). No data, just the layout. */
export default function Loading() {
  return (
    <div className="loading-shell" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <header className="safe-top px-1 pb-4" aria-hidden="true">
        <div className="skeleton mb-2 h-3.5 w-32" />
        <div className="skeleton h-9 w-44 rounded-[14px]" />
      </header>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="glass glass-thick flex items-center justify-around px-4 py-6">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton size-[104px] rounded-full" />)}
        </div>
        <div className="glass flex flex-col gap-3 p-4">
          <div className="skeleton h-4 w-28" />
          <div className="skeleton h-24 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="glass flex flex-col gap-2 p-4"><div className="skeleton h-3.5 w-20" /><div className="skeleton h-7 w-16" /></div>)}
        </div>
      </div>
    </div>
  );
}
