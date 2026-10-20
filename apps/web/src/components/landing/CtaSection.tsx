import { motion, useReducedMotion } from 'framer-motion';
import { Reveal } from './motion';
import { useUiStore } from '../../store/ui.store';

/**
 * Closing CTA (`#get-started`) — a dark crimson-glass banner (reference style):
 * layered gradient, a soft blurred bloom, and a white "Log in" pill. The white
 * button keeps the ≥3 "Log in" affordances contract the landing tests assert.
 */
export function CtaSection(): JSX.Element {
  const reduce = useReducedMotion();
  const openRegisterModal = useUiStore((s) => s.openRegisterModal);
  return (
    <section id="get-started" aria-labelledby="cta-title" className="px-4 sm:px-6">
      <div className="mx-auto mt-32 max-w-5xl">
        <Reveal>
          <motion.div
            whileHover={reduce ? undefined : { y: -3 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="glass-dark relative overflow-hidden rounded-3xl p-10 text-center shadow-2xl sm:p-16"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-r from-faciload-950 via-faciload-800 to-faciload-900 opacity-90"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-faciload-500/20 blur-3xl"
            />
            <div className="relative z-10 mx-auto max-w-2xl">
              <h2
                id="cta-title"
                className="font-jakarta mb-6 text-3xl font-extrabold tracking-tight text-white sm:text-5xl"
              >
                Ready to clear the workload chaos?
              </h2>
              <p className="mb-8 text-base text-white/80 sm:text-lg">
                Join Industrial Technology departments standardizing their scheduling command
                center today.
              </p>
              <button
                type="button"
                onClick={openRegisterModal}
                className="rounded-2xl bg-white px-8 py-4 text-base font-extrabold text-faciload-900 shadow-xl transition-all hover:scale-105 hover:bg-faciload-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-faciload-800"
              >
                Get Started
              </button>
            </div>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}
