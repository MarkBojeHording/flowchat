"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, Check, Sparkles } from "lucide-react";
import { BrandIcon } from "./brand-tag";

const PROMPT =
  "When someone fills my Typeform, add them to Google Sheets and notify Slack";

const steps = [
  {
    key: "trigger",
    kind: "Trigger",
    brand: "typeform",
    title: "New Typeform response",
    desc: "Runs the moment a form is submitted",
  },
  {
    key: "a1",
    kind: "Action",
    brand: "sheets",
    title: "Add row to Google Sheets",
    desc: "Name, email and answers appended",
  },
  {
    key: "a2",
    kind: "Action",
    brand: "slack",
    title: "Send Slack message",
    desc: "Posts to #leads channel",
  },
];

export function HeroAnimation() {
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let cancelled = false;
    const push = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.current.push(id);
    };
    const run = () => {
      setPhase(0);
      setTyped("");
      const perChar = 34;
      for (let i = 1; i <= PROMPT.length; i++) {
        push(() => setTyped(PROMPT.slice(0, i)), i * perChar);
      }
      const typeDone = PROMPT.length * perChar;
      push(() => setPhase(1), typeDone + 500);
      push(() => setPhase(2), typeDone + 1500);
      push(() => setPhase(3), typeDone + 2400);
      push(() => setPhase(4), typeDone + 3300);
      push(() => setPhase(5), typeDone + 4200);
      push(() => run(), typeDone + 8200);
    };
    run();
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const visibleCards = Math.max(0, phase - 1);

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] opacity-60 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 60% at 70% 20%, rgba(232,160,32,0.22), transparent 70%)",
        }}
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-foreground/5">
        <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-3">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="ml-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles size={13} className="text-gold" />
            Flowchat
          </span>
        </div>
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-left text-sm leading-relaxed text-primary-foreground">
              {typed || <span className="opacity-0">.</span>}
              {phase === 0 && (
                <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-primary-foreground" />
              )}
            </div>
          </div>
          <AnimatePresence>
            {phase >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-gold/15">
                  <Sparkles size={13} className="text-gold" />
                </span>
                {phase < 5 ? (
                  <span className="flex items-center gap-1">
                    Building your automation
                    <TypingDots />
                  </span>
                ) : (
                  <span>Done — your automation is live.</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-3">
            <div className="flex flex-col items-stretch gap-2">
              {steps.map((step, i) => (
                <div key={step.key} className="flex flex-col items-center">
                  <AnimatePresence>
                    {visibleCards > i && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 260,
                          damping: 22,
                        }}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <BrandIcon brand={step.brand} size={20} />
                          <div className="min-w-0">
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wide ${step.kind === "Trigger" ? "text-gold" : "text-muted-foreground"}`}
                            >
                              {step.kind}
                            </span>
                            <p className="truncate text-sm font-medium text-foreground">
                              {step.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {step.desc}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {i < steps.length - 1 && visibleCards > i + 1 && (
                      <motion.div
                        initial={{ opacity: 0, scaleY: 0 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        className="my-1 flex flex-col items-center text-muted-foreground/50"
                      >
                        <ArrowDown size={16} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
              {visibleCards === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Your automation will appear here…
                </p>
              )}
            </div>
            <AnimatePresence>
              {phase >= 5 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 flex items-center justify-center"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <Check size={13} strokeWidth={3} />
                    Live · running 24/7
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  );
}
