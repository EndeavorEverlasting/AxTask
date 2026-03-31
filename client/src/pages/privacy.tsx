import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPolicy() {
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
            <CardTitle className="text-2xl">Privacy Policy</CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last updated: March 31, 2026</p>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h3 className="text-lg font-semibold">1. Information We Collect</h3>
              <p className="text-gray-600 dark:text-gray-300">
                When you use AxTask, we collect information you provide directly, including your name, email address, and task data you create within the application. If you sign in with Google, we receive your basic profile information (name, email, profile picture) from Google.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">2. How We Use Your Information</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We use your information to provide and improve the AxTask service, including authenticating your account, storing and managing your tasks, providing AI-powered task prioritization and planning features, and communicating with you about your account.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">3. Data Storage and Security</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Your data is stored securely using industry-standard encryption. We use PostgreSQL databases hosted on secure infrastructure. Passwords are hashed using scrypt with unique salts. Session data is encrypted and stored server-side.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">4. Third-Party Services</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We use Google OAuth for authentication. When you sign in with Google, Google's Privacy Policy applies to the information they collect. We only receive and store basic profile information (name and email) from Google.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">5. Data Sharing</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We do not sell, trade, or otherwise transfer your personal information to third parties. Your task data remains private to your account unless you explicitly share it through collaboration features.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">6. Your Rights</h3>
              <p className="text-gray-600 dark:text-gray-300">
                You can access, update, or delete your personal data at any time through the application settings. You can export all your task data using the Import/Export feature. You can delete your account, which will permanently remove all associated data.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">7. Cookies and Local Storage</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We use session cookies for authentication and local storage for user preferences such as theme settings and remembered login methods. No tracking or advertising cookies are used.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">8. Changes to This Policy</h3>
              <p className="text-gray-600 dark:text-gray-300">
                We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold">9. Contact</h3>
              <p className="text-gray-600 dark:text-gray-300">
                If you have questions about this privacy policy, please contact us through the application.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
