import {
  findItemByName,
  findSummonerByName,
  findShardName,
  getChampionAssetUrls,
  getChampionDetails,
  getDDragonData,
  getItemAssetUrl,
  getRuneAssetUrl,
  resolveChampion,
  getSummonerAssetUrl,
} from "./ddragon.js";
import { getMobalyticsBuilds } from "./metaBuildProvider.js";
import { getTierListOverview } from "./metaTierProvider.js";

const JUNGLE_CHAMPIONS = new Set([
  "Belveth",
  "Briar",
  "Diana",
  "Ekko",
  "Elise",
  "Evelynn",
  "Fiddlesticks",
  "Graves",
  "Hecarim",
  "Ivern",
  "JarvanIV",
  "Karthus",
  "Kayn",
  "Khazix",
  "Kindred",
  "LeeSin",
  "Lillia",
  "MasterYi",
  "Nidalee",
  "Nocturne",
  "Nunu",
  "Rammus",
  "RekSai",
  "Sejuani",
  "Shaco",
  "Shyvana",
  "Skarner",
  "Taliyah",
  "Udyr",
  "Vi",
  "Viego",
  "Warwick",
  "Wukong",
  "XinZhao",
  "Zac",
]);

const SUPPORT_CHAMPIONS = new Set([
  "Alistar",
  "Blitzcrank",
  "Braum",
  "Janna",
  "Karma",
  "Leona",
  "Lulu",
  "Lux",
  "Milio",
  "Morgana",
  "Nami",
  "Nautilus",
  "Pyke",
  "Rakan",
  "Rell",
  "Renata",
  "Senna",
  "Seraphine",
  "Sona",
  "Soraka",
  "Taric",
  "Thresh",
  "Yuumi",
  "Zilean",
  "Zyra",
]);

const TOP_DUELISTS = new Set([
  "Aatrox",
  "Camille",
  "Darius",
  "Fiora",
  "Gangplank",
  "Garen",
  "Gnar",
  "Gwen",
  "Illaoi",
  "Irelia",
  "Jax",
  "Jayce",
  "Kennen",
  "Kled",
  "Malphite",
  "Mordekaiser",
  "Nasus",
  "Olaf",
  "Ornn",
  "Pantheon",
  "Poppy",
  "Renekton",
  "Riven",
  "Rumble",
  "Sett",
  "Shen",
  "Sion",
  "TahmKench",
  "Teemo",
  "Tryndamere",
  "Urgot",
  "Volibear",
  "Yorick",
]);

function inferLane(champion) {
  if (SUPPORT_CHAMPIONS.has(champion.id)) {
    return "Support";
  }

  if (champion.tags.includes("Marksman")) {
    return "Bot";
  }

  if (JUNGLE_CHAMPIONS.has(champion.id)) {
    return "Jungle";
  }

  if (TOP_DUELISTS.has(champion.id) || champion.tags.includes("Tank")) {
    return "Top";
  }

  return "Mid";
}

function getPrimaryTag(champion) {
  return champion.tags[0] || "Fighter";
}

function getArchetypePreset(primaryTag, lane) {
  const byLane = {
    Bot: {
      title: "Ranked DPS",
      playstyle: "Escala para peleas largas y objective control.",
      runes: {
        primaryStyle: "Precision",
        keystone: "Lethal Tempo",
        slots: ["Presence of Mind", "Legend: Alacrity", "Cut Down"],
        secondaryStyle: "Inspiration",
        secondarySlots: ["Magical Footwear", "Biscuit Delivery"],
      },
      summoners: ["Flash", "Heal"],
      starterItems: ["Doran's Blade", "Health Potion"],
      coreItems: ["Berserker's Greaves", "Kraken Slayer", "Infinity Edge"],
      situationalItems: ["Lord Dominik's Regards", "Bloodthirster", "Guardian Angel"],
      notes: [
        "Pensada para front-to-back y dos picos de dano fuertes.",
        "Si la lane es muy agresiva, cambia Heal por Barrier.",
      ],
    },
    Support: {
      title: "Playmaker Utility",
      playstyle: "Prioriza engage, peel y tempo para dragones.",
      runes: {
        primaryStyle: "Resolve",
        keystone: "Aftershock",
        slots: ["Font of Life", "Bone Plating", "Unflinching"],
        secondaryStyle: "Inspiration",
        secondarySlots: ["Hextech Flashtraption", "Cosmic Insight"],
      },
      summoners: ["Flash", "Ignite"],
      starterItems: ["World Atlas", "Health Potion"],
      coreItems: ["Ionian Boots of Lucidity", "Locket of the Iron Solari", "Zeke's Convergence"],
      situationalItems: ["Knight's Vow", "Mikael's Blessing", "Redemption"],
      notes: [
        "Ruta segura para supports de engage o peel corto.",
        "Si tu comp necesita sustain, prioriza Redemption antes del tercer item.",
      ],
    },
    Jungle: {
      title: "Tempo Jungle",
      playstyle: "Busca tempo de campamentos y primeras ventanas de gank.",
      runes: {
        primaryStyle: "Precision",
        keystone: "Conqueror",
        slots: ["Triumph", "Legend: Haste", "Coup de Grace"],
        secondaryStyle: "Inspiration",
        secondarySlots: ["Magical Footwear", "Cosmic Insight"],
      },
      summoners: ["Flash", "Smite"],
      starterItems: ["Scorchclaw Pup", "Health Potion"],
      coreItems: ["Ionian Boots of Lucidity", "Sundered Sky", "Black Cleaver"],
      situationalItems: ["Sterak's Gage", "Guardian Angel", "Maw of Malmortius"],
      notes: [
        "Buena para snowball controlado sin regalar tempo.",
        "Si el rival stackea armadura, adelantá Black Cleaver.",
      ],
    },
    Top: {
      title: "Stable Side Lane",
      playstyle: "Ruta sólida para fase de líneas y split controlado.",
      runes: {
        primaryStyle: "Precision",
        keystone: "Conqueror",
        slots: ["Triumph", "Legend: Haste", "Last Stand"],
        secondaryStyle: "Resolve",
        secondarySlots: ["Second Wind", "Overgrowth"],
      },
      summoners: ["Flash", "Teleport"],
      starterItems: ["Doran's Blade", "Health Potion"],
      coreItems: ["Plated Steelcaps", "Sundered Sky", "Sterak's Gage"],
      situationalItems: ["Death's Dance", "Black Cleaver", "Maw of Malmortius"],
      notes: [
        "Pensada para no regalar side lane y mantener presión.",
        "Contra poke pesado, prioriza sustain temprano.",
      ],
    },
    Mid: {
      title: "Mid Priority",
      playstyle: "Busca wave control y buen setup para river fights.",
      runes: {
        primaryStyle: "Sorcery",
        keystone: "Summon Aery",
        slots: ["Manaflow Band", "Transcendence", "Scorch"],
        secondaryStyle: "Inspiration",
        secondarySlots: ["Biscuit Delivery", "Cosmic Insight"],
      },
      summoners: ["Flash", "Teleport"],
      starterItems: ["Doran's Ring", "Health Potion"],
      coreItems: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame"],
      situationalItems: ["Zhonya's Hourglass", "Banshee's Veil", "Void Staff"],
      notes: [
        "Apunta a prioridad de línea y rotación temprana.",
        "Si necesitás snowball, cambia Teleport por Ignite.",
      ],
    },
  };

  const byTag = {
    Assassin: {
      title: "Snowball Pick",
      playstyle: "Abusa ventanas cortas y targets blandos.",
      runes: {
        primaryStyle: "Domination",
        keystone: "Electrocute",
        slots: ["Sudden Impact", "Eyeball Collection", "Treasure Hunter"],
        secondaryStyle: "Precision",
        secondarySlots: ["Triumph", "Coup de Grace"],
      },
      summoners: ["Flash", lane === "Jungle" ? "Smite" : "Ignite"],
      starterItems: [lane === "Jungle" ? "Gustwalker Hatchling" : "Doran's Blade", "Health Potion"],
      coreItems: ["Ionian Boots of Lucidity", "Opportunity", "Edge of Night"],
      situationalItems: ["Serpent's Fang", "Serylda's Grudge", "Guardian Angel"],
      notes: [
        "Ideal si ves backline vulnerable y poca peel rival.",
        "Si no sacás ventaja temprano, rotá al preset más estable.",
      ],
    },
    Mage: {
      title: "Burst Control",
      playstyle: "Controla el rango y castiga objetivos sin MR.",
      runes: {
        primaryStyle: "Sorcery",
        keystone: "Arcane Comet",
        slots: ["Manaflow Band", "Transcendence", "Gathering Storm"],
        secondaryStyle: "Inspiration",
        secondarySlots: ["Magical Footwear", "Cosmic Insight"],
      },
      summoners: ["Flash", "Teleport"],
      starterItems: ["Doran's Ring", "Health Potion"],
      coreItems: ["Sorcerer's Shoes", "Luden's Companion", "Stormsurge"],
      situationalItems: ["Shadowflame", "Zhonya's Hourglass", "Void Staff"],
      notes: [
        "Buen preset para burst y prioridad de mapa.",
        "Si el rival tiene engage duro, adelantá Zhonya.",
      ],
    },
    Tank: {
      title: "Frontline Anchor",
      playstyle: "Absorbe engage y ordena las teamfights.",
      runes: {
        primaryStyle: "Resolve",
        keystone: "Grasp of the Undying",
        slots: ["Demolish", "Second Wind", "Overgrowth"],
        secondaryStyle: "Inspiration",
        secondarySlots: ["Biscuit Delivery", "Cosmic Insight"],
      },
      summoners: ["Flash", lane === "Top" ? "Teleport" : lane === "Jungle" ? "Smite" : "Ignite"],
      starterItems: [lane === "Support" ? "World Atlas" : "Doran's Shield", "Health Potion"],
      coreItems: ["Plated Steelcaps", "Sunfire Aegis", "Kaenic Rookern"],
      situationalItems: ["Frozen Heart", "Thornmail", "Randuin's Omen"],
      notes: [
        "Ruta muy estable contra comps mixtas.",
        "Si el daño enemigo es casi todo AP, cambiá Steelcaps por Mercury's Treads.",
      ],
    },
    Support: byLane.Support,
    Marksman: byLane.Bot,
    Fighter: byLane.Top,
  };

  return byTag[primaryTag] || byLane[lane];
}

function createFlexPreset(primaryTag, lane) {
  const templates = {
    Marksman: {
      title: "Safe Scaling",
      playstyle: "Menos codicia, más consistencia en mid game.",
      runes: {
        primaryStyle: "Precision",
        keystone: "Fleet Footwork",
        slots: ["Presence of Mind", "Legend: Bloodline", "Cut Down"],
        secondaryStyle: "Sorcery",
        secondarySlots: ["Absolute Focus", "Gathering Storm"],
      },
      summoners: ["Flash", "Barrier"],
      starterItems: ["Cull", "Health Potion"],
      coreItems: ["Berserker's Greaves", "Statikk Shiv", "Infinity Edge"],
      situationalItems: ["Rapid Firecannon", "Bloodthirster", "Mercurial Scimitar"],
      notes: [
        "Útil si el matchup de línea te puede sacar de la partida.",
      ],
    },
    Mage: {
      title: "Control Utility",
      playstyle: "Menos all-in, más setup y consistencia.",
      runes: {
        primaryStyle: "Sorcery",
        keystone: "Phase Rush",
        slots: ["Manaflow Band", "Transcendence", "Scorch"],
        secondaryStyle: "Resolve",
        secondarySlots: ["Bone Plating", "Overgrowth"],
      },
      summoners: ["Flash", "Teleport"],
      starterItems: ["Doran's Ring", "Health Potion"],
      coreItems: ["Sorcerer's Shoes", "Liandry's Torment", "Zhonya's Hourglass"],
      situationalItems: ["Morellonomicon", "Banshee's Veil", "Cryptbloom"],
      notes: [
        "Buena ruta cuando la pelea va larga o el rival entra de frente.",
      ],
    },
    Assassin: {
      title: "Reset Window",
      playstyle: "Busca picks limpios y salidas rápidas.",
      runes: {
        primaryStyle: "Domination",
        keystone: "First Strike",
        slots: ["Magical Footwear", "Triple Tonic", "Cosmic Insight"],
        secondaryStyle: "Precision",
        secondarySlots: ["Triumph", "Legend: Haste"],
      },
      summoners: ["Flash", lane === "Jungle" ? "Smite" : "Ignite"],
      starterItems: [lane === "Jungle" ? "Gustwalker Hatchling" : "Long Sword", "Refillable Potion"],
      coreItems: ["Ionian Boots of Lucidity", "Youmuu's Ghostblade", "Opportunity"],
      situationalItems: ["Edge of Night", "Serpent's Fang", "Guardian Angel"],
      notes: [
        "Elegila si la partida gira alrededor de side lane o picks sobre carrys.",
      ],
    },
    Fighter: {
      title: "All-Round Bruiser",
      playstyle: "Build flexible para intercambios largos y frontline secundaria.",
      runes: {
        primaryStyle: "Precision",
        keystone: "Conqueror",
        slots: ["Triumph", "Legend: Alacrity", "Last Stand"],
        secondaryStyle: "Resolve",
        secondarySlots: ["Bone Plating", "Unflinching"],
      },
      summoners: ["Flash", lane === "Top" ? "Teleport" : "Ignite"],
      starterItems: ["Doran's Blade", "Health Potion"],
      coreItems: ["Mercury's Treads", "Black Cleaver", "Sterak's Gage"],
      situationalItems: ["Sundered Sky", "Death's Dance", "Spirit Visage"],
      notes: [
        "Es la ruta comodín cuando no querés overcomitear a split ni a burst.",
      ],
    },
    Tank: {
      title: "Anti-Carry Frontline",
      playstyle: "Presiona al carry rival y sobrevive el primer burst.",
      runes: {
        primaryStyle: "Resolve",
        keystone: "Aftershock",
        slots: ["Shield Bash", "Conditioning", "Overgrowth"],
        secondaryStyle: "Precision",
        secondarySlots: ["Triumph", "Legend: Haste"],
      },
      summoners: ["Flash", lane === "Top" ? "Teleport" : lane === "Jungle" ? "Smite" : "Ignite"],
      starterItems: [lane === "Support" ? "World Atlas" : "Doran's Shield", "Health Potion"],
      coreItems: ["Mercury's Treads", "Jak'Sho, The Protean", "Thornmail"],
      situationalItems: ["Frozen Heart", "Force of Nature", "Knight's Vow"],
      notes: [
        "Muy buena contra carries de daño sostenido.",
      ],
    },
    Support: {
      title: "Peel & Reset",
      playstyle: "Protege carrys y estira las teamfights.",
      runes: {
        primaryStyle: "Sorcery",
        keystone: "Summon Aery",
        slots: ["Manaflow Band", "Transcendence", "Scorch"],
        secondaryStyle: "Resolve",
        secondarySlots: ["Bone Plating", "Revitalize"],
      },
      summoners: ["Flash", "Exhaust"],
      starterItems: ["World Atlas", "Health Potion"],
      coreItems: ["Ionian Boots of Lucidity", "Moonstone Renewer", "Redemption"],
      situationalItems: ["Mikael's Blessing", "Ardent Censer", "Shurelya's Battlesong"],
      notes: [
        "Ideal si tu comp ya tiene engage y necesita sostén.",
      ],
    },
  };

  return templates[primaryTag] || templates[lane] || templates.Fighter;
}

function inferSkillOrder(championDetails, primaryTag) {
  const spells = championDetails.spells || [];
  if (spells.length < 3) {
    return [];
  }

  const orderByTag = {
    Marksman: [0, 2, 1],
    Mage: [0, 2, 1],
    Assassin: [0, 2, 1],
    Fighter: [0, 1, 2],
    Tank: [0, 2, 1],
    Support: [1, 2, 0],
  };

  const indexes = orderByTag[primaryTag] || [0, 2, 1];
  return indexes.map((index, offset) => {
    const spell = spells[index];
    const key = ["Q", "W", "E"][index];
    return {
      slot: offset + 1,
      key,
      name: spell.name,
    };
  });
}

function withChampionFlavor(champion, preset, championDetails) {
  const passive = championDetails.passive?.name;
  const skillOrder = inferSkillOrder(championDetails, getPrimaryTag(champion));

  return {
    ...preset,
    notes: [
      `${champion.name} suele rendir mejor cuando jugás alrededor de ${passive || "su pasiva"}.`,
      ...preset.notes,
    ],
    skillOrder,
  };
}

function enrichSkillOrder(skillOrder, championDetails) {
  const spellByKey = new Map(
    (championDetails.spells || []).map((spell, index) => [["Q", "W", "E", "R"][index], spell.name]),
  );

  return (skillOrder || []).map((skill) => ({
    ...skill,
    name: spellByKey.get(skill.key) || skill.name || skill.key,
  }));
}

function enrichItems(version, itemsById, itemIds) {
  return (itemIds || []).map((itemId) => {
    const item = itemsById.get(String(itemId));
    return {
      id: String(itemId),
      name: item?.name || `Item ${itemId}`,
      iconUrl: item ? getItemAssetUrl(version, itemId) : null,
    };
  });
}

function enrichItemsByName(version, itemsById, itemsByName, itemNames) {
  return (itemNames || []).map((itemName) => {
    const item = findItemByName(itemsByName, itemName);
    return {
      id: item?.id || itemName,
      name: item?.name || itemName,
      iconUrl: item?.id ? getItemAssetUrl(version, item.id) : null,
    };
  });
}

function enrichSummoners(version, summonersById, summonerIds) {
  return (summonerIds || []).map((summonerId) => {
    const spell = summonersById.get(Number(summonerId));
    return {
      id: Number(summonerId),
      name: spell?.name || `Spell ${summonerId}`,
      iconUrl: spell ? getSummonerAssetUrl(version, spell.image.full) : null,
    };
  });
}

function enrichSummonersByName(version, summonersByName, spellNames) {
  return (spellNames || []).map((spellName) => {
    const spell = findSummonerByName(summonersByName, spellName);
    return {
      id: spell?.key || spellName,
      name: spell?.name || spellName,
      iconUrl: spell ? getSummonerAssetUrl(version, spell.image.full) : null,
    };
  });
}

function enrichRunePage(version, runesById, runeStylesById, runePage) {
  if (!runePage) {
    return {
      primaryStyle: "Primary",
      keystone: null,
      slots: [],
      secondaryStyle: "Secondary",
      secondarySlots: [],
      shards: [],
    };
  }

  const perks = runePage.perkIds || [];
  const realRunes = perks
    .map((perkId) => runesById.get(Number(perkId)))
    .filter(Boolean);
  const shardIds = perks.filter((perkId) => !runesById.has(Number(perkId)));
  const primaryRunes = realRunes.filter((rune) => rune.styleId === runePage.styleId);
  const secondaryRunes = realRunes.filter((rune) => rune.styleId === runePage.subStyleId);
  const keystone = primaryRunes[0] || null;
  const primaryStyle = runeStylesById.get(runePage.styleId);
  const secondaryStyle = runeStylesById.get(runePage.subStyleId);

  return {
    primaryStyle: primaryStyle?.name || "Primary",
    primaryStyleIconUrl: getRuneAssetUrl(primaryStyle?.icon),
    keystone: keystone?.name || null,
    keystoneIconUrl: getRuneAssetUrl(keystone?.icon),
    slots: primaryRunes.slice(1).map((rune) => ({
      id: rune.id,
      name: rune.name,
      iconUrl: getRuneAssetUrl(rune.icon),
    })),
    secondaryStyle: secondaryStyle?.name || "Secondary",
    secondaryStyleIconUrl: getRuneAssetUrl(secondaryStyle?.icon),
    secondarySlots: secondaryRunes.map((rune) => ({
      id: rune.id,
      name: rune.name,
      iconUrl: getRuneAssetUrl(rune.icon),
    })),
    shards: shardIds.map((shardId) => ({
      id: Number(shardId),
      name: findShardName(shardId),
      iconUrl: null,
    })),
  };
}

function enrichCounters(championsById, version, counters) {
  const championByLowerName = new Map(
    [...championsById.values()].map((champion) => [champion.name.toLowerCase(), champion]),
  );
  const championBySlug = new Map(
    [...championsById.values()].map((champion) => [champion.id.toLowerCase(), champion]),
  );

  const enrichList = (entries) =>
    (entries || []).map((entry) => {
      const champion =
        championByLowerName.get(String(entry.name || "").toLowerCase()) ||
        championBySlug.get(String(entry.slug || "").toLowerCase());
      return {
        ...entry,
        name: champion?.name || entry.name || entry.slug,
        id: champion?.id || entry.name || entry.slug,
        squareUrl: champion
          ? getChampionAssetUrls(version, champion).square
          : null,
      };
    });

  return {
    weakAgainst: enrichList(counters?.weakAgainst),
    strongAgainst: enrichList(counters?.strongAgainst),
      matchupSpecific: enrichList(counters?.matchupSpecific),
  };
}

function resolveChampionRoles(champion, overview) {
  const roleEntries = overview?.champions?.[champion.id]?.roles || [];
  if (roleEntries.length) {
    return roleEntries;
  }

  return [
    {
      lane: inferLane(champion),
      tier: null,
      winRate: null,
      pickRate: null,
      banRate: null,
      matches: null,
    },
  ];
}

export async function getChampionCatalog() {
  const [{ championsById, version }, tierOverview] = await Promise.all([
    getDDragonData(),
    getTierListOverview().catch(() => null),
  ]);

  return [...championsById.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((champion) => {
      const roles = resolveChampionRoles(champion, tierOverview);
      const lane = roles[0]?.lane || inferLane(champion);
      const assets = getChampionAssetUrls(version, champion);
      return {
        id: champion.id,
        key: champion.key,
        name: champion.name,
        title: champion.title,
        blurb: champion.blurb,
        tags: champion.tags,
        partype: champion.partype,
        lane,
        tier: roles[0]?.tier || null,
        roles,
        squareUrl: assets.square,
        splashUrl: assets.splash,
        loadingUrl: assets.loading,
      };
    });
}

export async function getChampionBuildPackage(championId, requestedLane = null) {
  const [
    {
      championsById,
      championsByLookup,
      itemsById,
      itemsByName,
      summonersById,
      summonersByName,
      runesById,
      runeStylesById,
      version,
    },
    tierOverview,
  ] =
    await Promise.all([getDDragonData(), getTierListOverview().catch(() => null)]);
  const champion = resolveChampion(championsById, championsByLookup, championId);

  if (!champion) {
    throw new Error(`Campeon no encontrado: ${championId}`);
  }

  const championDetails = await getChampionDetails(champion.id);
  const roles = resolveChampionRoles(champion, tierOverview);
  const allowedLanes = new Set(roles.map((role) => role.lane));
  const lane =
    requestedLane && allowedLanes.has(requestedLane)
      ? requestedLane
      : roles[0]?.lane || inferLane(champion);
  const primaryTag = getPrimaryTag(champion);
  const assets = getChampionAssetUrls(version, champion);

  const standardPreset = withChampionFlavor(
    champion,
    getArchetypePreset(primaryTag, lane),
    championDetails,
  );

  const flexPreset = withChampionFlavor(
    champion,
    createFlexPreset(primaryTag, lane),
    championDetails,
  );

  const fallbackBuilds = [standardPreset, flexPreset];

  try {
    const meta = await getMobalyticsBuilds(champion, lane);
    const builds = meta.builds.map((build, index) => ({
      ...build,
      runes: enrichRunePage(version, runesById, runeStylesById, build.runePage),
      starterItems: enrichItems(version, itemsById, build.starterItemIds),
      earlyItems: enrichItems(version, itemsById, build.earlyItemIds),
      coreItems: enrichItems(version, itemsById, build.coreItemIds),
      fullBuildItems: enrichItems(version, itemsById, build.fullBuildItemIds),
      situationalItems: enrichItems(version, itemsById, build.situationalItemIds),
      summoners: enrichSummoners(version, summonersById, build.summonerIds),
      skillOrder: enrichSkillOrder(build.skillOrder, championDetails),
      notes: [
        `Source: ${meta.provider} patch ${meta.patch || "current"}, ${build.winRate || "?"}% WR over ${build.matches ? build.matches.toLocaleString() : "?"} matches.`,
        ...build.notes,
      ],
    }));

    return {
      champion: {
        id: champion.id,
        name: champion.name,
        title: champion.title,
        blurb: champion.blurb,
        tags: champion.tags,
        partype: champion.partype,
        lane,
        roles,
        tier: roles.find((role) => role.lane === lane)?.tier || meta.championStats?.tier || null,
        squareUrl: assets.square,
        splashUrl: assets.splash,
        loadingUrl: assets.loading,
        passive: championDetails.passive?.name || null,
        spells: (championDetails.spells || []).map((spell, index) => ({
          key: ["Q", "W", "E", "R"][index],
          name: spell.name,
          description: spell.description,
        })),
      },
      builds,
      counters: enrichCounters(championsById, version, meta.counters),
      source: {
        provider: meta.provider,
        patch: meta.patch,
        url: meta.url,
        fallback: false,
      },
      caveat:
        "Pregame builds sourced from current public meta data. If the provider layout changes, the app falls back to internal presets.",
    };
  } catch {
    return {
      champion: {
        id: champion.id,
        name: champion.name,
        title: champion.title,
        blurb: champion.blurb,
        tags: champion.tags,
        partype: champion.partype,
        lane,
        roles,
        tier: roles.find((role) => role.lane === lane)?.tier || null,
        squareUrl: assets.square,
        splashUrl: assets.splash,
        loadingUrl: assets.loading,
        passive: championDetails.passive?.name || null,
        spells: (championDetails.spells || []).map((spell, index) => ({
          key: ["Q", "W", "E", "R"][index],
          name: spell.name,
          description: spell.description,
        })),
      },
      builds: fallbackBuilds.map((build) => ({
        ...build,
        starterItems: enrichItemsByName(version, itemsById, itemsByName, build.starterItems),
        earlyItems: [],
        fullBuildItems: [],
        coreItems: enrichItemsByName(version, itemsById, itemsByName, build.coreItems),
        situationalItems: enrichItemsByName(version, itemsById, itemsByName, build.situationalItems),
        runes: build.runes,
        summoners: enrichSummonersByName(version, summonersByName, build.summoners),
      })),
      counters: {
        weakAgainst: [],
        strongAgainst: [],
        matchupSpecific: [],
      },
      source: {
        provider: "Internal fallback",
        patch: null,
        url: null,
        fallback: true,
      },
      caveat:
        "Meta provider unavailable. Showing internal fallback presets so the UI remains usable.",
    };
  }
}
