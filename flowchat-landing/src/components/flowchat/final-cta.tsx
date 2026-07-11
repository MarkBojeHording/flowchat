import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 text-center lg:py-28">
      <Reveal>
        <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
          Stop doing it manually.
          <br />
          <span className="font-serif text-gold italic">Start today.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-pretty text-lg text-muted-foreground">
          Takes 3 minutes to set up your first automation.
        </p>
        <Link
          href="/dashboard"
          className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Start for free
          <ArrowRight
            size={16}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">
          No credit card required
        </p>
      </Reveal>
    </section>
  );
}
