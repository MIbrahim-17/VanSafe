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
        // Soft, diffuse elevation in the Apple manner.
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -10px rgba(16, 24, 40, 0.10)",
        lift: "0 12px 36px -12px rgba(18, 114, 64, 0.20), 0 6px 16px -8px rgba(16, 24, 40, 0.10)",
        pop: "0 8px 30px rgba(16, 24, 40, 0.12)",
      },
      borderRadius: {
        "4xl": "28px",
      },
      transitionTimingFunction: {
        // Apple's gentle spring-like ease.
        apple: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
