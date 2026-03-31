import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare } from "lucide-react";
import { Link } from "wouter";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity">
            <CheckSquare className="h-6 w-6" />
            <span className="text-xl font-bold">AxTask</span>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Terms of Service</CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last updated: March 31, 2026</p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h3 className="text-lg font-semibold">1. Acceptance of Terms</h3>
              <p className="text-gray-600 dark:text-gray-300">
                By accessing and using AxTask, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the service.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">2. Description of Service</h3>
              <p className="text-gray-600 dark:text-gray-300">
                AxTask is an intelligent task management application that provides task creation and organization, AI-powered priority scoring and planning, gamification features including AxCoins rewards, collaboration tools, and data import/export capabilities.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">3. User Accounts</h3>
              <p className="text-gray-600 dark:text-gray-300">
                You are responsible for maintaining the security of your account credentials. You agree to provide accurate information when creating your account. You must notify us immediately of any unauthorized use of your account.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">4. User Content</h3>
              <p className="text-gray-600 dark:text-gray-300">
                You retain ownership of all tasks, notes, and other content you create within AxTask. You grant us a limited license to store and process your content solely for the purpose of providing the service. You are responsible for the content you create and must not use the service for illegal purposes.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">5. Acceptable Use</h3>
              <p className="text-gray-600 dark:text-gray-300">
                You agree not to misuse the service, attempt to gain unauthorized access to any part of the service, use the service to distribute malware or spam, or interfere with other users' use of the service.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">6. AxCoins and Virtual Currency</h3>
              <p className="text-gray-600 dark:text-gray-300">
                AxCoins are a virtual reward system within the application. They have no real-world monetary value and cannot be exchanged for cash. We reserve the right to modify the AxCoins system, including earning rates and redemption options, at any time.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">7. AI Features</h3>
              <p className="text-gray-600 dark:text-gray-300">
                AxTask includes AI-powered features for task prioritization and planning. These features provide suggestions and recommendations that you may accept or reject. We do not guarantee the accuracy or suitability of AI-generated recommendations.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">8. Service Availability</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We strive to maintain high availability but do not guarantee uninterrupted access. We may perform maintenance or updates that temporarily affect service availability. We are not liable for any losses resulting from service downtime.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">9. Limitation of Liability</h3>
              <p className="text-gray-600 dark:text-gray-300">
                AxTask is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the service.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">10. Termination</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We may suspend or terminate your account if you violate these terms. You may delete your account at any time. Upon termination, your data will be permanently deleted.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">11. Changes to Terms</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">12. Contact</h3>
              <p className="text-gray-600 dark:text-gray-300">
                If you have questions about these terms, please contact us through the application.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
