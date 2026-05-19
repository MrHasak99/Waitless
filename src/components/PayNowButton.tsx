"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function PayNowButton({
  bookingId,
  amount,
}: {
  bookingId: string;
  amount: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/payments/initiate/${bookingId}`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      setError(body.error ?? "Could not start payment.");
      return;
    }
    const { invoiceUrl } = await res.json();
    // Redirect to MyFatoorah. The callback route brings the user back.
    window.location.href = invoiceUrl;
  }

  return (
    <div>
      <Button onClick={pay} disabled={loading}>
        {loading ? "Redirecting…" : `Pay ${amount.toFixed(3)} KWD now`}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        You&apos;ll be redirected to MyFatoorah&apos;s secure sandbox.
      </p>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
