'use client';
import { serif } from '@/lib/fonts';
import { usePrefs, type Prefs } from '@/lib/prefs';
import { label, panel, pillGhost } from '@/lib/ui';

function Segmented<T extends string>({ value, options, onChange, name }: { value: T; options: [T, string][]; onChange: (v: T) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-full border border-fg/10 bg-fg/[0.04] p-1">
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${value === v ? 'bg-fg text-bg' : 'text-fg/60 hover:text-fg'}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, name }: { checked: boolean; onChange: (v: boolean) => void; name: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={name} onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-fg/20'}`}>
      <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function Setting({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-fg/50">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className={`${label} mb-3 text-fg/50`}>{title}</h3>
      <div className={`${panel} divide-y divide-fg/10`}>{children}</div>
    </section>
  );
}

export function SettingsView() {
  const { prefs, set, reset } = usePrefs();
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-tight">
          <span className={`${serif.className} font-normal italic`}>Settings</span>
        </h2>
        <p className="mt-3 text-sm text-fg/50">Saved on this device.</p>
      </div>

      <Group title="Appearance">
        <Setting title="Theme" hint="System follows your device's light or dark setting.">
          <Segmented name="Theme" value={prefs.theme} onChange={(theme: Prefs['theme']) => set({ theme })}
            options={[['system', 'System'], ['dark', 'Dark'], ['light', 'Light']]} />
        </Setting>
        <Setting title="Photo grid" hint="Compact fits more photos on screen.">
          <Segmented name="Photo grid" value={prefs.density} onChange={(density: Prefs['density']) => set({ density })}
            options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} />
        </Setting>
      </Group>

      <Group title="Safety">
        <Setting title="Confirm before deleting" hint="Ask first when deleting a photo. Deleting removes it for everyone it was shared with.">
          <Toggle name="Confirm before deleting" checked={prefs.confirmDelete} onChange={(confirmDelete) => set({ confirmDelete })} />
        </Setting>
      </Group>

      <button className={pillGhost} onClick={reset}>Reset to defaults</button>
    </div>
  );
}
