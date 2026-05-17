"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function CancelButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!confirm("Cancel this booking?")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: "POST",
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Cancel failed");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button variant="danger" onClick={handleCancel} disabled={loading}>
        {loading ? "Cancelling…" : "Cancel booking"}
      </Button>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
