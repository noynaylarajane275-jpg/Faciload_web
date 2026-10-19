import { Link } from 'react-router-dom';

export function NotAuthorizedPage(): JSX.Element {
  return (
    <section aria-labelledby="not-authorized-title">
      <h1 id="not-authorized-title" className="text-2xl font-semibold text-brand-500">
        Not authorized
      </h1>
      <p className="mt-2 text-slate-600">Your account does not have access to that page.</p>
      <Link className="mt-4 inline-block text-sm text-brand-500 underline" to="/dashboard">
        Back to Dashboard
      </Link>
    </section>
  );
}
