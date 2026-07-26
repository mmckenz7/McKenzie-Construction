import { ProjectRequestForm } from "@/components/project-request-form";

export default function ContactPage() {
  return (
    <main className="bg-white text-zinc-950">
      <section className="border-b border-zinc-200 bg-zinc-950 text-white">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:px-8 lg:py-20">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#8CC63F]">
            Start Your Project
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Tell us what you are planning.
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-300">
            Complete this form once with your project details, preferred
            consultation time, and the best way to reach you.
          </p>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Requested consultation times are not confirmed until McKenzie
            Construction reviews the request and confirms the appointment with
            you.
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-6 py-12 lg:px-8 lg:py-16">
          <ProjectRequestForm />
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-100">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 sm:grid-cols-2 lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6da128]">
              Prefer to Call?
            </p>

            <h2 className="mt-3 text-2xl font-black">
              Speak directly with McKenzie Construction.
            </h2>

            <a
              href="tel:8652633811"
              className="mt-5 inline-flex min-h-12 items-center justify-center bg-zinc-950 px-6 text-sm font-black uppercase tracking-wide text-white transition hover:bg-zinc-800"
            >
              Call 865-263-3811
            </a>
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6da128]">
              What Happens Next
            </p>

            <p className="mt-3 leading-7 text-zinc-600">
              We will review your request, contact you using your preferred
              method, and either confirm your preferred consultation time or
              suggest a different time.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}