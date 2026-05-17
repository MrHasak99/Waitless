"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

type Props = {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    role: "diner" | "admin" | "venue_staff";
    disabled: boolean;
    total_bookings: number;
    created_at: string;
  };
};

export function UserRow({ user }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggle() {
    start(async () => {
      setErr(null);
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !user.disabled }),
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
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
          {user.role}
        </span>
      </td>
      <td className="px-4 py-2">{user.total_bookings}</td>
      <td className="px-4 py-2 text-xs text-muted-foreground">
        {format(new Date(user.created_at), "d MMM yyyy")}
      </td>
      <td className="px-4 py-2 text-right">
        <button
          type="button"
          onClick={toggle}
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
