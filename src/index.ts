import { WorkerEntrypoint } from 'cloudflare:workers';
import type { EnvVars, HonoVariables } from '~/types.mjs';
import { loadBalance } from '~do/containerHelpers.mjs';

export { ContainerSidecar } from '~do/index.mjs';

export default class extends WorkerEntrypoint<EnvVars> {
	/**
	 * Parses the Server-Timing header and returns an object with the metrics.
	 * The object keys are the metric names (with optional descriptions), and the values are the duration of each metric or null if no duration is found.
	 *
	 * @param {string} [serverTimingHeader=''] - The Server-Timing header string.
	 * @returns {Record<string, number | null>} An object where keys are metric names (with optional descriptions) and values are the durations in milliseconds or null.
	 */
	private serverTiming(serverTimingHeader = '') {
		const result: Record<string, number | null> = {};

		if (serverTimingHeader && serverTimingHeader.trim().length > 0) {
			// Split the header by comma to get each metric
			const metrics = serverTimingHeader.trim().split(',');

			metrics.forEach((metric) => {
				// Split each metric by semicolon to separate the name from other attributes
				const parts = metric.split(';').map((part) => part.trim());

				// Get the metric name
				const name = parts[0];

				// Find the 'dur' attribute and convert it to a number
				const durationPart = parts.find((part) => part.startsWith('dur='));
				const duration = durationPart ? parseFloat(durationPart.split('=')[1]!) : null;

				// Optionally find the 'desc' attribute
				const descriptionPart = parts.find((part) => part.startsWith('desc='));
				const description = descriptionPart ? descriptionPart.split('=')[1] : null;

				// Construct the key name with optional description
				const keyName = description ? `${name} (${description})` : name;

				if (name) {
					result[keyName!] = duration;
				}
			});
		}

		return result;
	}

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

		app.all('*', (c) =>
			Promise.all([
				// Proxy the actual request
				loadBalance(c.env.CONTAINER_SIDECAR, 9).fetch(c.req.raw),
				import('hono/timing'),
			]).then(([response, { setMetric }]) => {
				const mutableResponse = new Response(response.body, response);
				// Remove duplicate headers
				mutableResponse.headers.delete('Server-Timing');
				mutableResponse.headers.delete('Server-Timing-CC');

				// Get the build in Server-Timing header from the response
				const serverTiming = this.serverTiming(response.headers.get('Server-Timing') ?? undefined);
				for (const [key, value] of Object.entries(serverTiming)) {
					if (value !== null) {
						setMetric(c, key, value);
					}
				}

				// Get the cf container's Server-Timing header from the response
				const containerServerTiming = this.serverTiming(response.headers.get('Server-Timing-CC') ?? undefined);
				for (const [key, value] of Object.entries(containerServerTiming)) {
					if (value !== null) {
						setMetric(c, key, value);
					}
				}

				return mutableResponse;
			}),
		);

		return app.fetch(request, this.env, this.ctx);
	}
}
