import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { SectionTitle, ProjectCard } from '@/components/ui';

const projects = [
  {
    title: 'Harbor Residence',
    blurb: 'A seamless blend of coastal calm and architectural drama, completed with bespoke detailing and sculptural interiors.',
  },
  {
    title: 'Northfield Studio',
    blurb: 'A modern workplace transformation designed to inspire creativity while supporting efficient team flow.',
  },
  {
    title: 'Elm Grove Retreat',
    blurb: 'A warm, welcoming renovation shaped around outdoor living and thoughtful family-centered design.',
  },
  {
    title: 'Cedar Point House',
    blurb: 'A durable, beautifully crafted home built with timeless materials and elevated everyday comfort in mind.',
  },
];

export default function ProjectsPage() {
  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <Navigation />
      <main className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionTitle eyebrow="Projects" title="A portfolio of places that feel warm, refined, and built to last." description="From whole-home builds to complex renovations, each project reflects careful planning and a refined point of view." />
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard key={project.title} title={project.title} blurb={project.blurb} />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
