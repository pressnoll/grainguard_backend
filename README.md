# GrainGuard MQTT -> Firestore gateway

The gateway contains no DSP and no ML. It only:

1. subscribes to probe MQTT topics;
2. validates and authenticates the logical probe identity through `probeRegistry`;
3. maps a probe to a facility/silo;
4. writes telemetry or an immutable acoustic inbox event to Firestore;
5. ACKs acoustic events after Firestore accepts them.

## Firestore probe registry

Create this document before testing P01:

`probeRegistry/P01`

```json
{
  "facilityId": "YOUR_FACILITY_ID",
  "siloId": "YOUR_SILO_ID",
  "enabled": true,
  "featureSchema": 1
}
```

Do not let the ESP choose its own `facilityId` or `siloId`; the trusted gateway owns that mapping.

## Local run

```bash
cp .env.example .env
npm install
npm run typecheck
npm run dev
```

For local Firebase Admin authentication, set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON path. Do not commit that JSON file.

## Data flow

- telemetry -> latest silo environment/device fields
- acoustic -> `facilities/{fid}/acousticInbox/{scanId}`
- app reads `acousticInbox`, runs the local acoustic classifier, then creates the immutable classified history under the existing `acousticEvents` collection and updates `silos/{siloId}.acoustic` atomically.

Using a separate `acousticInbox` is deliberate: it preserves the app's existing append-only `acousticEvents` history model instead of requiring clients to mutate a history document from `pending` to `classified`.
