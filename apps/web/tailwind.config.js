/** @type {import('tailwindcss').Config} */
export default {
  // Light-only app: the dark/light toggle was removed AND every `dark:`
  // variant class has been stripped from source, so nothing can flip the
  // theme. Kept as 'class' (not 'media') as a belt-and-braces guard — a
  // stray `dark:` class would require an explicit `.dark` ancestor to apply,
  // which OS dark-mode preference alone can never provide.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // FACILOAD app tokens — black → dark-red system-wide.
        // Primary/crimson actions; success/error/warning keep semantic hues.
        primary: {
          DEFAULT: '#b91c3c', // brand-500 — primary actions, active states
          dark: '#7f0d24', // deeper crimson — hover/active, header accents
          light: '#fbdce2', // rose-100 tint — tinted backgrounds, highlights
        },
        surface: {
          DEFAULT: '#ffffff', // main workspace background (light)
          muted: '#fbeef0', // soft-rose page backdrop / skeleton base (light)
        },
        // Landing-page theme tokens — black → dark-red ramp.
        // `leaf` is the marketing ramp used for CTAs, the stat strip, and the
        // schedule-mockup glow; `ink` is the near-black red used for landing
        // headlines / body copy. Kept project-wide so any page can reuse
        // `bg-leaf-*` / `text-ink`.
        // `ink.DEFAULT` is the legacy app-wide text token (used outside the
        // landing page); `ink.100/300/500` are the landing rose-scale tints.
        ink: {
          DEFAULT: '#2b0a10', // near-black crimson — legacy app-wide text token
          100: '#ffe9ec',
          300: '#f3b9c2',
          500: '#c5808e',
        },
        navy: {
          950: '#0a0406', // near-black with a red undertone — page base
          900: '#160609',
          800: '#26080f',
        },
        brand: {
          500: '#b91c3c',
          400: '#e63e5c',
        },
        signal: {
          300: '#ff6a5e', // ember accent (was cyan)
        },
        // Red-tinted slate — the app font renders crimson in light mode.
        // Full 50–950 scale so the extend merge fully replaces the default gray.
        slate: {
          50: '#fdf6f7',
          100: '#fbe9ec',
          200: '#f6d4d9',
          300: '#eeb4bd',
          400: '#dd8595',
          500: '#c45c72',
          600: '#ab4860',
          700: '#8c384e',
          800: '#742f42',
          900: '#3a1218',
          950: '#23080f',
        },
        glass: {
          fill: 'rgba(255,255,255,0.055)',
          'fill-strong': 'rgba(255,255,255,0.09)',
          border: 'rgba(255,150,160,0.18)',
          'border-strong': 'rgba(255,150,160,0.32)',
        },
        // `leaf` is kept as an alias of the crimson ramp so legacy `bg-leaf-*` /
        // `text-leaf-*` classes across pages render dark-red without per-file
        // rewrites (leaf-* now === crimson scale).
        leaf: {
          50: '#fff1f2',
          100: '#ffe0e4',
          200: '#ffc5cd',
          300: '#f99aac',
          400: '#ef5f7c',
          500: '#d81e43',
          600: '#b81536',
          700: '#97122c',
          800: '#7c1226',
          900: '#65101f',
          950: '#3a0713',
        },
        // Marketing rose→dark-red scale used only by the landing page via
        // `bg-faciload-*` / `text-faciload-*` (mirrors the reference palette
        // exactly). The app dashboard keeps the `brand`/`leaf` crimson tokens.
        faciload: {
          50: '#fdf2f4',
          100: '#fbe7eb',
          200: '#f7d2d9',
          300: '#f1abb8',
          400: '#e5758b',
          500: '#d54865',
          600: '#bd2b4c',
          700: '#9f1f3c',
          800: '#841d35',
          900: '#701c31',
          950: '#3e0a17',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Display face for landing headlines (loaded via Google Fonts in
        // index.html; falls back to Inter/system sans if offline).
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Plus Jakarta Sans — the landing reference's face. Scoped to the
        // landing page via `font-jakarta` so the app dashboard keeps Inter.
        jakarta: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      // Landing motion keyframes (used sparingly alongside framer-motion;
      // entrance/float utilities available via `animate-fade-up` etc.).
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'float-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        drift: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(30px,-24px) scale(1.08)' },
        },
        'pulse-dot': {
          '0%': { boxShadow: '0 0 0 0 rgba(255,106,94,0.55)' },
          '70%': { boxShadow: '0 0 0 9px rgba(255,106,94,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(255,106,94,0)' },
        },
        'sweep-rotate': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'ping-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(3.2)', opacity: '0' },
        },
        'block-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(.94)' },
          to: { opacity: '1', transform: 'none' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'float-soft': 'float-soft 7s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        drift: 'drift 24s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 2.6s ease-out infinite',
        'sweep-rotate': 'sweep-rotate 6s linear infinite',
        'ping-ring': 'ping-ring 2.4s cubic-bezier(0,0,0.2,1) infinite',
        'block-in': 'block-in 0.5s cubic-bezier(.2,.8,.2,1) forwards',
        rise: 'rise 0.8s cubic-bezier(.2,.8,.2,1) forwards',
      },
    },
  },
  plugins: [],
};

