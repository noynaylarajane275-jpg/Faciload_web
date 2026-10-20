import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { z } from 'zod';
import { registerRequest } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';

const registerFormSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export function RegisterModal(): JSX.Element | null {
  const isOpen = useUiStore((s) => s.isRegisterModalOpen);
  const closeRegisterModal = useUiStore((s) => s.closeRegisterModal);
  const openLoginModal = useUiStore((s) => s.openLoginModal);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const reduce = useReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleClose = useCallback(() => {
    closeRegisterModal();
  }, [closeRegisterModal]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setFieldErrors({});
      setServerError(null);
    }
  }, [isOpen]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const parsed = registerFormSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: flat.email?.[0], password: flat.password?.[0], confirmPassword: flat.confirmPassword?.[0] });
      return;
    }
    setFieldErrors({});
    setServerError(null);
    setPending(true);
    try {
      const result = await registerRequest(parsed.data.email, parsed.data.password, parsed.data.confirmPassword);
      login({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken });
      handleClose();
      navigate('/pending-approval', { replace: true });
    } catch (err) {
      setPassword('');
      setConfirmPassword('');
      setServerError(err instanceof Error ? err.message : 'Could not create your account');
    } finally {
      setPending(false);
    }
  }

  return (
    <AnimatePresence>
            {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            aria-hidden="true"
            data-testid="register-modal-backdrop"
            onClick={handleClose}
            className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.2 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-title"
            onClick={(e) => e.stopPropagation()}
            className="glass-card-dark relative z-10 w-full max-w-sm overflow-hidden p-0"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
            transition={reduce ? { duration: 0 } : { duration: 0.25 }}
          >
            <div aria-hidden="true" className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-signal-300 to-brand-500" />
            <div className="p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-signal-300 shadow-[0_0_0_4px_rgba(255,106,94,0.18)]" />
                <span className="text-sm font-bold text-ink-100">FACILOAD</span>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close register dialog"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-xl leading-none text-ink-300 hover:bg-white/[0.10] hover:text-ink-100"
              >
                ×
              </button>
            </div>
            <h1 id="register-title" className="mt-6 text-2xl font-bold text-ink-100">
              Create your account
            </h1>
            <p className="mt-1 text-sm text-ink-300">
              Register with your email — the chair links your faculty profile before you get access.
            </p>
            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
              {serverError ? (
                <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2.5 text-sm text-red-300">
                  <span>{serverError}</span>
                </div>
              ) : null}
              <div>
                <label htmlFor="register-email" className="glass-label-dark">Email</label>
                <input id="register-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input-dark py-3 pl-3.5 pr-3.5" />
                {fieldErrors.email ? <p className="mt-1 text-sm text-red-400">{fieldErrors.email}</p> : null}
              </div>
              <div>
                <label htmlFor="register-password" className="glass-label-dark">Password</label>
                <input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input-dark py-3 pl-3.5 pr-3.5" />
                {fieldErrors.password ? <p className="mt-1 text-sm text-red-400">{fieldErrors.password}</p> : null}
              </div>
              <div>
                <label htmlFor="register-confirm-password" className="glass-label-dark">Confirm password</label>
                <input id="register-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="glass-input-dark py-3 pl-3.5 pr-3.5" />
                {fieldErrors.confirmPassword ? <p className="mt-1 text-sm text-red-400">{fieldErrors.confirmPassword}</p> : null}
              </div>
              <motion.button type="submit" disabled={pending} className="glass-btn-primary-dark">
                {pending ? 'Creating account…' : 'Create account'}
              </motion.button>
            </form>
            <p className="mt-3 text-center text-xs text-ink-300">
              Already have an account?{' '}
              <button type="button" onClick={openLoginModal} className="glass-link-dark font-semibold">
                Log in
              </button>
            </p>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
