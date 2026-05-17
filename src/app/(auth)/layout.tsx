import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Waitless
        </Link>
      </div>
      <div className="mx-auto max-w-sm px-4 pt-12">{children}</div>
    </main>
  );
}
