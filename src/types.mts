export interface EnvVars extends Secrets, Cloudflare.Env {
	CF_ACCOUNT_ID: string;
	GIT_HASH?: string;
}

interface Secrets {
	CF_API_TOKEN: string;
}

export interface ContextVariables {
	requestDate: Date;
}
