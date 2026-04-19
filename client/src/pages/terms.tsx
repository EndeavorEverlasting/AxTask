import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare } from "lucide-react";
import { Link } from "wouter";

export default function TermsOfService() {
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
            <CardTitle className="text-2xl">Terms of Service</CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Last updated: April 18, 2026
            </p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h3 className="text-lg font-semibold">1. Acceptance of terms</h3>
              <p className="text-gray-600 dark:text-gray-300">
                By accessing or using AxTask, you agree to be bound by these
                Terms of Service and the{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                . If you do not agree to these terms, please do not use the
                service.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">2. Description of service</h3>
              <p className="text-gray-600 dark:text-gray-300">
                AxTask is a task management application with planner, calendar,
                shopping list, and checklist surfaces, a priority engine, a
                classification and archetype empathy layer, opt-in push
                reminders and adherence interventions, a collaboration inbox, a
                community forum, a rewards system (AxCoins) with avatar and
                skill progression, and data import / export tooling.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">3. Accounts and authentication</h3>
              <p className="text-gray-600 dark:text-gray-300">
                You are responsible for keeping your account credentials and
                any connected identity providers secure. You agree to provide
                accurate information when you create your account and to
                notify us promptly if you believe your account has been
                accessed without your permission. We recommend enabling
                TOTP-based multi-factor authentication and, where applicable,
                a verified phone for SMS or email one-time codes.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">4. User content</h3>
              <p className="text-gray-600 dark:text-gray-300">
                You retain ownership of the tasks, notes, classifications,
                feedback, community posts, and attachments you create in
                AxTask. You grant us a limited licence to store and process
                that content as needed to run the service for you: to
                synchronise it across your devices, to power your planner and
                priority suggestions, to run moderation on posted content, and
                to produce backup exports you request. You are responsible
                for ensuring that the content you upload does not violate the
                law or the rights of others.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">5. Acceptable use</h3>
              <p className="text-gray-600 dark:text-gray-300">
                You agree not to misuse the service. In particular, you will
                not attempt to probe, scan, or compromise the security of
                AxTask or its infrastructure; use the service to distribute
                malware, spam, or illegal content; interfere with other users'
                use of the service; or use automated tooling to scrape,
                reverse-engineer, or abuse the API outside what the product
                itself is designed to do.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">6. AxCoins and virtual rewards</h3>
              <p className="text-gray-600 dark:text-gray-300">
                AxCoins are an in-product engagement currency. They have{" "}
                <strong>no monetary value</strong>, cannot be purchased, cannot
                be exchanged for cash, and are not redeemable outside AxTask.
                AxCoins are earned through product interactions (completing
                tasks, contributing classifications, collaborating, opting
                into reminders, and so on) and can be spent on in-product
                rewards such as avatar packs and productivity unlocks.
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                On rare occasions the AxTask owner may credit AxCoins directly
                to an account as a goodwill gesture (for example, to make up
                for a verified bug). Those credits are recorded in an audit
                log as <code>owner_coin_grant</code> and are only available to
                a tightly allow-listed group of operator accounts. They are
                not a general admin power. We reserve the right to adjust
                earning rates, rewards catalogues, and economy rules at any
                time.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">7. AI-assisted features</h3>
              <p className="text-gray-600 dark:text-gray-300">
                AxTask uses heuristic and AI-assisted features for priority
                scoring, classification, archetype empathy cues, and planner
                suggestions. These features provide{" "}
                <em>recommendations</em>
                , not decisions. You remain responsible for what you do with
                your tasks and time. We do not guarantee the accuracy,
                appropriateness, or fitness for a particular purpose of any
                AI-generated suggestion.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">8. Community and moderation</h3>
              <p className="text-gray-600 dark:text-gray-300">
                When you post in the community forum or send messages through
                the collaboration inbox, automated and manual moderation apply.
                Posts that violate these terms, including harassment, hate
                speech, personal attacks, illegal content, or targeted abuse,
                may be hidden, edited for safety, or removed. Repeated
                violations may result in restrictions on posting or
                suspension of the account.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">9. Service availability</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We aim to keep AxTask available and performant but we do not
                guarantee uninterrupted access. Maintenance, deployments,
                upstream outages, or other factors may temporarily affect
                availability. AxTask is provided &ldquo;as is&rdquo; without
                warranties of any kind, to the fullest extent permitted by
                law.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">10. Limitation of liability</h3>
              <p className="text-gray-600 dark:text-gray-300">
                To the fullest extent permitted by law, AxTask and its
                operators are not liable for indirect, incidental, special,
                consequential, or punitive damages arising out of or relating
                to your use of the service, including loss of data, loss of
                profits, or loss of productivity, even if we have been advised
                of the possibility of such damages.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">11. Termination</h3>
              <p className="text-gray-600 dark:text-gray-300">
                You may stop using AxTask at any time. You may export your
                data first from the Import / Export page. If you would like
                your account and data permanently deleted, please contact us;
                we will verify your identity and then process the deletion.
                We may suspend or terminate accounts that violate these terms
                or that pose a risk to other users or to the integrity of the
                service.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">12. Changes to these terms</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We may update these terms from time to time. We will notify
                you of material changes by posting the updated terms on this
                page and updating the &ldquo;Last updated&rdquo; date above.
                Continued use of the service after changes take effect
                constitutes acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">13. Contact</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Questions about these terms? Reach out through the{" "}
                <Link href="/contact" className="text-primary hover:underline">
                  Contact
                </Link>{" "}
                page or the in-product feedback surface.
              </p>
            </section>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          <Link href="/privacy" className="hover:underline">
            Privacy Policy
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
