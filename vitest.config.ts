import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.toml" },
			miniflare: {
				bindings: { "1234": "secret" },
			},
		}),
	],
	test: {
		include: ["test/**/*.spec.ts"],
	},
});
