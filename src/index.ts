import { Container, getRandom } from '@cloudflare/containers';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { EnvVars, HonoVariables } from '~/types.mjs';

export class ContainerSidecar extends Container<EnvVars> {
	override defaultPort = 8080;
	override enableInternet = true;
	override sleepAfter = '15m';

	override onStart() {
		console.debug('Container successfully started');
	}

	override onStop() {
		console.debug('Container successfully shut down');
	}

	override onError(error: unknown) {
		console.error('Container error:', error);
	}
}

export default {
	async fetch(request, env, ctx) {
		const app = new Hono<{ Bindings: EnvVars; Variables: HonoVariables }>();

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

		app.all('*', (c) => getRandom(c.env.CONTAINER_SIDECAR, 10).then((stub) => stub.fetch(c.req.raw.url, c.req.raw)));

		return app.fetch(request, env, ctx);
	},
} as ExportedHandler<EnvVars>;
