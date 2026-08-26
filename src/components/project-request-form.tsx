import { consultationTimeOptions, type ConsultationHours } from "@/lib/consultation-hours";

const inputClass =
  "min-h-14 w-full border border-zinc-300 bg-white px-4 text-base text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950";

const labelClass =
  "mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-950";

const projectTypes = [
  "New Deck",
  "Deck Replacement",
  "Covered Outdoor Living",
  "Screened Porch",
  "Railing or Stairs",
  "Pergola",
  "Exterior Residential Project",
  "Other",
] as const;

export type ProjectRequestType = (typeof projectTypes)[number];

export function ProjectRequestForm({
  consultationHours,
  defaultProjectType = "",
}: {
  consultationHours?: Partial<ConsultationHours>;
  defaultProjectType?: ProjectRequestType | "";
}) {
  const timeOptions = consultationTimeOptions(consultationHours);

  return (
    <form
      action="/api/leads"
      method="post"
      className="grid gap-5 bg-zinc-100 p-6 sm:grid-cols-2 sm:p-9"
    >
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <label className="block">
        <span className={labelClass}>Name *</span>
        <input
          required
          name="name"
          autoComplete="name"
          className={inputClass}
          placeholder="Your name"
        />
      </label>

      <label className="block">
        <span className={labelClass}>Phone *</span>
        <input
          required
          type="tel"
          name="phone"
          autoComplete="tel"
          inputMode="tel"
          className={inputClass}
          placeholder="Your phone number"
        />
      </label>

      <label className="block">
        <span className={labelClass}>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          className={inputClass}
          placeholder="Your email"
        />
      </label>

      <label className="block">
        <span className={labelClass}>
          How Would You Prefer We Contact You?
        </span>

        <select
          name="preferredContactMethod"
          defaultValue="no_preference"
          className={inputClass}
        >
          <option value="no_preference">No preference</option>
          <option value="phone">Phone call</option>
          <option value="text">Text message</option>
          <option value="email">Email</option>
        </select>
      </label>

      <label className="block sm:col-span-2">
        <span className={labelClass}>Property Address</span>
        <input
          name="propertyAddress"
          autoComplete="street-address"
          className={inputClass}
          placeholder="Project address"
        />
      </label>

      <label className="block">
        <span className={labelClass}>Project Type *</span>
        <select
          required
          name="projectType"
          defaultValue={defaultProjectType}
          className={inputClass}
        >
          <option value="" disabled>
            Select a project type
          </option>
          {projectTypes.map((projectType) => (
            <option key={projectType} value={projectType}>
              {projectType === "Other" ? "Other or not sure" : projectType}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelClass}>Estimated Investment</span>
        <select
          name="estimatedBudget"
          defaultValue=""
          className={inputClass}
        >
          <option value="">I would like guidance</option>
          <option value="Under $15,000">Under $15,000</option>
          <option value="$15,000–$30,000">$15,000–$30,000</option>
          <option value="$30,000–$50,000">$30,000–$50,000</option>
          <option value="$50,000–$75,000">$50,000–$75,000</option>
          <option value="$75,000+">$75,000+</option>
        </select>
      </label>

      <label className="block sm:col-span-2">
        <span className={labelClass}>Desired Timeline</span>
        <select
          name="desiredTimeline"
          defaultValue=""
          className={inputClass}
        >
          <option value="">Select a timeframe</option>
          <option value="As soon as possible">As soon as possible</option>
          <option value="Within 1–3 months">Within 1–3 months</option>
          <option value="Within 3–6 months">Within 3–6 months</option>
          <option value="This year">This year</option>
          <option value="Just planning">Just planning</option>
        </select>
      </label>

      <fieldset className="border border-zinc-300 bg-white p-5 sm:col-span-2">
        <legend className="px-2 text-xs font-black uppercase tracking-[0.14em]">
          Request a Consultation
        </legend>

        <p className="mb-5 text-sm leading-6 text-zinc-600">
          Choose the date and time that works best for you. This is only a
          request. McKenzie Construction will review it before confirming the
          appointment.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Preferred Date</span>
            <input
              type="date"
              name="requestedDate"
              className={inputClass}
            />
          </label>

          <label>
            <span className={labelClass}>Preferred Time</span>
            <select
              name="requestedTime"
              defaultValue=""
              className={inputClass}
            >
              <option value="">No preference</option>
              {timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label>
            <span className={labelClass}>Alternate Date</span>
            <input
              type="date"
              name="alternateDate"
              className={inputClass}
            />
          </label>

          <label>
            <span className={labelClass}>Alternate Time</span>
            <select
              name="alternateTime"
              defaultValue=""
              className={inputClass}
            >
              <option value="">No alternate time</option>
              {timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <label className="block sm:col-span-2">
        <span className={labelClass}>Tell Us About the Project *</span>
        <textarea
          required
          name="description"
          rows={6}
          className="w-full border border-zinc-300 bg-white px-4 py-4 text-base text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950"
          placeholder="Describe what you would like to build or improve."
        />
      </label>

      <button
        type="submit"
        className="min-h-14 bg-[#8CC63F] px-7 text-sm font-black uppercase tracking-wide text-black transition hover:brightness-105 sm:col-span-2"
      >
        Submit Project Request →
      </button>

      <p className="text-center text-xs leading-5 text-zinc-500 sm:col-span-2">
        Requested consultation times are not confirmed until McKenzie
        Construction confirms them with you.
      </p>
    </form>
  );
}
