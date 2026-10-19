import { LayerGroupIcon } from './icons';

export function Footer(): JSX.Element {
  return (
    <footer className="border-t border-white/10 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-faciload-500 to-faciload-800 text-white"
          >
            <LayerGroupIcon className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-bold text-white">FACILOAD</span>
          <span className="ml-2 text-xs text-rose-100/50">
            © 2026 Industrial Technology Scheduling Command Center
          </span>
        </div>
        <div className="flex items-center gap-6 text-xs font-medium text-rose-100/70">
          <a href="#" className="transition-colors hover:text-faciload-300">
            Privacy Policy
          </a>
          <a href="#" className="transition-colors hover:text-faciload-300">
            Terms of Service
          </a>
          <a href="#" className="transition-colors hover:text-faciload-300">
            Department Support
          </a>
        </div>
      </div>
    </footer>
  );
}
