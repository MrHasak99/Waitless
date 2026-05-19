"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Series = { date: string; signups: number; bookings: number };

export function SignupBookingChart({ data }: { data: Series[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Last 30 days · signups vs bookings
      </p>
      <div className="mt-3 h-64 w-full">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="signups" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c2410c" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#c2410c" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="bookings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
              }}
            />
            <Area
              type="monotone"
              dataKey="signups"
              stroke="#c2410c"
              fill="url(#signups)"
              strokeWidth={2}
              name="Signups"
            />
            <Area
              type="monotone"
              dataKey="bookings"
              stroke="#0ea5e9"
              fill="url(#bookings)"
              strokeWidth={2}
              name="Bookings"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
