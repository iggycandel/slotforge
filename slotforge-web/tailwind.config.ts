import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './lib/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Spinative design-system palette — matching landing page tokens
        sf: {
          base:    '#07080d',   // alias for bg — used in ring-offset
          bg:      '#07080d',
          surface: '#0f1118',
          overlay: '#161b27',
          border:  'rgba(255,255,255,0.07)',
          gold:    '#d7a84f',
          'gold-2':'#f0ca79',
          purple:  '#7b74ff',
          green:   '#57d7a1',
          text:    '#f4efe4',
          muted:   '#a5afc0',
          subtle:  '#555e6e',
        },
      },
      boxShadow: {
        card:    '0 4px 24px rgba(0,0,0,0.35)',
        overlay: '0 12px 48px rgba(0,0,0,0.55)',
        gold:    '0 4px 20px rgba(215,168,79,0.28)',
      },
      backgroundImage: {
        'grid-subtle': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M40 0H0v1h40V0zM0 40h40v-1H0v1z' fill='rgba(255,255,255,0.02)'/%3E%3Cpath d='M0 0v40h1V0H0zM40 0v40h-1V0h1z' fill='rgba(255,255,255,0.02)'/%3E%3C/svg%3E")`,
      },
    },
  },
  plugins: [],
}

export default config
