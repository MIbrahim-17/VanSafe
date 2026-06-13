import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Civic green — institutional, trustworthy (Pakistan/public-service feel).
        brand: {
          50: "#eefdf3",
          100: "#d6f8e0",
          200: "#b0efc6",
          300: "#7fe0a6",
          400: "#46c97f",
          500: "#1fae62",
          600: "#138f4e",
          700: "#127240",
          800: "#125b35",
          900: "#0f4a2d",
          950: "#06291a",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
        lift: "0 10px 30px -12px rgba(18, 114, 64, 0.18), 0 4px 12px -6px rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
