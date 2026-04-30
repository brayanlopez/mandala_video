import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: [
        "js/geometry.js",
        "js/geometry-patterns.js",
        "js/animator.js",
        "js/renderer-p5.js",
        "js/presets.js",
      ],
      exclude: [],
      reporter: ["text", "lcov"],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
