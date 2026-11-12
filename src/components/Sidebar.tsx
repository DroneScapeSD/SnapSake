'use client';
import { APP, label, limitLabel, size } from '@/lib/ui';
import { serif } from '@/lib/fonts';
import { handle } from '@/lib/username';
import { Icon, type IconName } from './icons';

export type View = 'photos' | 'friends' | 'settings' | 'account' | 'admin';
export const VIEWS: View[] = ['photos', 'friends', 'settings', 'account', 'admin'];
export const VIEW_TITLES: Record<View, string> = { photos: 'Photos', friends: 'Friends', settings: 'Settings', account: 'Account', admin: 'Admin' };

const ICONS: Record<View, IconName> = { photos: 'photos', friends: 'friends', settings: 'settings', account: 'account', admin: 'admin' };

export function Sidebar({ view, onNavigate, open, onClose, badges, used, quota, isAdmin, username, onLogout }: {
  view: View;
  onNavigate: (v: View) => void;
  open: boolean; // mobile drawer state
  onClose: () => void;
  badges: Partial<Record<View, number>>;
  used: number;
  quota: number; // this person's storage limit in bytes
  isAdmin: boolean; // shows the Admin tab (cosmetic: the server decides who can really use it)
  username: string;
  onLogout: () => void;
}) {
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 100;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden" onClick={onClose} aria-hidden />}
      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-fg/10 bg-bg transition-transform duration-200 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-6 pb-6 pt-7">
          <h1 className={`${serif.className} text-3xl italic leading-none`}>{APP}</h1>
          <button aria-label="Close menu" className="flex h-8 w-8 items-center justify-center rounded-full text-fg/60 transition hover:bg-fg/10 hover:text-fg md:hidden" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {VIEWS.filter((v) => v !== 'admin' || isAdmin).map((v) => {
            const active = v === view;
            const n = badges[v];
            return (
              <button
                key={v}
                onClick={() => onNavigate(v)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${active ? 'bg-fg/[0.08] text-fg' : 'text-fg/55 hover:bg-fg/[0.05] hover:text-fg'}`}
              >
                {active && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />}
                <Icon name={ICONS[v]} />
                <span className="flex-1">{VIEW_TITLES[v]}</span>
                {!!n && <span aria-label={`${n} pending`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-black">{n}</span>}
              </button>
            );
          })}
        </nav>

        <div className="space-y-4 border-t border-fg/10 p-5">
          <div>
            <div className="flex justify-between text-[11px] text-fg/50"><span>Storage</span><span>{size(used)} / {limitLabel(quota)}</span></div>
            <div className="mt-1.5 h-[3px] rounded-full bg-fg/10"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-fg/45" title={username && handle(username)}>{username && handle(username)}</p>
            <button className={`${label} shrink-0 text-fg/60 transition hover:text-fg`} onClick={onLogout}>Log out</button>
          </div>
        </div>
      </aside>
    </>
  );
}
