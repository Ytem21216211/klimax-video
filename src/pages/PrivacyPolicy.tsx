import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: January 27, 2026</p>

        <Separator className="mb-8" />

        <div className="space-y-8 text-foreground/90">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="leading-relaxed">
              Welcome to Klimax video. We respect your privacy and are committed to protecting your personal data. 
              This privacy policy explains how we collect, use, and safeguard your information when you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            <p className="leading-relaxed mb-4">We collect information that you provide directly to us, including:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Account information (email address, username)</li>
              <li>Content you upload (videos, audio files, images)</li>
              <li>Project data and preferences</li>
              <li>Communication data when you contact us</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="leading-relaxed mb-4">We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Provide, maintain, and improve our services</li>
              <li>Process and render your video projects</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Analyze usage patterns to improve user experience</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Data Storage and Security</h2>
            <p className="leading-relaxed">
              Your data is stored securely using industry-standard encryption and security measures. 
              We use secure cloud infrastructure to store your uploaded content and project data. 
              Access to your data is restricted to authorized personnel only.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Third-Party Services</h2>
            <p className="leading-relaxed mb-4">We may use third-party services that collect, monitor, and analyze data, including:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Cloud storage providers for file hosting</li>
              <li>AI services for content generation and processing</li>
              <li>Analytics services to improve our platform</li>
              <li>YouTube API for video publishing (with your consent)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
            <p className="leading-relaxed mb-4">You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent for data processing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
            <p className="leading-relaxed">
              We retain your personal data only for as long as necessary to fulfill the purposes for which it was collected. 
              Uploaded content and project data are retained until you delete them or close your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Children's Privacy</h2>
            <p className="leading-relaxed">
              Our service is not intended for children under 13 years of age. We do not knowingly collect 
              personal information from children under 13. If we discover that we have collected data from 
              a child under 13, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Changes to This Policy</h2>
            <p className="leading-relaxed">
              We may update this privacy policy from time to time. We will notify you of any changes by 
              posting the new policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
            <p className="leading-relaxed">
              If you have any questions about this privacy policy or our data practices, please contact us 
              through our support channels.
            </p>
          </section>
        </div>

        <Separator className="my-8" />

        <p className="text-center text-muted-foreground text-sm">
          © {new Date().getFullYear()} Klimax video. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
