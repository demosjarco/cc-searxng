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

export const jsonOutput = z.object({
	query: z.string().trim().nonempty().openapi({ description: 'The search query' }),
	number_of_results: z.int().nonnegative().openapi({ description: 'If engine supports paging, 0 means unlimited numbers of pages. The value is only applied if the engine itself does not have a max value that is lower than this one' }),
	results: z
		.array(
			z.object({
				template: z.string().trim().optional(),
				url: z
					.url({ protocol: /^https?$/, hostname: z.regexes.domain })
					.trim()
					.nonempty()
					.openapi({ description: 'Result URL' }),
				title: z.string().trim().nonempty().openapi({ description: 'Result title' }),
				content: z.string().trim().openapi({ description: 'Snippet shown for the result' }),
				publishedDate: z.string().trim().nullable().optional().openapi({ description: 'Published date if available' }),
				thumbnail: z.string().trim().optional().openapi({ description: 'Thumbnail URL if present' }),
				engine: z.string().trim().nonempty().openapi({ description: 'Primary engine delivering the result' }),
				parsed_url: z.array(z.string().trim()).optional().openapi({ description: 'Parsed URL parts' }),
				img_src: z.string().trim().optional().openapi({ description: 'Image source URL if available' }),
				priority: z.string().trim().optional().openapi({ description: 'Priority value if provided' }),
				engines: z.array(z.string().trim().nonempty()).optional().openapi({ description: 'Engines contributing this result' }),
				positions: z.array(z.number()).optional().openapi({ description: 'Result ranks across engines' }),
				score: z.number().optional().openapi({ description: 'Relevance score' }),
				category: z.string().trim().optional().openapi({ description: 'Result category if available' }),
				pubdate: z.string().trim().optional().openapi({ description: 'Alternate published date format' }),
			}),
		)
		.openapi({ description: 'List of search results' }),
	answers: z
		.array(
			z.object({
				url: z
					.url({ protocol: /^https?$/, hostname: z.regexes.domain })
					.trim()
					.nonempty()
					.openapi({ description: 'Answer source URL' }),
				engine: z.string().trim().nonempty().openapi({ description: 'Engine providing the answer' }),
				parsed_url: z.array(z.string().trim()).optional().openapi({ description: 'Parsed URL parts' }),
				template: z.string().trim().optional().openapi({ description: 'Template used to render the answer' }),
				answer: z.string().trim().nonempty().openapi({ description: 'Extracted answer text' }),
				title: z.string().trim().optional().openapi({ description: 'Answer title if present' }),
				thumbnail: z.string().trim().optional().openapi({ description: 'Thumbnail URL if present' }),
			}),
		)
		.openapi({ description: 'Direct answers returned by engines' }),
	corrections: z.array(z.unknown()).openapi({ description: 'Query corrections suggested by engines' }),
	infoboxes: z
		.array(
			z.object({
				infobox: z.string().trim().nonempty().openapi({ description: 'Infobox title' }),
				id: z.string().trim().optional().openapi({ description: 'Infobox identifier' }),
				content: z.string().trim().optional().openapi({ description: 'Infobox content' }),
				img_src: z.string().trim().optional().openapi({ description: 'Primary image URL' }),
				urls: z
					.array(
						z.object({
							title: z.string().trim().nonempty().openapi({ description: 'URL label' }),
							url: z
								.url({ protocol: /^https?$/, hostname: z.regexes.domain })
								.trim()
								.nonempty()
								.openapi({ description: 'URL' }),
							official: z.boolean().optional().openapi({ description: 'Marks official links' }),
						}),
					)
					.optional()
					.openapi({ description: 'Links related to the infobox' }),
				engine: z.string().trim().optional().openapi({ description: 'Engine providing the infobox' }),
				url: z
					.url({ protocol: /^https?$/, hostname: z.regexes.domain })
					.trim()
					.nonempty()
					.optional()
					.openapi({ description: 'Canonical URL if present' }),
				template: z.string().trim().optional().openapi({ description: 'Template used to render the infobox' }),
				parsed_url: z.array(z.string().trim()).nullable().optional().openapi({ description: 'Parsed URL parts' }),
				title: z.string().trim().optional().openapi({ description: 'Infobox title (displayed)' }),
				thumbnail: z.string().trim().optional().openapi({ description: 'Thumbnail URL' }),
				priority: z.string().trim().optional().openapi({ description: 'Priority value if provided' }),
				engines: z.array(z.string().trim().nonempty()).optional().openapi({ description: 'Engines contributing to the infobox' }),
				positions: z
					.union([z.string().trim(), z.array(z.number()), z.array(z.string())])
					.optional()
					.openapi({ description: 'Positions across engines' }),
				score: z.number().optional().openapi({ description: 'Infobox score if available' }),
				category: z.string().trim().optional().openapi({ description: 'Infobox category' }),
				publishedDate: z.string().trim().nullable().optional().openapi({ description: 'Published date if available' }),
				attributes: z
					.array(
						z.object({
							label: z.string().trim().nonempty().openapi({ description: 'Attribute label' }),
							value: z.string().trim().openapi({ description: 'Attribute value' }),
							entity: z.string().trim().optional().openapi({ description: 'Wikidata entity ID if available' }),
							image: z
								.object({
									src: z.string().trim().optional().openapi({ description: 'Image URL' }),
									alt: z.string().trim().optional().openapi({ description: 'Alt text' }),
									title: z.string().trim().optional().openapi({ description: 'Image title' }),
									width: z.number().optional().openapi({ description: 'Image width' }),
									height: z.number().optional().openapi({ description: 'Image height' }),
									type: z.string().trim().optional().openapi({ description: 'Image type identifier' }),
									themes: z.string().trim().optional().openapi({ description: 'Themes metadata' }),
									colorinvertable: z.boolean().optional().openapi({ description: 'Indicates if colors can be inverted' }),
									contenttype: z.string().trim().optional().openapi({ description: 'Content type' }),
								})
								.optional()
								.openapi({ description: 'Optional image for the attribute' }),
						}),
					)
					.optional()
					.openapi({ description: 'Attributes contained in the infobox' }),
			}),
		)
		.openapi({ description: 'Infoboxes compiled from engines' }),
	suggestions: z.array(z.unknown()).openapi({ description: 'Autocomplete suggestions if provided' }),
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
