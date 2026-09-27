import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Relative base: the same build serves at the Railway root today and under
// artka.dev/avatar-calculator/ later, without a rebuild.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2022", sourcemap: false },
  test: { environment: "node", include: ["src/**/*.test.ts", "*.test.mjs"] },
});
