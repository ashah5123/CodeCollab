"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "idle" | "running" | "paused";
type Broadcast = { secondsLeft: number; status: Status };

export type TimerProps = {
  submissionId: string;
  isOwner: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ArrowBtn({
  direction,
  onClick,
  disabled,
}: {
  direction: "up" | "down";
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-5 w-8 items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
    >
      {direction === "up" ? (
        <ChevronUpIcon className="h-3 w-3" />
      ) : (
        <ChevronDownIcon className="h-3 w-3" />
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Timer({ submissionId, isOwner }: TimerProps) {
  const [mins, setMins] = useState(25);
  const [secs, setSecs] = useState(0);
  const [status, setStatus] = useState<Status>("idle");

  // secondsLeftRef is the authoritative countdown value used inside the
  // interval callback so we never read stale state.
  const secondsLeftRef = useRef(25 * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof createClient>["channel"] extends (...a: never[]) => infer R ? R : never | null>(null as never);

  const isEditable = isOwner && status !== "running";
  const totalInput = mins * 60 + secs;

  // ── Color state ────────────────────────────────────────────────────────────
  let textColor = "text-slate-200";
  let borderColor = "border-slate-700/60";
  let shouldPulse = false;

  if (status !== "idle") {
    const sl = secondsLeftRef.current;
    if (sl <= 10) {
      textColor = "text-red-400";
      borderColor = "border-red-500/50";
      shouldPulse = true;
    } else if (sl <= 60) {
      textColor = "text-amber-400";
      borderColor = "border-amber-500/50";
    }
  }

  // ── Broadcast helper ───────────────────────────────────────────────────────
  const broadcast = useCallback((sl: number, st: Status) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "timer",
      payload: { secondsLeft: sl, status: st } satisfies Broadcast,
    });
  }, []);

  // ── Supabase realtime subscription ─────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`timer:${submissionId}`)
      .on("broadcast", { event: "timer" }, ({ payload }) => {
        const { secondsLeft: sl, status: st } = payload as Broadcast;
        secondsLeftRef.current = sl;
        setStatus(st);
        setMins(Math.floor(sl / 60));
        setSecs(sl % 60);
      })
      .subscribe();

    // @ts-expect-error – channel type is complex; ref is typed loosely above
    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
    };
  }, [submissionId]);

  // ── Interval ticker ────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "running") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      const next = secondsLeftRef.current - 1;

      if (next <= 0) {
        secondsLeftRef.current = 0;
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setStatus("idle");
        setMins(0);
        setSecs(0);
        if (isOwner) broadcast(0, "idle");
        return;
      }

      secondsLeftRef.current = next;
      setMins(Math.floor(next / 60));
      setSecs(next % 60);
      if (isOwner) broadcast(next, "running");
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, isOwner, broadcast]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (!isOwner) return;
    const total = mins * 60 + secs;
    if (total <= 0) return;
    secondsLeftRef.current = total;
    setStatus("running");
    broadcast(total, "running");
  }, [isOwner, mins, secs, broadcast]);

  const handlePause = useCallback(() => {
    if (!isOwner) return;
    setStatus("paused");
    broadcast(secondsLeftRef.current, "paused");
  }, [isOwner, broadcast]);

  const handleReset = useCallback(() => {
    if (!isOwner) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus("idle");
    // Keep whatever values are currently in the inputs as the reset target
    secondsLeftRef.current = mins * 60 + secs;
    broadcast(mins * 60 + secs, "idle");
  }, [isOwner, mins, secs, broadcast]);

  // ── Input adjusters ────────────────────────────────────────────────────────
  const adjMins = (delta: number) => {
    if (!isEditable) return;
    setMins((prev) => clamp(prev + delta, 0, 999));
  };

  const adjSecs = (delta: number) => {
    if (!isEditable) return;
    setSecs((prev) => clamp(prev + delta, 0, 59));
  };

  // Shared input class
  const inputCls = [
    "w-14 py-2 text-center text-2xl font-bold font-mono rounded-lg border",
    "bg-surface-muted/40 focus:outline-none transition-colors",
    "focus:border-accent",
    borderColor,
    textColor,
    !isEditable ? "cursor-default select-none caret-transparent" : "",
    // hide native number spinners
    "[appearance:textfield]",
    "[&::-webkit-outer-spin-button]:appearance-none",
    "[&::-webkit-inner-spin-button]:appearance-none",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={[
        "rounded-xl border bg-surface-muted/20 p-4 space-y-3 transition-colors duration-300",
        borderColor,
        shouldPulse ? "animate-pulse" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">Timer</p>

      {/* ── MM : SS inputs ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-1.5">
        {/* Minutes */}
        <div className="flex flex-col items-center gap-0.5">
          <ArrowBtn
            direction="up"
            onClick={() => adjMins(1)}
            disabled={!isEditable}
          />
          <input
            type="number"
            min={0}
            max={999}
            value={mins}
            readOnly={!isEditable}
            onChange={(e) => {
              if (!isEditable) return;
              const v = parseInt(e.target.value, 10);
              setMins(isNaN(v) ? 0 : clamp(v, 0, 999));
            }}
            className={inputCls}
          />
          <ArrowBtn
            direction="down"
            onClick={() => adjMins(-1)}
            disabled={!isEditable}
          />
        </div>

        {/* Colon */}
        <span
          className={`text-2xl font-bold font-mono select-none mb-0.5 ${textColor}`}
        >
          :
        </span>

        {/* Seconds */}
        <div className="flex flex-col items-center gap-0.5">
          <ArrowBtn
            direction="up"
            onClick={() => adjSecs(1)}
            disabled={!isEditable}
          />
          <input
            type="number"
            min={0}
            max={59}
            value={String(secs).padStart(2, "0")}
            readOnly={!isEditable}
            onChange={(e) => {
              if (!isEditable) return;
              const v = parseInt(e.target.value, 10);
              setSecs(isNaN(v) ? 0 : clamp(v, 0, 59));
            }}
            className={inputCls}
          />
          <ArrowBtn
            direction="down"
            onClick={() => adjSecs(-1)}
            disabled={!isEditable}
          />
        </div>
      </div>

      {/* ── Owner controls ───────────────────────────────────────────────── */}
      {isOwner && (
        <div className="flex gap-1.5">
          {status === "idle" && (
            <button
              type="button"
              onClick={handleStart}
              disabled={totalInput <= 0}
              className="flex-1 rounded-lg bg-accent py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Start
            </button>
          )}

          {status === "running" && (
            <>
              <button
                type="button"
                onClick={handlePause}
                className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/10 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-border bg-surface-muted/30 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-surface-muted transition-colors"
              >
                Reset
              </button>
            </>
          )}

          {status === "paused" && (
            <>
              <button
                type="button"
                onClick={handleStart}
                className="flex-1 rounded-lg bg-accent py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-border bg-surface-muted/30 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-surface-muted transition-colors"
              >
                Reset
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Viewer status line ───────────────────────────────────────────── */}
      {!isOwner && (
        <p className="text-center text-[10px] text-zinc-600">
          {status === "idle"
            ? "No timer active"
            : status === "running"
            ? "Timer running"
            : "Timer paused"}
        </p>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M5 15l7-7 7 7"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}
