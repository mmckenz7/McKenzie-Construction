import Image from "next/image";
import Link from "next/link";

export type RelatedProject = {
  href: string;
  imageAlt: string;
  imageSrc: string;
  location: string;
  title: string;
};

export function RelatedProjects({ projects }: { projects: RelatedProject[] }) {
  return (
    <section className="border-t border-brand-charcoal/10 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-green">
              Related Projects
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-brand-charcoal sm:text-4xl">
              Explore more completed outdoor spaces.
            </h2>
          </div>
          <Link
            href="/projects/gallery"
            className="text-sm font-semibold text-brand-charcoal transition hover:text-brand-green"
          >
            View the full gallery <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="mt-9 grid gap-6 md:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.href}
              href={project.href}
              className="group overflow-hidden rounded-[1.5rem] border border-brand-charcoal/10 bg-brand-gray shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-green"
            >
              <article className="grid sm:grid-cols-[0.9fr_1.1fr]">
                <div className="relative min-h-52 overflow-hidden bg-brand-charcoal/10">
                  <Image
                    src={project.imageSrc}
                    alt={project.imageAlt}
                    fill
                    sizes="(min-width: 768px) 25vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-col justify-center p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-green">
                    {project.location}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold leading-tight text-brand-charcoal">
                    {project.title}
                  </h3>
                  <p className="mt-4 text-sm font-semibold text-brand-charcoal/65">
                    Open project <span aria-hidden="true">→</span>
                  </p>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
