import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useUiStore } from '../../store/ui.store';
import { ArrowRightIcon, BarsIcon, LayerGroupIcon, XMarkIcon } from './icons';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '#features', label: 'Features' },
  { href: '#bento', label: 'Command Center' },
  { href: '#roles', label: 'Workflow' },
  { href: '#get-started', label: 'Impact' },
];

/**
 * Landing top nav — a floating frosted "pill" (reference style) holding the
 * FACILOAD lockup, a row of section links, and the account affordances. The
 * primary action is a single "Log in" button that opens the auth modal; a
 * gradient "Get Started" pill mirrors it. Exactly one button inside the nav is
 * named "Log in" (the landing tests assert this via `within(nav)`).
 */
export function Nav(): JSX.Element {
  const openLoginModal = useUiStore((s) => s.openLoginModal);
  const openRegisterModal = useUiStore((s) => s.openRegisterModal);
  const reduce = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed left-0 right-0 top-4 z-50 px-4 sm:px-6">
      <motion.nav
        aria-label="Landing"
        initial={reduce ? undefined : { y: -14, opacity: 0 }}
        animate={reduce ? undefined : { y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="glass-panel mx-auto flex max-w-6xl items-center justify-between rounded-full px-4 py-3 shadow-lg shadow-faciload-900/5 transition-all duration-300 sm:px-6"
      >
        <Link to="/" className="group flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-faciload-600 to-faciload-800 text-white shadow-md shadow-faciload-700/30 transition-transform group-hover:scale-105"
          >
            <LayerGroupIcon className="h-4 w-4" />
          </span>
          <span className="font-jakarta text-lg font-extrabold tracking-wider text-faciload-900">
            FACILOAD
          </span>
        </Link>

        {/* Desktop section links */}
        <div className="hidden items-center gap-1 rounded-full border border-faciload-100 bg-white/60 px-2 py-1 shadow-inner md:flex">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-slate-600 transition-all hover:bg-white/90 hover:text-faciload-700"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openLoginModal}
            className="hidden px-3 py-2 text-sm font-semibold text-faciload-800 transition-colors hover:text-faciload-950 sm:inline-flex"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={openRegisterModal}
            className="group relative overflow-hidden rounded-full bg-gradient-to-r from-faciload-700 to-faciload-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-faciload-800/30 transition-all hover:shadow-lg active:scale-95"
          >
            <span className="relative z-10 flex items-center gap-2">
              Get Started
              <ArrowRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-1" />
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-r from-faciload-800 to-faciload-950 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-faciload-200 bg-white/90 text-faciload-800 md:hidden"
          >
            {mobileOpen ? <XMarkIcon className="h-4 w-4" /> : <BarsIcon className="h-4 w-4" />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile dropdown (kept outside <nav> so the nav keeps a single "Log in") */}
      {mobileOpen && (
        <div className="glass-panel mx-auto mt-3 flex max-w-6xl flex-col gap-2 rounded-2xl p-4 shadow-xl md:hidden">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-xl px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-faciload-50"
            >
              {link.label}
            </a>
          ))}
          <hr className="my-1 border-faciload-100" />
          <button
            type="button"
            onClick={() => {
              openRegisterModal();
              setMobileOpen(false);
            }}
            className="w-full rounded-xl bg-faciload-800 py-3 text-center font-semibold text-white shadow-md"
          >
            Get Started
          </button>
        </div>
      )}
    </header>
  );
}
