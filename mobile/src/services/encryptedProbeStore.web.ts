import { ProbeFailure } from '../domain/probeFailure';

export async function openEncryptedProbeStore(): Promise<never> {
  throw new ProbeFailure('native-platform', 'native-required');
}
