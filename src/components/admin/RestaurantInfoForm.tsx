"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Restaurant } from "@/lib/supabase/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function RestaurantInfoForm({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [form, setForm] = useState({
    name: restaurant.name,
    cuisine: restaurant.cuisine ?? "",
    description: restaurant.description ?? "",
    address: restaurant.address,
    area: restaurant.area ?? "",
    phone: restaurant.phone ?? "",
    lat: restaurant.lat,
    lng: restaurant.lng,
    opens_at: restaurant.opens_at,
    closes_at: restaurant.closes_at,
    deposit_threshold: restaurant.deposit_threshold,
    deposit_kwd: Number(restaurant.deposit_kwd),
    merge_fee_kwd: Number(restaurant.merge_fee_kwd),
    borrow_seat_fee_kwd: Number(restaurant.borrow_seat_fee_kwd),
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm({ ...form, [k]: v });
    setOk(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      setErr(null);
      const res = await fetch(`/api/admin/restaurants/${restaurant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Save failed");
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      <Field label="Name">
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
        />
      </Field>
      <Field label="Cuisine">
        <Input
          value={form.cuisine}
          onChange={(e) => set("cuisine", e.target.value)}
        />
      </Field>
      <Field label="Area">
        <Input
          value={form.area}
          onChange={(e) => set("area", e.target.value)}
        />
      </Field>
      <Field label="Phone">
        <Input
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <Input
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Latitude">
        <Input
          type="number"
          step="any"
          value={form.lat}
          onChange={(e) => set("lat", Number(e.target.value))}
        />
      </Field>
      <Field label="Longitude">
        <Input
          type="number"
          step="any"
          value={form.lng}
          onChange={(e) => set("lng", Number(e.target.value))}
        />
      </Field>
      <Field label="Opens at">
        <Input
          type="time"
          value={form.opens_at.slice(0, 5)}
          onChange={(e) => set("opens_at", `${e.target.value}:00`)}
        />
      </Field>
      <Field label="Closes at">
        <Input
          type="time"
          value={form.closes_at.slice(0, 5)}
          onChange={(e) => set("closes_at", `${e.target.value}:00`)}
        />
      </Field>
      <Field label="Deposit required at party size">
        <Input
          type="number"
          min={1}
          max={50}
          value={form.deposit_threshold}
          onChange={(e) =>
            set("deposit_threshold", Math.max(1, Number(e.target.value)))
          }
        />
      </Field>
      <Field label="Deposit (KWD)">
        <Input
          type="number"
          step="0.001"
          min={0}
          value={form.deposit_kwd}
          onChange={(e) => set("deposit_kwd", Number(e.target.value))}
        />
      </Field>
      <Field label="Merge service fee (KWD)">
        <Input
          type="number"
          step="0.001"
          min={0}
          value={form.merge_fee_kwd}
          onChange={(e) => set("merge_fee_kwd", Number(e.target.value))}
        />
      </Field>
      <Field label="Borrowed-seat fee, per seat (KWD)">
        <Input
          type="number"
          step="0.001"
          min={0}
          value={form.borrow_seat_fee_kwd}
          onChange={(e) =>
            set("borrow_seat_fee_kwd", Number(e.target.value))
          }
        />
      </Field>
      <div className="sm:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {ok && <span className="text-sm text-green-600">Saved.</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className ?? ""}`}>
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
