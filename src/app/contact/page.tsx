import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { SectionTitle, CTAButton } from '@/components/ui';

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <Navigation />
      <main className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionTitle eyebrow="Contact" title="Let’s begin with a conversation about your next project." description="Share your goals and timeline, and we’ll help you map out what’s possible with clarity and confidence." />
        <div className="mt-10 grid gap-6 rounded-[2rem] bg-white p-8 shadow-soft lg:grid-cols-[1fr_0.9fr] lg:p-10">
          <div>
            <h3 className="text-2xl font-semibold">Reach out</h3>
            <p className="mt-4 text-lg leading-8 text-brand-charcoal/70">Whether you are planning a full build or a selective transformation, we would be honored to help bring it to life.</p>
            <div className="mt-8 space-y-3 text-brand-charcoal/80">
              <p><span className="font-semibold">Email:</span> hello@mckenzieconstruction.com</p>
              <p><span className="font-semibold">Phone:</span> (555) 014-2048</p>
              <p><span className="font-semibold">Studio:</span> 1825 Cedar Avenue, Portland, OR</p>
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-brand-charcoal p-6 text-white">
            <h3 className="text-xl font-semibold">Ready to get started?</h3>
            <p className="mt-3 text-sm leading-7 text-white/75">Book a discovery call and we’ll discuss scope, budget, and next steps.</p>
            <div className="mt-6">
              <CTAButton href="mailto:hello@mckenzieconstruction.com">Email Our Team</CTAButton>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
