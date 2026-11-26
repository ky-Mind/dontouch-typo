import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "touchtyping",
    compatibilityDate: "2026-11-20",
    domains: ["touchtyping.xianzing.my.id"],
    assets: { notFoundHandling: "single-page-application" },
    observability: { enabled: true },
  },
});
