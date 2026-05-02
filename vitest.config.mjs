import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["js/**.js"],
      // main.js requires full browser DOM (AppState, event handlers, UI binding).
      // exporter.js requires CCapture and MediaRecorder (browser-only globals).
      // Both are tested manually; unit tests would be integration tests requiring jsdom + stubs.
      exclude: ["js/main.js", "js/exporter.js"],
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
