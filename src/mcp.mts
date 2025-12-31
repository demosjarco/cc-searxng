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
			results: z4.array(
				z4.object({
					template: z4.string().trim().optional(),
					url: z4
						.url({ protocol: /^https?$/, hostname: z4.regexes.domain })
						.trim()
						.nonempty(),
					title: z4.string().trim().nonempty(),
					content: z4.string().trim(),
					publishedDate: z4.string().trim().nullable().optional(),
					thumbnail: z4.string().trim().optional(),
					engine: z4.string().trim().nonempty(),
					parsed_url: z4.array(z4.string().trim()).optional(),
					img_src: z4.string().trim().optional(),
					priority: z4.string().trim().optional(),
					engines: z4.array(z4.string().trim().nonempty()).optional(),
					positions: z4.array(z4.number()).optional(),
					score: z4.number().optional(),
					category: z4.string().trim().optional(),
					pubdate: z4.string().trim().optional(),
				}),
			),
			answers: z4.array(
				z4.object({
					url: z4
						.url({ protocol: /^https?$/, hostname: z4.regexes.domain })
						.trim()
						.nonempty(),
					engine: z4.string().trim().nonempty(),
					parsed_url: z4.array(z4.string().trim()).optional(),
					template: z4.string().trim().optional(),
					answer: z4.string().trim().nonempty(),
					title: z4.string().trim().optional(),
					thumbnail: z4.string().trim().optional(),
				}),
			),
			corrections: z4.array(z4.unknown()),
			infoboxes: z4.array(
				z4.object({
					infobox: z4.string().trim().nonempty(),
					id: z4.string().trim().optional(),
					content: z4.string().trim().optional(),
					img_src: z4.string().trim().optional(),
					urls: z4
						.array(
							z4.object({
								title: z4.string().trim().nonempty(),
								url: z4
									.url({ protocol: /^https?$/, hostname: z4.regexes.domain })
									.trim()
									.nonempty(),
								official: z4.boolean().optional(),
							}),
						)
						.optional(),
					engine: z4.string().trim().optional(),
					url: z4
						.url({ protocol: /^https?$/, hostname: z4.regexes.domain })
						.trim()
						.nonempty()
						.optional(),
					template: z4.string().trim().optional(),
					parsed_url: z4.array(z4.string().trim()).nullable().optional(),
					title: z4.string().trim().optional(),
					thumbnail: z4.string().trim().optional(),
					priority: z4.string().trim().optional(),
					engines: z4.array(z4.string().trim().nonempty()).optional(),
					positions: z4.union([z4.string().trim(), z4.array(z4.number()), z4.array(z4.string())]).optional(),
					score: z4.number().optional(),
					category: z4.string().trim().optional(),
					publishedDate: z4.string().trim().nullable().optional(),
					attributes: z4
						.array(
							z4.object({
								label: z4.string().trim().nonempty(),
								value: z4.string().trim(),
								entity: z4.string().trim().optional(),
								image: z4
									.object({
										src: z4.string().trim().optional(),
										alt: z4.string().trim().optional(),
										title: z4.string().trim().optional(),
										width: z4.number().optional(),
										height: z4.number().optional(),
										type: z4.string().trim().optional(),
										themes: z4.string().trim().optional(),
										colorinvertable: z4.boolean().optional(),
										contenttype: z4.string().trim().optional(),
									})
									.optional(),
							}),
						)
						.optional(),
				}),
			),
			suggestions: z4.array(z4.unknown()),
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
