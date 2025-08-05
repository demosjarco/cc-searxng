import { Container } from '@cloudflare/containers';
import type { EnvVars } from '~/types.mjs';

export class ContainerSidecar<E extends EnvVars = EnvVars> extends Container<E> {
	override defaultPort = 8080;
	override enableInternet = true;

	override onStart() {
		console.debug('Container successfully started');
	}

	override onStop() {
		console.debug('Container successfully shut down');
	}

	override onError(error: unknown) {
		console.error('Container error:', error);
	}
}
