'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { PrefsProvider } from '@/lib/prefs';
import { useFriends } from '@/lib/friends';
import { useProfile } from '@/lib/profile';
import { sans, serif } from '@/lib/fonts';
import { APP, field, label, pillGhost, pillPrimary } from '@/lib/ui';
import { Icon } from '@/components/icons';
import { Sidebar, VIEWS, VIEW_TITLES, type View } from '@/components/Sidebar';
import { PhotosView } from '@/components/PhotosView';
import { FriendsView } from '@/components/FriendsView';
import { SettingsView } from '@/components/SettingsView';
import { AccountView } from '@/components/AccountView';

const initialView = (): View => {
  if (typeof window === 'undefined') return 'photos';
  const h = location.hash.slice(1) as View;
  return VIEWS.includes(h) ? h : 'photos';
};

export default function Page() {
  return <PrefsProvider><Home /></PrefsProvider>;
}

function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [toast, setToast] = useState('');
  const [view, setView] = useState<View>(initialView);
  const [navOpen, setNavOpen] = useState(false);
  const uid = user?.id ?? null;
  const friends = useFriends(uid);
  const profile = useProfile(uid);

  const say = (m: string) => { if (!m) return; setToast(m); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setReady(true); });
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => l.subscription.unsubscribe();
  }, []);

  function go(v: View) {
    setView(v); setNavOpen(false);
    history.replaceState(null, '', `#${v}`); // so a refresh stays on the same section
  }

  async function auth(signup: boolean) {
    const { error } = signup ? await supabase.auth.signUp({ email, password: pw }) : await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) say(error.message);
  }
  const logout = () => supabase.auth.signOut();

  if (!ready) return null;

  const toastEl = toast && (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-fg px-5 py-2.5 text-sm font-medium text-bg shadow-lg">{toast}</div>
  );

  if (!user) return (
    <main className={`${sans.className} relative min-h-screen overflow-hidden bg-bg text-fg`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_0%,rgba(245,166,35,0.16),transparent_70%),radial-gradient(50%_40%_at_0%_100%,rgba(99,102,241,0.12),transparent_70%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 md:grid-cols-[1.2fr_1fr]">
        <section>
          <p className={`${label} text-fg/50`}>{APP}</p>
          <h1 className="mt-6 text-[clamp(2.75rem,8vw,6rem)] font-semibold leading-[0.95] tracking-tight">
            Your photos.<br />
            <span className={`${serif.className} font-normal italic text-accent-text`}>Shared</span> on purpose.
          </h1>
          <p className="mt-6 max-w-md text-lg text-fg/60">
            A private photo library. Send any photo to exactly the friends you choose, no group chats needed.
          </p>
        </section>
        <section>
          <div className="rounded-3xl border border-fg/10 bg-fg/[0.03] p-8 backdrop-blur">
            <h2 className="text-2xl font-semibold tracking-tight">Welcome</h2>
            <p className="mt-1 text-sm text-fg/50">Log in or create an account.</p>
            <div className="mt-6 space-y-3">
              <input className={field} type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className={field} type="password" autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && auth(false)} />
              <button className={`${pillPrimary} w-full`} onClick={() => auth(false)}>Log in</button>
              <button className={`${pillGhost} w-full`} onClick={() => auth(true)}>Create account</button>
            </div>
          </div>
        </section>
      </div>
      {toastEl}
    </main>
  );

  return (
    <div className={`${sans.className} min-h-screen bg-bg text-fg`}>
      <Sidebar
        view={view} onNavigate={go} open={navOpen} onClose={() => setNavOpen(false)}
        badges={{ friends: friends.incoming.length }}
        used={profile.used} email={user.email ?? ''} onLogout={logout}
      />

      <div className="md:pl-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-fg/10 bg-bg/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <button aria-label="Open menu" className="flex h-9 w-9 items-center justify-center rounded-full text-fg/70 transition hover:bg-fg/10 hover:text-fg" onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <span className="text-sm font-semibold uppercase tracking-[0.25em]">{VIEW_TITLES[view]}</span>
          {friends.incoming.length > 0 && view !== 'friends' && <span className="ml-auto h-2 w-2 rounded-full bg-accent" aria-label="Pending friend requests" />}
        </header>

        <main className="mx-auto max-w-6xl px-5 py-10">
          <PhotosView uid={user.id} active={view === 'photos'} say={say} onChanged={profile.refresh} />
          {view === 'friends' && <FriendsView friends={friends} say={say} />}
          {view === 'settings' && <SettingsView />}
          {view === 'account' && <AccountView user={user} tier={profile.tier} used={profile.used} friendCount={friends.friends.length} say={say} onLogout={logout} />}
        </main>
      </div>
      {toastEl}
    </div>
  );
}
