"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

type Role = "diner" | "admin" | "venue_staff";

type Props = {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    role: Role;
    disabled: boolean;
    total_bookings: number;
    created_at: string;
  };
};

export function UserRow({ user }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function patch(body: Record<string, unknown>) {
    start(async () => {
      setErr(null);
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <tr className={user.disabled ? "opacity-60" : ""}>
      <td className="px-4 py-2">{user.full_name ?? "—"}</td>
      <td className="px-4 py-2">{user.email}</td>
      <td className="px-4 py-2">
        <select
          value={user.role}
          disabled={pending}
          onChange={(e) => patch({ role: e.target.value as Role })}
          className="h-7 rounded-md border border-border bg-card px-2 text-xs"
        >
          <option value="diner">diner</option>
          <option value="venue_staff">venue_staff</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td className="px-4 py-2">{user.total_bookings}</td>
      <td className="px-4 py-2 text-xs text-muted-foreground">
        {format(new Date(user.created_at), "d MMM yyyy")}
      </td>
      <td className="px-4 py-2 text-right">
        <button
          type="button"
          onClick={() => patch({ disabled: !user.disabled })}
          disabled={pending}
          className="text-xs text-accent hover:underline disabled:opacity-50"
        >
          {pending
            ? "Saving…"
            : user.disabled
              ? "Reactivate"
              : "Deactivate"}
        </button>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </td>
    </tr>
  );
}
