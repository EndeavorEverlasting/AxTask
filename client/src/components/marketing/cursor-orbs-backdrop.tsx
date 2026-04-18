import { useEffect, useRef } from "react";

const ORB_DEFS = [
  { size: 380, baseX: 10, baseY: 8, color: "from-sky-500/30 to-indigo-500/18", drift: 44, speed: 7 },
  { size: 320, baseX: 78, baseY: 14, color: "from-violet-500/28 to-fuchsia-500/16", drift: 38, speed: 9 },
  { size: 260, baseX: 48, baseY: 72, color: "from-cyan-400/24 to-teal-400/16", drift: 48, speed: 8 },
  { size: 340, baseX: 88, baseY: 58, color: "from-emerald-500/22 to-cyan-500/14", drift: 34, speed: 11 },
  { size: 240, baseX: 18, baseY: 52, color: "from-rose-500/18 to-pink-500/14", drift: 52, speed: 6 },
  { size: 300, baseX: 42, baseY: 28, color: "from-amber-500/18 to-orange-500/14", drift: 40, speed: 10 },
];

const REPEL_RADIUS = 40;
const REPEL_STRENGTH = 18;

/**
 * Full-viewport cursor-reactive gradient orbs.
 * Uses direct DOM manipulation (no React re-renders) for 60 fps performance.
 */
export function CursorOrbsBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const orbRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const mouse = { x: -1, y: -1 };
    const pos = ORB_DEFS.map((o) => ({ x: o.baseX, y: o.baseY }));
    let t = 0;
    let last = performance.now();
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      const r = container.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 100;
      mouse.y = ((e.clientY - r.top) / r.height) * 100;
    };
    const onLeave = () => { mouse.x = -1; mouse.y = -1; };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave, { passive: true });

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      t += dt;
      const hasMouse = mouse.x >= 0;

      for (let i = 0; i < ORB_DEFS.length; i++) {
        const o = ORB_DEFS[i];
        const driftX = Math.sin(t / o.speed + i * 1.8) * o.drift * 0.35;
        const driftY = Math.cos(t / o.speed + i * 2.4) * o.drift * 0.35;
        let repelX = 0, repelY = 0;
        if (hasMouse) {
          const dx = pos[i].x - mouse.x;
          const dy = pos[i].y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (dist < REPEL_RADIUS) {
            const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * REPEL_STRENGTH;
            repelX = (dx / dist) * force;
            repelY = (dy / dist) * force;
          }
        }
        const tx = o.baseX + driftX + repelX;
        const ty = o.baseY + driftY + repelY;
        pos[i].x += (tx - pos[i].x) * dt * 1.6;
        pos[i].y += (ty - pos[i].y) * dt * 1.6;

        const el = orbRefs.current[i];
        if (el) {
          el.style.left = `calc(${pos[i].x}% - ${o.size / 2}px)`;
          el.style.top = `calc(${pos[i].y}% - ${o.size / 2}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="axtask-orb-layer pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {/* Neon aurora base layer — kept for backwards-compat with landing/login
       * rendering directly. When PretextShell wraps the app, the fixed
       * .axtask-aurora-body provides the base wash and these local glows
       * layer softly over it. */}
      <div className="absolute inset-0">
        <div className="absolute -top-1/4 left-1/4 h-[60vh] w-[80vw] rotate-12 rounded-full bg-gradient-to-r from-emerald-600/10 via-cyan-500/8 to-transparent blur-[120px]" />
        <div className="absolute -bottom-1/4 right-1/4 h-[50vh] w-[70vw] -rotate-12 rounded-full bg-gradient-to-l from-violet-600/10 via-indigo-500/8 to-transparent blur-[100px]" />
      </div>
      {ORB_DEFS.map((orb, i) => (
        <div
          key={i}
          ref={(el) => { orbRefs.current[i] = el; }}
          className={`absolute rounded-full bg-gradient-to-br ${orb.color} blur-3xl`}
          style={{
            width: orb.size,
            height: orb.size,
            left: `calc(${orb.baseX}% - ${orb.size / 2}px)`,
            top: `calc(${orb.baseY}% - ${orb.size / 2}px)`,
            willChange: "left, top",
          }}
        />
      ))}
    </div>
  );
}
