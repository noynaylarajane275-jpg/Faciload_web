import { Reveal } from './motion';
import { CalendarDaysIcon, ShieldIcon, UsersGearIcon } from './icons';

type Stat = {
  value: string;
  label: string;
  body: string;
  icon: (props: { className?: string }) => JSX.Element;
};

const STATS: Stat[] = [
  {
    value: '6-day',
    label: 'weekly grid, Mon–Sat',
    body: 'Full coverage for demanding engineering term schedules, including Saturday laboratory blocks.',
    icon: CalendarDaysIcon,
  },
  {
    value: '100%',
    label: 'conflict-checked placements',
    body: 'Zero overlapping rooms or double-booked faculty units with real-time algorithmic linting.',
    icon: ShieldIcon,
  },
  {
    value: '3 roles',
    label: 'Chair, Faculty, Admin',
    body: 'Tailored permission workspaces for departmental heads, teaching staff, and system schedulers.',
    icon: UsersGearIcon,
  },
];

/**
 * Bento stat grid (`#bento`) — the reference's "Command Center" trio. Three
 * frosted white cards that float on the dark rose gradient, each with a rose
 * icon badge, a big crimson number, and supporting copy.
 */
export function StatStrip(): JSX.Element {
  return (
    <section id="bento" aria-label="FACILOAD at a glance" className="px-4 pb-14 pt-6 sm:px-6">
      <dl className="mx-auto grid max-w-6xl grid-cols-1 gap-6 text-left md:grid-cols-3">
        {STATS.map((stat, i) => (
          <Reveal key={stat.label} delay={i * 0.08}>
            <div className="group relative h-full overflow-hidden rounded-3xl bg-white/70 p-8 shadow-lg shadow-faciload-900/5 backdrop-blur-md transition-all duration-300 hover:border-faciload-300/60 hover:bg-white/85">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-6 -right-6 h-28 w-28 rounded-full bg-faciload-100 blur-2xl transition-colors group-hover:bg-faciload-200"
              />
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-faciload-100 text-xl text-faciload-700 shadow-inner"
                >
                  <stat.icon className="h-5 w-5" />
                </div>
                <dd className="font-jakarta text-4xl font-extrabold tracking-tight text-faciload-700 sm:text-5xl">
                  {stat.value}
                </dd>
                <dt className="mt-2 text-sm font-semibold text-slate-600">{stat.label}</dt>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">{stat.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
