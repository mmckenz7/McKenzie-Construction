const brandGreen = "#8CC63F";

export default function ThankYouPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-24 text-white sm:px-8">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center">
        <div>
          <div
            className="mb-7 h-1 w-16"
            style={{ backgroundColor: brandGreen }}
          />

          <p
            className="text-sm font-black uppercase tracking-[0.25em]"
            style={{ color: brandGreen }}
          >
            Request received
          </p>

          <h1 className="mt-5 text-5xl font-black leading-tight tracking-[-0.04em] sm:text-6xl">
            Thank you for contacting McKenzie Construction.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
            Your project request has been submitted. Michael will review the
            details and contact you to discuss the project and confirm any
            requested consultation time.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="/"
              className="inline-flex min-h-14 items-center justify-center px-7 text-sm font-black text-black transition hover:brightness-110"
              style={{ backgroundColor: brandGreen }}
            >
              RETURN HOME
            </a>

            <a
              href="tel:+18654333325"
              className="inline-flex min-h-14 items-center justify-center border border-white/30 px-7 text-sm font-black text-white transition hover:bg-white hover:text-black"
            >
              CALL 865-433-3325
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}