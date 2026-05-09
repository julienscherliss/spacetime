import { LegalLayout } from './LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="Updated May 9, 2026">
      <p>
        Spacetime ("Spacetime", "we", "us", or "our") builds a personal time and
        task tool. This Privacy Policy explains what we collect, how we use it,
        and the choices you have. It applies to the Spacetime web app, our iOS
        and Android apps, and the marketing site at launchspacetime.com
        (together, the "Service").
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Information we collect</h2>
      <p>
        <strong className="text-foreground">Account information.</strong> When
        you sign up we collect your email address and an authentication
        identifier supplied by your sign-in provider (e.g. Apple, Google, or
        email/password). We do not see or store your provider password.
      </p>
      <p>
        <strong className="text-foreground">Content you create.</strong>{' '}
        Spacetime stores the tasks, routines, tags, notes, time entries,
        billing settings, and other content you enter so we can sync it across
        your devices. This content belongs to you.
      </p>
      <p>
        <strong className="text-foreground">Diagnostic and audit data.</strong>{' '}
        We keep an internal audit log of important account events (sign-in,
        sign-out, task creation, completion, deletion, restore) so you and we
        can investigate problems or recover from mistakes. Audit entries are
        scoped to your account and visible to you in Settings → Advanced →
        Debug. We may also receive crash reports and basic device metadata
        (OS, app version, locale) when something goes wrong.
      </p>
      <p>
        <strong className="text-foreground">What we do not collect.</strong>{' '}
        We do not run third-party analytics or advertising trackers inside the
        app. We do not sell or rent personal data. We do not use your content
        to train machine-learning models.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">How we use information</h2>
      <p>We use the information we collect to:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Provide, sync, and back up your Spacetime data across devices.</li>
        <li>Authenticate you and keep your account secure.</li>
        <li>Diagnose crashes, prevent abuse, and improve reliability.</li>
        <li>Send transactional messages (e.g. password resets, account or
          billing notices). We do not send marketing email unless you opt in.</li>
        <li>Comply with legal obligations.</li>
      </ul>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">How we share information</h2>
      <p>
        We share data only with infrastructure providers that operate the
        Service on our behalf, under contracts that limit their use of the
        data:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Hosting, database, authentication, and edge functions (Supabase, hosted on AWS).</li>
        <li>App distribution and crash reporting via Apple App Store and Google Play.</li>
        <li>Email delivery for transactional messages.</li>
      </ul>
      <p>
        We may also disclose information if required by law, to protect the
        rights or safety of users, or in connection with a corporate
        transaction (in which case we will notify affected users).
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Data retention and deletion</h2>
      <p>
        Tasks you delete are kept in "Recently Deleted" so you can restore
        them. You can permanently remove your entire account and all
        associated content at any time from Settings → Account → Delete
        Account. When you do, we delete your tasks, routines, tags, time
        entries, billing settings, library items, and authentication record
        within 30 days, except where we must retain limited records to
        comply with legal obligations.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Security</h2>
      <p>
        Data is encrypted in transit (TLS) and at rest. Database access is
        protected by row-level security so each account can only read and
        write its own rows. We follow least-privilege principles for internal
        access and review our security posture regularly. No system is
        perfectly secure; if we become aware of a breach affecting you we
        will notify you as required by law.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Your rights</h2>
      <p>
        Depending on where you live (including the EEA, UK, and California),
        you may have the right to access, correct, export, or delete your
        personal information, and to object to or restrict certain
        processing. You can exercise most of these rights directly in the
        app, or by emailing{' '}
        <a href="mailto:privacy@launchspacetime.com" className="underline">
          privacy@launchspacetime.com
        </a>
        . We will respond within the timeframe required by applicable law.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Children</h2>
      <p>
        Spacetime is not directed to children under 13 (or under 16 in the
        EEA), and we do not knowingly collect personal information from
        them. If you believe a child has given us personal information,
        contact us and we will delete it.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">International transfers</h2>
      <p>
        We are based in the United States and our infrastructure providers
        may process data in the United States and other countries. Where
        required, we rely on appropriate safeguards such as the EU Standard
        Contractual Clauses for international transfers.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post
        the updated policy here and, for material changes, notify you in the
        app or by email. Continued use of the Service after the changes take
        effect means you accept the updated policy.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Contact</h2>
      <p>
        Questions about this policy or our practices? Email{' '}
        <a href="mailto:privacy@launchspacetime.com" className="underline">
          privacy@launchspacetime.com
        </a>
        .
      </p>
    </LegalLayout>
  );
}