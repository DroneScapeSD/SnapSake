import Link from 'next/link';
import { sans, serif } from '@/lib/fonts';
import { Footer } from './Footer';

export function LegalPage({ title, accent, updated, children }: {
  title: string;
  accent: string; // the serif italic word in the headline
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${sans.className} flex min-h-screen flex-col bg-bg text-fg`}>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 md:px-8 md:py-16">
        <Link href="/" className="text-xs uppercase tracking-[0.2em] text-fg/45 transition hover:text-fg">
          ← Back to {title === 'Privacy' ? 'Tandem' : 'Tandem'}
        </Link>

        <header className="mt-8 border-b border-fg/10 pb-8">
          <h1 className="text-[clamp(2.5rem,7vw,4.5rem)] font-semibold leading-none tracking-tight">
            {title} <span className={`${serif.className} font-normal italic`}>{accent}</span>
          </h1>
          <p className="mt-4 text-sm text-fg/45">Last updated {updated}</p>
        </header>

        <div className="mt-10 space-y-10">{children}</div>
      </main>

      <Footer />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section id={title.toLowerCase().replace(/[^a-z0-9]+/g, '-')} className="space-y-3">
      <h2 className="text-xs uppercase tracking-[0.2em] text-fg/50">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-fg/70">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-fg/25">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}
