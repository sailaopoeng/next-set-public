export type HistoryFilters = {
  search: string;
  templateId: string;
  from: string;
  to: string;
  page: number;
};

export type HistoryIndexRow = {
  id: string;
  name: string;
  template_id: string | null;
  performed_at: string;
  session_exercises: Array<{ exercise: { name: string } | null }>;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseHistoryFilters(params: RawSearchParams): HistoryFilters {
  const pageValue = Number(one(params.page));
  return {
    search: one(params.q).trim().slice(0, 100),
    templateId: one(params.template).trim(),
    from: validDateKey(one(params.from)),
    to: validDateKey(one(params.to)),
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

export function filterHistoryRows(rows: HistoryIndexRow[], filters: HistoryFilters) {
  const search = filters.search.toLocaleLowerCase();
  return rows.filter((session) => {
    if (filters.templateId && session.template_id !== filters.templateId) return false;
    const dateKey = singaporeDateKey(session.performed_at);
    if (filters.from && dateKey < filters.from) return false;
    if (filters.to && dateKey > filters.to) return false;
    if (!search) return true;
    return session.name.toLocaleLowerCase().includes(search) ||
      session.session_exercises.some((item) =>
        item.exercise?.name.toLocaleLowerCase().includes(search),
      );
  });
}

export function historyHref(filters: HistoryFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.templateId) params.set("template", filters.templateId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/history?${query}` : "/history";
}

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : "";
}

function singaporeDateKey(value: string) {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
