import Link from 'next/link';
import { SITE } from '@/lib/site';

// Rendered at the bottom of every screen: the app shell, the login page, and the legal pages.
export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-fg/10 px-5 py-6 ${className}`}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-fg/40 sm:flex-row">
        <p>
          © {new Date().getFullYear()} {SITE.name}
        </p>
        <nav aria-label="Legal" className="flex items-center gap-5">
          <Link href="/privacy" className="transition hover:text-fg">Privacy Policy</Link>
          <Link href="/terms" className="transition hover:text-fg">Terms &amp; Conditions</Link>
        </nav>
      </div>
    </footer>
  );
}
