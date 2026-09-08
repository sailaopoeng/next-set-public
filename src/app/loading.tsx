export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
      <div
        aria-live="polite"
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow-sm"
        role="status"
      >
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
        />
        Loading page...
      </div>
    </div>
  );
}
