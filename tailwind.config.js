/**
 * Tailwind config locks the palette to the approved iBuildNew brand colours only.
 * No other colour tokens are exposed to components.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/pages/**/*.{js,jsx}", "./src/components/**/*.{js,jsx}"],
  theme: {
    // Replace defaults so designers can't reach for off-brand hues accidentally.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#FFFFFF",
      black: "#000000",
      // iBuildNew / Homeshelf approved palette
      ibn: {
        orange: "#F15A2C",
        navy: "#171649",
        blue: "#2B7EEF",
      },
      // Minimal neutral scale derived from navy — used for borders, table rules, muted text only.
      // These are tints of navy, kept subtle so the brand hues dominate.
      neutral: {
        50: "#F6F6F9",
        100: "#EDEDF2",
        200: "#D9D9E2",
        300: "#B8B8C5",
        500: "#6E6E82",
        700: "#3C3C52",
      },
    },
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,22,73,0.06), 0 2px 8px rgba(23,22,73,0.05)",
      },
    },
  },
  plugins: [],
};
