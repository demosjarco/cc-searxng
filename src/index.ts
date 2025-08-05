import { WorkerEntrypoint } from 'cloudflare:workers';
import type { EnvVars, HonoVariables } from '~/types.mjs';

export { ContainerSidecar } from '~do/index.mjs';

export default class extends WorkerEntrypoint<EnvVars> {
	override async fetch(request: Request): Promise<Response> {
		const app = await import('hono').then(({ Hono }) => new Hono<{ Bindings: EnvVars; Variables: HonoVariables }>());

		// Security
		app.use('*', (c, next) => import('hono/secure-headers').then(({ secureHeaders }) => secureHeaders()(c, next)));
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

		return app.fetch(request, this.env, this.ctx);
	}
}
