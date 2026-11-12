'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { PrefsProvider } from '@/lib/prefs';
import { useFriends } from '@/lib/friends';
import { captureAlbumInvite, clearPendingAlbum, getPendingAlbum, useAlbums } from '@/lib/albums';
import { useProfile } from '@/lib/profile';
import { captureReferral, clearReferral, getReferral } from '@/lib/referral';
import { checkUsername, handle, normalizeUsername } from '@/lib/username';
import { sans, serif } from '@/lib/fonts';
import { APP, field, label, pillGhost, pillPrimary } from '@/lib/ui';
import { Icon } from '@/components/icons';
import { Sidebar, VIEWS, VIEW_TITLES, type View } from '@/components/Sidebar';
import { PhotosView, type PhotoTab } from '@/components/PhotosView';
import { FriendsView } from '@/components/FriendsView';
import { SettingsView } from '@/components/SettingsView';
import { AccountView } from '@/components/AccountView';
import { AdminView } from '@/components/AdminView';
import { SITE } from '@/lib/site';
import { Footer } from '@/components/Footer';

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
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [who, setWho] = useState(''); // log in: username or email
  const [username, setUsername] = useState(''); // sign up
  const [email, setEmail] = useState(''); // sign up
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(''); // a username the server said is already in use
  const [toast, setToast] = useState('');
  const [view, setView] = useState<View>(initialView);
  const [navOpen, setNavOpen] = useState(false);
  const [photoTab, setPhotoTab] = useState<PhotoTab>('mine');
  const [invite, setInvite] = useState(false); // opened an album link while logged out
  const [invitedBy, setInvitedBy] = useState(''); // opened a friend's ?ref= invite link while logged out
  const uid = user?.id ?? null;
  const friends = useFriends(uid);
  const albums = useAlbums(uid);
  const profile = useProfile(uid);
  const isAdmin = profile.username === SITE.adminUsername; // only shows the tab; every admin request is re-checked on the server
  const shownView: View = view === 'admin' && !isAdmin ? 'photos' : view; // anyone else who lands on #admin just sees Photos

  const say = (m: string) => { if (!m) return; setToast(m); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      captureReferral(); // remembers a ?ref=<username> invite link
      const ref = getReferral();
      if (ref) { setInvitedBy(ref); setMode('signup'); }
      captureAlbumInvite(); // remembers a ?join=<token> album link until we know who is logged in
      setInvite(!!getPendingAlbum());
      setUser(data.session?.user ?? null); setReady(true);
    });
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => l.subscription.unsubscribe();
  }, []);

  // Once logged in, tell the server who invited this person (counts toward the inviter's free upgrade).
  useEffect(() => {
    if (!uid) return;
    const ref = getReferral();
    if (!ref) return;
    clearReferral();
    supabase.rpc('claim_referral', { p_username: ref }).then(() => {});
  }, [uid]);

  // Once logged in, use any pending album link: join the album and open it.
  useEffect(() => {
    if (!uid) return;
    const token = getPendingAlbum();
    if (!token) return;
    clearPendingAlbum(); // clear first so a re-render can't join twice
    albums.join(token).then(({ album, error }) => {
      setInvite(false);
      if (error || !album) return say(error ?? 'Could not open this album link');
      say(`Joined album "${album.name}"`);
      albums.setOpenId(album.id); setPhotoTab('albums'); go('photos');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  function go(v: View) {
    setView(v); setNavOpen(false);
    history.replaceState(null, '', `#${v}`); // so a refresh stays on the same section
  }

  // Log in with a username (the @ is optional) or, as a fallback, an email address.
  async function login() {
    const id = who.trim().replace(/^@/, '');
    if (!id || !pw) return say('Enter your username and password');
    setBusy(true);
    try {
      if (id.includes('@')) { // an email address; usernames can never contain @
        const { error } = await supabase.auth.signInWithPassword({ email: id, password: pw });
        if (error) say(error.message);
        return;
      }
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: id, password: pw }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return say(out.error ?? 'Could not log in');
      const { error } = await supabase.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token });
      if (error) say(error.message);
    } finally { setBusy(false); }
  }

  // Looks the name up on blur, so people hear "taken" before they fill in the rest.
  async function checkTaken() {
    const n = normalizeUsername(username);
    if (checkUsername(n)) return;
    const { data } = await supabase.rpc('username_available', { p_username: n });
    setTaken(data === false ? n : '');
  }

  async function signup() {
    const bad = checkUsername(username);
    if (bad) return say(bad);
    if (!email.trim()) return say('Enter your email address');
    if (!pw) return say('Choose a password');
    const name = normalizeUsername(username);
    setBusy(true);
    try {
      const { data: free, error: lookup } = await supabase.rpc('username_available', { p_username: name });
      if (lookup) return say(lookup.message);
      if (free === false) { setTaken(name); return say(`${handle(name)} is already taken`); }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { username: name } } });
      if (error) return say(/database error/i.test(error.message) ? `${handle(name)} was just taken. Try another username` : error.message);
      if (!data.session) say('Check your email to confirm your account, then log in');
    } finally { setBusy(false); }
  }

  const signingUp = mode === 'signup';
  const switchMode = () => { setMode(signingUp ? 'login' : 'signup'); setPw(''); };
  const nameProblem = username && (checkUsername(username) ?? (taken === normalizeUsername(username) ? `${handle(taken)} is already taken` : null));
  const logout = () => supabase.auth.signOut();

  // Before the session check finishes, render the public landing page instead of nothing, so crawlers and
  // link previews get real content in the server HTML. The login card is a same-sized placeholder (no flash of inputs).
  if (!ready) return <Landing card={<div aria-hidden className="h-[26rem] rounded-3xl border border-fg/10 bg-fg/[0.03]" />} />;

  const toastEl = toast && (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-fg px-5 py-2.5 text-sm font-medium text-bg shadow-lg">{toast}</div>
  );

  if (!user) return (
    <Landing toast={toastEl} card={(
          <div className="rounded-3xl border border-fg/10 bg-fg/[0.03] p-8 backdrop-blur">
            <h2 className="text-2xl font-semibold tracking-tight">{signingUp ? 'Create your account' : 'Welcome'}</h2>
            <p className="mt-1 text-sm text-fg/50">{signingUp ? 'Pick a username, then add your email and a password.' : 'Log in with your username or email.'}</p>
            {invitedBy && <p className="mt-4 rounded-xl bg-accent/15 px-4 py-3 text-sm text-accent-text">{handle(invitedBy)} invited you to {APP}. Create an account and upload a photo to help them unlock a free upgrade.</p>}
            {invite && <p className="mt-4 rounded-xl bg-accent/15 px-4 py-3 text-sm text-accent-text">Someone shared an album with you. Log in or create an account to open it.</p>}
            <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); if (!busy) (signingUp ? signup() : login()); }}>
              {signingUp ? (
                <>
                  <div>
                    <div className="relative">
                      <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-fg/40">@</span>
                      <input className={`${field} !pl-9`} type="text" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="username" aria-label="Username"
                        value={username} onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))} onBlur={checkTaken} />
                    </div>
                    <p className={`mt-1.5 px-1 text-xs ${nameProblem ? 'text-red-500' : 'text-fg/40'}`}>{nameProblem || 'At least 3 characters. Letters and numbers only.'}</p>
                  </div>
                  <input className={field} type="email" name="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <input className={field} type="password" name="password" autoComplete="new-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
                </>
              ) : (
                <>
                  <input className={field} type="text" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Username or email" aria-label="Username or email"
                    value={who} onChange={(e) => setWho(e.target.value)} />
                  <input className={field} type="password" name="password" autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
                </>
              )}
              <button type="submit" className={`${pillPrimary} w-full`} disabled={busy}>{signingUp ? 'Create account' : 'Log in'}</button>
              <button type="button" className={`${pillGhost} w-full`} onClick={switchMode}>{signingUp ? 'I already have an account' : 'Create account'}</button>
            </form>
          </div>
    )} />
  );

  return (
    <div className={`${sans.className} min-h-screen max-w-full overflow-x-clip bg-bg text-fg`}>
      <Sidebar
        view={shownView} onNavigate={go} open={navOpen} onClose={() => setNavOpen(false)}
        badges={{ friends: friends.incoming.length }}
        used={profile.used} quota={profile.quota} isAdmin={isAdmin} username={profile.username} onLogout={logout}
      />

      <div className="flex min-h-screen min-w-0 flex-col md:pl-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-fg/10 bg-bg/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <button aria-label="Open menu" className="flex h-9 w-9 items-center justify-center rounded-full text-fg/70 transition hover:bg-fg/10 hover:text-fg" onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <span className="text-sm font-semibold uppercase tracking-[0.25em]">{VIEW_TITLES[shownView]}</span>
          {friends.incoming.length > 0 && shownView !== 'friends' && <span className="ml-auto h-2 w-2 rounded-full bg-accent" aria-label="Pending friend requests" />}
        </header>

        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-5 py-10">
          <PhotosView uid={user.id} active={shownView === 'photos'} say={say} onChanged={profile.refresh} friends={friends.friends} onOpenFriends={() => go('friends')}
            tab={photoTab} onTab={setPhotoTab} albums={albums} used={profile.used} quota={profile.quota} tier={profile.tier} />
          {shownView === 'friends' && <FriendsView friends={friends} say={say} />}
          {shownView === 'settings' && <SettingsView />}
          {shownView === 'account' && <AccountView user={user} username={profile.username} tier={profile.tier} quota={profile.quota} used={profile.used} friendCount={friends.friends.length} say={say} onLogout={logout} onTierChange={profile.refresh} />}
          {shownView === 'admin' && <AdminView say={say} />}
        </main>
        <Footer />
      </div>
      {toastEl}
    </div>
  );
}


function Hero() {
  return (
    <section>
      <p className={`${label} text-fg/50`}>{APP}</p>
      <h1 className="mt-6 text-[clamp(2.75rem,8vw,6rem)] font-semibold leading-[0.95] tracking-tight">
        Your photos.<br />
        <span className={`${serif.className} font-normal italic text-accent-text`}>Shared</span> on purpose.
      </h1>
      <p className="mt-6 max-w-md text-lg text-fg/60">
        {APP} is a private photo library. Send any photo to exactly the friends you choose, no group chats needed.
      </p>
    </section>
  );
}

const STEPS = [
  { title: 'Upload to a private library', text: 'Your photos are visible only to you until you decide to share them.' },
  { title: 'Share with exactly who you choose', text: 'Send each photo to individual friends by username. You decide who sees what, photo by photo.' },
  { title: 'Make albums with a private link', text: 'Group photos into an album and let friends join through a link you can reset at any time.' },
];

// The logged-out page. Rendered on the server too (see the !ready branch), so everything outside the login card is crawlable text.
function Landing({ card, toast }: { card: React.ReactNode; toast?: React.ReactNode }) {
  return (
    <main className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-bg text-fg`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_0%,rgba(245,166,35,0.16),transparent_70%),radial-gradient(50%_40%_at_0%_100%,rgba(99,102,241,0.12),transparent_70%)]" />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-12 md:grid-cols-[1.2fr_1fr]">
        <Hero />
        <section>{card}</section>
      </div>
      <section aria-labelledby="how" className="relative mx-auto w-full max-w-6xl px-6 pb-16">
        <h2 id="how" className={`${label} text-fg/50`}>How {APP} works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((st, i) => (
            <li key={st.title} className="rounded-3xl border border-fg/10 bg-fg/[0.03] p-6">
              <span className="text-sm text-accent-text">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{st.title}</h3>
              <p className="mt-2 text-sm text-fg/60">{st.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <div className="flex-1" />
      <Footer className="relative" />
      {toast}
    </main>
  );
}
