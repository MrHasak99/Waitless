import Link from "next/link";
import { NewRestaurantForm } from "@/components/admin/NewRestaurantForm";

export const dynamic = "force-dynamic";

export default function NewRestaurantPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 text-xs">
        <Link
          href="/admin/restaurants"
          className="text-muted-foreground hover:text-foreground"
        >
          ← All restaurants
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Add restaurant</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        After creating, add tables and generate time slots from the
        restaurant&apos;s detail page.
      </p>
      <div className="mt-6">
        <NewRestaurantForm />
      </div>
    </div>
  );
}
