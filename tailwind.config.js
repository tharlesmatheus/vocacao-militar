/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class", // <-- IMPORTANTE
    content: [
        "./src/**/*.{js,ts,jsx,tsx}", // Ajuste conforme seu projeto
        "./app/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {},
    },
    plugins: [],
}
