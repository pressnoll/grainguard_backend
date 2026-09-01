import { db } from "./firebase";

export interface ProbeBinding {
  probeId: string;
  facilityId: string;
  siloId: string;
  enabled: boolean;
  featureSchema: number;
}

interface CacheEntry {
  value: ProbeBinding;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getProbeBinding(probeId: string): Promise<ProbeBinding> {
  const now = Date.now();
  const cached = cache.get(probeId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const snap = await db.collection("probeRegistry").doc(probeId).get();
  if (!snap.exists) {
    throw new Error(`Unregistered probe: ${probeId}`);
  }

  const data = snap.data() ?? {};
  const binding: ProbeBinding = {
    probeId,
    facilityId: String(data.facilityId ?? ""),
    siloId: String(data.siloId ?? ""),
    enabled: data.enabled === true,
    featureSchema: Number(data.featureSchema ?? 1)
  };

  if (!binding.facilityId || !binding.siloId) {
    throw new Error(`Probe ${probeId} has incomplete facility/silo binding`);
  }
  if (!binding.enabled) {
    throw new Error(`Probe ${probeId} is disabled`);
  }

  cache.set(probeId, { value: binding, expiresAt: now + CACHE_TTL_MS });
  return binding;
}
