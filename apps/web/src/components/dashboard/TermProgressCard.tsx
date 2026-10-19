import { motion, useReducedMotion } from 'framer-motion';

/**
 * TermProgressCard — circular % ring of the term's scheduled progress.
 * The ring fills from 0 → actual (~800ms ease-out); reduced motion shows the
 * final value instantly. Geometry: r=52 within a 120×120 viewBox, rotated so
 * the fill starts at 12 o'clock.
 */

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ring({
  strokeDashoffset,
  animated,
}: {
  strokeDashoffset: number;
  animated: boolean;
}): JSX.Element {
  if (!animated) {
    return (
      <circle
        cx="60"
        cy="60"
        r={RADIUS}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        className="stroke-brand-500"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={strokeDashoffset}
        transform="rotate(-90 60 60)"
      />
    );
  }
  return (
    <motion.circle
      cx="60"
      cy="60"
      r={RADIUS}
      fill="none"
      strokeWidth="10"
      strokeLinecap="round"
      className="stroke-brand-500"
      strokeDasharray={CIRCUMFERENCE}
      transform="rotate(-90 60 60)"
      initial={{ strokeDashoffset: CIRCUMFERENCE }}
      animate={{ strokeDashoffset }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

export function TermProgressCard({ percent }: { percent: number }): JSX.Element {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <div className="glass-card flex flex-col items-center p-4">
      <h2 className="self-start text-sm font-semibold text-slate-900">Term progress</h2>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Term scheduled progress"
        className="relative mt-3 h-[120px] w-[120px]"
      >
        <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            className="stroke-brand-500/20"
          />
          <Ring strokeDashoffset={offset} animated={!reduce} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-bold text-slate-900">
          {clamped}%
        </span>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">of assignment hours plotted</p>
    </div>
  );
}
