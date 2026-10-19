import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Dashboard entrance motion — mount-based sibling of the Landing page's
 * scroll-reveal primitives (components/landing/motion.tsx). Same spec:
 * opacity 0→1, y 12→0, ~400ms, ~80ms stagger, and everything degrades to
 * plain markup under `prefers-reduced-motion`.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export const dashboardStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export const dashboardFadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE },
  },
};

/** Stagger container for the dashboard's top-to-bottom section order. */
export function DashboardStagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      variants={dashboardStagger}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

/** One staggered section (keeps the section's own classes on the inner node). */
export function DashboardStaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return <motion.div variants={dashboardFadeUp}>{children}</motion.div>;
}
