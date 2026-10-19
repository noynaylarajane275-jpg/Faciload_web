import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Shared landing motion primitives (framer-motion).
 * All wrappers respect `prefers-reduced-motion` via `useReducedMotion` and
 * degrade to static markup — structure/copy/layout stay untouched.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: EASE },
  }),
};

export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE },
  },
};

/** Fade-up on scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}): JSX.Element {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      custom={delay}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-64px' }}
    >
      {children}
    </motion.div>
  );
}

/** Stagger container for grids (features / roles cards). */
export function Stagger({
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
      variants={staggerParent}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-48px' }}
    >
      {children}
    </motion.div>
  );
}

/** Stagger child wrapper (keeps the card's own classes on the inner node). */
export function StaggerItem({ children }: { children: ReactNode }): JSX.Element {
  const reduce = useReducedMotion();
  if (reduce) {
    return <>{children}</>;
  }
  return <motion.div variants={staggerChild}>{children}</motion.div>;
}

/** Tap/hover micro-interaction for CTA links (wraps without changing markup). */
export function Pressable({ children }: { children: ReactNode }): JSX.Element {
  const reduce = useReducedMotion();
  if (reduce) {
    return <>{children}</>;
  }
  return (
    <motion.span
      className="inline-flex"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      {children}
    </motion.span>
  );
}
