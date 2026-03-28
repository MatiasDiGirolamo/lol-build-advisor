import { PLATFORM_TO_REGION } from "../data/constants.js";
import { getDDragonData } from "./ddragon.js";
import { RequestError, requestJson } from "../utils/http.js";
import { getSanitizedRiotApiKey } from "../utils/env.js";

function getApiKey() {
  return getSanitizedRiotApiKey();
}

function normalizePlatform(platform) {
  const normalized = String(platform || "").trim().toLowerCase();

  if (!PLATFORM_TO_REGION[normalized]) {
    throw new Error(`Servidor no soportado: ${platform}`);
  }

  return normalized;
}

function getRegion(platform) {
  return PLATFORM_TO_REGION[normalizePlatform(platform)];
}

async function riotGet(host, path) {
  return requestJson(`https://${host}${path}`, {
    headers: {
      "X-Riot-Token": getApiKey(),
    },
  });
}

async function getAccountByRiotId(platform, gameName, tagLine) {
  const region = getRegion(platform);
  const safeGameName = encodeURIComponent(gameName.trim());
  const safeTagLine = encodeURIComponent(tagLine.trim());

  return riotGet(
    `${region}.api.riotgames.com`,
    `/riot/account/v1/accounts/by-riot-id/${safeGameName}/${safeTagLine}`,
  );
}

async function getSummonerByPuuid(platform, puuid) {
  return riotGet(
    `${normalizePlatform(platform)}.api.riotgames.com`,
    `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
  );
}

async function getActiveGameBySummoner(platform, summonerId) {
  return riotGet(
    `${normalizePlatform(platform)}.api.riotgames.com`,
    `/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(
      summonerId,
    )}`,
  );
}

async function getLeagueEntriesBySummoner(platform, summonerId) {
  return riotGet(
    `${normalizePlatform(platform)}.api.riotgames.com`,
    `/lol/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`,
  );
}

async function getChampionMasteryBySummoner(platform, summonerId, championId) {
  return riotGet(
    `${normalizePlatform(platform)}.api.riotgames.com`,
    `/lol/champion-mastery/v4/champion-masteries/by-summoner/${encodeURIComponent(
      summonerId,
    )}/by-champion/${championId}`,
  );
}

function formatRank(entries) {
  if (!entries?.length) {
    return "Sin ranked visible";
  }

  const soloQueue =
    entries.find((entry) => entry.queueType === "RANKED_SOLO_5x5") || entries[0];

  return `${soloQueue.tier} ${soloQueue.rank} (${soloQueue.leaguePoints} LP)`;
}

function getParticipantName(participant) {
  if (participant.riotId) {
    return participant.riotId;
  }

  if (participant.riotIdGameName && participant.riotIdTagLine) {
    return `${participant.riotIdGameName}#${participant.riotIdTagLine}`;
  }

  return participant.summonerName || "Jugador";
}

function getEncryptedSummonerId(summoner) {
  return (
    summoner?.id ||
    summoner?.summonerId ||
    summoner?.encryptedSummonerId ||
    null
  );
}

export async function analyzeFromRiotId({ gameName, tagLine, platform }) {
  const normalizedPlatform = normalizePlatform(platform);
  const { championsByKey } = await getDDragonData();

  const account = await getAccountByRiotId(normalizedPlatform, gameName, tagLine);
  const summoner = await getSummonerByPuuid(normalizedPlatform, account.puuid);
  const encryptedSummonerId = getEncryptedSummonerId(summoner);

  if (!encryptedSummonerId) {
    throw new Error(
      "Riot encontro la cuenta, pero no devolvio un Summoner ID valido para League en ese servidor. Verifica que el Riot ID juegue LoL en esa region y volve a probar.",
    );
  }

  let activeGame;
  try {
    activeGame = await getActiveGameBySummoner(normalizedPlatform, encryptedSummonerId);
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      return {
        found: false,
        source: "riot-api",
        message: "No encontre una partida activa para ese Riot ID en este servidor.",
      };
    }

    throw error;
  }

  const currentParticipant =
    activeGame.participants.find((participant) => participant.summonerId === encryptedSummonerId) ||
    activeGame.participants.find(
      (participant) =>
        participant.riotId === `${account.gameName}#${account.tagLine}` ||
        participant.puuid === account.puuid,
    );

  const participants = await Promise.all(
    activeGame.participants.map(async (participant) => {
      const champion = championsByKey.get(String(participant.championId));
      const [entries, mastery] = await Promise.all([
        getLeagueEntriesBySummoner(normalizedPlatform, participant.summonerId).catch(
          () => [],
        ),
        getChampionMasteryBySummoner(
          normalizedPlatform,
          participant.summonerId,
          participant.championId,
        ).catch(() => null),
      ]);

      return {
        name: getParticipantName(participant),
        isCurrentPlayer: participant.summonerId === encryptedSummonerId,
        teamId: participant.teamId,
        relation:
          participant.teamId === currentParticipant?.teamId ? "ALLY" : "ENEMY",
        championName: champion?.id || `Champion ${participant.championId}`,
        championTags: champion?.tags || [],
        rank: formatRank(entries),
        masteryPoints: mastery?.championPoints ?? null,
        scoreLine: "0/0/0",
        level: null,
        kills: 0,
        deaths: 0,
        assists: 0,
        creepScore: 0,
        currentGold: 0,
        lane: null,
        items: [],
      };
    }),
  );

  const self = participants.find((participant) => participant.isCurrentPlayer) || participants[0];

  return {
    found: true,
    source: "riot-api",
    modeLabel: "Spectator oficial de Riot",
    platform: normalizedPlatform,
    player: {
      riotId: `${account.gameName}#${account.tagLine}`,
      championName:
        self?.championName ||
        championsByKey.get(String(currentParticipant?.championId))?.id,
    },
    game: {
      queueId: activeGame.gameQueueConfigId,
      gameLengthSeconds: null,
    },
    participants,
    limitations: [
      "Este modo usa Spectator V5 oficial: ve composicion, rank y mastery, pero no expone los items vivos de la partida.",
      "Para recomendaciones segun items actuales, necesitas el modo local usando Live Client Data API.",
    ],
  };
}
