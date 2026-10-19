import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Shared modal dialog — light-only glassmorphic crimson (the theme toggle was
 * removed; light palette only, no `dark:` variants). Backdrop
 * `bg-navy-950/60 backdrop-blur-sm` (navy is a near-black scrim), frosted
 * glass card, crimson top accent bar (`from-brand-500 via-signal-300
 * to-brand-500`), glass close button, fade+scale entrance respecting
 * `prefers-reduced-motion`.
 */
export function Modal({ open, title, onClose, children }: ModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Lock background scroll while open so the page's scroll position and
  // filters survive close/reopen (ui-ux.md Section 10).
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const transition = reduce ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' as const };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                onClose();
              }
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="glass-card relative z-10 w-full max-w-lg overflow-hidden !rounded-2xl p-0"
            initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={transition}
          >
            {/* Top gradient accent bar. */}
            <div aria-hidden="true" className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-signal-300 to-brand-500" />
            <div className="mb-4 flex items-center justify-between p-6 pb-0">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-slate-500 transition-colors hover:bg-brand-500/20 hover:text-slate-900"
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 pt-0">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
