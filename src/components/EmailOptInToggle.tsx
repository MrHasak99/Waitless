"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function EmailOptInToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [optIn, setOptIn] = useState(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggle() {
    const next = !optIn;
    setOptIn(next);
    start(async () => {
      setErr(null);
      const res = await fetch("/api/settings/email-opt-in", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: next }),
      });
      if (!res.ok) {
        setOptIn(!next);
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Could not save.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex items-center justify-between gap-4">
      <span>
        <span className="block font-medium">Transactional emails</span>
        <span className="text-xs text-muted-foreground">
          Booking confirmations, 24h reminders, payment receipts.
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={optIn}
        onClick={toggle}
        disabled={pending}
        className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${
          optIn ? "bg-accent" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            optIn ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </label>
  );
}
