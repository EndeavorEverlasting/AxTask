import { useQuery } from "@tanstack/react-query";
import { Crown, Sparkles, Lock, Zap, Brain, BarChart3, Layers, Rocket, GanttChartSquare } from "lucide-react";
import { Link } from "wouter";
import { DonateCta } from "@/components/donate-cta";
import { useAuth } from "@/lib/auth-context";
import { motion } from "framer-motion";

type PremiumCatalog = {
  plans: Array<{
    product: string;
    planKey: string;
    monthlyPriceUsd: number;
    features: string[];
    discountPercentVsSeparate?: number;
  }>;
};

type FeaturePreview = {
  icon: typeof Brain;
  label: string;
  desc: string;
  /** Status shown on the card so users see what's live vs upcoming. */
  status: "shipped" | "in-development";
  /** Optional deep-link for shipped features. */
  href?: string;
};

/**
 * Honest feature ladder: "shipped" items already exist in the product and link
 * to their real surface; "in-development" items are placeholders for roadmap
 * transparency. Do not mark something "shipped" until the underlying code and
 * an unlock path (coins and/or avatar level) both exist.
 */
const FEATURE_PREVIEWS: FeaturePreview[] = [
  {
    icon: GanttChartSquare,
    label: "Gantt Timeline (Free) + Customization Pack",
    desc: "Task timeline on Planner and Analytics. Swimlanes, dependency arrows, and priority coloring unlock via avatar level 3+ or 250 AxCoins.",
    status: "shipped",
    href: "/planner#gantt",
  },
  { icon: Brain, label: "AI-Powered Smart Views", desc: "Auto-curated task boards that learn your workflow.", status: "in-development" },
  { icon: BarChart3, label: "Advanced Analytics", desc: "Deep productivity insights and trend analysis.", status: "in-development" },
  { icon: Layers, label: "Review Workflows", desc: "Automated triage cadences for your backlog.", status: "in-development" },
  { icon: Zap, label: "Bundle Automation", desc: "Cross-product reclassification and auto-reprioritization.", status: "in-development" },
  { icon: Rocket, label: "Weekly Digests", desc: "AI-generated summaries delivered to your inbox.", status: "in-development" },
  { icon: Sparkles, label: "Priority Insights", desc: "Actionable intelligence on stalled and misclassified tasks.", status: "in-development" },
];

export default function PremiumPage() {
  const { user } = useAuth();

  const { data: catalog } = useQuery<PremiumCatalog>({ queryKey: ["/api/premium/catalog"] });
  const plans = catalog?.plans ?? [];

  return (
    <div className="relative min-h-screen overflow-hidden p-6 md:p-10">
      {/* Local amber/violet glows layer over the shared aurora for the premium hero. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl animate-pulse" />
        <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl animate-pulse [animation-delay:1.5s]" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl animate-pulse [animation-delay:3s]" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl space-y-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-amber-500/20 backdrop-blur-md border border-amber-400/30 mx-auto">
            <Crown className="h-10 w-10 text-amber-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent">
            Premium Features
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto text-sm md:text-base">
            We're crafting something extraordinary. Premium subscriptions and payment processing are actively in development.
          </p>
        </motion.div>

        {/* "In Development" banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="rounded-2xl border border-amber-400/20 bg-white/5 backdrop-blur-xl p-6 md:p-8 text-center space-y-4 axtask-calm-blur-fallback"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-4 py-2 border border-amber-400/30">
            <Lock className="h-4 w-4 text-amber-400" />
            <span className="text-amber-300 font-semibold text-sm">Premium Features In Development</span>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed max-w-2xl mx-auto">
            Payment integration and subscription management are being built out. Beta testers will receive special offers
            — including lifetime access — when we launch. Stay tuned.
          </p>
          <div className="pt-2">
            <DonateCta />
          </div>
        </motion.div>

        {/* Feature preview grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURE_PREVIEWS.map((feat, i) => {
            const isShipped = feat.status === "shipped";
            const card = (
              <motion.div
                key={feat.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
                className={`group rounded-xl border p-5 space-y-3 transition-all duration-300 h-full ${
                  isShipped
                    ? "border-emerald-400/30 bg-emerald-500/5 hover:border-emerald-300/50 hover:bg-emerald-500/10"
                    : "border-white/10 bg-white/5 backdrop-blur-md hover:border-amber-400/30 hover:bg-white/10 axtask-calm-blur-fallback"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg group-hover:scale-110 transition-transform ${
                        isShipped ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      <feat.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-200 truncate">{feat.label}</h3>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      isShipped
                        ? "border-emerald-400/40 text-emerald-300 bg-emerald-500/10"
                        : "border-amber-400/30 text-amber-300 bg-amber-500/10"
                    }`}
                  >
                    {isShipped ? "Live" : "In dev"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
              </motion.div>
            );
            return feat.href ? (
              <Link key={feat.label} href={feat.href} className="block focus:outline-none focus:ring-2 focus:ring-emerald-400/60 rounded-xl">
                {card}
              </Link>
            ) : (
              <div key={feat.label}>{card}</div>
            );
          })}
        </div>

        {/* Plans preview (read-only, no activation) */}
        {plans.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-200 text-center">Planned Tiers</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan, i) => (
                <motion.div
                  key={plan.planKey}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
                  className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-5 space-y-3 axtask-calm-blur-fallback"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-200">{plan.planKey}</h3>
                    <span className="text-xs font-mono text-amber-400">${plan.monthlyPriceUsd}/mo</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.features.slice(0, 4).map((f) => (
                      <span key={f} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{f}</span>
                    ))}
                  </div>
                  <button
                    disabled
                    className="w-full rounded-lg bg-white/5 border border-white/10 py-2 text-xs text-slate-500 cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Lock className="h-3 w-3" />
                    Coming Soon
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Greeting */}
        {user && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center text-xs text-slate-500"
          >
            Signed in as <span className="text-slate-400">{user.displayName || user.email}</span> — you'll be among the first to know when premium launches.
          </motion.p>
        )}
      </div>
    </div>
  );
}
