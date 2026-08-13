import Link from "next/link";

import { OnsiteDeckIntakeForm } from "@/components/onsite-deck-intake-form";
import { getInternalDeckIntakeAccess } from "@/lib/internal-deck-intake-access";

export default async function OnsiteDeckIntakePage() {
  const intakeAccess = await getInternalDeckIntakeAccess();

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/all-work"
        className="text-sm font-semibold text-slate-600 hover:underline"
      >
        ← Mission Control
      </Link>
      <p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-amber-700">
        Onsite quick add
      </p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950">
        Start a Deck estimate
      </h1>
      <p className="mt-2 mb-6 text-sm leading-6 text-slate-600">
        Only the details needed to identify the customer are required. Add the
        rest later.
      </p>
      {intakeAccess.enabled ? (
        <OnsiteDeckIntakeForm />
      ) : (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-bold">Onsite Deck intake is unavailable</h2>
          <p className="mt-2 text-sm leading-6">
            Your account needs estimate editing and site-visit access, and the
            Guided Site Visit feature must be enabled.
          </p>
        </section>
      )}
    </main>
  );
}
