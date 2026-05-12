import { LegalLayout } from './LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="Updated May 12, 2026">
      <p>
        Spacetime ("Spacetime", "we", "us", or "our") builds a personal time and
        task tool. This Privacy Policy explains what we collect, how we use it,
        and the choices you have. It applies to the Spacetime web app, our iOS
        and Android apps, and the marketing site at launchspacetime.com
        (together, the "Service").
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Information We Collect</h2>
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
        <strong className="text-foreground">Subscription and purchase status.</strong>{' '}
        If you subscribe through the Apple App Store, we receive transaction
        identifiers and subscription status from Apple so we can grant and
        manage your access. We do not receive or store your payment card details.
      </p>
      <p>
        <strong className="text-foreground">Diagnostic and crash data.</strong>{' '}
        We keep an internal audit log of important account events (sign-in,
        sign-out, task creation, completion, deletion, restore) so you and we
        can investigate problems or recover from mistakes. We may also receive
        crash reports, basic performance metrics, and device metadata (OS,
        app version, locale) when something goes wrong.
      </p>
      <p>
        <strong className="text-foreground">What we do not collect.</strong>{' '}
        We do not run third-party advertising trackers inside the app. We do
        not sell or rent personal data. We do not use your content to train
        machine-learning models.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">How We Use Information</h2>
      <p>We use the information we collect to:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Provide, sync, and back up your Spacetime data across devices.</li>
        <li>Authenticate you and keep your account secure.</li>
        <li>Process and validate purchases and subscriptions.</li>
        <li>Send local notifications and reminders you configure inside the app.</li>
        <li>Diagnose crashes, prevent abuse, and improve reliability.</li>
        <li>Send transactional messages (e.g. password resets, account or
          billing notices). We do not send marketing email unless you opt in.</li>
        <li>Comply with legal obligations.</li>
      </ul>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Data Storage</h2>
      <p>
        Your account data and content are stored on infrastructure hosted in
        the United States, encrypted in transit (TLS) and at rest. We retain
        your data for as long as your account is active. When you delete your
        account, we permanently remove your content within 30 days, except
        where we must retain limited records to comply with legal obligations.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Third-Party Services</h2>
      <p>
        We share data only with infrastructure providers that operate the
        Service on our behalf, under contracts that limit their use of the
        data:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong className="text-foreground">Supabase</strong> — hosting, database, authentication, and edge functions (AWS infrastructure).</li>
        <li><strong className="text-foreground">Apple</strong> — App Store distribution, Apple Sign In, and in-app purchase processing.</li>
        <li><strong className="text-foreground">Google</strong> — Google Sign In authentication (optional).</li>
        <li><strong className="text-foreground">Email delivery</strong> — transactional message delivery.</li>
      </ul>
      <p>
        We may also disclose information if required by law, to protect the
        rights or safety of users, or in connection with a corporate
        transaction (in which case we will notify affected users).
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Purchases and Subscriptions</h2>
      <p>
        Spacetime offers auto-renewable subscriptions via the Apple App Store.
        Transactions are processed by Apple; we receive only transaction
        identifiers, product identifiers, and subscription status so we can
        grant and manage access. We do not receive or store your payment card
        details. Subscription management, cancellation, and refunds are
        governed by Apple's terms and policies.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Notifications</h2>
      <p>
        Spacetime uses local device notifications to deliver reminders and
        alerts you configure (e.g. task due times, routine reminders). These
        notifications are generated and stored on your device. We do not send
        push notifications from our servers except for time-sensitive account
        or billing notices, and only when you have an active subscription.
        You can disable notifications at any time in your device settings.
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

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Children's Privacy</h2>
      <p>
        Spacetime is not directed to children under 13 (or under 16 in the
        EEA), and we do not knowingly collect personal information from
        them. If you believe a child has given us personal information,
        contact us and we will delete it.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post
        the updated policy here and, for material changes, notify you in the
        app or by email. Continued use of the Service after the changes take
        effect means you accept the updated policy.
      </p>

      <h2 className="text-base font-medium mt-8 mb-2 text-foreground">Contact</h2>
      <p>
        Questions about this policy or our practices? Email{' '}
        <a href="mailto:support@launchspacetime.com" className="underline">
          support@launchspacetime.com
        </a>
        .
      </p>
    </LegalLayout>
  );
}
