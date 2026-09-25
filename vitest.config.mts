import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve the `@/*` alias from tsconfig.json.
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside a React Server Components build. Tests run
      // server modules directly, so swap in the package's no-op entry.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      // The logic: helpers, queries, actions and route handlers. Components
      // are checked in the browser instead.
      include: ["lib/**/*.ts", "app/**/*.ts"],
      exclude: ["**/*.test.ts", "**/__fixtures__/**"],
      reporter: ["text-summary", "html"],
    },
    // Both inherit the settings above. `npm test` runs `unit`, and
    // `npm run test:db` runs `db`.
    projects: [
      {
        test: {
          name: "unit",
          exclude: [...configDefaults.exclude, "tests/db/**"],
        },
      },
      {
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          // Starting PGlite and applying the migrations takes a few seconds.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
