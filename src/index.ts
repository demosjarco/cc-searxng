import { getRandom } from '@cloudflare/containers';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { EnvVars } from '~/types.mjs';

export { ContainerSidecar } from '~/do.mjs';

export default {
	async fetch(request, env, ctx) {
		const app = new Hono<{ Bindings: EnvVars }>();

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

		app.all('*', (c) => getRandom(c.env.CONTAINER_SIDECAR, 10).then((stub) => stub.fetch(c.req.url, c.req.raw)));

		return app.fetch(request, env, ctx);
	},
} as ExportedHandler<EnvVars>;
