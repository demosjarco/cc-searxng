import { getRandom } from '@cloudflare/containers';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContextVariables, EnvVars } from '~/types.mjs';

export { ContainerSidecar } from '~/do.mjs';

export default {
	async fetch(request, env, ctx) {
		const app = new Hono<{ Bindings: EnvVars; Variables: ContextVariables }>();

		// Variable Setup
		app.use('*', (c, next) =>
			import('hono/context-storage').then(({ contextStorage }) =>
				contextStorage()(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					c,
					next,
				),
			),
		);
		app.use('*', async (c, next) => {
			if (c.req.raw.headers.has('X-Timestamp-S') && c.req.raw.headers.has('X-Timestamp-MS')) {
				c.set('requestDate', new Date(parseInt(c.req.header('X-Timestamp-S')!, 10) * 1000 + parseInt(c.req.header('X-Timestamp-MS')!, 10)));
			} else if (request.cf?.clientTcpRtt) {
				c.set('requestDate', new Date(Date.now() - request.cf.clientTcpRtt));
			} else {
				c.set('requestDate', new Date());
			}

			await next();
		});

		// Security
		app.use(
			'*',
			/**
			 * Measured in kb
			 * Set to less than worker memory limit
			 * @link https://developers.cloudflare.com/workers/platform/limits/#worker-limits
			 */
			bodyLimit({
				// mb * kb
				maxSize: 100 * 1024 * 1024,
				onError: (c) => c.json({ success: false, errors: [{ message: 'Content size not supported', extensions: { code: 413 } }] }, 413),
			}),
		);

		await import('~routes/index.mjs').then(({ default: baseApp }) => app.route('/', baseApp));

		app.on(['GET', 'POST'], '/mcp', (c) =>
			Promise.all([import('agents/mcp'), import('~/mcp.mjs'), import('uuid'), import('node:crypto')]).then(([{ createMcpHandler }, { server }, { v7: uuidv7 }, { randomBytes }]) =>
				createMcpHandler(server, { sessionIdGenerator: () => uuidv7({ random: randomBytes(16), msecs: c.var.requestDate.getTime() }) })(
					c.req.raw,
					c.env,
					// @ts-expect-error It's the same ctx
					c.executionCtx,
				),
			),
		);

		app.all('*', (c) => getRandom(c.env.CONTAINER_SIDECAR, 10).then((stub) => stub.fetch(c.req.url, c.req.raw)));

		return app.fetch(request, env, ctx);
	},
} as ExportedHandler<EnvVars>;
