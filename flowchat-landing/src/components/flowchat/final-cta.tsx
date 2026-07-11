import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
      <Reveal>
        <div
          className="relative overflow-hidden rounded-3xl px-8 py-20 text-center"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(232,160,32,0.25) 0%, transparent 60%), #1a1108",
          }}
        >
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Stop doing it manually.
            <br />
            <span className="font-serif italic text-gold">Start today.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-pretty text-lg text-white/60">
            Takes 3 minutes to set up your first automation.
          </p>
          <Link
            href="/dashboard"
            className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-gold-foreground transition-transform hover:-translate-y-0.5"
          >
            Start for free
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          <p className="mt-4 text-sm text-white/40">No credit card required</p>
        </div>
      </Reveal>
    </section>
  );
}
