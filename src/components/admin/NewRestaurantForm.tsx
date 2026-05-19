"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { KUWAIT_CENTER } from "@/lib/distance";

export function NewRestaurantForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    cuisine: "",
    description: "",
    address: "",
    area: "",
    phone: "",
    lat: KUWAIT_CENTER.lat,
    lng: KUWAIT_CENTER.lng,
    opens_at: "12:00",
    closes_at: "23:00",
    deposit_threshold: 6,
    deposit_kwd: 5,
    merge_fee_kwd: 2,
    borrow_seat_fee_kwd: 0.5,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm({ ...form, [k]: v });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      setErr(null);
      const res = await fetch("/api/admin/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Could not create restaurant.");
        return;
      }
      const { id } = await res.json();
      router.push(`/admin/restaurants/${id}`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      <Field label="Name" required>
        <Input
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label="Cuisine">
        <Input
          value={form.cuisine}
          onChange={(e) => set("cuisine", e.target.value)}
          placeholder="Levantine, Italian, Kuwaiti…"
        />
      </Field>
      <Field label="Area">
        <Input
          value={form.area}
          onChange={(e) => set("area", e.target.value)}
          placeholder="Salmiya, Shaab…"
        />
      </Field>
      <Field label="Phone">
        <Input
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="+965…"
        />
      </Field>
      <Field label="Address" required className="sm:col-span-2">
        <Input
          required
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
          value={form.opens_at}
          onChange={(e) => set("opens_at", e.target.value)}
        />
      </Field>
      <Field label="Closes at">
        <Input
          type="time"
          value={form.closes_at}
          onChange={(e) => set("closes_at", e.target.value)}
        />
      </Field>
      <Field label="Deposit threshold (party size)">
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
          {pending ? "Creating…" : "Create restaurant"}
        </Button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className ?? ""}`}>
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}
