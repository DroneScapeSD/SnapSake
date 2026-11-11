import type { Metadata } from 'next';
import { Bullets, LegalPage, Section } from '@/components/LegalPage';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: `Terms & Conditions — ${SITE.name}`,
  description: `The rules for using ${SITE.name}: your account, your photos, sharing limits and acceptable use.`,
};

export default function Terms() {
  return (
    <LegalPage title="Terms &" accent="conditions" updated={SITE.updated}>
      <Section title="Agreeing to these terms">
        <p>
          By creating an account or using {SITE.name}, you agree to these terms. If you don&apos;t agree,
          please don&apos;t use the app. These terms apply to everyone with an account, whether you upload
          photos or only receive them.
        </p>
      </Section>

      <Section title="What this service is">
        <p>
          {SITE.name} is a private photo library with per-photo sharing. Instead of posting into a group,
          you choose exactly which friends receive each photo, and it appears in their library too.
        </p>
        <p>
          The app is a small, independent project offered free of charge, currently in testing with
          friends. It is not a commercial service, and we don&apos;t promise any particular level of
          availability, uptime or support. Features, storage limits and sharing rules may change, and the
          service may be paused or discontinued.
        </p>
      </Section>

      <Section title="Your account">
        <Bullets
          items={[
            'Use an email address you actually control, and keep your password to yourself.',
            'You are responsible for activity that happens under your account.',
            'One account per person. Don’t create accounts on someone else’s behalf or share one between people.',
            'You must be at least 13 years old, and old enough to consent to these terms where you live.',
          ]}
        />
      </Section>

      <Section title="Your photos stay yours">
        <p>
          You keep all rights to the photos you upload. To run the service we need permission to store
          your files, keep the records that make sharing work, and deliver them to you and to the people
          you share them with — including resizing or re-encoding a copy so it loads quickly. That
          permission lasts only as long as the photo is in your library.
        </p>
        <p>
          Only upload photos you have the right to upload. Don&apos;t upload someone else&apos;s work
          without permission, and don&apos;t upload images of other people that they wouldn&apos;t expect
          to be shared.
        </p>
      </Section>

      <Section title="Sharing, and what it means">
        <Bullets
          items={[
            'Sharing adds a photo to a friend’s library. It is access, not a transfer — you keep the original.',
            'A recipient can download, copy or screenshot a photo while it is shared with them, and we cannot undo that.',
            'Shared photos count against your storage, not the recipient’s.',
            'The free plan allows a photo to be shared with at most 3 different people over its lifetime. Removing someone and adding them back does not free a slot.',
            'Limits are enforced by a fingerprint of the file, so deleting a photo and re-uploading the same image does not reset its sharing history.',
            'Photos are capped at 15 MB each and 3 GB per account. Re-uploading an identical file is rejected.',
          ]}
        />
        <p>
          Attempting to get around these limits — by altering files, abusing multiple accounts, or
          tampering with the app&apos;s requests — is a breach of these terms.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>Don&apos;t use {SITE.name} to store or share anything that is illegal, or to:</p>
        <Bullets
          items={[
            'upload sexual images of minors, or intimate images of someone without their consent;',
            'harass, threaten, stalk or expose someone’s private information;',
            'infringe copyright, trademarks or other rights;',
            'distribute malware, phishing links or spam;',
            'probe, scan, overload or attempt to break the service or other people’s accounts;',
            'scrape, mirror or bulk-download content you don’t have permission to access;',
            'resell the service or use it as storage for a commercial product.',
          ]}
        />
      </Section>

      <Section title="Removing content and accounts">
        <p>
          We may remove content or suspend an account that breaks these terms or puts the service or other
          people at risk, and we may report illegal content to the authorities. Where it&apos;s reasonable
          and possible, we&apos;ll tell you why. You can stop using the service at any time and ask us to
          delete your account.
        </p>
      </Section>

      <Section title="Keep your own copies">
        <p>
          {SITE.name} is a sharing tool, not a backup service. Don&apos;t rely on it as the only copy of
          anything important — keep the originals on your own device or in your own backup.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any
          kind, express or implied, including fitness for a particular purpose, accuracy or
          non-infringement. We don&apos;t guarantee that photos will always be available, that the service
          will be uninterrupted, or that data will never be lost.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the fullest extent the law allows, we are not liable for indirect, incidental, special or
          consequential losses, or for lost or corrupted photos, lost data, or loss of goodwill arising
          from your use of the service. Because the service is free, our total liability to you for any
          claim is limited to the amount you have paid us, which is zero. Nothing here limits rights you
          have under mandatory consumer law where you live.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of the country in which the operator of {SITE.name}{' '}
          resides, without regard to conflict-of-law rules. If any part of these terms is found
          unenforceable, the rest stays in effect.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We may update these terms as the app changes; the date at the top shows the current version, and
          continuing to use the app after a change means you accept it. Questions, complaints or takedown
          requests:{' '}
          <a className="underline decoration-fg/30 underline-offset-2 transition hover:text-fg" href={`mailto:${SITE.contact}`}>{SITE.contact}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
