import { getRandom } from '@cloudflare/containers';
import { createMcpHandler } from 'agents/mcp';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { contextStorage } from 'hono/context-storage';
import { createServer } from '~/mcp.js';
import baseApp from '~/routes/index.js';
import type { EnvVars } from '~/types.js';

export { ContainerSidecar } from '~/do.js';

const app = new Hono<{ Bindings: EnvVars }>();

// Variable Setup
app.use('*', contextStorage());

// Security
app.use(
	'*',
	bodyLimit({
		/**
		 * Set to less than worker memory limit
		 * @link https://developers.cloudflare.com/workers/platform/limits/#worker-limits
		 * mb * kb
		 */
		maxSize: 100 * 1024 * 1024,
		onError: (c) => c.json({ success: false, errors: [{ message: 'Content size not supported', extensions: { code: 413 } }] }, 413),
	}),
);

app.route('/', baseApp);

app.all('/mcp', (c) => createMcpHandler(createServer())(c.req.raw, c.env, c.executionCtx as ExecutionContext));

app.all('*', (c) => getRandom(c.env.CONTAINER_SIDECAR, 25).then((stub) => stub.fetch(c.req.url, c.req.raw)));

export default app;
