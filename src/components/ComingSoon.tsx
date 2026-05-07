import Link from "next/link";

type Props = {
  section: string;
  description: string;
};

export function ComingSoon({ section, description }: Props) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Link
        href="/"
        className="text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground"
      >
        ← Übersicht
      </Link>
      <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
        {section}
      </p>
      <h1 className="font-heading text-5xl font-semibold tracking-tight lg:text-6xl">
        Bald verfügbar
      </h1>
      <p className="max-w-md text-sm text-muted-foreground lg:text-base">{description}</p>
    </main>
  );
}
