import Link from "next/link";

import { CommunicationReplyComposer } from "@/components/communication-reply-composer";

export const dynamic = "force-dynamic";

export default function NewCompanyEmailPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-3xl">
      <Link href="/communications" className="text-sm font-semibold text-slate-600 hover:text-slate-950">← Company Inbox</Link>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">Company Inbox</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">New email</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Send from the company mailbox without creating or assigning a lead, customer, or project. The conversation will remain available in the inbox and can be matched later if needed.</p>
        <div className="mt-6"><CommunicationReplyComposer recipient={null} editableRecipient /></div>
      </section>
    </div>
  </main>;
}
