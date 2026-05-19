"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function CancelButton({
  bookingId,
  autoConfirm,
}: {
  bookingId: string;
  autoConfirm?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);

  async function doCancel() {
    if (loading) return;
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

  // One-click cancel from the reminder email: `?action=cancel` auto-opens
  // the confirm dialog so the user only has to acknowledge once.
  useEffect(() => {
    if (autoConfirm && !triggered.current) {
      triggered.current = true;
      void doCancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirm]);

  return (
    <div>
      <Button variant="danger" onClick={doCancel} disabled={loading}>
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
