import {
  getChampionDetails,
  getDDragonData,
  getItemAssetUrl,
  getItemName,
  resolveChampion,
} from "./ddragon.js";
import { requestJson } from "../utils/http.js";

const SUPPORT_ITEM_NAMES = [
  "world atlas",
  "runic compass",
  "bounty of worlds",
  "dream maker",
  "solstice sleigh",
  "celestial opposition",
  "bloodsong",
  "zakzak's realmspike",
];

const JUNGLE_ITEM_NAMES = [
  "scorchclaw pup",
  "gustwalker hatchling",
  "mosstomper seedling",
];

async function getLiveClient(path) {
  return requestJson(`https://127.0.0.1:2999/liveclientdata/${path}`, {
    insecure: true,
    timeoutMs: 5000,
  });
}

function matchPlayerName(candidate, player) {
  return (
    candidate === player.riotId ||
    candidate === player.summonerName ||
    candidate === `${player.riotIdGameName}#${player.riotIdTagLine}`
  );
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferLiveLane(player, championTags) {
  const itemNames = (player.items || []).map((item) => normalizeName(item.displayName));

  if (itemNames.some((name) => SUPPORT_ITEM_NAMES.includes(name))) {
    return "Support";
  }

  if (itemNames.some((name) => JUNGLE_ITEM_NAMES.includes(name))) {
    return "Jungle";
  }

  if (championTags.includes("Marksman")) {
    return "Bot";
  }

  if (championTags.includes("Support")) {
    return "Support";
  }

  if (championTags.includes("Tank") || championTags.includes("Fighter")) {
    return "Top";
  }

  return "Mid";
}

export async function analyzeFromLiveClient() {
  const { championsById, championsByLookup, itemsById, version } = await getDDragonData();
  const [allGameData, activePlayerName] = await Promise.all([
    getLiveClient("allgamedata"),
    getLiveClient("activeplayername"),
  ]);
  const uniqueChampions = [
    ...new Set(allGameData.allPlayers.map((player) => player.championName)),
  ];
  const championDetailsEntries = await Promise.all(
    uniqueChampions.map(async (championName) => {
      const champion = resolveChampion(championsById, championsByLookup, championName);
      return [
        championName,
        champion ? await getChampionDetails(champion.id).catch(() => null) : null,
      ];
    }),
  );
  const championDetailsMap = new Map(championDetailsEntries);

  const currentPlayer =
    allGameData.allPlayers.find((player) => matchPlayerName(activePlayerName, player)) ||
    allGameData.allPlayers[0];
  const currentChampion =
    resolveChampion(championsById, championsByLookup, currentPlayer.championName);
  const currentChampionTags = currentChampion?.tags || [];
  const inferredLane = inferLiveLane(currentPlayer, currentChampionTags);

  const participants = allGameData.allPlayers.map((player) => {
    const champion = resolveChampion(championsById, championsByLookup, player.championName);
    const championTags = champion?.tags || [];
    const championName = champion?.name || player.championName;
    const championId = champion?.id || player.championName;
    return {
      championId,
      championName,
      championTags,
      passiveName: championDetailsMap.get(player.championName)?.passive?.name || null,
      abilities: (championDetailsMap.get(player.championName)?.spells || []).map(
        (spell, index) => ({
          key: ["Q", "W", "E", "R"][index],
          name: spell.name,
        }),
      ),
      name:
        player.riotId ||
        player.summonerName ||
        `${player.riotIdGameName || ""}#${player.riotIdTagLine || ""}`,
      isCurrentPlayer: matchPlayerName(activePlayerName, player),
      teamId: player.team,
      relation: player.team === currentPlayer.team ? "ALLY" : "ENEMY",
      rank: null,
      masteryPoints: null,
      lane: inferLiveLane(player, championTags),
      level: player.level,
      kills: player.scores.kills,
      deaths: player.scores.deaths,
      assists: player.scores.assists,
      creepScore: player.scores.creepScore || 0,
      scoreLine: `${player.scores.kills}/${player.scores.deaths}/${player.scores.assists}`,
      items: (player.items || []).map((item) => ({
        id: item.itemID,
        name: getItemName(itemsById, item.itemID, item.displayName),
        iconUrl: getItemAssetUrl(version, item.itemID),
      })),
    };
  });

  return {
    found: true,
    source: "live-client",
    modeLabel: "Live Client Data API local",
    platform: null,
    player: {
      riotId: activePlayerName,
      championName: currentChampion?.name || currentPlayer.championName,
      level: currentPlayer.level,
      currentGold: allGameData.activePlayer.currentGold,
      lane: inferredLane,
    },
    game: {
      queueId: allGameData.gameData.gameQueueConfigId,
      gameLengthSeconds: Math.floor(allGameData.gameData.gameTime || 0),
    },
    participants,
    limitations: [
      "Este modo solo funciona si el juego esta abierto en esta misma PC.",
      "Live Client Data API es local; para login oficial con Riot necesitas RSO y una key de produccion aprobada.",
    ],
  };
}
