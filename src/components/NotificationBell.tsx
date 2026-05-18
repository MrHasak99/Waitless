"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Notification } from "@/lib/supabase/types";

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let mounted = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (mounted) setItems((data ?? []) as Notification[]);

      const channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setItems((current) => {
              if (payload.eventType === "INSERT") {
                return [payload.new as Notification, ...current].slice(0, 20);
              }
              if (payload.eventType === "UPDATE") {
                return current.map((n) =>
                  n.id === (payload.new as Notification).id
                    ? (payload.new as Notification)
                    : n,
                );
              }
              if (payload.eventType === "DELETE") {
                return current.filter(
                  (n) => n.id !== (payload.old as Notification).id,
                );
              }
              return current;
            });
          },
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function markRead(n: Notification) {
    if (n.read) return;
    // Optimistic — clear immediately so the badge updates even if the user
    // navigates away before the DB UPDATE round-trips.
    setItems((curr) =>
      curr.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
    );
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", n.id);
    if (error) {
      // Roll back on failure.
      setItems((curr) =>
        curr.map((x) => (x.id === n.id ? { ...x, read: false } : x)),
      );
    }
  }

  async function markAllRead() {
    if (unread === 0) return;
    // Optimistic — flip every unread item in local state.
    setItems((curr) =>
      curr.map((x) => (x.read ? x : { ...x, read: true })),
    );
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 hover:bg-muted"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-accent-foreground">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-accent hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </li>
            )}
            {items.map((n) => {
              const content = (
                <div
                  className={`flex flex-col gap-1 px-3 py-2 hover:bg-muted ${
                    n.read ? "opacity-70" : ""
                  }`}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              );
              return (
                <li key={n.id} onClick={() => markRead(n)}>
                  {n.href ? (
                    <Link href={n.href} onClick={() => setOpen(false)}>
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
