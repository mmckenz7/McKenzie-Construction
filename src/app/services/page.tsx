import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { SectionTitle, ServiceCard } from '@/components/ui';

const services = [
  {
    title: 'Architecture & Planning',
    description: 'Clear strategy, site insight, and elegant planning from conceptual design to permit-ready documentation.',
  },
  {
    title: 'Custom Residential',
    description: 'Premium homes created around your family, routines, and long-term lifestyle goals.',
  },
  {
    title: 'Interior Renovation',
    description: 'Refined transformations that bring beauty, comfort, and function into every room.',
  },
  {
    title: 'Commercial Spaces',
    description: 'Flexible, polished environments that support operations, brand identity, and visitor experience.',
  },
  {
    title: 'Project Management',
    description: 'Transparent scheduling, procurement, and oversight for a calm and efficient build experience.',
  },
  {
    title: 'Maintenance & Upgrades',
    description: 'Thoughtful improvements that extend performance, resilience, and curb appeal over time.',
  },
];

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <Navigation />
      <main className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionTitle eyebrow="Services" title="Building experiences that feel effortless, elevated, and enduring." description="Every engagement is shaped around clarity, precision, and a deeply personal approach to design and execution." />
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <ServiceCard key={service.title} title={service.title} description={service.description} />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
