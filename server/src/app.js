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

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    hasRiotApiKey: Boolean(process.env.RIOT_API_KEY),
    hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.get("/api/platforms", (_request, response) => {
  response.json(PLATFORM_OPTIONS);
});

app.get("/api/champions", async (_request, response) => {
  try {
    const champions = await getChampionCatalog();
    response.json(champions);
  } catch (error) {
    response.status(500).json({
      message: error.message || "No pude cargar el catalogo de campeones.",
    });
  }
});

app.get("/api/meta/tiers", async (_request, response) => {
  try {
    const data = await getTierListOverview();
    response.json(data);
  } catch (error) {
    response.status(500).json({
      message: error.message || "No pude cargar la tier list actual.",
    });
  }
});

app.get("/api/champions/:championId/builds", async (request, response) => {
  try {
    const lane = request.query.lane ? String(request.query.lane) : null;
    const data = await getChampionBuildPackage(request.params.championId, lane);
    response.json(data);
  } catch (error) {
    response.status(404).json({
      message: error.message || "No pude cargar las builds del campeon.",
    });
  }
});

app.post("/api/analyze/riot", async (request, response) => {
  try {
    const { gameName, tagLine, platform } = request.body || {};

    if (!gameName || !tagLine || !platform) {
      response.status(400).json({
        message: "Necesito gameName, tagLine y platform.",
      });
      return;
    }

    const snapshot = await analyzeFromRiotId({ gameName, tagLine, platform });

    if (!snapshot.found) {
      response.json(snapshot);
      return;
    }

    const analysis = buildRecommendations(snapshot);
    const aiBrief = await maybeGenerateAiBrief(snapshot, analysis).catch(() => null);

    response.json({
      ...snapshot,
      analysis: {
        ...analysis,
        aiBrief,
      },
    });
  } catch (error) {
    response.status(500).json({
      message: error.message || "No pude analizar la partida con Riot API.",
    });
  }
});

app.post("/api/analyze/live-client", async (_request, response) => {
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
      message:
        error.message ||
        "No pude leer la partida local. Asegurate de tener una partida activa abierta.",
    });
  }
});

export default app;
