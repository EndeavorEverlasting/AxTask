import { useEffect, useRef, useState } from "react";

const ORB_DEFS = [
  { size: 340, baseX: 10, baseY: 8, color: "from-sky-500/24 to-indigo-500/14", drift: 44, speed: 7 },
  { size: 280, baseX: 78, baseY: 14, color: "from-violet-500/22 to-fuchsia-500/12", drift: 38, speed: 9 },
  { size: 220, baseX: 48, baseY: 72, color: "from-cyan-400/18 to-teal-400/12", drift: 48, speed: 8 },
  { size: 300, baseX: 88, baseY: 58, color: "from-emerald-500/16 to-cyan-500/10", drift: 34, speed: 11 },
  { size: 200, baseX: 18, baseY: 52, color: "from-rose-500/14 to-pink-500/10", drift: 52, speed: 6 },
  { size: 260, baseX: 42, baseY: 28, color: "from-amber-500/14 to-orange-500/10", drift: 40, speed: 10 },
];

/**
 * Full-viewport cursor-reactive gradient orbs (Neon-style ambient motion).
 */
export function CursorOrbsBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const orbPositions = useRef(ORB_DEFS.map((o) => ({ x: o.baseX, y: o.baseY })));
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const [positions, setPositions] = useState(ORB_DEFS.map((o) => ({ x: o.baseX, y: o.baseY })));

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      timeRef.current += dt;
      const t = timeRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      const next = ORB_DEFS.map((o, i) => {
        const driftX = Math.sin(t / o.speed + i * 1.8) * o.drift * 0.3;
        const driftY = Math.cos(t / o.speed + i * 2.4) * o.drift * 0.3;
        const attractX = (mx * 100 - o.baseX) * 0.14;
        const attractY = (my * 100 - o.baseY) * 0.14;
        const prev = orbPositions.current[i];
        const tx = o.baseX + driftX + attractX;
        const ty = o.baseY + driftY + attractY;
        return {
          x: prev.x + (tx - prev.x) * dt * 1.25,
          y: prev.y + (ty - prev.y) * dt * 1.25,
        };
      });
      orbPositions.current = next;
      setPositions([...next]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      {ORB_DEFS.map((orb, i) => (
        <div
          key={i}
          className={`absolute rounded-full bg-gradient-to-br ${orb.color} blur-3xl transition-opacity duration-1000`}
          style={{
            width: orb.size,
            height: orb.size,
            left: `calc(${positions[i].x}% - ${orb.size / 2}px)`,
            top: `calc(${positions[i].y}% - ${orb.size / 2}px)`,
            willChange: "left, top",
          }}
        />
      ))}
    </div>
  );
}
