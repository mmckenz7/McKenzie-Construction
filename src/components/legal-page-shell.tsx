import type { ReactNode } from "react";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  introduction: string;
  children: ReactNode;
};

export function LegalPageShell({
  eyebrow,
  title,
  introduction,
  children,
}: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Navigation />

      <main>
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-4xl px-6 py-16 sm:px-8 sm:py-20 lg:px-10">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-lime-400">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
              {introduction}
            </p>
            <p className="mt-6 text-sm font-semibold text-slate-400">
              Effective and last updated August 19, 2026
            </p>
          </div>
        </section>

        <article className="mx-auto max-w-4xl space-y-10 px-6 py-14 text-base leading-8 text-slate-700 sm:px-8 sm:py-16 lg:px-10">
          {children}
        </article>
      </main>

      <Footer />
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-bold tracking-tight text-slate-950">
        {title}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}
