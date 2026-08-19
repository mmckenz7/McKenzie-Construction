import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-brand-charcoal/10 bg-brand-charcoal px-6 py-10 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-lg font-semibold">
            McKenzie Construction
          </p>

          <p className="mt-2 max-w-xl text-sm leading-7 text-white/70">
            Custom decks, covered outdoor living spaces, screened
            porches, renovations, and residential construction
            throughout Knoxville and East Tennessee.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-white/70">
          <Link
            href="/services"
            className="transition hover:text-brand-green"
          >
            Services
          </Link>

          <Link
            href="/knoxville-deck-builder"
            className="transition hover:text-brand-green"
          >
            Knoxville Deck Builder
          </Link>

          <Link
            href="/projects"
            className="transition hover:text-brand-green"
          >
            Projects
          </Link>

          <Link
            href="/projects/gallery"
            className="transition hover:text-brand-green"
          >
            Gallery
          </Link>

          <Link
            href="/contact"
            className="transition hover:text-brand-green"
          >
            Contact
          </Link>

          <Link
            href="/privacy"
            className="transition hover:text-brand-green"
          >
            Privacy
          </Link>

          <Link
            href="/sms-terms"
            className="transition hover:text-brand-green"
          >
            SMS Terms
          </Link>

          <Link
            href="/sms-consent"
            className="transition hover:text-brand-green"
          >
            SMS Consent
          </Link>
        </div>
      </div>
    </footer>
  );
}
