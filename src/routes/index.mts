import { OpenAPIHono } from '@hono/zod-openapi';
import search from '~/routes/search/index.mjs';
import type { EnvVars } from '~/types.mjs';

const app = new OpenAPIHono<{ Bindings: EnvVars }>();

const title = 'DemosJarco Search API';

app.doc31('/generate/openapi31', (c) => ({
	openapi: '3.1.0',
	info: {
		title,
		version: c.env.ENVIRONMENT.toLocaleUpperCase(),
	},
	servers: [
		{
			url: c.req.path
				.split('/')
				.splice(0, c.req.path.split('/').length - 2)
				.join('/'),
		},
	],
}));
app.doc('/generate/openapi', (c) => ({
	openapi: '3.0.0',
	info: {
		title,
		version: c.env.ENVIRONMENT.toLocaleUpperCase(),
	},
	servers: [
		{
			url: c.req.path
				.split('/')
				.splice(0, c.req.path.split('/').length - 2)
				.join('/'),
		},
	],
}));
app.doc('/generate/search.cf-apig.openapi', (c) => ({
	openapi: '3.0.0',
	info: {
		title,
		version: c.env.ENVIRONMENT.toLocaleUpperCase(),
	},
	servers: [
		{
			url: 'https://search.demosjarco.dev',
		},
	],
}));

app.route('/search', search);

export default app;
