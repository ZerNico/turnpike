import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript"],
  categories: {
    correctness: "warn",
  },
  rules: {
    "typescript/no-explicit-any": "error",
    "eslint/no-unused-vars": "warn",
  },
});
