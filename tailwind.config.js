/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./*.js",
  ],
  theme: {
    extend: {
      colors: {
        // Palette pulled directly from the Zoloop logo (orange + purple Z).
        ink: "#0B0C10",
        inkCard: "#15161C",
        line: "#26272F",
        paper: "#F2EEE4",
        cornerA: "#FE4C12",
        cornerADim: "#2F1510",
        cornerB: "#754BF6",
        cornerBDim: "#1A1532",
        gold: "#E8B84B",
        grayText: "#82838C",
      },
      fontFamily: {
        display: ["Anton", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
