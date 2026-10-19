import { motion, useReducedMotion } from 'framer-motion';
import { Reveal } from './motion';

/** Numbered workflow steps (reference style) — replaces the role cards here so
 *  the "Workflow" nav anchor lands on a clear how-it-works sequence. */
const STEPS: Array<{ num: string; title: string; body: string }> = [
  {
    num: '01',
    title: 'Import & Setup',
    body: 'Upload faculty profiles, classroom capacities, and course offerings in seconds.',
  },
  {
    num: '02',
    title: 'Drag & Drop Board',
    body: 'Place classes onto the 6-day grid while the system flags overlapping schedules live.',
  },
  {
    num: '03',
    title: 'One-Click Publish',
    body: "Instantly generate individual professor workload summaries and departmental PDFs.",
  },
];

export function Roles(): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <section id="roles" aria-labelledby="roles-title" className="px-4 sm:px-6">
      <div className="mx-auto mt-32 max-w-6xl">
        <Reveal>
          <div className="mb-16 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-faciload-300">
              Streamlined Operation
            </span>
            <h2
              id="roles-title"
              className="font-jakarta mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
            >
              From raw course catalogs to published schedules
            </h2>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.num} delay={i * 0.1}>
              <motion.article
                whileHover={reduce ? undefined : { y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="glass-panel relative h-full rounded-3xl p-8 shadow-lg shadow-faciload-900/5"
              >
                <div className="font-jakarta mb-4 font-mono text-5xl font-extrabold text-faciload-200">
                  {step.num}
                </div>
                <h3 className="font-jakarta mb-2 text-xl font-bold text-slate-900">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{step.body}</p>
              </motion.article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
