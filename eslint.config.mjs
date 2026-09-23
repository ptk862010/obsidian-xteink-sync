// Luật duyệt plugin chính thức của Obsidian (eslint-plugin-obsidianmd). Chạy: npm run lint
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  { ignores: ["main.js", "node_modules/**", "scripts/**", "esbuild.config.mjs"] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.mjs", "tests/*.ts"] },
      },
    },
  },
]);
