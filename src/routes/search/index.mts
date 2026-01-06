import { getRandom } from '@cloudflare/containers';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { EnvVars } from '~/types.mjs';

const app = new OpenAPIHono<{ Bindings: EnvVars }>();

/**
 * @link https://docs.searxng.org/dev/search_api.html
 */
const plugins = ['Hash_plugin', 'Self_Information', 'Tracker_URL_remover', 'Ahmia_blacklist', 'Hostnames_plugin', 'Open_Access_DOI_rewrite', 'Vim-like_hotkeys', 'Tor_check_plugin'] as const;
const input = z.object({
	q: z.string().trim().nonempty().openapi({ description: 'Search query' }).openapi({ description: 'The search query. This string is passed to external search services. Thus, SearXNG supports syntax of each search service. For example, site:github.com SearXNG is a valid query for Google. However, if simply the query above is passed to any search engine which does not filter its results based on this syntax, you might not get the results you wanted.' }),
	categories: z
		.codec(z.string().trim().nonempty(), z.array(z.string().trim().nonempty()).nonempty(), {
			decode: (str) => str.split(',').map((s) => s.trim()),
			encode: (arr) => arr.join(','),
		})
		.optional()
		.openapi({ description: 'Comma separated list, specifies the active search categories' }),
	engines: z
		.codec(z.string().trim().nonempty(), z.array(z.string().trim().nonempty()).nonempty(), {
			decode: (str) => str.split(',').map((s) => s.trim()),
			encode: (arr) => arr.join(','),
		})
		.optional()
		.openapi({ description: 'Comma separated list, specifies the active search engines' }),
	language: z
		.string()
		.trim()
		.nonempty()
		.refine((value) => import('validator/es/lib/isLocale').then(({ default: isLocale }) => isLocale(value)))
		.optional()
		.openapi({ description: 'Code of the language' }),
	pageno: z.coerce.number().int().min(1).default(1).openapi({ description: 'Search page number' }),
	time_range: z.enum(['day', 'month', 'year']).optional().openapi({ description: 'Time range of search for engines which support it' }),
	format: z.enum(['json', 'csv', 'rss']).optional().openapi({ description: 'Output format of results' }),
	results_on_new_tab: z.enum(['0', '1']).default('0').openapi({ description: 'Open search results on new tab' }),
	image_proxy: z.enum(['True', 'False']).default('True').openapi({ description: 'Open search results on new tab' }),
	autocomplete: z.enum(['360search', 'baidu', 'brave', 'dbpedia', 'duckduckgo', 'google', 'mwmbl', 'naver', 'quark', 'qwant', 'seznam', 'sogou', 'startpage', 'stract', 'swisscows', 'wikipedia', 'yandex']).default('duckduckgo').openapi({ description: 'Service which completes words as you type' }),
	safesearch: z.enum(['0', '1', '2']).default('0').openapi({ description: 'Open search results on new tab' }),
	theme: z.enum(['simple']).default('simple').openapi({ description: 'Theme of instance' }),
	enabled_plugins: z
		.codec(
			z
				.string()
				.trim()
				.nonempty()
				.default((['Hash_plugin', 'Self_Information', 'Tracker_URL_remover', 'Ahmia_blacklist'] as (typeof plugins)[number][]).join(',')),
			z.array(z.enum(plugins)).nonempty(),
			{
				decode: (str) =>
					str
						.split(',')
						.map((s) => s.trim())
						.filter((s): s is (typeof plugins)[number] => plugins.includes(s as (typeof plugins)[number])),
				encode: (arr) => arr.join(','),
			},
		)
		.openapi({ description: 'List of enabled plugins' }),
	disabled_plugins: z
		.codec(
			z
				.string()
				.trim()
				.nonempty()
				.default((['Hostnames_plugin', 'Open_Access_DOI_rewrite', 'Vim-like_hotkeys', 'Tor_check_plugin'] as (typeof plugins)[number][]).join(',')),
			z.array(z.enum(plugins)).nonempty(),
			{
				decode: (str) =>
					str
						.split(',')
						.map((s) => s.trim())
						.filter((s): s is (typeof plugins)[number] => plugins.includes(s as (typeof plugins)[number])),
				encode: (arr) => arr.join(','),
			},
		)
		.openapi({ description: 'List of enabled plugins' }),
	enabled_engines: z
		.codec(z.string().trim().nonempty(), z.array(z.string().trim().nonempty()).nonempty(), {
			decode: (str) => str.split(',').map((s) => s.trim()),
			encode: (arr) => arr.join(','),
		})
		.optional()
		.openapi({ description: 'List of enabled engines' }),
	disabled_engines: z
		.codec(z.string().trim().nonempty(), z.array(z.string().trim().nonempty()).nonempty(), {
			decode: (str) => str.split(',').map((s) => s.trim()),
			encode: (arr) => arr.join(','),
		})
		.optional()
		.openapi({ description: 'List of disabled engines' }),
});

/**
 * @link https://github.com/searxng/searxng/blob/3d88876a32addc8a1d1be8cf8afe8f9136a1571d/searx/result_types/_base.py#L228-L335
 */
const Result = z
	.object({
		url: z
			.url({ protocol: /^https?$/, hostname: z.regexes.domain })
			.trim()
			.nonempty()
			.optional()
			.openapi({ description: 'A link related to this *result*' }),
		engine: z.string().trim().nonempty().optional().openapi({ description: 'Engine providing the answer' }),
		parsed_url: z.array(z.string().trim()).optional().openapi({ description: 'Parsed URL parts' }),
	})
	.openapi('Result', { description: 'Base class of all result types' });

/**
 * @link https://github.com/searxng/searxng/blob/3d88876a32addc8a1d1be8cf8afe8f9136a1571d/searx/result_types/_base.py#L228-L335
 */
const MainResult = Result.extend({
	template: z.string().trim().default('default.html').openapi({ description: 'Name of the template used to render the result' }),
	title: z.string().trim().optional().openapi({ description: 'Link title of the result item' }),
	content: z.string().trim().optional().openapi({ description: 'Extract or description of the result item' }),
	img_src: z.string().trim().optional().openapi({ description: 'URL of a image that is displayed in the result item' }),
	iframe_src: z.string().trim().optional().openapi({ description: 'URL of an embedded `<iframe>` / the frame is collapsible' }),
	audio_src: z.string().trim().optional().openapi({ description: 'URL of an embedded `<audio controls>`' }),
	thumbnail: z.string().trim().optional().openapi({ description: 'URL of a thumbnail that is displayed in the result item' }),
	publishedDate: z.string().trim().nullable().optional().openapi({ description: 'The date on which the object was published' }),
	pubdate: z.string().trim().optional().openapi({ description: 'String representation of `MainResult.publishedDate`. Deprecated: it is still partially used in the templates, but will one day be completely eliminated.' }),
	length: z.number().optional().openapi({ description: 'Playing duration in seconds' }),
	views: z.string().trim().optional().openapi({ description: 'View count in humanized number format' }),
	author: z.string().trim().optional().openapi({ description: 'Author of the title' }),
	metadata: z.string().trim().optional().openapi({ description: 'Miscellaneous metadata' }),
	priority: z.enum(['', 'high', 'low']).default('').openapi({ description: 'The priority can be set via :ref:`hostnames plugin`, for example' }),
	engines: z.array(z.string().trim().nonempty()).default([]).openapi({ description: 'In a merged results list, the names of the engines that found this result are listed in this field' }),
	positions: z.array(z.int().nonnegative()).default([]).openapi({ description: 'Result ranks across engines' }),
	score: z.number().default(0).openapi({ description: 'Relevance score' }),
	category: z.string().trim().optional().openapi({ description: 'Result category if available' }),
}).openapi('MainResult', { description: 'Base class of all result types displayed in area main results' });

/**
 * @link https://github.com/searxng/searxng/blob/3d88876a32addc8a1d1be8cf8afe8f9136a1571d/searx/result_types/_base.py#L427-L572
 */
const LegacyResult = z
	.object({
		url: z
			.url({ protocol: /^https?$/, hostname: z.regexes.domain })
			.trim()
			.nonempty()
			.nullish(),
		template: z.string().trim().default('default.html'),
		engine: z.string().trim().nonempty().optional(),
		parsed_url: z.array(z.string().trim()).nullish().openapi({ description: 'Parsed URL parts' }),
		title: z.string().trim().optional(),
		content: z.string().trim().optional(),
		img_src: z.string().trim().optional(),
		thumbnail: z.string().trim().optional(),
		priority: z.enum(['', 'high', 'low']).default(''),
		engines: z.array(z.string().trim().nonempty()).default([]),
		positions: z.union([z.array(z.int().nonnegative()).default([]), z.literal('')]),
		score: z.number().default(0),
		category: z.string().trim().optional(),
		publishedDate: z.string().trim().nullable().optional(),
		pubdate: z.string().trim().optional(),
	})
	.openapi('LegacyResult', { description: 'A wrapper around a legacy result item. The SearXNG core uses this class for untyped dictionaries / to be downward compatible. This class is needed until we have implemented an `Result` class for each result type and the old usages in the codebase have been fully migrated.' });

export const jsonOutput = z.object({
	query: z.string().trim().nonempty().openapi({ description: 'The search query' }),
	number_of_results: z.int().nonnegative().openapi({ description: 'Average number of results reported by engines' }),
	/**
	 * @link https://github.com/searxng/searxng/blob/3d88876a32addc8a1d1be8cf8afe8f9136a1571d/searx/results.py#L59
	 */
	results: z.array(z.union([MainResult, LegacyResult])).openapi({ description: 'List of search results (typed or legacy)' }),
	/**
	 * @link https://github.com/searxng/searxng/blob/master/searx/results.py#L62
	 */
	answers: z.array(Result).openapi({ description: 'Direct answers returned by engines' }),
	/**
	 * @link https://github.com/searxng/searxng/blob/master/searx/results.py#L63
	 */
	corrections: z.array(z.string()).openapi({ description: 'Query corrections suggested by engines' }),
	/**
	 * @link https://github.com/searxng/searxng/blob/master/searx/results.py#L60
	 */
	infoboxes: z
		.array(
			LegacyResult.extend({
				infobox: z.string().trim().nonempty(),
				urls: z.array(z.record(z.string(), z.string())),
				attributes: z.array(z.record(z.string(), z.string())),
			}),
		)
		.openapi({ description: 'Infoboxes compiled from engines' }),
	/**
	 * @link https://github.com/searxng/searxng/blob/master/searx/results.py#L61
	 */
	suggestions: z.array(z.string()).openapi({ description: 'Autocomplete suggestions if provided' }),
	unresponsive_engines: z.array(z.tuple([z.string().trim().nonempty().openapi({ description: 'Engine name' }), z.string().trim().nonempty().openapi({ description: 'Error message' })])).openapi({ description: 'List of unresponsive engines' }),
});

app.openapi(
	createRoute({
		method: 'get',
		path: '/',
		request: {
			query: input,
		},
		responses: {
			200: {
				content: {
					'application/json': {
						schema: jsonOutput,
					},
					'application/rss+xml': {
						schema: z
							.object({
								version: z
									.literal('2.0')
									.optional()
									.openapi({ description: 'RSS version attribute', xml: { attribute: true } }),
								channel: z
									.object({
										title: z.string().trim().nonempty().openapi({ description: 'Channel title' }),
										link: z
											.url({ protocol: /^https?$/, hostname: z.regexes.domain })
											.trim()
											.nonempty()
											.openapi({ description: 'Channel link', xml: { name: 'link' } }),
										description: z.string().trim().nonempty().openapi({ description: 'Channel description' }),
										language: z.string().trim().optional().openapi({ description: 'Language tag for the feed' }),
										generator: z.string().trim().optional().openapi({ description: 'Feed generator identifier' }),
										docs: z
											.url({ protocol: /^https?$/, hostname: z.regexes.domain })
											.trim()
											.nonempty()
											.optional()
											.openapi({ description: 'Documentation URL for RSS', xml: { name: 'docs' } }),
										lastBuildDate: z.string().trim().optional().openapi({ description: 'Last build timestamp (RFC 822)' }),
										item: z
											.array(
												z
													.object({
														title: z.string().trim().nonempty().openapi({ description: 'Entry title' }),
														link: z
															.url({ protocol: /^https?$/, hostname: z.regexes.domain })
															.trim()
															.nonempty()
															.openapi({ description: 'Entry link', xml: { name: 'link' } }),
														guid: z
															.string()
															.trim()
															.nonempty()
															.openapi({ description: 'Stable entry identifier', xml: { name: 'guid' } }),
														pubDate: z.string().trim().optional().openapi({ description: 'Publication date (RFC 822)' }),
														description: z.string().trim().optional().openapi({ description: 'Entry summary' }),
														category: z.string().trim().optional().openapi({ description: 'Entry category' }),
													})
													.openapi({ description: 'RSS channel entry', xml: { name: 'item' } }),
											)
											.nonempty()
											.openapi({ description: 'Entries contained in the channel', xml: { name: 'item', wrapped: false } }),
									})
									.openapi({ description: 'RSS channel metadata', xml: { name: 'channel' } }),
							})
							.openapi({
								xml: { name: 'rss' },
								format: 'xml',
							}),
					},
					'application/csv': {
						schema: z.string().trim().nonempty().openapi({ type: 'string', format: 'binary' }),
					},
				},
				description: 'Return results in the requested format.',
			},
		},
	}),
	(c) => {
		const url = new URL(c.req.url);
		url.search = new URLSearchParams(
			// @ts-expect-error URLSearchParams correctly converts string values, but TS doesn't infer that
			c.req.valid('query'),
		).toString();

		return getRandom(c.env.CONTAINER_SIDECAR, 10).then((stub) => stub.fetch(url, new Request(url, c.req.raw)));
	},
);

export default app;
