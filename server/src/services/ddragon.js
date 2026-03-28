import { requestJson } from "../utils/http.js";

let cachedData = null;
let cachedAt = 0;
const championDetailsCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const SHARD_NAMES = new Map([
  [5008, "Adaptive Force"],
  [5005, "Attack Speed"],
  [5007, "Ability Haste"],
  [5001, "Health Scaling"],
  [5002, "Move Speed"],
  [5003, "Tenacity & Slow Resist"],
]);

function normalizeLookupKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/['.,:()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getDDragonData() {
  const cacheIsFresh = cachedData && Date.now() - cachedAt < CACHE_TTL_MS;
  if (cacheIsFresh) {
    return cachedData;
  }

  const versions = await requestJson(
    "https://ddragon.leagueoflegends.com/api/versions.json",
  );
  const version = versions[0];

  const [championResponse, localizedChampionResponse, itemResponse, summonerResponse, runeResponse] =
    await Promise.all([
    requestJson(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    ),
    requestJson(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/es_MX/champion.json`,
    ).catch(() => ({ data: {} })),
    requestJson(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`,
    ),
    requestJson(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`,
    ),
    requestJson(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`,
    ),
  ]);

  const championEntries = Object.values(championResponse.data);
  const localizedChampionEntries = Object.values(localizedChampionResponse.data || {});

  const championsByKey = new Map(
    championEntries.map((champion) => [String(champion.key), champion]),
  );

  const championsById = new Map(
    championEntries.map((champion) => [champion.id, champion]),
  );

  const championsByLookup = new Map();

  for (const champion of championEntries) {
    championsByLookup.set(normalizeLookupKey(champion.id), champion);
    championsByLookup.set(normalizeLookupKey(champion.name), champion);
    championsByLookup.set(normalizeLookupKey(champion.title), champion);
  }

  for (const champion of localizedChampionEntries) {
    const englishChampion = championsById.get(champion.id);
    if (!englishChampion) {
      continue;
    }

    championsByLookup.set(normalizeLookupKey(champion.name), englishChampion);
    championsByLookup.set(normalizeLookupKey(champion.title), englishChampion);
  }

  const itemsById = new Map(
    Object.entries(itemResponse.data).map(([id, item]) => [String(id), item]),
  );

  const itemsByName = new Map(
    Object.entries(itemResponse.data).map(([id, item]) => [
      normalizeLookupKey(item.name),
      {
        id: String(id),
        ...item,
      },
    ]),
  );

  const summonersByName = new Map(
    Object.values(summonerResponse.data).map((spell) => [
      normalizeLookupKey(spell.name),
      spell,
    ]),
  );

  const summonersById = new Map(
    Object.values(summonerResponse.data).map((spell) => [Number(spell.key), spell]),
  );

  const runeStylesById = new Map();
  const runesById = new Map();

  for (const style of runeResponse) {
    runeStylesById.set(style.id, style);

    for (const slot of style.slots || []) {
      for (const rune of slot.runes || []) {
        runesById.set(rune.id, {
          ...rune,
          styleId: style.id,
          styleName: style.name,
        });
      }
    }
  }

  cachedData = {
    version,
    championsById,
    championsByKey,
    championsByLookup,
    itemsById,
    itemsByName,
    summonersByName,
    summonersById,
    runesById,
    runeStylesById,
  };
  cachedAt = Date.now();

  return cachedData;
}

export function getItemName(itemsById, itemId, fallbackName = "") {
  const item = itemsById.get(String(itemId));
  return item?.name || fallbackName || `Item ${itemId}`;
}

export function resolveChampion(championsById, championsByLookup, championRef) {
  if (!championRef) {
    return null;
  }

  return (
    championsById.get(String(championRef)) ||
    championsByLookup.get(normalizeLookupKey(championRef)) ||
    null
  );
}

export function getItemAssetUrl(version, itemId) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

export function getSummonerAssetUrl(version, imageFull) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${imageFull}`;
}

export function getProfileIconAssetUrl(version, profileIconId) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`;
}

export function getRuneAssetUrl(iconPath) {
  return iconPath
    ? `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`
    : null;
}

export function findItemByName(itemsByName, itemName) {
  return itemsByName.get(normalizeLookupKey(itemName)) || null;
}

export function findSummonerByName(summonersByName, spellName) {
  return summonersByName.get(normalizeLookupKey(spellName)) || null;
}

export function findShardName(perkId) {
  return SHARD_NAMES.get(Number(perkId)) || `Shard ${perkId}`;
}

export function getChampionAssetUrls(version, champion) {
  return {
    square: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}`,
    splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`,
    loading: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`,
  };
}

export async function getChampionDetails(championId) {
  const { version } = await getDDragonData();
  const cacheKey = `${version}:${championId}`;

  if (championDetailsCache.has(cacheKey)) {
    return championDetailsCache.get(cacheKey);
  }

  const response = await requestJson(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${championId}.json`,
  );
  const champion = response.data[championId];
  championDetailsCache.set(cacheKey, champion);
  return champion;
}
