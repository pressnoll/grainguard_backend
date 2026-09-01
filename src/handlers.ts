import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebase";
import { getProbeBinding } from "./registry";
import type { AcousticPacket, StatusPacket, TelemetryPacket } from "./schemas";

export async function handleTelemetry(packet: TelemetryPacket): Promise<void> {
  const binding = await getProbeBinding(packet.probe_id);

  const siloRef = db
    .collection("facilities")
    .doc(binding.facilityId)
    .collection("silos")
    .doc(binding.siloId);

  const update: Record<string, unknown> = {
    device: {
      probeId: packet.probe_id,
      batteryV: packet.battery_v,
      firmware: packet.firmware,
      lastSequence: packet.sequence,
      lastSeenAt: FieldValue.serverTimestamp()
    },
    lastFrameAt: FieldValue.serverTimestamp()
  };

  if (packet.dht_valid) {
    update.environment = {
      temperatureC: packet.temperature_c,
      humidityPct: packet.humidity_pct,
      source: "probe",
      capturedAt: FieldValue.serverTimestamp()
    };
  }

  await siloRef.set(update, { merge: true });
}

export async function handleAcoustic(packet: AcousticPacket): Promise<"created" | "duplicate"> {
  const binding = await getProbeBinding(packet.probe_id);

  if (binding.featureSchema !== packet.feature_schema) {
    throw new Error(
      `Feature schema mismatch for ${packet.probe_id}: registry=${binding.featureSchema}, packet=${packet.feature_schema}`
    );
  }

  const inboxRef = db
    .collection("facilities")
    .doc(binding.facilityId)
    .collection("acousticInbox")
    .doc(packet.scan_id);

  const inboxRecord = {
    scanId: packet.scan_id,
    probeId: packet.probe_id,
    siloId: binding.siloId,
    protocolVersion: packet.protocol_version,
    featureSchema: packet.feature_schema,
    featureSpace: packet.feature_space,
    sampleRateHz: packet.sample_rate_hz,
    windowSeconds: packet.window_seconds,
    windowCount: packet.window_count,
    sequence: packet.sequence,
    firmware: packet.firmware,
    environment: {
      temperatureC: packet.environment.temperature_c,
      humidityPct: packet.environment.humidity_pct,
      dhtValid: packet.environment.dht_valid
    },
    device: {
      batteryV: packet.device.battery_v
    },
    windows: packet.windows,
    receivedAt: FieldValue.serverTimestamp()
  };

  try {
    // create() is deliberately used instead of set(): the scan_id is our
    // idempotency key. Retried MQTT deliveries cannot overwrite an existing event.
    await inboxRef.create(inboxRecord);
    return "created";
  } catch (error: unknown) {
    const maybeCode = (error as { code?: number | string }).code;
    if (maybeCode === 6 || maybeCode === "already-exists") {
      return "duplicate";
    }
    throw error;
  }
}

export async function handleStatus(packet: StatusPacket): Promise<void> {
  const binding = await getProbeBinding(packet.probe_id);

  const registryRef = db.collection("probeRegistry").doc(packet.probe_id);
  const siloRef = db
    .collection("facilities")
    .doc(binding.facilityId)
    .collection("silos")
    .doc(binding.siloId);

  const batch = db.batch();
  batch.set(
    registryRef,
    {
      lastState: packet.state,
      lastSequence: packet.sequence,
      firmware: packet.firmware,
      lastSeenAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  batch.set(
    siloRef,
    {
      device: {
        probeId: packet.probe_id,
        state: packet.state,
        firmware: packet.firmware,
        lastSeenAt: FieldValue.serverTimestamp()
      }
    },
    { merge: true }
  );

  await batch.commit();
}
