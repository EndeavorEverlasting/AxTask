import { useEffect, useState } from "react";

export function useScrollDirection() {
  const [direction, setDirection] = useState<"up" | "down">("up");

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const customEvent = e as CustomEvent<{ direction: "up" | "down" }>;
      setDirection(customEvent.detail.direction);
    };

    window.addEventListener("axtask-scroll-direction", handleScroll);
    return () => window.removeEventListener("axtask-scroll-direction", handleScroll);
  }, []);

  return direction;
}
