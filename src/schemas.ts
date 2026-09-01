import { z } from "zod";

const finiteNumber = z.number().finite();
const probeId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

export const TelemetrySchema = z.object({
  protocol_version: z.literal(1),
  probe_id: probeId,
  sequence: z.number().int().nonnegative(),
  temperature_c: finiteNumber,
  humidity_pct: finiteNumber,
  dht_valid: z.boolean(),
  battery_v: finiteNumber,
  firmware: z.string().min(1).max(64),
  uptime_ms: z.number().int().nonnegative()
}).superRefine((value, ctx) => {
  if (value.dht_valid) {
    if (value.temperature_c < -40 || value.temperature_c > 80) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["temperature_c"], message: "temperature outside DHT22 range" });
    }
    if (value.humidity_pct < 0 || value.humidity_pct > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["humidity_pct"], message: "humidity outside 0..100" });
    }
  }
  if (value.battery_v < 0 || value.battery_v > 6.5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["battery_v"], message: "battery voltage outside expected range" });
  }
});

const FeatureVectorSchema = z.array(finiteNumber).length(30);

const AcousticWindowSchema = z.object({
  index: z.number().int().nonnegative(),
  measured_sample_rate_hz: finiteNumber,
  features: FeatureVectorSchema
});

export const AcousticSchema = z.object({
  protocol_version: z.literal(1),
  probe_id: probeId,
  scan_id: z.string().min(8).max(96),
  sequence: z.number().int().nonnegative(),
  feature_schema: z.literal(1),
  feature_space: z.literal("raw"),
  sample_rate_hz: z.literal(24000),
  window_seconds: z.literal(1),
  window_count: z.number().int().min(1).max(10),
  firmware: z.string().min(1).max(64),
  environment: z.object({
    temperature_c: finiteNumber,
    humidity_pct: finiteNumber,
    dht_valid: z.boolean()
  }),
  device: z.object({
    battery_v: finiteNumber
  }),
  windows: z.array(AcousticWindowSchema).min(1).max(10)
}).superRefine((value, ctx) => {
  if (value.windows.length !== value.window_count) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["windows"],
      message: "window_count does not match windows.length"
    });
  }

  const seen = new Set<number>();
  for (const window of value.windows) {
    if (seen.has(window.index)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["windows"], message: "duplicate window index" });
    }
    seen.add(window.index);

    // Allow a small real-world ADC clock tolerance, while rejecting a clearly
    // incompatible capture rate.
    if (window.measured_sample_rate_hz < 22000 || window.measured_sample_rate_hz > 26000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["windows", window.index, "measured_sample_rate_hz"],
        message: "measured sample rate outside accepted range"
      });
    }
  }

  for (let i = 0; i < value.window_count; i += 1) {
    if (!seen.has(i)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["windows"], message: `missing window index ${i}` });
    }
  }

  if (value.environment.dht_valid) {
    if (value.environment.temperature_c < -40 || value.environment.temperature_c > 80) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["environment", "temperature_c"], message: "temperature outside DHT22 range" });
    }
    if (value.environment.humidity_pct < 0 || value.environment.humidity_pct > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["environment", "humidity_pct"], message: "humidity outside 0..100" });
    }
  }
  if (value.device.battery_v < 0 || value.device.battery_v > 6.5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["device", "battery_v"], message: "battery voltage outside expected range" });
  }
});

export const StatusSchema = z.object({
  protocol_version: z.literal(1),
  probe_id: probeId,
  state: z.enum(["online", "sleeping", "error"]),
  sequence: z.number().int().nonnegative(),
  firmware: z.string().min(1).max(64)
});

export type TelemetryPacket = z.infer<typeof TelemetrySchema>;
export type AcousticPacket = z.infer<typeof AcousticSchema>;
export type StatusPacket = z.infer<typeof StatusSchema>;
