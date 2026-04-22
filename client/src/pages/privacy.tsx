import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity"
          >
            <CheckSquare className="h-6 w-6" />
            <span className="text-xl font-bold">AxTask</span>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Privacy Policy</CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Last updated: April 18, 2026
            </p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h3 className="text-lg font-semibold">1. Information we collect</h3>
              <p className="text-gray-600 dark:text-gray-300">
                When you use AxTask, we collect the information you provide
                directly: your name or display name, email address, an optional
                phone number (only if you enable SMS-based verification), and
                the tasks, notes, shopping lists, classifications, feedback,
                and community posts you create in the product. If you sign in
                with Google, WorkOS, or Replit, we receive basic profile
                information (name, email, and profile picture where available)
                from those providers.
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                We also collect small amounts of engagement data that the
                product itself needs to function: AxCoin ledger entries,
                streak and avatar state, push-notification subscriptions you
                opt into, and archetype signals used for in-product empathy
                cues. Archetype signals are stored against a per-event hashed
                actor (HMAC-SHA256), not your user id, and the aggregated
                rollup tables never carry a user column.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">2. How we use your information</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We use your information to run AxTask: authenticating you,
                storing your tasks and related data, producing priority
                suggestions and planner insights, awarding and redeeming
                AxCoins, moderating the community forum you post in, and
                sending you the notifications you have opted into. We do not
                sell your personal data, and we do not use it to train external
                advertising models.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">3. Data storage and security</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Your data is stored in a managed PostgreSQL database. Passwords
                are hashed with scrypt using unique per-account salts. TOTP
                secrets used for multi-factor authentication are encrypted at
                rest with AES-256-GCM before they are written to the database.
                Sessions live server-side and are identified by a signed cookie;
                sensitive actions such as exporting your full account or using
                admin tooling require a recent MFA step-up in the same session.
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                Between your browser and AxTask, traffic uses industry-standard
                TLS (HTTPS) in production. Direct messages (DMs) use an{" "}
                <span className="text-foreground font-medium">explicit E2EE</span> mode: your
                browser encrypts the body before upload, and the server stores ciphertext only
                (see the operator-facing contract in{" "}
                <code className="text-xs">docs/E2EE_PRODUCT.md</code>). Other product areas such as
                tasks, non-DM collaboration notes, and community posts remain protected by access
                control and TLS unless a future release adds client-side encryption for those
                surfaces and documents it the same way.
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                If you use the optional video huddle page, the embedded meeting
                URL is supplied by your deployment; call encryption and
                retention are governed by that third-party provider, not by AxTask
                code.
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                Responses sent to your browser are shaped by explicit public
                serializers so we do not accidentally expose internal fields
                such as password hashes, raw OAuth ids, or other accounts'
                identifiers. Anything your browser receives for a signed-in
                session can be inspected in DevTools by you or anyone with
                access to your device, so you should treat your device
                security the same way you treat any productivity app.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">4. Third-party services</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We use Google OAuth, WorkOS, and (on the Replit-hosted
                preview) Replit authentication so you can sign in without a
                separate password. When you use those providers, their own
                privacy policies govern how they handle your profile
                information. AxTask only stores the fields it needs to identify
                your account (name, email, provider id). If you enable SMS or
                email OTP, delivery goes through a transactional provider; we
                do not share your phone number or email beyond what is
                required to deliver the one-time code.
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                When you paste images or link to external assets (for example
                in feedback, collab messages, or community posts), AxTask
                fetches them through a server-side proxy that applies SSRF,
                MIME, and size checks before storing them. GIF search is
                likewise proxied; the third-party GIF service does not receive
                your user id.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">5. Data sharing</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We do not sell, rent, or trade your personal information. Your
                tasks, notes, and planner data are private to your account
                unless you share them through the collaboration or community
                features. Content you post to the community forum is visible
                to other signed-in users and is subject to moderation.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">6. Your rights</h3>
              <p className="text-gray-600 dark:text-gray-300">
                You can access and update the personal information on your
                account at any time from the Settings, Profile, and Account pages. You
                can export your task data and, after an MFA step-up, a full
                account backup as JSON from the Import / Export page. If you
                would like us to permanently delete your account and
                associated data, please contact us; we will verify your
                identity before processing the request.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">7. Cookies and local storage</h3>
              <p className="text-gray-600 dark:text-gray-300">
                AxTask uses a session cookie to keep you signed in and a CSRF
                token to protect form submissions. We use browser local
                storage for non-sensitive preferences such as theme, remembered
                sign-in provider, and offline task queues. We do not use
                advertising or cross-site tracking cookies.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">8. Push notifications</h3>
              <p className="text-gray-600 dark:text-gray-300">
                If you opt in to push notifications, AxTask uses Web Push with
                VAPID keys to deliver reminders, streak nudges, and adherence
                interventions you have enabled. Your push-subscription
                endpoint is stored on a per-device basis and can be revoked at
                any time from the Settings page or your browser.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">9. Changes to this policy</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We may update this privacy policy from time to time. We will
                notify you of material changes by posting the new policy on
                this page and updating the &ldquo;Last updated&rdquo; date above.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">10. Contact</h3>
              <p className="text-gray-600 dark:text-gray-300">
                If you have questions about this privacy policy, please reach
                out through the <Link href="/contact" className="text-primary hover:underline">Contact</Link>{" "}
                page or the feedback surface inside the product.
              </p>
            </section>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          <Link href="/terms" className="hover:underline">
            Terms of Service
          </Link>
          <span className="mx-2" aria-hidden>
            &middot;
          </span>
          <Link href="/contact" className="hover:underline">
            Contact
          </Link>
        </p>
      </div>
    </div>
  );
}
