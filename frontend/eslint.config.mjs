// .eslintrc.config.ts
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// Convert ES module meta to Node-style __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create compatibility wrapper for old ESLint configs
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Use Next.js recommended configs
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    // Optional: your own overrides
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // temporarily allow 'any'
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ], // warn instead of error
      "react-hooks/exhaustive-deps": "off", // optional for dev
      "@next/next/no-img-element": "warn", // don't block build
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
