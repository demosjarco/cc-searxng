import type { SecureHeadersVariables } from 'hono/secure-headers';
import type { TimingVariables } from 'hono/timing';

export interface EnvVars extends Secrets, Cloudflare.Env {
	CF_ACCOUNT_ID: string;
	GIT_HASH?: string;
}

interface Secrets {
	CF_API_TOKEN: string;
}

export type HonoVariables = TimingVariables & SecureHeadersVariables;
