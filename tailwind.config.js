/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./*.js",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0B0C10",
        inkCard: "#15161C",
        line: "#26272F",
        paper: "#F2EEE4",
        cornerA: "#FF4B33",
        cornerADim: "#4A2620",
        cornerB: "#8B7CF6",
        cornerBDim: "#2E2A47",
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
