import type { UserConfig } from "vite";

export default {
  build: {
    target: "esnext",
    minify: false,
  },
  assetsInclude: ["**/*.stl"],
} satisfies UserConfig;
