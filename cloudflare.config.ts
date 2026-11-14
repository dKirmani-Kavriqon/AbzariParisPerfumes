import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "558c396a78e9cb79e07d05f9f24314b3",
  worker: defineWorker({
    name: "kce-eval-vinext",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-14",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      APP_ENV: bindings.text("preview"),
      LOG_LEVEL: bindings.text("info"),
      DATABASE_URL: bindings.secret(),
      HEALTH_CHECK_TOKEN: bindings.secret(),
    },
  }),
});
