import type { EnvVars } from '~/types.mjs';

export { ContainerSidecar } from '~/do.mjs';

export default {
	async fetch(request, env, ctx) {
		const app = await import('hono').then(({ Hono }) => new Hono<{ Bindings: EnvVars }>());

		app.use('*', (c, next) =>
			import('hono/context-storage').then(({ contextStorage }) =>
				contextStorage()(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);

		// Security
		app.use('*', (c, next) =>
			import('hono/body-limit').then(({ bodyLimit }) =>
				bodyLimit({
					/**
					 * Set to less than worker memory limit
					 * @link https://developers.cloudflare.com/workers/platform/limits/#worker-limits
					 * mb * kb
					 */
					maxSize: 100 * 1024 * 1024,
					onError: (c) => c.json({ success: false, errors: [{ message: 'Content size not supported', extensions: { code: 413 } }] }, 413),
				})(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,

					next,
				),
			),
		);

		await import('~routes/index.mjs').then(({ default: baseApp }) => app.route('/', baseApp));

		app.on(['GET', 'POST'], '/mcp', (c) =>
			import('agents/mcp').then(async ({ createMcpHandler }) =>
				createMcpHandler({
					// @ts-expect-error It's the same server
					server: await import('~/mcp.mjs').then(({ server }) => server),
				})(c.req.raw, env, ctx),
			),
		);

		app.all('*', (c) => import('@cloudflare/containers').then(({ getRandom }) => getRandom(c.env.CONTAINER_SIDECAR, 10).then((stub) => stub.fetch(c.req.url, c.req.raw))));

		return app.fetch(request, env, ctx);
	},
} as ExportedHandler<EnvVars>;
