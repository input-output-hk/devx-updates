import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".readiness/**",
    // Local worktrees, each a full copy of the repo with its own build output.
    ".claude/**",
  ]),
  // `({ node, ...props })` drops a prop before spreading the rest onto an element.
  { rules: { "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }] } },
  // The devnet probes are CommonJS on purpose: they run with plain `node`.
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
