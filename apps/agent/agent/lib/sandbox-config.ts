export const SANDBOX = {
	startupTimeoutMs: 10000,
	docker: {
		image:
			"ghcr.io/vercel/eve@sha256:26ba0791b0483c517eeb22e3ff58847207192c828b56cb899ec552329d38dd08",
		pullPolicy: "never",
		networkPolicy: "deny-all",
	},
} as const;
