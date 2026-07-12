import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { HeroAnimation } from "./hero-animation";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-2 lg:gap-8 lg:pb-28 lg:pt-20">
        <div className="flex flex-col items-start">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-gold" />
            Automation for everyone
          </span>
          <h1 className="text-balance text-5xl font-semibold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Stop doing it
            <br />
            manually.
            <br />
            <span className="font-serif text-gold italic">Just describe it.</span>
          </h1>
          <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
            Flowchat is automation for everyone. Type what you want in plain
            language, and it builds, runs, and maintains it forever.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Start for free
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <a
              href="#examples"
              className="inline-flex items-center justify-center rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              See examples
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card · Free to start
          </p>
        </div>
        <div className="w-full">
          <HeroAnimation />
        </div>
      </div>
    </section>
  );
}
