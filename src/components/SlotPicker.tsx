"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, isSameDay } from "date-fns";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { TimeSlot } from "@/lib/supabase/types";
import type { Suggestion } from "@/lib/booking/suggest";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Props = {
  restaurantId: string;
  depositThreshold: number;
  depositKwd: number;
  initialSlots: TimeSlot[];
};

type SlotState = "available" | "almost-full" | "full";

function slotState(slot: TimeSlot, party: number): SlotState {
  const remaining = slot.capacity - slot.booked_count;
  if (remaining < party) return "full";
  if (remaining / slot.capacity < 0.2) return "almost-full";
  return "available";
}

type SuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "single_table_ok" }
  | { status: "options"; suggestions: Suggestion[] }
  | { status: "no_arrangement_possible" }
  | { status: "slot_full" };

export function SlotPicker({
  restaurantId,
  depositThreshold,
  depositKwd,
  initialSlots,
}: Props) {
  const router = useRouter();
  const [slots, setSlots] = useState(initialSlots);
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState<Date>(() => {
    const d = initialSlots[0]?.start_time
      ? new Date(initialSlots[0].start_time)
      : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<SuggestState>({ status: "idle" });
  const [chosenArrangement, setChosenArrangement] = useState<Suggestion | null>(
    null,
  );
  const [waitlist, setWaitlist] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "joined"; position: number; alreadyJoined: boolean }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`slots-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_slots",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setSlots((current) => {
            const next = [...current];
            if (payload.eventType === "DELETE") {
              return next.filter((s) => s.id !== (payload.old as TimeSlot).id);
            }
            const row = payload.new as TimeSlot;
            const idx = next.findIndex((s) => s.id === row.id);
            if (idx >= 0) next[idx] = row;
            else next.push(row);
            return next;
          });
        },
      )
      .subscribe((status) => {
        setStale(status !== "SUBSCRIBED");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const days = useMemo(() => {
    const map = new Map<string, Date>();
    for (const s of slots) {
      const d = new Date(s.start_time);
      d.setHours(0, 0, 0, 0);
      map.set(d.toISOString(), d);
    }
    return Array.from(map.values()).sort((a, b) => a.getTime() - b.getTime());
  }, [slots]);

  const slotsForDay = useMemo(
    () =>
      slots
        .filter((s) => isSameDay(new Date(s.start_time), date))
        .sort(
          (a, b) =>
            new Date(a.start_time).getTime() -
            new Date(b.start_time).getTime(),
        ),
    [slots, date],
  );

  const selected = slots.find((s) => s.id === selectedSlot);
  const depositNeeded = partySize >= depositThreshold;
  const arrangementFee = chosenArrangement?.fee ?? 0;
  const blockedBySuggestion =
    suggest.status === "options" && !chosenArrangement;

  async function fetchAiHint(slotId: string, party: number) {
    setAiHint("Analyzing slot…");
    const res = await fetch("/api/ai/capacity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, partySize: party }),
    });
    if (!res.ok) {
      setAiHint(null);
      return;
    }
    const json = await res.json();
    setAiHint(`${json.reason} · est. wait ${json.estimatedWaitMin} min`);
  }

  async function fetchSuggestions(slotId: string, party: number) {
    setSuggest({ status: "loading" });
    setChosenArrangement(null);
    const res = await fetch("/api/bookings/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, partySize: party }),
    });
    if (!res.ok) {
      setSuggest({ status: "idle" });
      return;
    }
    const json = await res.json();
    if (json.status === "single_table_ok") {
      setSuggest({ status: "single_table_ok" });
    } else if (json.status === "options") {
      setSuggest({ status: "options", suggestions: json.suggestions });
    } else if (json.status === "slot_full") {
      setSuggest({ status: "slot_full" });
    } else {
      setSuggest({ status: "no_arrangement_possible" });
    }
  }

  function selectSlot(id: string) {
    setSelectedSlot(id);
    setError(null);
    setWaitlist({ status: "idle" });
    void fetchAiHint(id, partySize);
    void fetchSuggestions(id, partySize);
  }

  function changeParty(n: number) {
    setPartySize(n);
    setChosenArrangement(null);
    setWaitlist({ status: "idle" });
    if (selectedSlot) {
      void fetchAiHint(selectedSlot, n);
      void fetchSuggestions(selectedSlot, n);
    }
  }

  async function joinWaitlist() {
    if (!selected) return;
    setWaitlist({ status: "loading" });
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: selected.id, partySize }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setWaitlist({
        status: "error",
        message: body.error ?? "Could not join the waitlist.",
      });
      return;
    }
    const json = await res.json();
    setWaitlist({
      status: "joined",
      position: json.position,
      alreadyJoined: Boolean(json.alreadyJoined),
    });
  }

  async function handleBook() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: selected.id,
        partySize,
        arrangement: chosenArrangement,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Unknown error" }));
      setError(body.error ?? "Booking failed");
      return;
    }
    const { bookingId } = await res.json();
    router.push(`/bookings/${bookingId}`);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {stale && (
        <div className="mb-3 rounded-md bg-yellow-100 px-3 py-2 text-xs text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200">
          Live updates disconnected — refreshing manually may be needed.
        </div>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Party size
          </label>
          <Input
            type="number"
            min={1}
            max={20}
            value={partySize}
            onChange={(e) => changeParty(Math.max(1, Number(e.target.value)))}
            className="mt-1 w-24"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Date
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {days.map((d) => (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => {
                  setDate(d);
                  setSelectedSlot(null);
                  setSuggest({ status: "idle" });
                  setChosenArrangement(null);
                }}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  isSameDay(d, date)
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {format(d, "EEE d MMM")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Time
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {slotsForDay.map((s) => {
            const state = slotState(s, partySize);
            const label = format(new Date(s.start_time), "HH:mm");
            return (
              <button
                key={s.id}
                type="button"
                disabled={state === "full"}
                onClick={() => selectSlot(s.id)}
                className={`rounded-md border px-3 py-2 text-sm ${
                  selectedSlot === s.id
                    ? "border-accent bg-accent text-accent-foreground"
                    : state === "full"
                      ? "border-border bg-muted text-muted-foreground"
                      : state === "almost-full"
                        ? "border-yellow-400 bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200"
                        : "border-border bg-card hover:bg-muted"
                }`}
              >
                <div className="font-medium">{label}</div>
                <div className="text-[10px] uppercase tracking-wider">
                  {state === "full"
                    ? "Full"
                    : state === "almost-full"
                      ? "Almost full"
                      : `${s.capacity - s.booked_count} left`}
                </div>
              </button>
            );
          })}
          {slotsForDay.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              No slots configured for this day.
            </p>
          )}
        </div>
      </div>

      {selected && (
        <div className="mt-5 rounded-md border border-border bg-muted/40 p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">
              {format(new Date(selected.start_time), "EEEE d MMM · HH:mm")} ·{" "}
              {partySize} {partySize === 1 ? "guest" : "guests"}
            </p>
            {depositNeeded && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                Deposit {depositKwd.toFixed(3)} KWD
              </span>
            )}
          </div>
          {aiHint && (
            <p className="mt-2 text-xs text-muted-foreground">{aiHint}</p>
          )}

          <SuggestionPanel
            state={suggest}
            chosen={chosenArrangement}
            onChoose={setChosenArrangement}
            waitlist={waitlist}
            onJoinWaitlist={joinWaitlist}
          />

          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button
            className="mt-4 w-full"
            onClick={handleBook}
            disabled={
              submitting ||
              blockedBySuggestion ||
              suggest.status === "slot_full" ||
              suggest.status === "no_arrangement_possible"
            }
          >
            {submitting
              ? "Booking…"
              : chosenArrangement
                ? `Confirm — service fee ${arrangementFee.toFixed(3)} KWD`
                : depositNeeded
                  ? "Reserve & pay deposit"
                  : "Confirm booking"}
          </Button>
        </div>
      )}
    </div>
  );
}

type WaitlistState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "joined"; position: number; alreadyJoined: boolean }
  | { status: "error"; message: string };

function SuggestionPanel({
  state,
  chosen,
  onChoose,
  waitlist,
  onJoinWaitlist,
}: {
  state: SuggestState;
  chosen: Suggestion | null;
  onChoose: (s: Suggestion | null) => void;
  waitlist: WaitlistState;
  onJoinWaitlist: () => void;
}) {
  if (state.status === "idle" || state.status === "single_table_ok") {
    return null;
  }
  if (state.status === "loading") {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Checking the floor plan…
      </p>
    );
  }
  if (state.status === "slot_full") {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-sm text-red-600">
          This slot is full for your party size.
        </p>
        <WaitlistCta state={waitlist} onJoin={onJoinWaitlist} />
      </div>
    );
  }
  if (state.status === "no_arrangement_possible") {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          No single table or workable combination fits your party at this time.
          Try a smaller party, a different time, or join the waitlist.
        </p>
        <WaitlistCta state={waitlist} onJoin={onJoinWaitlist} />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Your party needs a custom arrangement — pick one
      </p>
      {state.suggestions.map((s, i) => {
        const isPicked =
          chosen &&
          chosen.kind === s.kind &&
          JSON.stringify(chosen) === JSON.stringify(s);
        return (
          <button
            type="button"
            key={i}
            onClick={() => onChoose(isPicked ? null : s)}
            className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm ${
              isPicked
                ? "border-accent bg-accent/10"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            <div>
              {s.kind === "merge" ? (
                <>
                  <p className="font-medium">
                    Combine {s.labels.join(" + ")} ({s.totalSeats} seats)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tables pulled together for your party.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">
                    Add {s.seats} chair{s.seats === 1 ? "" : "s"} to {s.toLabel}{" "}
                    from {s.fromLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Temporary borrow for the duration of your booking.
                  </p>
                </>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-medium text-accent">
                {s.fee.toFixed(3)} KWD
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                service fee
              </p>
            </div>
          </button>
        );
      })}
      {chosen && (
        <p className="text-[11px] text-muted-foreground">
          Tap the option again to deselect.
        </p>
      )}
    </div>
  );
}

function WaitlistCta({
  state,
  onJoin,
}: {
  state: WaitlistState;
  onJoin: () => void;
}) {
  if (state.status === "joined") {
    return (
      <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200">
        {state.alreadyJoined
          ? `You're already on the waitlist at position #${state.position}.`
          : `You're on the waitlist at position #${state.position}. We'll notify you the moment a seat opens.`}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onJoin}
        disabled={state.status === "loading"}
      >
        {state.status === "loading" ? "Joining…" : "Join the waitlist"}
      </Button>
      <span className="text-xs text-muted-foreground">
        Get notified if a seat opens before service.
      </span>
      {state.status === "error" && (
        <span className="text-xs text-red-600">{state.message}</span>
      )}
    </div>
  );
}
