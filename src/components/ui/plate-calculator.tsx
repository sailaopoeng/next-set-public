"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calculator, Minus, Plus, X } from "lucide-react";

import {
  calculateBarbellPlates,
  DEFAULT_BAR_WEIGHT_KG,
  DEFAULT_PLATE_WEIGHTS_KG,
  DISPLAY_PLATE_WEIGHTS_KG,
} from "@/lib/plates";

const QUICK_TARGETS_KG = [60, 90, 110];

export function PlateCalculatorButton({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Open barbell plate calculator"
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 ${
          compact ? "h-8 px-2" : "h-10 w-10"
        } ${className}`}
        onClick={() => setIsOpen(true)}
        title="Plate calculator"
        type="button"
      >
        <Calculator size={compact ? 14 : 18} />
        {compact ? <span>Plates</span> : null}
      </button>
      {isOpen
        ? createPortal(
            <PlateCalculatorDialog onClose={() => setIsOpen(false)} />,
            document.body,
          )
        : null}
    </>
  );
}

function PlateCalculatorDialog({ onClose }: { onClose: () => void }) {
  const [targetInput, setTargetInput] = useState("60");
  const [barInput, setBarInput] = useState(String(DEFAULT_BAR_WEIGHT_KG));
  const [availablePlatesKg, setAvailablePlatesKg] = useState<readonly number[]>(
    DEFAULT_PLATE_WEIGHTS_KG,
  );
  const targetKg = parseNumberInput(targetInput);
  const barKg = parseNumberInput(barInput) ?? DEFAULT_BAR_WEIGHT_KG;
  const calculation = useMemo(
    () =>
      calculateBarbellPlates({
        targetKg: targetKg ?? 0,
        barKg,
        platesKg: availablePlatesKg,
      }),
    [availablePlatesKg, barKg, targetKg],
  );
  const canCalculate = targetKg !== null && targetKg >= barKg;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-2 sm:items-center sm:p-4"
      role="dialog"
    >
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl sm:max-w-md sm:pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              Plate calculator
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Per side, using a {formatKg(barKg)} bar.
            </p>
          </div>
          <button
            aria-label="Close plate calculator"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">
              Total weight
            </span>
            <div className="mt-1 flex items-center gap-2">
              <StepButton
                label="Decrease total weight"
                onClick={() => adjustInput(targetInput, -2.5, setTargetInput)}
              >
                <Minus size={16} />
              </StepButton>
              <input
                aria-label="Total weight"
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-center text-xl font-extrabold tabular-nums"
                inputMode="decimal"
                min={0}
                step={0.5}
                type="number"
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
              />
              <StepButton
                label="Increase total weight"
                onClick={() => adjustInput(targetInput, 2.5, setTargetInput)}
              >
                <Plus size={16} />
              </StepButton>
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">
              Bar
            </span>
            <input
              aria-label="Bar weight"
              className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-2 text-center text-base font-bold tabular-nums"
              inputMode="decimal"
              min={0}
              step={0.5}
              type="number"
              value={barInput}
              onChange={(event) => setBarInput(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {QUICK_TARGETS_KG.map((weightKg) => (
            <button
              className="h-9 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 transition hover:bg-white"
              key={weightKg}
              onClick={() => setTargetInput(String(weightKg))}
              type="button"
            >
              {formatKg(weightKg)}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <div className="text-xs font-bold text-slate-600">
            Available plates
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {DISPLAY_PLATE_WEIGHTS_KG.map((plateKg) => {
              const isAvailable = availablePlatesKg.includes(plateKg);

              return (
                <label
                  className={`flex min-h-10 cursor-pointer items-center justify-center rounded-xl border px-1.5 text-xs font-bold tabular-nums transition ${
                    isAvailable
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-400"
                  }`}
                  key={plateKg}
                >
                  <input
                    checked={isAvailable}
                    className="sr-only"
                    type="checkbox"
                    onChange={() =>
                      setAvailablePlatesKg((currentPlatesKg) =>
                        togglePlateAvailability(currentPlatesKg, plateKg),
                      )
                    }
                  />
                  {formatKg(plateKg)}
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {canCalculate ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold text-slate-600">
                  Each side
                </span>
                <span className="text-2xl font-extrabold tabular-nums text-slate-950">
                  {formatKg(calculation.perSideKg)}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {calculation.plates.length > 0 ? (
                  calculation.plates.map((plate) => (
                    <div
                      className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm"
                      key={plate.weightKg}
                    >
                      <span className="font-bold text-slate-700">
                        {formatKg(plate.weightKg)} plate
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">
                        x{plate.count}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm font-medium text-slate-600">
                    Empty bar.
                  </p>
                )}
              </div>
              {!calculation.isBalanced ? (
                <p className="mt-3 rounded-xl bg-amber-100 p-2.5 text-xs font-bold text-amber-800">
                  Add {formatKg(calculation.remainingKg)} more per side, or use
                  smaller plates.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm font-semibold text-rose-700">
              Enter a total weight at least as heavy as the bar.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function togglePlateAvailability(
  currentPlatesKg: readonly number[],
  plateKg: number,
) {
  if (currentPlatesKg.includes(plateKg)) {
    return currentPlatesKg.filter((currentPlateKg) => currentPlateKg !== plateKg);
  }

  const nextPlatesKg = new Set([...currentPlatesKg, plateKg]);

  return DEFAULT_PLATE_WEIGHTS_KG.filter((defaultPlateKg) =>
    nextPlatesKg.has(defaultPlateKg),
  );
}

function StepButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-12 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function adjustInput(
  currentValue: string,
  delta: number,
  setValue: (nextValue: string) => void,
) {
  const currentNumber = parseNumberInput(currentValue) ?? 0;
  setValue(String(Math.max(0, Math.round((currentNumber + delta) * 100) / 100)));
}

function parseNumberInput(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatKg(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}kg`;
}
