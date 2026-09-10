import { defineConfig } from "vitest/config";

// Only Treadsim's pure modules are unit-tested. noclip itself has no test suite.
export default defineConfig({
    test: {
        include: ["src/Treadsim/**/*.test.ts"],
        environment: "node",
    },
});
