import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-brand-charcoal/10 bg-brand-charcoal px-6 py-10 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-lg font-semibold">McKenzie Construction</p>
          <p className="mt-2 max-w-xl text-sm leading-7 text-white/70">
            Premium construction and renovation services rooted in craftsmanship, clarity, and care.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-white/70">
          <Link href="/services" className="transition hover:text-brand-green">Services</Link>
          <Link href="/projects" className="transition hover:text-brand-green">Projects</Link>
          <Link href="/contact" className="transition hover:text-brand-green">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
