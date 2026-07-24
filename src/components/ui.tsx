import Link from 'next/link';

export function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold text-brand-charcoal sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg leading-8 text-brand-charcoal/70">{description}</p>
    </div>
  );
}

export function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-brand-charcoal/10 bg-white p-4 shadow-sm">
      <p className="text-2xl font-semibold text-brand-green">{value}</p>
      <p className="mt-2 text-sm uppercase tracking-[0.2em] text-brand-charcoal/70">{label}</p>
    </div>
  );
}

export function ServiceCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.75rem] border border-brand-charcoal/10 bg-white p-7 shadow-sm">
      <div className="mb-4 h-12 w-12 rounded-full bg-brand-green/20" />
      <h3 className="text-xl font-semibold text-brand-charcoal">{title}</h3>
      <p className="mt-3 text-base leading-7 text-brand-charcoal/70">{description}</p>
    </div>
  );
}

export function ProjectCard({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="rounded-[1.75rem] border border-brand-charcoal/10 bg-white p-7 shadow-sm">
      <div className="h-36 rounded-[1.25rem] bg-gradient-to-br from-brand-green/40 to-brand-charcoal/10" />
      <h3 className="mt-6 text-xl font-semibold text-brand-charcoal">{title}</h3>
      <p className="mt-3 text-base leading-7 text-brand-charcoal/70">{blurb}</p>
    </div>
  );
}

export function CTAButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-full bg-brand-green px-6 py-3 text-center text-sm font-semibold text-brand-charcoal transition hover:opacity-90">
      {children}
    </Link>
  );
}

export function OutlineButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-full border border-brand-charcoal/20 bg-transparent px-6 py-3 text-center text-sm font-semibold text-brand-charcoal transition hover:border-brand-green hover:text-brand-green">
      {children}
    </Link>
  );
}
