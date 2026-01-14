import { getRandom } from '@cloudflare/containers';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getContext } from 'hono/context-storage';
import * as z4 from 'zod/v4';
import type { jsonOutput as searchZodOutput } from '~/routes/search/index.mjs';
import type { EnvVars } from '~/types.mjs';

export const server = new McpServer({
	name: 'DemosJarco Search',
	version: '1.0.0',
	websiteUrl: 'https://search.demosjarco.dev',
});

/**
 * @link https://github.com/searxng/searxng/blob/3d88876a32addc8a1d1be8cf8afe8f9136a1571d/searx/result_types/_base.py#L228-L335
 */
const Result = z4.object({
	url: z4
		.url({ protocol: /^https?$/, hostname: z4.regexes.domain })
		.trim()
		.nonempty()
		.optional(),
	engine: z4.string().trim().nonempty().optional(),
	parsed_url: z4.array(z4.string().trim()).optional(),
});
/**
 * @link https://github.com/searxng/searxng/blob/3d88876a32addc8a1d1be8cf8afe8f9136a1571d/searx/result_types/_base.py#L228-L335
 */
const MainResult = Result.extend({
	template: z4.string().trim().default('default.html'),
	title: z4.string().trim().optional(),
	content: z4.string().trim().optional(),
	img_src: z4.string().trim().optional(),
	iframe_src: z4.string().trim().optional(),
	audio_src: z4.string().trim().optional(),
	thumbnail: z4.string().trim().nullish(),
	publishedDate: z4.string().trim().nullable().optional(),
	pubdate: z4.string().trim().optional(),
	length: z4.number().optional(),
	views: z4.string().trim().optional(),
	author: z4.string().trim().optional(),
	metadata: z4.string().trim().optional(),
	priority: z4.enum(['', 'high', 'low']).default(''),
	engines: z4.array(z4.string().trim().nonempty()).default([]),
	positions: z4.array(z4.int().nonnegative()).default([]),
	score: z4.number().default(0),
	category: z4.string().trim().optional(),
});

/**
 * @link https://github.com/searxng/searxng/blob/3d88876a32addc8a1d1be8cf8afe8f9136a1571d/searx/result_types/_base.py#L427-L572
 */
const LegacyResult = z4.object({
	url: z4
		.url({ protocol: /^https?$/, hostname: z4.regexes.domain })
		.trim()
		.nonempty()
		.nullish(),
	template: z4.string().trim().default('default.html'),
	engine: z4.string().trim().nonempty().optional(),
	parsed_url: z4.array(z4.string().trim()).nullish(),
	title: z4.string().trim().optional(),
	content: z4.string().trim().optional(),
	img_src: z4.string().trim().optional(),
	thumbnail: z4.string().trim().nullish(),
	priority: z4.enum(['', 'high', 'low']).default(''),
	engines: z4.array(z4.string().trim().nonempty()).default([]),
	positions: z4.union([z4.array(z4.int().nonnegative()).default([]), z4.literal('')]),
	score: z4.number().default(0),
	category: z4.string().trim().optional(),
	publishedDate: z4.string().trim().nullable().optional(),
	pubdate: z4.string().trim().optional(),
});

server.registerTool(
	'web-search',
	{
		title: 'Web Search',
		description: 'Searches the web via SearXNG instances',
		inputSchema: z4.object({
			query: z4.string().trim().nonempty(),
			language: z4
				.string()
				.trim()
				.nonempty()
				.refine((value) => import('validator/es/lib/isLocale').then(({ default: isLocale }) => isLocale(value)))
				.optional(),
			pageno: z4.coerce.number().int().min(1).default(1),
			safesearch: z4.enum(['0', '1', '2']).default('0'),
		}),
		outputSchema: z4.object({
			/**
			 * @link https://github.com/searxng/searxng/blob/3d88876a32addc8a1d1be8cf8afe8f9136a1571d/searx/results.py#L59
			 */
			results: z4.array(z4.union([MainResult, LegacyResult])),
			/**
			 * @link https://github.com/searxng/searxng/blob/master/searx/results.py#L62
			 */
			answers: z4.array(Result),
			/**
			 * @link https://github.com/searxng/searxng/blob/master/searx/results.py#L63
			 */
			corrections: z4.array(z4.string()),
			/**
			 * @link https://github.com/searxng/searxng/blob/master/searx/results.py#L60
			 */
			infoboxes: z4.array(
				LegacyResult.extend({
					infobox: z4.string().trim().nonempty(),
					urls: z4.array(z4.record(z4.string(), z4.string())),
					attributes: z4.array(z4.record(z4.string(), z4.string())),
				}),
			),
			/**
			 * @link https://github.com/searxng/searxng/blob/master/searx/results.py#L61
			 */
			suggestions: z4.array(z4.string()),
		}),
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
							results,
							answers,
							corrections,
							infoboxes: infoboxes.filter((infobox) => infobox.engine !== 'cloudflareai'),
							suggestions,
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
