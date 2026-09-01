import { createServer } from "node:http";
import { connect, type MqttClient } from "mqtt";
import { config } from "./config";
import { AcousticSchema, StatusSchema, TelemetrySchema } from "./schemas";
import { handleAcoustic, handleStatus, handleTelemetry } from "./handlers";

const healthServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "grainguard-gateway"
    }));
    return;
  }

  res.writeHead(404);
  res.end();
});

healthServer.listen(config.PORT, "0.0.0.0", () => {
  console.log(`Health server listening on port ${config.PORT}`);
});

const ROOT = "grainguard/probes";
const TELEMETRY_FILTER = `${ROOT}/+/telemetry`;
const ACOUSTIC_FILTER = `${ROOT}/+/acoustic`;
const STATUS_FILTER = `${ROOT}/+/status`;

function probeIdFromTopic(topic: string): string | null {
  const parts = topic.split("/");
  if (parts.length !== 4) return null;
  if (parts[0] !== "grainguard" || parts[1] !== "probes") return null;
  return parts[2] || null;
}

function ackTopic(probeId: string): string {
  return `${ROOT}/${probeId}/ack`;
}

function publishAck(client: MqttClient, probeId: string, scanId: string): Promise<void> {
  const payload = JSON.stringify({ ok: true, scan_id: scanId });

  return new Promise((resolve, reject) => {
    client.publish(ackTopic(probeId), payload, { qos: 1, retain: false }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

const client = connect({
  protocol: "mqtts",
  host: config.MQTT_HOST,
  port: config.MQTT_PORT,
  username: config.MQTT_USERNAME,
  password: config.MQTT_PASSWORD,
  clientId: config.MQTT_CLIENT_ID,
  clean: true,
  reconnectPeriod: 2000,
  connectTimeout: 10000,
  keepalive: 30
});

client.on("connect", () => {
  console.log("MQTT connected");

  client.subscribe(
    {
      [TELEMETRY_FILTER]: { qos: 1 },
      [ACOUSTIC_FILTER]: { qos: 1 },
      [STATUS_FILTER]: { qos: 1 }
    },
    (error) => {
      if (error) {
        console.error("MQTT subscribe failed", error);
        return;
      }
      console.log("Subscribed to GrainGuard probe topics");
    }
  );
});

client.on("reconnect", () => console.log("MQTT reconnecting..."));
client.on("error", (error) => console.error("MQTT error", error));

client.on("message", async (topic, payload) => {
  const topicProbeId = probeIdFromTopic(topic);
  if (!topicProbeId) {
    console.warn("Ignoring malformed topic", topic);
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(payload.toString("utf8"));
  } catch {
    console.warn("Ignoring non-JSON payload on", topic);
    return;
  }

  try {
    if (topic.endsWith("/telemetry")) {
      const packet = TelemetrySchema.parse(raw);
      if (packet.probe_id !== topicProbeId) throw new Error("topic/payload probe_id mismatch");
      await handleTelemetry(packet);
      return;
    }

    if (topic.endsWith("/status")) {
      const packet = StatusSchema.parse(raw);
      if (packet.probe_id !== topicProbeId) throw new Error("topic/payload probe_id mismatch");
      await handleStatus(packet);
      return;
    }

    if (topic.endsWith("/acoustic")) {
      const packet = AcousticSchema.parse(raw);
      if (packet.probe_id !== topicProbeId) throw new Error("topic/payload probe_id mismatch");

      const outcome = await handleAcoustic(packet);

      // ACK only after Firestore has accepted the event (or confirmed that the
      // same scan_id already exists). The probe retries until it sees this ACK.
      await publishAck(client, packet.probe_id, packet.scan_id);
      console.log(`Acoustic ${outcome}: ${packet.scan_id}`);
      return;
    }
  } catch (error) {
    console.error(`Rejected message on ${topic}:`, error);
  }
});

const shutdown = () => {
  console.log("Shutting down gateway...");
  client.end(false, {}, () => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
