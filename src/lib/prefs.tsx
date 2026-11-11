'use client';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

export type Theme = 'system' | 'dark' | 'light';
export type Prefs = { theme: Theme; density: 'comfortable' | 'compact'; confirmDelete: boolean };

export const DEFAULT_PREFS: Prefs = { theme: 'dark', density: 'comfortable', confirmDelete: true };
const KEY = 'tandem-prefs'; // keep in sync with the inline script in app/layout.tsx

function read(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULT_PREFS; }
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

const Ctx = createContext<{ prefs: Prefs; set: (p: Partial<Prefs>) => void; reset: () => void } | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(read);

  const save = useCallback((next: Prefs) => {
    setPrefs(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  // Apply before paint. Also re-applies after React Strict Mode's dev remount clears <html> attributes.
  useLayoutEffect(() => {
    applyTheme(prefs.theme);
    if (prefs.theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [prefs.theme]);

  // Stay in sync if another tab changes the settings.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setPrefs(read()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <Ctx.Provider value={{ prefs, set: (p) => save({ ...prefs, ...p }), reset: () => save(DEFAULT_PREFS) }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePrefs() {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return c;
}
