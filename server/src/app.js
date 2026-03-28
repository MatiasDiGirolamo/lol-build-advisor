import cors from "cors";
import express from "express";

import { PLATFORM_OPTIONS } from "./data/constants.js";
import { maybeGenerateAiBrief } from "./services/aiAdvisor.js";
import {
  getChampionBuildPackage,
  getChampionCatalog,
} from "./services/buildCatalog.js";
import { getTierListOverview } from "./services/metaTierProvider.js";
import { analyzeFromLiveClient } from "./services/liveClientApi.js";
import { buildRecommendations } from "./services/recommendationEngine.js";
import { analyzeFromRiotId } from "./services/riotApi.js";
import { hasValidRiotApiKey } from "./utils/env.js";
import { RequestError } from "./utils/http.js";

const app = express();
const rateLimitState = new Map();

function getPublicErrorMessage(error, fallbackMessage) {
  if (error instanceof RequestError) {
    if (error.status === 401 || error.status === 403) {
      return "Riot rechazo la API key. En el portal de Riot genera una dev key nueva y pegala otra vez en Vercel. Las development keys vencen cada 24 horas.";
    }

    if (error.status === 404) {
      return "No encontre ese recurso en Riot API. Revisa Riot ID, tag y servidor.";
    }

    if (error.status === 429) {
      return "Riot API esta rate-limited ahora. Espera un momento y volve a probar.";
    }
  }

  return error?.message || fallbackMessage;
}

function getClientKey(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.ip || request.socket?.remoteAddress || "unknown";
}

function allowOrigin(origin) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = String(origin).toLowerCase();
  const allowedOrigins = new Set(
    [
      process.env.APP_ORIGIN,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
    ].filter(Boolean).map((value) => value.toLowerCase()),
  );

  if (allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(normalizedOrigin);
}

function rateLimit({ windowMs, maxRequests }) {
  return (request, response, next) => {
    const now = Date.now();
    const key = `${request.path}:${getClientKey(request)}`;
    const entry = rateLimitState.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      rateLimitState.set(key, {
        windowStart: now,
        count: 1,
      });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      response.status(429).json({
        message: "Demasiadas requests seguidas. Espera unos segundos y probá de nuevo.",
      });
      return;
    }

    entry.count += 1;
    next();
  };
}

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      callback(null, allowOrigin(origin));
    },
  }),
);
app.use(express.json({ limit: "16kb" }));
app.use((request, response, next) => {
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    hasRiotApiKey: hasValidRiotApiKey(),
    hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.get("/api/platforms", (_request, response) => {
  response.json(PLATFORM_OPTIONS);
});

app.get("/api/champions", rateLimit({ windowMs: 60_000, maxRequests: 120 }), async (_request, response) => {
  try {
    const champions = await getChampionCatalog();
    response.json(champions);
  } catch (error) {
    response.status(500).json({
      message: error.message || "No pude cargar el catalogo de campeones.",
    });
  }
});

app.get("/api/meta/tiers", rateLimit({ windowMs: 60_000, maxRequests: 90 }), async (_request, response) => {
  try {
    const data = await getTierListOverview();
    response.json(data);
  } catch (error) {
    response.status(500).json({
      message: getPublicErrorMessage(error, "No pude cargar la tier list actual."),
    });
  }
});

app.get(
  "/api/champions/:championId/builds",
  rateLimit({ windowMs: 60_000, maxRequests: 90 }),
  async (request, response) => {
    try {
      const lane = request.query.lane ? String(request.query.lane) : null;
      const data = await getChampionBuildPackage(request.params.championId, lane);
      response.json(data);
    } catch (error) {
      response.status(404).json({
        message: getPublicErrorMessage(error, "No pude cargar las builds del campeon."),
      });
    }
  },
);

app.post("/api/analyze/riot", rateLimit({ windowMs: 60_000, maxRequests: 30 }), async (request, response) => {
  try {
    const { gameName, tagLine, platform } = request.body || {};

    if (
      !gameName ||
      !tagLine ||
      !platform ||
      String(gameName).length > 32 ||
      String(tagLine).length > 10
    ) {
      response.status(400).json({
        message: "Necesito gameName, tagLine y platform validos.",
      });
      return;
    }

    const snapshot = await analyzeFromRiotId({ gameName, tagLine, platform });

    if (!snapshot.found) {
      response.json({
        ...snapshot,
        refreshIntervalMs: 120000,
      });
      return;
    }

    const metaBuild = await getChampionBuildPackage(snapshot.player.championName).catch(
      () => null,
    );
    const analysis = buildRecommendations(snapshot, metaBuild);
    const aiBrief = await maybeGenerateAiBrief(snapshot, analysis).catch(() => null);

    response.json({
      ...snapshot,
      metaBuild,
      refreshIntervalMs: 120000,
      analysis: {
        ...analysis,
        aiBrief,
      },
    });
  } catch (error) {
    response.status(500).json({
      message: getPublicErrorMessage(error, "No pude analizar la partida con Riot API."),
    });
  }
});

app.post("/api/analyze/live-client", rateLimit({ windowMs: 60_000, maxRequests: 30 }), async (_request, response) => {
  try {
    const snapshot = await analyzeFromLiveClient();
    const metaBuild = await getChampionBuildPackage(snapshot.player.championName).catch(
      () => null,
    );
    const analysis = buildRecommendations(snapshot, metaBuild);
    const aiBrief = await maybeGenerateAiBrief(snapshot, analysis).catch(() => null);

    response.json({
      ...snapshot,
      metaBuild,
      refreshIntervalMs: 120000,
      analysis: {
        ...analysis,
        aiBrief,
      },
    });
  } catch (error) {
    response.status(500).json({
      message: getPublicErrorMessage(
        error,
        "No pude leer la partida local. Asegurate de tener una partida activa abierta.",
      ),
    });
  }
});

export default app;
