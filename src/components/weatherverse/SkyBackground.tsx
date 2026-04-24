import { motion } from "motion/react";
import { useMemo } from "react";

type Cloud = {
  id: number;
  top: string;
  scale: number;
  duration: number;
  delay: number;
  opacity: number;
};

// Generate a deterministic set of clouds so the sky looks stable across
// hot-reloads without needing a seedable RNG. The numbers below are hand-tuned
// to give a calm, slow parallax drift at 1080p.
const CLOUDS: Cloud[] = [
  { id: 1, top: "8%", scale: 1.1, duration: 180, delay: 0, opacity: 0.55 },
  { id: 2, top: "18%", scale: 0.85, duration: 240, delay: -60, opacity: 0.4 },
  { id: 3, top: "30%", scale: 1.35, duration: 300, delay: -120, opacity: 0.5 },
  { id: 4, top: "44%", scale: 0.9, duration: 210, delay: -30, opacity: 0.35 },
  { id: 5, top: "58%", scale: 1.15, duration: 260, delay: -180, opacity: 0.3 },
  { id: 6, top: "72%", scale: 0.75, duration: 200, delay: -90, opacity: 0.25 },
];

function CloudSVG({ opacity }: { opacity: number }) {
  return (
    <svg
      width="320"
      height="120"
      viewBox="0 0 320 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity }}
    >
      <defs>
        <radialGradient id="c-grad" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor="rgba(255,255,255,1)" />
          <stop offset="70%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <ellipse cx="160" cy="62" rx="150" ry="38" fill="url(#c-grad)" />
      <ellipse cx="100" cy="70" rx="70" ry="22" fill="url(#c-grad)" />
      <ellipse cx="210" cy="70" rx="80" ry="24" fill="url(#c-grad)" />
    </svg>
  );
}

export default function SkyBackground() {
  const clouds = useMemo(() => CLOUDS, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="sky-gradient absolute inset-0" />
      {/* Star specks for that late-evening feel; cheap radial gradients. */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.7), transparent 60%)," +
            "radial-gradient(1px 1px at 75% 15%, rgba(255,255,255,0.5), transparent 60%)," +
            "radial-gradient(1px 1px at 55% 80%, rgba(255,255,255,0.4), transparent 60%)," +
            "radial-gradient(1px 1px at 90% 55%, rgba(255,255,255,0.45), transparent 60%)",
        }}
      />
      {clouds.map((c) => (
        <motion.div
          key={c.id}
          className="absolute"
          style={{ top: c.top, left: "-20%" }}
          initial={{ x: "-10vw" }}
          animate={{ x: "120vw" }}
          transition={{
            duration: c.duration,
            delay: c.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <div style={{ transform: `scale(${c.scale})`, transformOrigin: "left center" }}>
            <CloudSVG opacity={c.opacity} />
          </div>
        </motion.div>
      ))}
      {/* Subtle dark overlay at the bottom so the terminal reads over the horizon. */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{
          background:
            "linear-gradient(to bottom, rgba(4,7,12,0) 0%, rgba(4,7,12,0.75) 100%)",
        }}
      />
    </div>
  );
}
