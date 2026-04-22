import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { motion, useScroll, useTransform } from "framer-motion";
import { Sparkles, LayoutDashboard, Zap, Shield, BarChart3, Terminal, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PretextShell } from "@/components/pretext/pretext-shell";
import { pretextGradientCtaClassName } from "@/components/pretext/pretext-confirmation-shell";
import { cn } from "@/lib/utils";
import { getSafePostLoginPath } from "@/lib/post-login-redirect";

const FEATURES = [
  { title: "Tasks that stay honest", body: "Pretext-aware layout and voice-ready flows keep your backlog legible under pressure.", icon: LayoutDashboard },
  { title: "Step-up when it matters", body: "MFA handoffs and confirmations use the same glass shell you trust for sensitive moves.", icon: Shield },
  { title: "Signals, not noise", body: "Analytics and rewards stay glanceable — the canvas is for doing, not decoding.", icon: BarChart3 },
];

const PHILOSOPHY_LINES = [
  { heading: "Fleeting by design", body: "Tasks are not monuments. They appear, demand attention, and dissolve — like the chips that scatter when your cursor arrives. Chase them and they retreat; let them breathe and they settle." },
  { heading: "Measured in motion", body: "Productivity is not a number on a dashboard. It is the arc of a day: bursts of focus, valleys of rest, the quiet satisfaction of marking something done before it marked you." },
  { heading: "Glass, not walls", body: "Every surface in AxTask is translucent — the confirm shell, the login card, the orbs behind them. Transparency is the point: nothing hides, nothing pretends." },
];

const AMBIENT_CHIP_LABELS = ["Done", "Shipped", "Closed", "Nailed It", "Checked", "Complete"] as const;

/** Placeholder slides until a hero MP4 ships; swap URLs without code changes. */
const SHOWCASE_SLIDES = [
  { label: "Dashboard pulse", src: "/icons/icon-192.svg" },
  { label: "Task focus", src: "/favicon.png" },
];

function buildLoginHref(opts: { register?: boolean; next?: string | null }) {
  const q = new URLSearchParams();
  if (opts.register) q.set("mode", "register");
  if (opts.next) q.set("next", opts.next);
  const s = q.toString();
  return s ? `/login?${s}` : "/login";
}

export default function LandingPage() {
  const search = useSearch();
  const nextRaw = useMemo(() => {
    try {
      return new URLSearchParams(search).get("next");
    } catch {
      return null;
    }
  }, [search]);

  const nextSafe = useMemo(() => getSafePostLoginPath(nextRaw), [nextRaw]);
  const nextForLinks = nextSafe ?? undefined;

  const loginHref = useMemo(() => buildLoginHref({ next: nextForLinks }), [nextForLinks]);
  const registerHref = useMemo(() => buildLoginHref({ register: true, next: nextForLinks }), [nextForLinks]);

  const featuresRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: featuresRef,
    offset: ["start end", "end start"],
  });
  const featuresY = useTransform(scrollYProgress, [0, 1], [48, -48]);

  return (
    <PretextShell
      chips={AMBIENT_CHIP_LABELS}
      className="relative min-h-dvh w-full overflow-x-hidden text-white"
    >
      <header className="relative z-10 border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <img
              src="/branding/axtask-logo.png"
              alt=""
              className="h-10 w-10 rounded-xl border border-white/20 bg-white/10 object-cover shadow-sm"
            />
            <span className="text-lg font-semibold tracking-tight bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 bg-clip-text text-transparent">
              AxTask
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" className="text-slate-200 hover:text-white hover:bg-white/10" asChild>
              <Link href={loginHref}>Log in</Link>
            </Button>
            <Button className={cn("h-9 px-4 text-sm", pretextGradientCtaClassName)} asChild>
              <Link href={registerHref}>Sign up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto max-w-4xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-emerald-300/90">
            Intelligent task management
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
            Your workspace,{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-200 bg-clip-text text-transparent">
              measured in motion
            </span>
            .
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-slate-300 sm:text-lg">
            Pretext-grade glass, MFA that feels like a ritual, and a canvas that stays calm when the day does not.
            Scroll for the tour — then step in when you are ready.
          </p>
          {nextSafe ? (
            <p className="mx-auto mt-4 max-w-xl rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100/95">
              You were headed to <span className="font-mono text-amber-50">{nextSafe}</span>. Log in and we will
              drop you there after sign-in.
            </p>
          ) : null}
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className={cn("h-12 min-w-[180px] px-8", pretextGradientCtaClassName)} asChild>
              <Link href={loginHref}>
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Log in
                </span>
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 min-w-[180px] border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              asChild
            >
              <Link href={registerHref}>Create an account</Link>
            </Button>
          </div>
        </section>

        <section ref={featuresRef} className="relative border-t border-white/10 bg-black/15 py-20">
          <motion.div style={{ y: featuresY }} className="mx-auto grid max-w-5xl gap-8 px-4 sm:grid-cols-3 sm:px-6">
            {FEATURES.map(({ title, body, icon: Icon }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/15 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur-xl ring-1 ring-white/[0.06]"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/15 border border-emerald-300/25">
                  <Icon className="h-5 w-5 text-emerald-300" />
                </div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
              </div>
            ))}
          </motion.div>
        </section>

        <section className="border-t border-white/10 bg-black/20 py-14">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-950/20 p-6 sm:p-8 backdrop-blur-md ring-1 ring-white/[0.06]">
              <div className="flex items-center gap-2 text-emerald-200/95">
                <Shield className="h-5 w-5 shrink-0" aria-hidden />
                <h2 className="text-base font-semibold tracking-tight">Security at a glance</h2>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-300 leading-relaxed list-disc pl-5">
                <li>Passwords: scrypt with a unique salt per account.</li>
                <li>Authenticator (TOTP) secrets: AES-256-GCM at rest.</li>
                <li>Sessions: server-side, with signed cookies and MFA step-up for sensitive exports.</li>
                <li>
                  Community and collab content: protected by your login, app permissions, and TLS — not
                  end-to-end encrypted like a dedicated messenger unless we ship and advertise that separately.
                </li>
              </ul>
              <p className="mt-4 text-xs text-slate-500">
                Details in the{" "}
                <Link href="/privacy" className="text-emerald-300/90 underline-offset-4 hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300/90">Philosophy</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
                Why the chips{" "}
                <span className="bg-gradient-to-r from-violet-300 via-fuchsia-200 to-pink-200 bg-clip-text text-transparent">
                  run away
                </span>
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
                Move your cursor over the floating labels. They scatter — because that is what tasks do when you reach for too many at once.
              </p>
            </div>
            <div className="space-y-8">
              {PHILOSOPHY_LINES.map(({ heading, body }) => (
                <motion.div
                  key={heading}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.5 }}
                  className="rounded-2xl border border-white/12 bg-white/[0.05] backdrop-blur-md p-6 sm:p-8 ring-1 ring-white/[0.05]"
                >
                  <div className="flex items-start gap-4">
                    <Quote className="mt-1 h-5 w-5 shrink-0 text-violet-400/60" />
                    <div>
                      <h3 className="text-lg font-semibold text-white">{heading}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-300/90">Showcase</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Built like a product film — frame by frame</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
                Cross-fading placeholders stand in for a future hero reel. Swap in an MP4 when production is ready.
              </p>
            </div>
            <ShowcaseDeck />
          </div>
        </section>

        <footer className="border-t border-white/10 py-16 text-center">
          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed mb-4">
            AxTask — where tasks are fleeting, the canvas is calm, and every surface is glass.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <Link
              href="/contact"
              className="underline-offset-4 transition-colors hover:text-emerald-200/90 hover:underline"
            >
              Contact
            </Link>
            <span className="text-slate-700" aria-hidden>
              &middot;
            </span>
            <Link
              href="/privacy"
              className="underline-offset-4 transition-colors hover:text-emerald-200/90 hover:underline"
            >
              Privacy
            </Link>
            <span className="text-slate-700" aria-hidden>
              &middot;
            </span>
            <Link
              href="/terms"
              className="underline-offset-4 transition-colors hover:text-emerald-200/90 hover:underline"
            >
              Terms
            </Link>
          </div>
        </footer>
      </main>
    </PretextShell>
  );
}

function ShowcaseDeck() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SHOWCASE_SLIDES.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-stretch">
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-black/40 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2 text-xs text-slate-400">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <span className="font-mono">axtask / dev</span>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-4 text-left text-[11px] leading-relaxed text-emerald-100/90 sm:text-xs">
          <code>
            {`$ axtask status --verbose
✓ Session warm
✓ MFA handoff channel listening
→ Tasks synced (local-first)

Ready when you are.`}
          </code>
        </pre>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          Terminal mock — style reference for future CLI stories
        </div>
      </div>

      <div className="relative min-h-[240px] overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900/90 to-indigo-950/90 shadow-2xl backdrop-blur-xl sm:min-h-[280px]">
        {SHOWCASE_SLIDES.map((slide, i) => (
          <motion.div
            key={slide.label}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8"
            initial={false}
            animate={{ opacity: i === index ? 1 : 0 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
            aria-hidden={i !== index}
          >
            <img src={slide.src} alt="" className="h-24 w-24 opacity-90 drop-shadow-lg sm:h-28 sm:w-28" />
            <p className="text-sm font-medium text-slate-200">{slide.label}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
