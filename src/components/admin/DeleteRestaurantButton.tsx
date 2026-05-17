"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteRestaurantButton({
  id,
  isDeleted,
}: {
  id: string;
  isDeleted: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    if (
      !isDeleted &&
      !confirm("Hide this restaurant from diners? Existing bookings stay.")
    ) {
      return;
    }
    start(async () => {
      await fetch(`/api/admin/restaurants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deleted: !isDeleted,
        }),
      });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="text-xs text-accent hover:underline disabled:opacity-50"
    >
      {pending ? "Saving…" : isDeleted ? "Restore" : "Hide"}
    </button>
  );
}
