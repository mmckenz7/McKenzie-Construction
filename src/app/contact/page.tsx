import type { Metadata } from "next";

import { ProjectRequestForm } from "@/components/project-request-form";
import type { ProjectRequestType } from "@/components/project-request-form";
import { TrackedPhoneLink } from "@/components/tracked-phone-link";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Request a Construction Consultation in Knoxville",
  description:
    "Tell McKenzie Construction about your deck, covered outdoor living, screened porch, renovation, or exterior residential project in Knoxville and East Tennessee.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Request a Consultation | McKenzie Construction",
    description:
      "Share your project goals and request a consultation with McKenzie Construction in Knoxville, Tennessee.",
    url: "/contact",
    type: "website",
  },
};

const supportedProjectTypes = new Set<ProjectRequestType>([
  "New Deck",
  "Deck Replacement",
  "Covered Outdoor Living",
  "Screened Porch",
  "Railing or Stairs",
  "Pergola",
  "Exterior Residential Project",
  "Other",
]);

function readProjectType(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return supportedProjectTypes.has(value as ProjectRequestType)
    ? (value as ProjectRequestType)
    : "";
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ projectType?: string | string[] }>;
}) {
  const defaultProjectType = readProjectType((await searchParams).projectType);
  const supabase = createAdminServerClient();
  const { data: settings } = await supabase
    .from("company_settings")
    .select(
      "consultation_start_time, consultation_end_time, end_of_business_time",
    )
    .limit(1)
    .maybeSingle();

  const consultationHours = {
    start: settings?.consultation_start_time ?? "08:00",
    end:
      settings?.consultation_end_time ??
      settings?.end_of_business_time ??
      "17:00",
  };

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
          {defaultProjectType ? (
            <div className="mb-6 border border-lime-300 bg-lime-50 px-5 py-4 text-sm leading-6 text-slate-800">
              We started the form with <strong>{defaultProjectType}</strong>{" "}
              based on the service you were viewing. You can change it below.
            </div>
          ) : null}
          <ProjectRequestForm
            consultationHours={consultationHours}
            defaultProjectType={defaultProjectType}
          />
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

            <TrackedPhoneLink
              location="contact_page"
              className="mt-5 inline-flex min-h-12 items-center justify-center bg-zinc-950 px-6 text-sm font-black uppercase tracking-wide text-white transition hover:bg-zinc-800"
            >
              Call or text 865-433-3325
            </TrackedPhoneLink>
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
