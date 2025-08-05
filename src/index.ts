import { Container } from '@cloudflare/containers';
import type { EnvVars, HonoVariables } from '~/types.mjs';

export class ContainerSidecar extends Container<EnvVars> {
	override defaultPort = 8080;
	override enableInternet = true;

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
		const app = await import('hono').then(({ Hono }) => new Hono<{ Bindings: EnvVars; Variables: HonoVariables }>());

		// Security
		app.use('*', (c, next) =>
			/**
			 * Measured in kb
			 * Set to less than worker memory limit
			 * @link https://developers.cloudflare.com/workers/platform/limits/#worker-limits
			 */
			import('hono/body-limit').then(({ bodyLimit }) =>
				bodyLimit({
					// mb * kb
					maxSize: 100 * 1024 * 1024,
					onError: (c) => c.json({ success: false, errors: [{ message: 'Content size not supported', extensions: { code: 413 } }] }, 413),
				})(c, next),
			),
		);

		// Debug
		app.use('*', (c, next) => import('hono/timing').then(({ timing }) => timing()(c, next)));

		app.all('*', (c) => import('@cloudflare/containers').then(({ getRandom }) => getRandom(c.env.CONTAINER_SIDECAR, 10)).then((stub) => stub.fetch(c.req.raw)));

		return app.fetch(request, env, ctx);
	},
} as ExportedHandler<EnvVars>;
