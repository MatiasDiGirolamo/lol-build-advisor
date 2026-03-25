import {
  AP_DAMAGE_CHAMPIONS,
  ARMOR_ITEM_PATTERNS,
  HEALING_ITEM_PATTERNS,
  HEAVY_CC_CHAMPIONS,
  HIGH_HEALING_CHAMPIONS,
  HIGH_TANK_CHAMPIONS,
  MAGIC_RESIST_ITEM_PATTERNS,
} from "../data/constants.js";

const ROLE_RESPONSES = {
  Marksman: {
    defaultBoots: "Berserker's Greaves",
    antiHeal: "Mortal Reminder",
    antiTank: "Lord Dominik's Regards",
    vsAd: "Guardian Angel",
    vsAp: "Wit's End",
    vsCc: "Mercurial Scimitar",
  },
  Mage: {
    defaultBoots: "Sorcerer's Shoes",
    antiHeal: "Morellonomicon",
    antiTank: "Void Staff",
    vsAd: "Zhonya's Hourglass",
    vsAp: "Banshee's Veil",
    vsCc: "Mercury's Treads",
  },
  Fighter: {
    defaultBoots: "Ionian Boots of Lucidity",
    antiHeal: "Chempunk Chainsword",
    antiTank: "Black Cleaver",
    vsAd: "Death's Dance",
    vsAp: "Maw of Malmortius",
    vsCc: "Mercury's Treads",
  },
  Assassin: {
    defaultBoots: "Ionian Boots of Lucidity",
    antiHeal: "Chempunk Chainsword",
    antiTank: "Serylda's Grudge",
    vsAd: "Guardian Angel",
    vsAp: "Maw of Malmortius",
    vsCc: "Edge of Night",
  },
  Tank: {
    defaultBoots: "Plated Steelcaps",
    antiHeal: "Thornmail",
    antiTank: "Sunfire Aegis",
    vsAd: "Frozen Heart",
    vsAp: "Force of Nature",
    vsCc: "Mercury's Treads",
  },
  Support: {
    defaultBoots: "Ionian Boots of Lucidity",
    antiHeal: "Morellonomicon",
    antiTank: "Imperial Mandate",
    vsAd: "Locket of the Iron Solari",
    vsAp: "Mikael's Blessing",
    vsCc: "Mikael's Blessing",
  },
  Generic: {
    defaultBoots: "Boots",
    antiHeal: "Anti-heal",
    antiTank: "Penetration",
    vsAd: "Armor item",
    vsAp: "Magic resist item",
    vsCc: "Tenacity item",
  },
};

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPattern(items, patterns) {
  return items.some((item) => patterns.some((pattern) => item.includes(pattern)));
}

function choosePrimaryRole(tags, preferredLane = null) {
  if (preferredLane === "Support") {
    return "Support";
  }

  if (preferredLane === "Bot") {
    return tags?.includes("Marksman") ? "Marksman" : "Support";
  }

  if (preferredLane === "Jungle") {
    return tags?.includes("Assassin")
      ? "Assassin"
      : tags?.includes("Fighter")
        ? "Fighter"
        : "Tank";
  }

  const priority = ["Marksman", "Support", "Mage", "Assassin", "Fighter", "Tank"];
  return priority.find((tag) => tags?.includes(tag)) || "Generic";
}

function getDamageProfile(championName, tags) {
  if (AP_DAMAGE_CHAMPIONS.has(championName)) {
    return { ad: 0.5, ap: 2.5 };
  }

  if (tags.includes("Mage")) {
    return { ad: 0.25, ap: 3 };
  }

  if (tags.includes("Marksman")) {
    return { ad: 3, ap: 0.1 };
  }

  if (tags.includes("Assassin")) {
    return { ad: 2.5, ap: 0.4 };
  }

  if (tags.includes("Fighter")) {
    return { ad: 2.2, ap: 0.4 };
  }

  if (tags.includes("Tank")) {
    return { ad: 1.2, ap: 1.2 };
  }

  if (tags.includes("Support")) {
    return { ad: 0.6, ap: 1.4 };
  }

  return { ad: 1, ap: 1 };
}

function scorePlayerThreat(player) {
  const itemCount = (player.items || []).filter((item) => item.id && Number(item.id) > 0).length;
  return (
    (player.kills || 0) * 3 +
    (player.assists || 0) * 1.2 +
    (player.level || 0) * 0.9 +
    itemCount * 2.25 +
    (player.creepScore || 0) / 18 -
    (player.deaths || 0) * 1.3
  );
}

function getEnemyMatchupBuckets(enemies) {
  return {
    ap: enemies
      .filter((enemy) => getDamageProfile(enemy.championName, enemy.championTags || []).ap >= 1.4)
      .sort((left, right) => scorePlayerThreat(right) - scorePlayerThreat(left)),
    ad: enemies
      .filter((enemy) => getDamageProfile(enemy.championName, enemy.championTags || []).ad >= 1.8)
      .sort((left, right) => scorePlayerThreat(right) - scorePlayerThreat(left)),
    cc: enemies.filter(
      (enemy) =>
        HEAVY_CC_CHAMPIONS.has(enemy.championName) ||
        (enemy.items || []).some((item) => normalizeName(item.name).includes("rylai")),
    ),
    healing: enemies.filter((enemy) => {
      const itemNames = (enemy.items || []).map((item) => normalizeName(item.name));
      return (
        HIGH_HEALING_CHAMPIONS.has(enemy.championName) ||
        hasPattern(itemNames, HEALING_ITEM_PATTERNS)
      );
    }),
    tanks: enemies.filter((enemy) => {
      const itemNames = (enemy.items || []).map((item) => normalizeName(item.name));
      return (
        HIGH_TANK_CHAMPIONS.has(enemy.championName) ||
        hasPattern(itemNames, ARMOR_ITEM_PATTERNS) ||
        hasPattern(itemNames, MAGIC_RESIST_ITEM_PATTERNS)
      );
    }),
  };
}

function abilityLabel(enemy) {
  const spellNames = (enemy.abilities || [])
    .map((ability) => ability.name)
    .filter(Boolean)
    .slice(0, 2);

  if (!spellNames.length) {
    return enemy.championName;
  }

  return `${enemy.championName} (${spellNames.join(" / ")})`;
}

function joinLabels(enemies, limit = 2) {
  const labels = enemies.slice(0, limit).map(abilityLabel);

  if (!labels.length) {
    return "la comp rival";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  return `${labels[0]} y ${labels[1]}`;
}

function summarizeThreats(enemies) {
  const totals = enemies.reduce(
    (summary, enemy) => {
      const tags = enemy.championTags || [];
      const itemNames = (enemy.items || []).map((item) => normalizeName(item.name));
      const damage = getDamageProfile(enemy.championName, tags);

      summary.ad += damage.ad;
      summary.ap += damage.ap;

      if (
        HEAVY_CC_CHAMPIONS.has(enemy.championName) ||
        itemNames.some((name) => name.includes("rylai"))
      ) {
        summary.cc += 1;
      }

      if (
        HIGH_HEALING_CHAMPIONS.has(enemy.championName) ||
        hasPattern(itemNames, HEALING_ITEM_PATTERNS)
      ) {
        summary.healing += 1;
      }

      if (
        HIGH_TANK_CHAMPIONS.has(enemy.championName) ||
        hasPattern(itemNames, ARMOR_ITEM_PATTERNS) ||
        hasPattern(itemNames, MAGIC_RESIST_ITEM_PATTERNS)
      ) {
        summary.tanks += 1;
      }

      if (hasPattern(itemNames, ARMOR_ITEM_PATTERNS)) {
        summary.armorStack += 1;
      }

      if (hasPattern(itemNames, MAGIC_RESIST_ITEM_PATTERNS)) {
        summary.magicResistStack += 1;
      }

      if (tags.includes("Marksman")) {
        summary.autoAttackThreat += 1;
      }

      return summary;
    },
    {
      ad: 0,
      ap: 0,
      cc: 0,
      healing: 0,
      tanks: 0,
      armorStack: 0,
      magicResistStack: 0,
      autoAttackThreat: 0,
    },
  );

  const damageBias =
    totals.ad > totals.ap * 1.35
      ? "AD-heavy"
      : totals.ap > totals.ad * 1.35
        ? "AP-heavy"
        : "Mixed";

  return {
    ...totals,
    damageBias,
    highCc: totals.cc >= 2,
    highHealing: totals.healing >= 2,
    frontToBack: totals.tanks >= 2,
    armorStacking: totals.armorStack >= 2,
    magicResistStacking: totals.magicResistStack >= 2,
    heavyAutoAttack: totals.autoAttackThreat >= 2,
  };
}

function buildCombatTips(threatSummary, buckets) {
  const tips = [];

  if (threatSummary.damageBias === "AD-heavy") {
    tips.push(
      `El dano fisico fuerte viene por ${joinLabels(buckets.ad)}: no llegues al mid game sin una capa defensiva.`,
    );
  }

  if (threatSummary.damageBias === "AP-heavy") {
    tips.push(
      `La presion magica real cae desde ${joinLabels(buckets.ap)}: necesitas respetar burst y pick tools antes del tercer slot.`,
    );
  }

  if (threatSummary.highCc) {
    tips.push(
      `Hay engage/catch de sobra desde ${joinLabels(buckets.cc)}: guarda dash, cleanse o peel para el primer control.`,
    );
  }

  if (threatSummary.highHealing) {
    tips.push(
      `El sustain de ${joinLabels(buckets.healing)} te castiga los trades largos si no cortas curaciones temprano.`,
    );
  }

  if (threatSummary.frontToBack) {
    tips.push(
      `La frontline de ${joinLabels(buckets.tanks)} va a comprar mucho tiempo: pensa la pelea con penetracion o DPS sostenido.`,
    );
  }

  if (threatSummary.damageBias === "Mixed") {
    tips.push(
      "La partida es de dano mixto: balancea dano, tempo y defensa flexible en vez de stackear una sola resistencia.",
    );
  }

  if (!tips.length) {
    tips.push(
      "La comp rival no tiene una sola amenaza dominante: segui la base meta y ajusta por el primer carry que snowballee.",
    );
  }

  return tips;
}

function buildEnemyThreats(buckets) {
  const cards = [];

  if (buckets.cc.length) {
    cards.push({
      title: "Hard engage",
      detail: `${joinLabels(buckets.cc)} te obligan a respetar sus ventanas de CC antes de entrar.`,
    });
  }

  if (buckets.healing.length) {
    cards.push({
      title: "Sustain check",
      detail: `${joinLabels(buckets.healing)} alargan peleas y escalan mejor si no metes heridas graves.`,
    });
  }

  if (buckets.tanks.length) {
    cards.push({
      title: "Frontline",
      detail: `${joinLabels(buckets.tanks)} compran tiempo para su backline y te fuerzan a pegar sobre tanques.`,
    });
  }

  if (buckets.ap.length) {
    cards.push({
      title: "Magic burst",
      detail: `${joinLabels(buckets.ap)} concentran la mayor parte del dano magico y del pick rival.`,
    });
  }

  if (buckets.ad.length) {
    cards.push({
      title: "AD pressure",
      detail: `${joinLabels(buckets.ad)} sostienen el castigo fisico cuando las peleas se alargan.`,
    });
  }

  return cards.slice(0, 5);
}

function indexMetaItems(metaBuild) {
  const entries = [
    ...(metaBuild?.builds?.[0]?.starterItems || []),
    ...(metaBuild?.builds?.[0]?.earlyItems || []),
    ...(metaBuild?.builds?.[0]?.coreItems || []),
    ...(metaBuild?.builds?.[0]?.fullBuildItems || []),
    ...(metaBuild?.builds?.[0]?.situationalItems || []),
  ];

  return new Map(entries.map((item) => [normalizeName(item.name), item]));
}

function getMetaCoreTargets(metaBuild, ownedItems) {
  const activeBuild = metaBuild?.builds?.[0];
  if (!activeBuild) {
    return [];
  }

  const baseline = [
    ...(activeBuild.coreItems || []),
    ...(activeBuild.fullBuildItems || []),
  ];

  return baseline.filter((item) => !ownedItems.has(normalizeName(item.name)));
}

function buildPriorityTargets(enemies) {
  const sorted = [...enemies]
    .sort((left, right) => scorePlayerThreat(right) - scorePlayerThreat(left))
    .slice(0, 3);

  return sorted.map((enemy, index) => ({
    rank: index + 1,
    championName: enemy.championName,
    label: abilityLabel(enemy),
    threatScore: Number(scorePlayerThreat(enemy).toFixed(1)),
    scoreLine: enemy.scoreLine,
    reason:
      index === 0
        ? "Es la mayor amenaza actual por nivel, kills e inventario."
        : "Si entra libre a la pelea, te fuerza a jugar defensivo.",
  }));
}

function getPreferredCategoryOrder(gameStatus) {
  if (gameStatus === "Behind") {
    return ["Anti AD", "Anti AP", "Anti CC", "Anti heal", "Boots", "Buy now"];
  }

  if (gameStatus === "Ahead") {
    return ["Buy now", "Next spike", "Anti tank", "Boots", "Anti heal"];
  }

  return ["Buy now", "Anti AD", "Anti AP", "Anti CC", "Anti tank", "Boots"];
}

function findLaneOpponent(currentPlayer, enemies, preferredLane) {
  const lane = preferredLane || currentPlayer?.lane || null;
  if (!lane) {
    return [...enemies].sort((left, right) => scorePlayerThreat(right) - scorePlayerThreat(left))[0] || null;
  }

  return (
    enemies.find((enemy) => enemy.lane === lane) ||
    [...enemies].sort((left, right) => scorePlayerThreat(right) - scorePlayerThreat(left))[0] ||
    null
  );
}

function evaluateGameState(currentPlayer, allies, enemies, preferredLane) {
  const laneOpponent = findLaneOpponent(currentPlayer, enemies, preferredLane);
  const selfScore = scorePlayerThreat(currentPlayer);
  const laneDelta = laneOpponent ? selfScore - scorePlayerThreat(laneOpponent) : 0;
  const allyScore = allies.reduce((total, ally) => total + scorePlayerThreat(ally), 0);
  const enemyScore = enemies.reduce((total, enemy) => total + scorePlayerThreat(enemy), 0);
  const teamDelta = allyScore - enemyScore;

  let status = "Even";
  if (laneDelta <= -4 || teamDelta <= -8) {
    status = "Behind";
  } else if (laneDelta >= 4 || teamDelta >= 8) {
    status = "Ahead";
  }

  let summary = "La partida esta pareja: segui la base meta y ajusta por la amenaza principal.";
  if (status === "Ahead") {
    summary = laneOpponent
      ? `Vas por delante contra ${laneOpponent.championName}: puedes priorizar tempo, vision y cerrar spike antes de forzar.`
      : "Tienes ventaja de tempo: puedes acelerar objetivos y comprar dano antes de defenderte.";
  }
  if (status === "Behind") {
    summary = laneOpponent
      ? `${laneOpponent.championName} va por delante en tu matchup: estabiliza, compra utilidad/defensa y no fuerces sin recursos.`
      : "Estas por detras: compra para estabilizar, juega a reset corto y evita all-ins innecesarios.";
  }

  return {
    status,
    statusLabel: status === "Ahead" ? "Ahead" : status === "Behind" ? "Behind" : "Even",
    summary,
    laneOpponentName: laneOpponent?.championName || null,
    laneDelta: Number(laneDelta.toFixed(1)),
    teamDelta: Number(teamDelta.toFixed(1)),
  };
}

function decideWinCondition(role, threatSummary, targets, gameState) {
  const topThreat = targets[0];

  if (gameState?.status === "Behind") {
    return {
      title: "Stabilize first",
      summary:
        role === "Support"
          ? "Juega para peel, corta engages y fuerza peleas cortas solo cuando tu carry tenga summoners o cooldowns."
          : "No persigas kills largas: juega sobre wave, vision y una compra defensiva antes del siguiente objetivo.",
    };
  }

  if (gameState?.status === "Ahead") {
    return {
      title: "Press the map",
      summary:
        role === "Support"
          ? "Aprovecha la ventaja para mover vision primero y habilitar picks sobre el carry rival."
          : "Tienes margen para jugar el spike agresivo: fuerza objetivos o picks antes de que el rival estabilice.",
    };
  }

  if (role === "Support") {
    return {
      title: "Peel y reset corto",
      summary: topThreat
        ? `Tu trabajo es cortar la entrada de ${topThreat.championName} o negar su pick window antes de empezar la pelea larga.`
        : "Jugá alrededor del carry aliado y guardá cooldowns para el primer engage rival.",
    };
  }

  if (threatSummary.frontToBack) {
    return {
      title: "Front-to-back",
      summary: "La pelea se gana bajando frontline sin regalarte al engage. Priorizá DPS limpio y spacing.",
    };
  }

  if (topThreat) {
    return {
      title: "Castigar carry principal",
      summary: `La partida gira alrededor de ${topThreat.championName}: o lo aislás rápido o jugás fuera de su rango de impacto.`,
    };
  }

  return {
    title: "Tempo de skirmish",
    summary: "Forzá peleas cuando tu spike entre antes que el de ellos y no regales engage frontal.",
  };
}

function buildPurchasePlan(recommendations, gameState) {
  const categoryOrder = getPreferredCategoryOrder(gameState?.status);
  const buyNow =
    categoryOrder
      .map((category) =>
        recommendations.find((recommendation) => recommendation.category === category),
      )
      .find(Boolean) ||
    recommendations[0] ||
    null;
  const remaining = recommendations.filter((recommendation) => recommendation.name !== buyNow?.name);

  return {
    buyNow,
    buyNext: remaining.slice(0, 2),
    fallback: remaining.slice(2, 4),
  };
}

export function buildRecommendations(snapshot, metaBuild = null) {
  const participants = Array.isArray(snapshot?.participants) ? snapshot.participants : [];
  const currentPlayer =
    participants.find((participant) => participant.isCurrentPlayer) || {
      championName: snapshot?.player?.championName || "Unknown",
      championTags: [],
      items: [],
      lane: snapshot?.player?.lane || null,
      scoreLine: "0/0/0",
    };
  const allies = participants.filter((participant) => participant.relation === "ALLY");
  const enemies = participants.filter((participant) => participant.relation === "ENEMY");
  const preferredLane = metaBuild?.champion?.lane || snapshot?.player?.lane || currentPlayer.lane || null;
  const role = choosePrimaryRole(currentPlayer.championTags || [], preferredLane);
  const roleConfig = ROLE_RESPONSES[role] || ROLE_RESPONSES.Generic;
  const ownedItems = new Set(
    (currentPlayer.items || []).map((item) => normalizeName(item.name)),
  );
  const threatSummary = summarizeThreats(enemies);
  const enemyBuckets = getEnemyMatchupBuckets(enemies);
  const metaItemMap = indexMetaItems(metaBuild);
  const metaTargets = getMetaCoreTargets(metaBuild, ownedItems);
  const recommendations = [];
  const seen = new Set();
  const targetPriority = buildPriorityTargets(enemies);
  const gameState = evaluateGameState(
    currentPlayer,
    allies.length ? allies : [currentPlayer],
    enemies,
    preferredLane,
  );

  function pushRecommendation(name, reason, category, priority) {
    const key = normalizeName(name);
    if (!name || seen.has(key) || ownedItems.has(key)) {
      return;
    }

    const metaItem = metaItemMap.get(key);
    recommendations.push({
      name,
      reason,
      category,
      priority,
      iconUrl: metaItem?.iconUrl || null,
    });
    seen.add(key);
  }

  if (metaTargets[0]) {
    pushRecommendation(
      metaTargets[0].name,
      `Es tu compra mas estable para el spike actual y te deja jugar mejor contra ${joinLabels(
        enemyBuckets.ap.length ? enemyBuckets.ap : enemies,
      )}.`,
      "Buy now",
      100,
    );
  }

  if (threatSummary.damageBias === "AD-heavy") {
    pushRecommendation(
      roleConfig.vsAd,
      `La amenaza AD mas seria viene de ${joinLabels(enemyBuckets.ad)} y ese slot baja burst o DPS fisico real.`,
      "Anti AD",
      97,
    );
  }

  if (threatSummary.damageBias === "AP-heavy") {
    pushRecommendation(
      roleConfig.vsAp,
      `${joinLabels(enemyBuckets.ap)} concentran control y burst magico; este ajuste te deja jugar peleas sin caer en el primer pick.`,
      "Anti AP",
      97,
    );
  }

  if (threatSummary.highHealing) {
    pushRecommendation(
      roleConfig.antiHeal,
      `${joinLabels(enemyBuckets.healing)} pueden dar vuelta trades largos; este slot existe para que su sustain no te arruine el mid game.`,
      "Anti heal",
      96,
    );
  }

  if (threatSummary.highCc) {
    pushRecommendation(
      roleConfig.vsCc,
      `${joinLabels(enemyBuckets.cc)} tienen herramientas para cazarte o cortar tu combo; necesitás proteccion o tenacidad para entrar.`,
      "Anti CC",
      95,
    );
  }

  if (
    threatSummary.frontToBack ||
    threatSummary.armorStacking ||
    threatSummary.magicResistStacking
  ) {
    pushRecommendation(
      roleConfig.antiTank,
      `${joinLabels(enemyBuckets.tanks)} van a frenar tu acceso a carries y comprar mucho tiempo; conviene meter dano sostenido o penetracion.`,
      "Anti tank",
      94,
    );
  }

  if (metaTargets[1]) {
    pushRecommendation(
      metaTargets[1].name,
      `Es el follow-up mas estable cuando la partida empiece a girar alrededor de ${joinLabels(
        enemyBuckets.tanks.length ? enemyBuckets.tanks : enemies,
      )}.`,
      "Next spike",
      88,
    );
  }

  pushRecommendation(
    roleConfig.defaultBoots,
    threatSummary.highCc
      ? `Te ayudan a sobrevivir mejor las entradas de ${joinLabels(
          enemyBuckets.cc.length ? enemyBuckets.cc : enemies,
        )} mientras mantenes tempo.`
      : "Te sostienen el tempo base para moverte antes a objetivos y skirmishes.",
    "Boots",
    78,
  );

  const sortedRecommendations = recommendations
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 5);

  return {
    playerRole: role,
    threatSummary,
    nextItems: sortedRecommendations,
    purchasePlan: buildPurchasePlan(sortedRecommendations, gameState),
    pressurePoints: buildCombatTips(threatSummary, enemyBuckets),
    enemyThreats: buildEnemyThreats(enemyBuckets),
    targetPriority,
    winCondition: decideWinCondition(role, threatSummary, targetPriority, gameState),
    gameState: {
      currentGold: snapshot?.player?.currentGold || 0,
      lane: preferredLane,
      status: gameState.status,
      statusLabel: gameState.statusLabel,
      summary: gameState.summary,
      laneOpponentName: gameState.laneOpponentName,
      laneDelta: gameState.laneDelta,
      teamDelta: gameState.teamDelta,
      enemyLeadLabel: targetPriority[0]
        ? `${targetPriority[0].championName} es la mayor amenaza ahora`
        : "Sin carry rival dominante por ahora",
    },
    baseline: {
      source: metaBuild?.source?.provider || null,
      patch: metaBuild?.source?.patch || null,
      coreItems: metaBuild?.builds?.[0]?.coreItems || [],
      situationalItems: metaBuild?.builds?.[0]?.situationalItems || [],
    },
  };
}
