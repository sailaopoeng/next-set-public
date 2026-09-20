"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">This page could not load. Please try again or return home.</p>
        <div className="mt-5 grid gap-2">
          <button className="min-h-11 rounded-xl bg-emerald-600 px-4 font-bold text-white" onClick={reset} type="button">
            Try again
          </button>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 font-bold text-slate-700" href="/">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
