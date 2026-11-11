import type { Metadata } from 'next';
import { Bullets, LegalPage, Section } from '@/components/LegalPage';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: `Privacy Policy — ${SITE.name}`,
  description: `How ${SITE.name} stores your account, your photos and who you share them with.`,
};

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy" accent="policy" updated={SITE.updated}>
      <Section title="The short version">
        <p>
          {SITE.name} is a private photo library. Your photos are visible to you and to the people you
          explicitly share them with. We don&apos;t run ads, we don&apos;t use third-party analytics, and we
          don&apos;t sell or rent your data to anyone.
        </p>
      </Section>

      <Section title="Who runs this">
        <p>
          {SITE.name} is a small, independent project run by an individual, not a company. It&apos;s
          currently offered free of charge as a test with friends. For any privacy question or request,
          email <a className="underline decoration-fg/30 underline-offset-2 transition hover:text-fg" href={`mailto:${SITE.contact}`}>{SITE.contact}</a>.
        </p>
      </Section>

      <Section title="What we collect">
        <p>Only what the app needs to work:</p>
        <Bullets
          items={[
            <>
              <strong className="font-medium text-fg">Account details.</strong> Your email address and a
              password. Passwords are hashed by our authentication provider — we never see or store the
              password itself.
            </>,
            <>
              <strong className="font-medium text-fg">Your photos.</strong> The files you upload, their
              filenames and sizes, and a SHA-256 fingerprint of each file that lets us reject duplicate
              uploads and enforce the sharing limit.
            </>,
            <>
              <strong className="font-medium text-fg">Sharing records.</strong> Which account each photo
              is shared with, and the lifetime list of people a photo has ever been shared with.
            </>,
            <>
              <strong className="font-medium text-fg">Usage figures.</strong> How much storage your
              account is using, so the quota can be enforced.
            </>,
            <>
              <strong className="font-medium text-fg">Data on this device.</strong> Your login session,
              and your theme, grid density and delete-confirmation preferences, kept in your
              browser&apos;s local storage.
            </>,
            <>
              <strong className="font-medium text-fg">Basic server logs.</strong> Our hosting providers
              record requests (IP address, browser type, timestamps) for security and abuse prevention.
            </>,
          ]}
        />
      </Section>

      <Section title="What we don't collect">
        <Bullets
          items={[
            'No advertising identifiers, tracking pixels or third-party analytics.',
            'No contact-list or address-book access — you type or pick a friend yourself.',
            'No location data, and no access to photos you haven’t chosen to upload.',
            'We do not sell, rent or trade personal data.',
          ]}
        />
      </Section>

      <Section title="How sharing works">
        <p>
          Each photo has its own recipient list. A photo appears in a friend&apos;s library only while you
          have it shared with them; removing them takes it out of their library. Access is enforced in the
          database, and photo files are served through links that expire after five minutes.
        </p>
        <p>
          Sharing gives someone access — it can&apos;t control what they do with it. A recipient can
          download or screenshot a photo while it&apos;s shared with them, and we can&apos;t take that copy
          back. Shared photos count against the uploader&apos;s storage, not the recipient&apos;s.
        </p>
      </Section>

      <Section title="Who processes data for us">
        <p>We use three infrastructure providers, who handle data only on our instructions:</p>
        <Bullets
          items={[
            'Supabase — accounts and database.',
            'Cloudflare (R2) — storage of the photo files.',
            'Vercel — hosting and delivery of the app.',
          ]}
        />
        <p>
          These providers may process data outside your country, including in the United States. Data is
          transmitted over HTTPS.
        </p>
      </Section>

      <Section title="How long we keep it">
        <Bullets
          items={[
            'Photos stay until you delete them or delete your account. Deleting a photo removes the file from storage and its record from the database.',
            'After a photo is deleted we keep a record of its fingerprint and who it was shared with, with no image and no filename. That record is what stops deleting and re-uploading from resetting the lifetime sharing limit.',
            'Account details stay until the account is deleted.',
            'Server logs are kept by our providers for a short period and then discarded.',
          ]}
        />
      </Section>

      <Section title="Your choices and rights">
        <p>
          You can delete any photo from the photo viewer at any time. Account deletion isn&apos;t
          self-service yet — email{' '}
          <a className="underline decoration-fg/30 underline-offset-2 transition hover:text-fg" href={`mailto:${SITE.contact}`}>{SITE.contact}</a>{' '}
          from the address on the account and we&apos;ll delete the account, its photos and its records.
          We may ask you to confirm you own the account first.
        </p>
        <p>
          Depending on where you live you may have further rights — to access a copy of your data, correct
          it, delete it, restrict or object to processing, or receive it in a portable format. You can
          exercise any of them by emailing us, and you can complain to your local data-protection
          authority. We don&apos;t sell personal information as defined by California law.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Photos sit in a private storage bucket, reachable only through short-lived signed links, and
          database access is restricted row by row so you can only see your own photos and the ones shared
          with you. Privileged keys live only on the server. No service is perfectly secure, but if a
          breach ever affects your data we&apos;ll tell you and the relevant authorities without undue
          delay.
        </p>
      </Section>

      <Section title="Children">
        <p>
          {SITE.name} isn&apos;t intended for children. You must be at least 13 years old to use it, and
          old enough to consent to data processing where you live. If you believe a child has created an
          account, email us and we&apos;ll remove it.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy as the app changes. The date at the top always shows the current
          version, and significant changes will be announced in the app before they take effect.
        </p>
      </Section>
    </LegalPage>
  );
}
