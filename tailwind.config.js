/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./app/**/*.{js,ts,jsx,tsx}", // app router
      "./pages/**/*.{js,ts,jsx,tsx}", // pages router (if used)
      "./components/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          'bg': 'var(--color-bg)',
          'fg': 'var(--color-foreground)',
          'card': 'var(--color-card)',
          'card-dark': 'var(--color-card-dark)',
          'card-dark-text': 'var(--color-card-dark-text)',
          'primary': 'var(--color-primary)',
          'link': 'var(--color-link)',
          'cta': 'var(--color-cta)',
          'cta-soft': 'var(--color-cta-soft)',
          'border-default': 'var(--color-border)',
        },
        borderRadius: {
          lg: 'var(--radius-lg)',
          md: 'var(--radius-md)',
          sm: 'var(--radius-sm)',
        },
      },
    },
    plugins: [],
  }
  