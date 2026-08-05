export default function MissionControlLoading() {
  return (
    <main className="min-h-screen bg-[#f4f4f2]">
      <div className="h-32 border-b border-slate-800 bg-[#171b1e]" />
      <div className="mx-auto max-w-[1440px] animate-pulse px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 border-b border-r border-slate-200 p-4 lg:border-b-0"><div className="h-2 w-24 rounded bg-slate-200" /><div className="mt-3 h-6 w-10 rounded bg-slate-200" /></div>)}
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
          <div className="space-y-5">{[0, 1, 2].map((panel) => <SkeletonPanel key={panel} rows={panel === 0 ? 5 : 4} />)}</div>
          <div className="space-y-5">{[0, 1, 2].map((panel) => <SkeletonPanel key={panel} rows={3} />)}</div>
        </div>
      </div>
    </main>
  );
}

function SkeletonPanel({ rows }: { rows: number }) {
  return <div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="h-14 border-b border-slate-200 p-4"><div className="h-4 w-40 rounded bg-slate-200" /></div>{Array.from({ length: rows }, (_, item) => <div key={item} className="h-14 border-b border-slate-100 px-5 py-3 last:border-0"><div className="h-3 w-2/3 rounded bg-slate-200" /><div className="mt-2 h-2 w-1/3 rounded bg-slate-100" /></div>)}</div>;
}
