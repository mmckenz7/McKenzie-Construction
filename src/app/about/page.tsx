import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { SectionTitle } from '@/components/ui';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <Navigation />
      <main className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionTitle eyebrow="About" title="Creating spaces with intention, craftsmanship, and calm confidence." description="McKenzie Construction is built on a simple commitment: deliver exceptional results with clear communication and a deep respect for the people who will live and work in the spaces we create." />
        <div className="mt-10 grid gap-6 rounded-[2rem] bg-white p-8 shadow-soft lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div>
            <h3 className="text-2xl font-semibold">A boutique approach to building</h3>
            <p className="mt-4 text-lg leading-8 text-brand-charcoal/70">
              We lead each project with a thoughtful process that balances design ambition, practical execution, and the realities of budget and timeline.
            </p>
          </div>
          <div className="rounded-[1.5rem] bg-brand-charcoal p-6 text-white">
            <p className="text-sm uppercase tracking-[0.3em] text-brand-green">Why clients choose us</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-white/75">
              <li>• Consistent communication from discovery to handoff</li>
              <li>• High-touch coordination with trusted trade partners</li>
              <li>• A refined eye for material selection and detail</li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
