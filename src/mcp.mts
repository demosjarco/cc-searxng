import { getRandom } from '@cloudflare/containers';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getContext } from 'hono/context-storage';
import type * as z4 from 'zod/v4';
import { input as searchZodInput, jsonOutput as searchZodOutput } from '~/routes/search/index.mjs';
import type { EnvVars } from '~/types.mjs';

export const server = new McpServer({
	name: 'DemosJarco Search',
	version: '1.0.0',
	websiteUrl: 'https://search.demosjarco.dev',
});

server.registerTool(
	'web-search',
	{
		title: 'Web Search',
		description: 'Searches the web via a SearXNG instances with many engines',
		inputSchema: {
			query: searchZodInput.shape.q,
			language: searchZodInput.shape.language,
			pageno: searchZodInput.shape.pageno,
			safesearch: searchZodInput.shape.safesearch,
		},
		outputSchema: {
			results: searchZodOutput.shape.results,
			answers: searchZodOutput.shape.answers,
			corrections: searchZodOutput.shape.corrections,
			infoboxes: searchZodOutput.shape.infoboxes,
			suggestions: searchZodOutput.shape.suggestions,
		},
	},
	async ({ query, language, pageno, safesearch }) => {
		const url = new URL('https://search.demosjarco.dev/search');
		// Hardcoded
		url.searchParams.set('format', 'json');
		url.searchParams.set('image_proxy', 'False');
		// Ai decided
		url.searchParams.set('q', query);
		if (language) url.searchParams.set('language', language);
		url.searchParams.set('pageno', pageno.toString(10));
		url.searchParams.set('safesearch', safesearch);

		return getRandom(getContext<{ Bindings: EnvVars }>().env.CONTAINER_SIDECAR, 10)
			.then((stub) => stub.fetch(url))
			.then((response) => {
				if (response.ok) {
					return response.json<z4.output<typeof searchZodOutput>>().then(({ results, answers, corrections, infoboxes, suggestions }) => {
						const json = {
							...results,
							...answers,
							...corrections,
							...infoboxes.filter((infobox) => infobox.engine !== 'cloudflareai'),
							...suggestions,
						};

						return {
							content: [{ type: 'text', text: JSON.stringify(json) }],
							structuredContent: json,
						};
					});
				} else {
					return {
						content: [{ type: 'text', text: `Search failed HTTP ${response.status}: ${response.statusText}` }],
					};
				}
			});
	},
);
