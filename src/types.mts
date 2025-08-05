import type { SecureHeadersVariables } from 'hono/secure-headers';
import type { TimingVariables } from 'hono/timing';
import type { ContainerSidecar } from '.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface EnvVars extends Secrets, Bindings, Record<string, any> {
	CF_ACCOUNT_ID: string;
	GIT_HASH: string;
	ENVIRONMENT: 'production' | 'preview';
	NODE_ENV: 'production' | 'development';
}

interface Secrets {
	CF_API_TOKEN: string;
}

interface Bindings {
	CONTAINER_SIDECAR: DurableObjectNamespace<ContainerSidecar>;
}

export type HonoVariables = TimingVariables & SecureHeadersVariables;
