import crypto from "node:crypto";

function sanitizeEnvValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[\r\n\t]+/g, "");
}

export function getSanitizedRiotApiKey() {
  const rawValue = sanitizeEnvValue(process.env.RIOT_API_KEY);

  if (!rawValue) {
    throw new Error(
      "Falta RIOT_API_KEY. Riot ID y Spectator requieren una API key oficial.",
    );
  }

  if (!/^RGAPI-[A-Za-z0-9-]+$/.test(rawValue)) {
    throw new Error(
      "La RIOT_API_KEY configurada es invalida. Revisa que en Vercel no tenga comillas, espacios o saltos de linea.",
    );
  }

  return rawValue;
}

export function hasValidRiotApiKey() {
  try {
    return Boolean(getSanitizedRiotApiKey());
  } catch {
    return false;
  }
}

export function getRiotApiKeyFingerprint() {
  try {
    const key = getSanitizedRiotApiKey();
    return crypto.createHash("sha256").update(key).digest("hex").slice(0, 10);
  } catch {
    return null;
  }
}
