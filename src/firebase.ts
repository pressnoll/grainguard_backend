import {
  applicationDefault,
  cert,
  getApps,
  initializeApp
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";
import { config } from "./config";

if (getApps().length === 0) {
  let credential;

  if (config.FIREBASE_SERVICE_ACCOUNT_B64) {
    const json = Buffer.from(
      config.FIREBASE_SERVICE_ACCOUNT_B64,
      "base64"
    ).toString("utf8");

    const serviceAccount = JSON.parse(json);

    credential = cert(serviceAccount);
  } else {
    credential = applicationDefault();
  }

  initializeApp({
    credential,
    projectId: config.FIREBASE_PROJECT_ID
  });
}

export const db = getFirestore();