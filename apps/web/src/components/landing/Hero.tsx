import { motion, useReducedMotion } from 'framer-motion';
import { useUiStore } from '../../store/ui.store';
import { ArrowRightLongIcon } from './icons';

/**
 * Hero — centered, light SaaS composition (reference style) with the FACILOAD
 * lockup front and center on the page-level pastel mesh. The headline carries
 * the "under control" phrase the landing tests assert on; a gradient chip sets
 * the "Industrial Technology" niche, and the two CTAs open the auth modal / jump
 * to the feature tabs.
 */
export function Hero(): JSX.Element {
  const openLoginModal = useUiStore((s) => s.openLoginModal);
  const reduce = useReducedMotion();
  return (
    <section className="relative px-4 pb-16 pt-32 sm:px-6 sm:pt-36">
      <div className="mx-auto max-w-5xl text-center">
        <motion.p
          initial={reduce ? undefined : { opacity: 0, y: 10 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 rounded-full border border-faciload-400/40 bg-faciload-950/40 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-100 shadow-sm backdrop-blur-md"
        >
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-faciload-600" />
          Built for Industrial Technology
        </motion.p>

        <motion.h1
          initial={reduce ? undefined : { opacity: 0, y: 16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="font-jakarta mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl"
        >
          Faculty workload{' '}
          <br className="hidden sm:block" />
          <span className="bg-gradient-to-r from-faciload-300 via-faciload-400 to-faciload-200 bg-clip-text text-transparent">
            under control.
          </span>
        </motion.h1>

        <motion.p
          initial={reduce ? undefined : { opacity: 0, y: 16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-rose-100/80 sm:text-lg"
        >
          FACILOAD is the scheduling command center for Industrial Technology
          departments. Drop classes onto a weekly board, catch every conflict the
          instant it happens, and let each professor&apos;s load total itself.
        </motion.p>

        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <button
            type="button"
            onClick={openLoginModal}
            className="group w-full rounded-2xl bg-gradient-to-r from-faciload-500 to-faciload-700 px-8 py-4 text-base font-bold text-white shadow-xl shadow-faciload-950/40 transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-faciload-300 focus-visible:ring-offset-2 focus-visible:ring-offset-faciload-950 sm:w-auto"
          >
            <span className="flex items-center justify-center gap-3">
              Log in
              <ArrowRightLongIcon className="h-4 w-4 transition-transform group-hover:translate-x-1.5" />
            </span>
          </button>
          <a
            href="#features"
            className="w-full rounded-2xl border-2 border-white/25 bg-white/5 px-8 py-4 text-center text-base font-bold text-white backdrop-blur-md transition-all hover:border-white/40 hover:bg-white/10 sm:w-auto"
          >
            See what it does
          </a>
        </motion.div>
      </div>
    </section>
  );
}
