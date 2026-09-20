import { AppShell } from "@/components/layout/app-shell";
import { SessionSummaryCard } from "@/components/session/session-summary-card";
import { AppLink } from "@/components/ui/app-activity";
import { getPageViewer } from "@/lib/auth/server";
import { historyHref, parseHistoryFilters } from "@/lib/history-filters";
import { listHistorySessions, listTemplates } from "@/server/db/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseHistoryFilters(await searchParams);
  const { supabase, ownerId, isOwner } = await getPageViewer();
  const [history, templates] = ownerId
    ? await Promise.all([
        listHistorySessions(supabase, ownerId, filters),
        listTemplates(supabase, ownerId),
      ])
    : [{ sessions: [], total: 0, page: 1, pageCount: 1 }, []];
  const hasFilters = Boolean(filters.search || filters.templateId || filters.from || filters.to);
  const first = history.total === 0 ? 0 : (history.page - 1) * 25 + 1;
  const last = Math.min(history.page * 25, history.total);

  return (
    <AppShell isOwner={isOwner}>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search workouts by name or exercise, or narrow them by date and template.
        </p>
      </div>
      <form action="/history" className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4" method="get">
        <label className="text-xs font-bold text-slate-700">
          Search
          <input
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
            defaultValue={filters.search}
            maxLength={100}
            name="q"
            placeholder="Workout or exercise"
            type="search"
          />
        </label>
        <label className="text-xs font-bold text-slate-700">
          Template
          <select className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900" defaultValue={filters.templateId} name="template">
            <option value="">All templates</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          From
          <input className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900" defaultValue={filters.from} name="from" type="date" />
        </label>
        <label className="text-xs font-bold text-slate-700">
          To
          <input className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900" defaultValue={filters.to} name="to" type="date" />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button className="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white" type="submit">Apply filters</button>
          {hasFilters ? (
            <AppLink className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700" href="/history">Clear filters</AppLink>
          ) : null}
        </div>
      </form>
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-3 px-1 text-xs font-semibold text-slate-500">
          Showing {first}–{last} of {history.total} {history.total === 1 ? "session" : "sessions"}
        </p>
        <div className="space-y-2">
          {history.sessions.length === 0 ? (
            <p className="p-1 text-sm text-slate-600">
              {hasFilters ? "No sessions match these filters." : "No sessions yet."}
            </p>
          ) : (
            history.sessions.map((session) => (
              <SessionSummaryCard
                isOwner={isOwner}
                key={session.id}
                session={session}
              />
            ))
          )}
        </div>
        {history.pageCount > 1 ? (
          <nav aria-label="History pages" className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
            {history.page > 1 ? (
              <AppLink className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700" href={historyHref(filters, history.page - 1)}>Previous</AppLink>
            ) : <span />}
            <span className="text-xs font-semibold text-slate-600">Page {history.page} of {history.pageCount}</span>
            {history.page < history.pageCount ? (
              <AppLink className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700" href={historyHref(filters, history.page + 1)}>Next</AppLink>
            ) : <span />}
          </nav>
        ) : null}
      </section>
    </AppShell>
  );
}
