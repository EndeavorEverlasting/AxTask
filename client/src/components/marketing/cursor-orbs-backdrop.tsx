import { useEffect, useRef, useState } from "react";

const ORB_DEFS = [
  { size: 380, baseX: 10, baseY: 8, color: "from-sky-500/30 to-indigo-500/18", drift: 44, speed: 7 },
  { size: 320, baseX: 78, baseY: 14, color: "from-violet-500/28 to-fuchsia-500/16", drift: 38, speed: 9 },
  { size: 260, baseX: 48, baseY: 72, color: "from-cyan-400/24 to-teal-400/16", drift: 48, speed: 8 },
  { size: 340, baseX: 88, baseY: 58, color: "from-emerald-500/22 to-cyan-500/14", drift: 34, speed: 11 },
  { size: 240, baseX: 18, baseY: 52, color: "from-rose-500/18 to-pink-500/14", drift: 52, speed: 6 },
  { size: 300, baseX: 42, baseY: 28, color: "from-amber-500/18 to-orange-500/14", drift: 40, speed: 10 },
];

/** Repulsion radius (in % of viewport) beyond which cursor has no push effect. */
const REPEL_RADIUS = 40;
/** Strength multiplier for how hard orbs flee the cursor. */
const REPEL_STRENGTH = 18;

/**
 * Full-viewport cursor-reactive gradient orbs.
 * Orbs drift lazily on sine waves and **flee** the cursor — like life's fleeting tasks.
 */
export function CursorOrbsBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -1, y: -1 });
  const orbPositions = useRef(ORB_DEFS.map((o) => ({ x: o.baseX, y: o.baseY })));
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const [positions, setPositions] = useState(ORB_DEFS.map((o) => ({ x: o.baseX, y: o.baseY })));

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
    };
    const onLeave = () => {
      mouseRef.current = { x: -1, y: -1 };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave, { passive: true });

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      timeRef.current += dt;
      const t = timeRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const hasMouse = mx >= 0;

      const next = ORB_DEFS.map((o, i) => {
        const driftX = Math.sin(t / o.speed + i * 1.8) * o.drift * 0.35;
        const driftY = Math.cos(t / o.speed + i * 2.4) * o.drift * 0.35;
        let repelX = 0;
        let repelY = 0;
        if (hasMouse) {
          const prev = orbPositions.current[i];
          const dx = prev.x - mx;
          const dy = prev.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (dist < REPEL_RADIUS) {
            const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * REPEL_STRENGTH;
            repelX = (dx / dist) * force;
            repelY = (dy / dist) * force;
          }
        }
        const prev = orbPositions.current[i];
        const tx = o.baseX + driftX + repelX;
        const ty = o.baseY + driftY + repelY;
        return {
          x: prev.x + (tx - prev.x) * dt * 1.6,
          y: prev.y + (ty - prev.y) * dt * 1.6,
        };
      });
      orbPositions.current = next;
      setPositions([...next]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Neon aurora base layer */}
      <div className="absolute inset-0">
        <div className="absolute -top-1/4 left-1/4 h-[60vh] w-[80vw] rotate-12 rounded-full bg-gradient-to-r from-emerald-600/10 via-cyan-500/8 to-transparent blur-[120px]" />
        <div className="absolute -bottom-1/4 right-1/4 h-[50vh] w-[70vw] -rotate-12 rounded-full bg-gradient-to-l from-violet-600/10 via-indigo-500/8 to-transparent blur-[100px]" />
      </div>
      {/* Reactive orbs */}
      {ORB_DEFS.map((orb, i) => (
        <div
          key={i}
          className={`absolute rounded-full bg-gradient-to-br ${orb.color} blur-3xl`}
          style={{
            width: orb.size,
            height: orb.size,
            left: `calc(${positions[i].x}% - ${orb.size / 2}px)`,
            top: `calc(${positions[i].y}% - ${orb.size / 2}px)`,
            willChange: "transform",
            transition: "opacity 1s",
          }}
        />
      ))}
    </div>
  );
}
