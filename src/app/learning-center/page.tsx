import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { SectionTitle } from '@/components/ui';

const resources = [
  {
    title: 'How to Plan a Renovation',
    description: 'A practical guide to budgeting, sequencing, and deciding what matters most in your remodel.',
  },
  {
    title: 'Design Decisions That Last',
    description: 'Learn how timeless finishes, durable materials, and functional layouts create lasting value.',
  },
  {
    title: 'What to Expect During Construction',
    description: 'A clear overview of milestones, communication rhythms, and ways to stay calm and informed.',
  },
];

export default function LearningCenterPage() {
  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <Navigation />
      <main className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionTitle eyebrow="Learning Center" title="Helpful guidance for clients who want confidence at every stage." description="Explore resources designed to make renovation planning, building decisions, and project delivery feel more informed and more manageable." />
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {resources.map((resource) => (
            <div key={resource.title} className="rounded-[1.75rem] border border-brand-charcoal/10 bg-white p-7 shadow-sm">
              <h3 className="text-xl font-semibold text-brand-charcoal">{resource.title}</h3>
              <p className="mt-3 text-base leading-7 text-brand-charcoal/70">{resource.description}</p>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
