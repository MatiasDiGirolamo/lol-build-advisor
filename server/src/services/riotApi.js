import { PLATFORM_TO_REGION } from "../data/constants.js";
import {
  getChampionAssetUrls,
  getDDragonData,
  getItemAssetUrl,
  getProfileIconAssetUrl,
} from "./ddragon.js";
import { RequestError, requestJson } from "../utils/http.js";
import { getSanitizedRiotApiKey } from "../utils/env.js";

const QUEUE_LABELS = new Map([
  [400, "Normal Draft"],
  [420, "Ranked Solo/Duo"],
  [430, "Normal Blind"],
  [440, "Ranked Flex"],
  [450, "ARAM"],
  [700, "Clash"],
  [1700, "Arena"],
  [1710, "Arena"],
  [1720, "Arena"],
]);

const RANKED_QUEUE_LABELS = new Map([
  ["RANKED_SOLO_5x5", "Solo/Duo"],
  ["RANKED_FLEX_SR", "Flex"],
  ["RANKED_TFT", "TFT"],
]);

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
  const safeGameName = encodeURIComponent(String(gameName || "").trim());
  const safeTagLine = encodeURIComponent(String(tagLine || "").trim());

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

async function getSummonerByAccountId(platform, accountId) {
  return riotGet(
    `${normalizePlatform(platform)}.api.riotgames.com`,
    `/lol/summoner/v4/summoners/by-account/${encodeURIComponent(accountId)}`,
  );
}

async function getSummonerByName(platform, summonerName) {
  return riotGet(
    `${normalizePlatform(platform)}.api.riotgames.com`,
    `/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`,
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

async function getChampionMasteriesBySummoner(platform, summonerId) {
  return riotGet(
    `${normalizePlatform(platform)}.api.riotgames.com`,
    `/lol/champion-mastery/v4/champion-masteries/by-summoner/${encodeURIComponent(
      summonerId,
    )}`,
  );
}

async function getMatchIdsByPuuid(platform, puuid, count = 8) {
  const region = getRegion(platform);
  return riotGet(
    `${region}.api.riotgames.com`,
    `/lol/match/v5/matches/by-puuid/${encodeURIComponent(
      puuid,
    )}/ids?start=0&count=${count}`,
  );
}

async function getMatchById(platform, matchId) {
  const region = getRegion(platform);
  return riotGet(
    `${region}.api.riotgames.com`,
    `/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
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

function queueLabelFromId(queueId) {
  return QUEUE_LABELS.get(Number(queueId)) || `Queue ${queueId}`;
}

function rankedQueueLabel(queueType) {
  return RANKED_QUEUE_LABELS.get(queueType) || queueType;
}

function formatGameDuration(seconds) {
  const totalSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function roundWinRate(wins, losses) {
  const totalGames = (wins || 0) + (losses || 0);
  return totalGames ? Number((((wins || 0) / totalGames) * 100).toFixed(1)) : null;
}

async function resolveLeagueSummoner(platform, account, fallbackName) {
  let puuidLookup = null;

  try {
    puuidLookup = await getSummonerByPuuid(platform, account.puuid);
    if (getEncryptedSummonerId(puuidLookup)) {
      return puuidLookup;
    }
  } catch (error) {
    if (!(error instanceof RequestError && error.status === 404)) {
      throw error;
    }
  }

  const accountId = puuidLookup?.accountId || puuidLookup?.encryptedAccountId || null;

  if (accountId) {
    try {
      const accountLookup = await getSummonerByAccountId(platform, accountId);
      if (getEncryptedSummonerId(accountLookup)) {
        return accountLookup;
      }
    } catch (error) {
      if (!(error instanceof RequestError && error.status === 404)) {
        throw error;
      }
    }
  }

  if (fallbackName) {
    try {
      const nameLookup = await getSummonerByName(platform, fallbackName);
      if (
        getEncryptedSummonerId(nameLookup) &&
        (!nameLookup?.puuid || nameLookup.puuid === account.puuid)
      ) {
        return nameLookup;
      }
    } catch (error) {
      if (!(error instanceof RequestError && error.status === 404)) {
        throw error;
      }
    }
  }

  return puuidLookup;
}

async function resolvePlayerIdentity({ gameName, tagLine, platform }) {
  const normalizedPlatform = normalizePlatform(platform);
  const account = await getAccountByRiotId(normalizedPlatform, gameName, tagLine);
  const summoner = await resolveLeagueSummoner(
    normalizedPlatform,
    account,
    account.gameName || gameName,
  );
  const encryptedSummonerId = getEncryptedSummonerId(summoner);

  if (!encryptedSummonerId) {
    throw new Error(
      "Riot encontro la cuenta, pero no pude resolver un perfil valido de League en ese servidor ni con fallback por cuenta o nombre. Verifica Riot ID, servidor y que esa cuenta tenga un perfil de LoL activo.",
    );
  }

  return {
    platform: normalizedPlatform,
    region: getRegion(normalizedPlatform),
    account,
    summoner,
    encryptedSummonerId,
  };
}

function enrichRankedQueues(entries) {
  const rankedQueues = (entries || [])
    .filter((entry) => entry.queueType?.startsWith("RANKED_"))
    .map((entry) => ({
      queueType: entry.queueType,
      label: rankedQueueLabel(entry.queueType),
      tierText: `${entry.tier} ${entry.rank}`.trim(),
      tier: entry.tier,
      rank: entry.rank,
      lp: entry.leaguePoints,
      wins: entry.wins,
      losses: entry.losses,
      winRate: roundWinRate(entry.wins, entry.losses),
      hotStreak: Boolean(entry.hotStreak),
      veteran: Boolean(entry.veteran),
      inactive: Boolean(entry.inactive),
    }))
    .sort((left, right) => {
      if (left.queueType === "RANKED_SOLO_5x5") {
        return -1;
      }
      if (right.queueType === "RANKED_SOLO_5x5") {
        return 1;
      }
      return left.label.localeCompare(right.label);
    });

  return {
    primary: rankedQueues[0] || null,
    queues: rankedQueues,
  };
}

function computeRecentChampionStats(matches) {
  const championStats = new Map();

  for (const match of matches) {
    const current = championStats.get(match.championName) || {
      championName: match.championName,
      squareUrl: match.championSquareUrl,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
    };

    current.games += 1;
    current.wins += match.result === "Win" ? 1 : 0;
    current.kills += match.kills || 0;
    current.deaths += match.deaths || 0;
    current.assists += match.assists || 0;

    championStats.set(match.championName, current);
  }

  return [...championStats.values()]
    .map((entry) => ({
      ...entry,
      winRate: roundWinRate(entry.wins, entry.games - entry.wins),
      averageKda:
        entry.games > 0
          ? Number(
              ((entry.kills + entry.assists) / Math.max(1, entry.deaths)).toFixed(2),
            )
          : 0,
    }))
    .sort((left, right) => right.games - left.games)
    .slice(0, 6);
}

function computeOverviewStats(matches) {
  if (!matches.length) {
    return {
      gamesAnalyzed: 0,
      wins: 0,
      losses: 0,
      recentWinRate: null,
      averageKills: 0,
      averageDeaths: 0,
      averageAssists: 0,
      averageCs: 0,
    };
  }

  const totals = matches.reduce(
    (accumulator, match) => {
      accumulator.wins += match.result === "Win" ? 1 : 0;
      accumulator.losses += match.result === "Loss" ? 1 : 0;
      accumulator.kills += match.kills || 0;
      accumulator.deaths += match.deaths || 0;
      accumulator.assists += match.assists || 0;
      accumulator.cs += match.cs || 0;
      return accumulator;
    },
    {
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
    },
  );

  return {
    gamesAnalyzed: matches.length,
    wins: totals.wins,
    losses: totals.losses,
    recentWinRate: roundWinRate(totals.wins, totals.losses),
    averageKills: Number((totals.kills / matches.length).toFixed(1)),
    averageDeaths: Number((totals.deaths / matches.length).toFixed(1)),
    averageAssists: Number((totals.assists / matches.length).toFixed(1)),
    averageCs: Number((totals.cs / matches.length).toFixed(1)),
  };
}

function mapRecentMatch(match, accountPuuid, version, championsById, itemsById) {
  const participant = match?.info?.participants?.find(
    (entry) => entry.puuid === accountPuuid,
  );

  if (!participant) {
    return null;
  }

  const champion = championsById.get(participant.championName) || null;
  const itemIds = [
    participant.item0,
    participant.item1,
    participant.item2,
    participant.item3,
    participant.item4,
    participant.item5,
    participant.item6,
  ].filter((itemId) => Number(itemId) > 0);

  return {
    matchId: match.metadata?.matchId || null,
    queueId: match.info?.queueId || null,
    queueLabel: queueLabelFromId(match.info?.queueId),
    championName: champion?.id || participant.championName,
    championSquareUrl: champion ? getChampionAssetUrls(version, champion).square : null,
    result: participant.win ? "Win" : "Loss",
    kills: participant.kills || 0,
    deaths: participant.deaths || 0,
    assists: participant.assists || 0,
    kdaLine: `${participant.kills || 0}/${participant.deaths || 0}/${participant.assists || 0}`,
    cs: (participant.totalMinionsKilled || 0) + (participant.neutralMinionsKilled || 0),
    durationText: formatGameDuration(match.info?.gameDuration),
    durationSeconds: match.info?.gameDuration || 0,
    teamPosition: participant.teamPosition || participant.individualPosition || "FILL",
    items: itemIds.map((itemId) => ({
      id: itemId,
      name: itemsById.get(String(itemId))?.name || `Item ${itemId}`,
      iconUrl: getItemAssetUrl(version, itemId),
    })),
    goldEarned: participant.goldEarned || 0,
    damageDealt: participant.totalDamageDealtToChampions || 0,
    visionScore: participant.visionScore || 0,
    startedAt: match.info?.gameStartTimestamp || null,
  };
}

export async function getPlayerProfileByRiotId({
  gameName,
  tagLine,
  platform,
  matchCount = 8,
}) {
  const [
    identity,
    {
      version,
      championsById,
      championsByKey,
      itemsById,
    },
  ] = await Promise.all([
    resolvePlayerIdentity({ gameName, tagLine, platform }),
    getDDragonData(),
  ]);

  const { account, summoner, encryptedSummonerId } = identity;
  const [leagueEntries, masteryEntries, matchIds] = await Promise.all([
    getLeagueEntriesBySummoner(identity.platform, encryptedSummonerId).catch(() => []),
    getChampionMasteriesBySummoner(identity.platform, encryptedSummonerId).catch(() => []),
    getMatchIdsByPuuid(identity.platform, account.puuid, matchCount).catch(() => []),
  ]);

  const matches = (
    await Promise.all(
      (matchIds || []).map((matchId) =>
        getMatchById(identity.platform, matchId).catch(() => null),
      ),
    )
  )
    .map((match) =>
      match
        ? mapRecentMatch(match, account.puuid, version, championsById, itemsById)
        : null,
    )
    .filter(Boolean);

  const ranked = enrichRankedQueues(leagueEntries);
  const masteries = (masteryEntries || [])
    .slice(0, 8)
    .map((entry) => {
      const champion = championsByKey.get(String(entry.championId));
      return {
        championId: entry.championId,
        championName: champion?.id || `Champion ${entry.championId}`,
        squareUrl: champion ? getChampionAssetUrls(version, champion).square : null,
        points: entry.championPoints || 0,
        level: entry.championLevel || 0,
        lastPlayTime: entry.lastPlayTime || null,
      };
    });

  return {
    player: {
      riotId: `${account.gameName}#${account.tagLine}`,
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform: identity.platform,
      summonerLevel: summoner?.summonerLevel || 0,
      profileIconId: summoner?.profileIconId || 29,
      profileIconUrl: getProfileIconAssetUrl(version, summoner?.profileIconId || 29),
      puuid: account.puuid,
    },
    ranked,
    overview: {
      ...computeOverviewStats(matches),
      favoriteChampions: computeRecentChampionStats(matches),
    },
    masteries,
    recentMatches: matches,
  };
}

export async function analyzeFromRiotId({ gameName, tagLine, platform }) {
  const normalizedPlatform = normalizePlatform(platform);
  const { championsByKey } = await getDDragonData();
  const identity = await resolvePlayerIdentity({
    gameName,
    tagLine,
    platform: normalizedPlatform,
  });
  const { account, summoner, encryptedSummonerId } = identity;

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
    activeGame.participants.find(
      (participant) => participant.summonerId === encryptedSummonerId,
    ) ||
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
      summonerLevel: summoner?.summonerLevel || 0,
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
