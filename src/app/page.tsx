import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <main className="flex-1">
      <nav className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Waitless
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-3xl px-4 pt-20 pb-12 text-center">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-accent">
          Kuwait · Beta
        </p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
          See the floor. Pick your table.
          <br />
          Skip the call.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-muted-foreground">
          Live table availability across Kuwait&apos;s busiest cafes and
          restaurants. Instant confirmation. AI-managed waitlist when seats
          fill up.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/sign-up">
            <Button size="lg">Find a table tonight</Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="secondary">
              Browse restaurants
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 pb-24 md:grid-cols-3">
        {[
          {
            title: "Live floor plan",
            body: "Tables update in real time as diners arrive and leave — powered by Supabase Realtime.",
          },
          {
            title: "Predictive capacity",
            body: "Our AI engine reads historical patterns to estimate wait times and flag high-risk bookings.",
          },
          {
            title: "Guaranteed seats",
            body: "Deposits kick in automatically for large parties on peak slots — your reservation is held.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-border bg-card p-5"
          >
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
