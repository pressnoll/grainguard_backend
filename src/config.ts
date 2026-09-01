import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  MQTT_HOST: z.string().min(1),
  MQTT_PORT: z.coerce.number().int().positive().default(8883),
  MQTT_USERNAME: z.string().min(1),
  MQTT_PASSWORD: z.string().min(1),
  MQTT_CLIENT_ID: z.string().min(1).default("grainguard-gateway-01"),

  FIREBASE_PROJECT_ID: z.string().min(1).default("grainguard-a3e3c"),

  // Used when deployed to Back4app.
  // Locally we can continue using GOOGLE_APPLICATION_CREDENTIALS.
  FIREBASE_SERVICE_ACCOUNT_B64: z.string().optional(),

  PORT: z.coerce.number().int().positive().default(3000)
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid gateway environment variables:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const config = parsed.data;