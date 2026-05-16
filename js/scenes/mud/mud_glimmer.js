/**
 * mud_glimmer.js  -  SaGa-Style Ability Discovery System (v2)
 *
 * Abilities are "glimmered" (sparked) mid-combat by using related techniques.
 * Two discovery paths:
 *   1. Spec glimmers: abilities with sparkFrom[] lists (standard discovery)
 *   2. Chain evolution: using an ability may spark its next rank via MudAbilityChains
 *
 * Chain progression is tracked per base ability ID: { [abilityId]: currentRank }
 * Stat-gated branches (Vigor/Precision/Grit/Instinct) unlock alternate evolutions.
 *
 * Glimmer chance increases when:
 *   - Fighting tougher enemies (mob power relative to player)
 *   - Higher proficiency with the triggering ability
 *   - Player has high Instinct stat
 */
(() => {
  'use strict';

  /* ─── Constants ──────────────────────────────────────────────────────── */

  /** Minimum mob-to-player power ratio for glimmers to trigger */
  const MIN_CHALLENGE_RATIO = 0.4;

  /** Bonus multiplier to spark chance per 0.1 challenge ratio above 1.0 */
  const CHALLENGE_BONUS_PER_TENTH = 0.15;

  /** Maximum challenge bonus multiplier (cap at 3x base chance) */
  const MAX_CHALLENGE_BONUS = 3.0;

  /** Proficiency bonus: each mastery rank adds this to spark chance */
  const PROFICIENCY_BONUS_PER_RANK = 0.005;

  /** Instinct bonus: each point adds this to spark chance */
  const INSTINCT_BONUS_PER_POINT = 0.0005;

  /** Cooldown between glimmer attempts (in combat ticks) to avoid spam */
  const GLIMMER_COOLDOWN_TICKS = 3;

  /** Maximum number of glimmers per single combat encounter */
  const MAX_GLIMMERS_PER_FIGHT = 2;

  /** Base spark chance for chain evolutions */
  const CHAIN_SPARK_CHANCE = 0.06;

  /** Bonus to chain spark chance when a stat-gated branch is available */
  const STAT_GATE_BONUS = 0.02;

  /* ─── State ──────────────────────────────────────────────────────────── */

  /**
   * Per-combat transient state. Reset when combat starts.
   * @type {{ lastGlimmerTick: number, glimmersThisFight: number }}
   */
  let combatGlimmerState = { lastGlimmerTick: 0, glimmersThisFight: 0 };

  /* ─── Core Functions ─────────────────────────────────────────────────── */

  /**
   * Reset glimmer state at the start of a new combat encounter.
   * Called by the integration layer when combat begins.
   */
  function resetCombatState() {
    combatGlimmerState = { lastGlimmerTick: 0, glimmersThisFight: 0 };
  }

  /**
   * Roll for a glimmer after the player uses an ability in combat.
   * Checks both chain evolutions and spec/cross-class glimmers.
   *
   * @param {object} params
   * @param {string} params.usedAbilityId   - ID of the ability just used
   * @param {string} params.baseClass       - Player's base class
   * @param {string} params.specId          - Player's specialization ID
   * @param {string[]} params.ownedAbilities - IDs of abilities player already knows
   * @param {number} params.playerPower     - Player's current power level
   * @param {number} params.mobPower        - Mob's effective power level
   * @param {number} params.combatTick      - Current combat tick count
   * @param {object} params.proficiency     - Player's proficiency data { [abilityId]: { rank } }
   * @param {object} params.coreStats       - Player's core stats { vigor: {level}, ... }
   * @param {object} [params.chainProgress] - Player's chain progress { [abilityId]: rank }
   * @returns {object|null} Glimmered ability object, or null if no glimmer
   */
  function rollForGlimmer(params) {
    const {
      usedAbilityId, baseClass, specId, ownedAbilities,
      playerPower, mobPower, combatTick,
      proficiency = {}, coreStats = {}, chainProgress = {}
    } = params;

    // ── Cooldown and per-fight cap ──
    if (combatGlimmerState.glimmersThisFight >= MAX_GLIMMERS_PER_FIGHT) return null;
    if (combatTick - combatGlimmerState.lastGlimmerTick < GLIMMER_COOLDOWN_TICKS) return null;

    // ── Challenge ratio check ──
    const challengeRatio = mobPower / Math.max(playerPower, 1);
    if (challengeRatio < MIN_CHALLENGE_RATIO) return null;

    // ── Calculate shared modifiers ──
    const profRank = proficiency[usedAbilityId]?.rank || 0;
    const instinctLevel = coreStats.instinct?.level || coreStats.instinct || 1;

    const challengeBonus = Math.min(
      MAX_CHALLENGE_BONUS,
      1.0 + Math.max(0, (challengeRatio - 1.0)) * CHALLENGE_BONUS_PER_TENTH * 10
    );
    const profBonus = profRank * PROFICIENCY_BONUS_PER_RANK;
    const instinctBonus = (typeof instinctLevel === 'number' ? instinctLevel : 1) * INSTINCT_BONUS_PER_POINT;

    // ── Priority 1: Chain evolution (using the ability itself may evolve it) ──
    const chainResult = rollChainEvolution(
      usedAbilityId, chainProgress, coreStats, ownedAbilities,
      challengeBonus, profBonus, instinctBonus
    );
    if (chainResult) {
      combatGlimmerState.glimmersThisFight++;
      combatGlimmerState.lastGlimmerTick = combatTick;
      return chainResult;
    }

    // ── Priority 2: Spec glimmers and cross-class discoveries ──
    const candidates = getSparkCandidates(usedAbilityId, baseClass, specId, ownedAbilities);
    if (candidates.length === 0) return null;

    // Shuffle candidates so it's not always the first in the list
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);

    for (const candidate of shuffled) {
      const baseChance = candidate.sparkChance || 0.05;
      const finalChance = (baseChance + profBonus + instinctBonus) * challengeBonus;

      if (Math.random() < finalChance) {
        combatGlimmerState.glimmersThisFight++;
        combatGlimmerState.lastGlimmerTick = combatTick;
        return candidate;
      }
    }

    return null;
  }

  /**
   * Roll for a chain evolution of the used ability.
   * Checks MudAbilityChains for the next available rank.
   *
   * @param {string} abilityId      - The ability that was just used
   * @param {object} chainProgress  - { [abilityId]: currentRank }
   * @param {object} coreStats      - Player's core stats
   * @param {string[]} owned        - Already-known ability IDs
   * @param {number} challengeBonus - Challenge ratio multiplier
   * @param {number} profBonus      - Proficiency bonus
   * @param {number} instinctBonus  - Instinct stat bonus
   * @returns {object|null} Chain evolution ability object, or null
   */
  function rollChainEvolution(abilityId, chainProgress, coreStats, owned, challengeBonus, profBonus, instinctBonus) {
    if (!window.MudAbilityChains) return null;

    // Find the base ability ID for chain lookup.
    // If the player is using a chain rank (e.g., slash_r3), find the root.
    const baseId = getBaseAbilityId(abilityId);
    const chain = window.MudAbilityChains.getChain(baseId);
    if (!chain) return null;

    const currentRank = chainProgress[baseId] || 1; // rank 1 = base ability
    const nextEntry = window.MudAbilityChains.getNextRank(baseId, currentRank, coreStats);
    if (!nextEntry) return null;

    // Don't re-learn something already owned
    if (owned.includes(nextEntry.id)) return null;

    // Calculate spark chance  -  chain evolutions have their own base rate
    let baseChance = CHAIN_SPARK_CHANCE;
    if (nextEntry.statGate) baseChance += STAT_GATE_BONUS; // Stat-gated paths slightly easier
    const finalChance = (baseChance + profBonus + instinctBonus) * challengeBonus;

    if (Math.random() < finalChance) {
      // Build the discovered ability object from the chain entry
      return buildChainAbility(nextEntry, baseId, chain);
    }

    return null;
  }

  /**
   * Get the base ability ID from a chain rank ID.
   * E.g., 'slash_r3' -> 'slash', 'slash_r5_grit' -> 'slash', 'slash' -> 'slash'
   *
   * @param {string} abilityId - Any ability ID (base or chain rank)
   * @returns {string} The base ability ID
   */
  function getBaseAbilityId(abilityId) {
    // Strip _r{N} or _r{N}_{stat} suffix to find the base
    const match = abilityId.match(/^(.+?)_r\d+(?:_\w+)?$/);
    if (match) return match[1];
    return abilityId;
  }

  /**
   * Build a full ability object from a chain rank entry.
   * Adds fields needed by the combat system.
   *
   * @param {object} entry  - Chain rank entry from MudAbilityChains
   * @param {string} baseId - The base ability ID this chain belongs to
   * @param {object} chain  - The full chain object (for metadata)
   * @returns {object} Ability object compatible with the combat system
   */
  function buildChainAbility(entry, baseId, chain) {
    // Cap cooldown at the base ability's cooldown so upgrades never increase CD
    const baseDef = window.MudAbilities?.getAbilityById(baseId);
    const baseCd = baseDef?.cooldown || 3;
    const cd = Math.min(entry.cooldown || 3, baseCd);
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      multiplier: entry.multiplier || 1.0,
      healPercent: entry.healPercent || null,
      hits: entry.hits || 1,
      cooldown: cd,
      desc: entry.desc || `Rank ${entry.rank} evolution of ${baseId}.`,
      // Chain metadata for tracking
      isChainEvolution: true,
      chainBaseId: baseId,
      chainRank: entry.rank,
      chainBranch: entry.branch || null,
      statGate: entry.statGate || null,
      // Mark as glimmer-discovered (not trainable)
      glimmer: true
    };
  }

  /**
   * Get spec glimmer and cross-class candidates (non-chain discoveries).
   * These are abilities with sparkFrom[] that include the used ability.
   *
   * @param {string} usedAbilityId  - The ability that was just used
   * @param {string} baseClass      - Player's base class
   * @param {string} specId         - Player's specialization
   * @param {string[]} owned        - Already-known ability IDs
   * @returns {object[]} Array of candidate ability objects
   */
  function getSparkCandidates(usedAbilityId, baseClass, specId, owned) {
    if (!window.MudAbilities) return [];

    const candidates = [];
    const ownedSet = new Set(owned);

    // ── Spec glimmers: abilities from the player's own spec ──
    const specAbilities = window.MudAbilities.getAllSpecAbilities(baseClass, specId) || [];
    for (const ability of specAbilities) {
      if (!ability.glimmer) continue;
      if (ownedSet.has(ability.id)) continue;
      if (!ability.sparkFrom || !ability.sparkFrom.includes(usedAbilityId)) continue;
      candidates.push(ability);
    }

    // ── Cross-class glimmers: abilities from other specs ──
    const crossPool = window.MudAbilities.getCrossClassPool();
    for (const ability of crossPool) {
      if (ownedSet.has(ability.id)) continue;
      if (!ability.sparkFrom || !ability.sparkFrom.includes(usedAbilityId)) continue;

      // Avoid duplicates if the same ability exists in their own spec
      const isOwnSpec = specAbilities.some(a => a.id === ability.id);
      if (isOwnSpec) continue;

      // Cross-class abilities have a reduced spark chance (halved)
      const adjusted = { ...ability, sparkChance: (ability.sparkChance || 0.05) * 0.5 };
      candidates.push(adjusted);
    }

    return candidates;
  }

  /**
   * Update chain progress when a chain ability is glimmered.
   * Returns updated chainProgress object.
   *
   * @param {object} chainProgress - Current { [abilityId]: rank }
   * @param {object} ability       - The glimmered ability
   * @returns {object} Updated chain progress
   */
  function updateChainProgress(chainProgress, ability) {
    if (!ability.isChainEvolution) return chainProgress;
    const updated = { ...chainProgress };
    updated[ability.chainBaseId] = ability.chainRank;
    return updated;
  }

  /**
   * Generate the dramatic glimmer discovery message.
   * SaGa-style "lightbulb moment" flavor text.
   *
   * @param {string} playerName  - Player's name
   * @param {string} usedName    - Name of the ability that triggered the glimmer
   * @param {object} discovered  - The discovered ability object
   * @returns {string[]} Array of message lines
   */
  function getGlimmerMessage(playerName, usedName, discovered) {
    const lines = [];

    if (discovered.isChainEvolution) {
      // Chain evolution messages  -  vary by rank and branch
      if (discovered.chainBranch) {
        // Stat-gated branch discovery
        const branchFlavors = {
          vigor: `Raw power surges through ${playerName}! A new path reveals itself...`,
          precision: `${playerName}'s focus sharpens to a razor edge. The technique transforms...`,
          grit: `${playerName}'s resolve hardens like iron. The technique evolves differently...`,
          instinct: `${playerName}'s instincts guide them down a different path...`
        };
        lines.push(branchFlavors[discovered.chainBranch] ||
          `Something shifts. ${playerName} discovers an alternate evolution...`);
      } else if (discovered.chainRank <= 3) {
        lines.push(`A flash of insight! Mid-strike, ${playerName} sees a way to extend the technique...`);
      } else if (discovered.chainRank <= 6) {
        lines.push(`The rhythm of battle reveals a deeper truth. ${playerName}'s hands move on their own...`);
      } else if (discovered.chainRank <= 9) {
        lines.push(`Transcendence. The boundary between warrior and weapon dissolves.`);
      } else {
        lines.push(`MASTERY. ${playerName} has reached the pinnacle of this technique!`);
      }
    } else if (discovered.crossClass) {
      lines.push(`Something clicks. Watching the flow of combat, ${playerName} grasps a foreign technique...`);
    } else {
      // Standard spec glimmer
      const flavors = [
        `A spark of brilliance! In the heat of battle, ${playerName} discovers something new!`,
        `Instinct takes over. ${playerName}'s body moves in a way it never has before!`,
        `The lightbulb moment. Using ${usedName}, ${playerName} glimpses a new possibility!`,
        `Battle-forged insight! ${playerName} pushes past their limits!`,
        `A revelation mid-combat! The technique evolves before ${playerName}'s eyes!`
      ];
      lines.push(flavors[Math.floor(Math.random() * flavors.length)]);
    }

    lines.push(`  \u2605 GLIMMER: Learned "${discovered.name}"! \u2605`);
    lines.push(`  ${discovered.desc}`);

    return lines;
  }

  /**
   * Get a summary of the player's glimmer/chain progress for the 'abilities' command.
   *
   * @param {string} baseClass      - Player's base class
   * @param {string} specId         - Player's specialization
   * @param {string[]} owned        - Owned ability IDs
   * @param {object} chainProgress  - { [abilityId]: rank }
   * @returns {object} Summary with counts and chain status
   */
  function getGlimmerSummary(baseClass, specId, owned, chainProgress) {
    if (!window.MudAbilities) return { discovered: 0, remaining: 0, chains: [] };

    const specAbilities = window.MudAbilities.getAllSpecAbilities(baseClass, specId) || [];
    const glimmerable = specAbilities.filter(a => a.glimmer);
    const discovered = glimmerable.filter(a => owned.includes(a.id));
    const remaining = glimmerable.filter(a => !owned.includes(a.id));

    // Chain summaries from MudAbilityChains
    const chains = [];
    if (window.MudAbilityChains) {
      const trainable = specAbilities.filter(a => !a.glimmer && !a.crossClass);
      for (const ability of trainable) {
        const chain = window.MudAbilityChains.getChain(ability.id);
        if (!chain) continue;
        const currentRank = chainProgress[ability.id] || 1;
        const maxRank = 10;
        const capstones = window.MudAbilityChains.getCapstones(ability.id);

        chains.push({
          baseId: ability.id,
          baseName: ability.name,
          currentRank,
          maxRank,
          hasStatBranch: capstones.length > 1,
          primary: chain.primary,
          secondary: chain.secondary
        });
      }
    }

    return {
      discovered: discovered.length,
      remaining: remaining.length,
      total: glimmerable.length,
      chains
    };
  }

  /**
   * Get hints for abilities the player could potentially glimmer next.
   * Used for the 'abilities' command to show "???" hints.
   *
   * @param {string} baseClass      - Player's base class
   * @param {string} specId         - Player's specialization
   * @param {string[]} owned        - Owned ability IDs
   * @param {object} chainProgress  - { [abilityId]: rank }
   * @param {object} coreStats      - Player's core stats
   * @returns {object[]} Array of { hint, type } for undiscovered abilities
   */
  function getGlimmerHints(baseClass, specId, owned, chainProgress, coreStats) {
    if (!window.MudAbilities) return [];

    const specAbilities = window.MudAbilities.getAllSpecAbilities(baseClass, specId) || [];
    const ownedSet = new Set(owned);
    const hints = [];

    // ── Spec glimmer hints ──
    for (const a of specAbilities) {
      if (!a.glimmer) continue;
      if (ownedSet.has(a.id)) continue;
      if (!a.sparkFrom) continue;

      const hasPrereq = a.sparkFrom.some(sf => ownedSet.has(sf));
      if (!hasPrereq) continue;

      hints.push({
        hint: `??? (Spark from: ${a.sparkFrom.map(id => getAbilityName(id, specAbilities)).join(', ')})`,
        type: a.crossClass ? 'cross-class' : 'spec-glimmer'
      });
    }

    // ── Chain evolution hints ──
    if (window.MudAbilityChains) {
      const trainable = specAbilities.filter(a => !a.glimmer && !a.crossClass);
      for (const ability of trainable) {
        const chain = window.MudAbilityChains.getChain(ability.id);
        if (!chain) continue;

        const currentRank = chainProgress[ability.id] || 1;
        if (currentRank >= 10) continue;

        const nextEntry = window.MudAbilityChains.getNextRank(ability.id, currentRank, coreStats || {});
        if (!nextEntry || ownedSet.has(nextEntry.id)) continue;

        const branchInfo = nextEntry.statGate
          ? ` [${nextEntry.statGate.stat} ${nextEntry.statGate.min}+]`
          : '';
        hints.push({
          hint: `??? Chain: ${ability.name} Rank ${currentRank + 1}${branchInfo} (Use ${ability.name} in tough fights)`,
          type: 'chain-evolution'
        });
      }
    }

    return hints;
  }

  /**
   * Helper: get ability name by ID from a list, with fallback.
   */
  function getAbilityName(id, abilities) {
    const found = abilities.find(a => a.id === id);
    if (found) return found.name;
    if (window.MudAbilities) {
      const global = window.MudAbilities.getAbilityById(id);
      if (global) return global.name;
    }
    return id;
  }

  /* ─── Public API ─────────────────────────────────────────────────────── */

  window.MudGlimmer = {
    // Constants (exposed for tuning)
    MIN_CHALLENGE_RATIO,
    MAX_GLIMMERS_PER_FIGHT,
    CHAIN_SPARK_CHANCE,

    // Core
    resetCombatState,
    rollForGlimmer,
    updateChainProgress,
    getGlimmerMessage,

    // Query
    getSparkCandidates,
    getGlimmerSummary,
    getGlimmerHints,

    // Utility
    getBaseAbilityId,
    buildChainAbility
  };
})();
