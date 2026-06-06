import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const TermsOfService = () => {
    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-8 max-w-4xl">
                <Link to="/">
                    <Button variant="ghost" className="mb-6">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Home
                    </Button>
                </Link>

                <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
                <p className="text-muted-foreground mb-8">Last updated: February 18, 2026</p>

                <Separator className="mb-8" />

                <div className="space-y-8 text-foreground/90">
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">1. Agreement to Terms</h2>
                        <p className="leading-relaxed">
                            By accessing or using MineCaption AI, you agree to be bound by these Terms of Service and our Privacy Policy.
                            If you do not agree to these terms, please do not use our services.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
                        <p className="leading-relaxed mb-4">
                            MineCaption AI provides AI-powered video editing tools for content creators. We reserve the right to modify,
                            suspend, or discontinue any part of the service at any time.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
                        <p className="leading-relaxed mb-4">
                            You are responsible for maintaining the confidentiality of your account credentials and for all activities
                            that occur under your account. You must immediately notify us of any unauthorized use of your account.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">4. User Content</h2>
                        <p className="leading-relaxed mb-4">
                            You retain all rights to the content you upload to our platform. By uploading content, you grant us a
                            license to use, store, and process your content solely for the purpose of providing our services to you.
                        </p>
                        <p className="leading-relaxed">
                            You agree not to upload content that is illegal, infringing, or violates the rights of others.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">5. Intellectual Property</h2>
                        <p className="leading-relaxed">
                            The MineCaption AI platform, including its software, design, and branding, is owned by us and protected by
                            intellectual property laws. You may not copy, modify, or distribute our platform without our prior written consent.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">6. Limitation of Liability</h2>
                        <p className="leading-relaxed">
                            To the fullest extent permitted by law, MineCaption AI shall not be liable for any indirect, incidental,
                            special, consequential, or punitive damages, or any loss of profits or revenues.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">7. Termination</h2>
                        <p className="leading-relaxed">
                            We may terminate or suspend your access to our services immediately, without prior notice, for any reason,
                            including if you breach these Terms of Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">8. Governing Law</h2>
                        <p className="leading-relaxed">
                            These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which
                            we operate, without regard to its conflict of law provisions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">9. Contact Us</h2>
                        <p className="leading-relaxed">
                            If you have any questions about these Terms, please contact us at support@minecaption.com.
                        </p>
                    </section>
                </div>

                <Separator className="my-8" />

                <p className="text-center text-muted-foreground text-sm">
                    © {new Date().getFullYear()} MineCaption AI. All rights reserved.
                </p>
            </div>
        </div>
    );
};

export default TermsOfService;
