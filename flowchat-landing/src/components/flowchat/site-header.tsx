import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-foreground"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-gold text-xs font-bold text-gold-foreground">
            f
          </span>
          Flowchat
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a
            href="#examples"
            className="transition-colors hover:text-foreground"
          >
            Examples
          </a>
          <a
            href="#pricing"
            className="transition-colors hover:text-foreground"
          >
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            Start for free
          </Link>
        </div>
      </div>
    </header>
  );
}
