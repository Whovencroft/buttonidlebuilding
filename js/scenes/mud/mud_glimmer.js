/**
 * mud_glimmer.js — SaGa-Style Ability Discovery System
 *
 * Abilities are "glimmered" (sparked) mid-combat by using related techniques.
 * Each glimmerable ability has a sparkFrom[] list and a sparkChance.
 * Scaling chains (Slash → Double Slash → Triple Slash) are tracked per-family.
 *
 * Glimmer chance increases when:
 *   - Fighting tougher enemies (mob power relative to player)
 *   - Higher proficiency with the triggering ability
 *   - Player has high Instinct stat
 *
 * Cross-class glimmers can be learned by any spec when using an ability
 * from the same "pool" (universal or affinity-matched).
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
   * @param {object} params.coreStats       - Player's core stats { instinct: { level } }
   * @param {object} [params.chainProgress] - Player's chain progress { [family]: rank }
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

    // ── Gather candidate abilities ──
    const candidates = getCandidates(usedAbilityId, baseClass, specId, ownedAbilities, chainProgress);
    if (candidates.length === 0) return null;

    // ── Calculate modifiers ──
    const profRank = proficiency[usedAbilityId]?.rank || 0;
    const instinctLevel = coreStats.instinct?.level || 1;

    const challengeBonus = Math.min(
      MAX_CHALLENGE_BONUS,
      1.0 + Math.max(0, (challengeRatio - 1.0)) * CHALLENGE_BONUS_PER_TENTH * 10
    );
    const profBonus = profRank * PROFICIENCY_BONUS_PER_RANK;
    const instinctBonus = instinctLevel * INSTINCT_BONUS_PER_POINT;

    // ── Roll for each candidate (first match wins) ──
    // Shuffle candidates so it's not always the first in the list
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);

    for (const candidate of shuffled) {
      const baseChance = candidate.sparkChance || 0.05;
      const finalChance = (baseChance + profBonus + instinctBonus) * challengeBonus;

      if (Math.random() < finalChance) {
        // Glimmer triggered!
        combatGlimmerState.glimmersThisFight++;
        combatGlimmerState.lastGlimmerTick = combatTick;
        return candidate;
      }
    }

    return null;
  }

  /**
   * Get all abilities that could be sparked from using a given ability.
   * Checks spec glimmers, scaling chains, and cross-class pool.
   *
   * @param {string} usedAbilityId  - The ability that was just used
   * @param {string} baseClass      - Player's base class
   * @param {string} specId         - Player's specialization
   * @param {string[]} owned        - Already-known ability IDs
   * @param {object} chainProgress  - { [family]: currentRank }
   * @returns {object[]} Array of candidate ability objects
   */
  function getCandidates(usedAbilityId, baseClass, specId, owned, chainProgress) {
    if (!window.MudAbilities) return [];

    const candidates = [];
    const ownedSet = new Set(owned);

    // ── Spec glimmers: abilities from the player's own spec ──
    const specAbilities = window.MudAbilities.getAllSpecAbilities(baseClass, specId) || [];
    for (const ability of specAbilities) {
      if (!ability.glimmer) continue;
      if (ownedSet.has(ability.id)) continue;
      if (!ability.sparkFrom || !ability.sparkFrom.includes(usedAbilityId)) continue;

      // Chain check: only allow next rank in sequence
      if (ability.chainFamily) {
        const currentRank = chainProgress[ability.chainFamily] || 0;
        if (ability.chainRank !== currentRank + 1) continue;
      }

      candidates.push(ability);
    }

    // ── Cross-class glimmers: abilities from other specs ──
    const crossPool = window.MudAbilities.getCrossClassPool();
    for (const ability of crossPool) {
      if (ownedSet.has(ability.id)) continue;
      if (!ability.sparkFrom || !ability.sparkFrom.includes(usedAbilityId)) continue;

      // Check if this cross-class ability is already in the player's spec
      // (avoid duplicates if the same ability exists in their own spec)
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
   * @param {object} chainProgress - Current { [family]: rank }
   * @param {object} ability       - The glimmered ability
   * @returns {object} Updated chain progress
   */
  function updateChainProgress(chainProgress, ability) {
    if (!ability.chainFamily) return chainProgress;
    const updated = { ...chainProgress };
    updated[ability.chainFamily] = ability.chainRank;
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

    // Chain abilities get a special message
    if (discovered.chainFamily) {
      const rank = discovered.chainRank;
      if (rank <= 2) {
        lines.push(`A flash of insight! Mid-strike, ${playerName} sees a way to extend the technique...`);
      } else if (rank <= 4) {
        lines.push(`The rhythm of battle reveals a deeper truth. ${playerName}'s hands move on their own...`);
      } else {
        lines.push(`Transcendence. The boundary between warrior and weapon dissolves.`);
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

    lines.push(`  ★ GLIMMER: Learned "${discovered.name}"! ★`);
    lines.push(`  ${discovered.desc}`);

    return lines;
  }

  /**
   * Get a summary of the player's glimmer progress for the 'abilities' command.
   *
   * @param {string} baseClass      - Player's base class
   * @param {string} specId         - Player's specialization
   * @param {string[]} owned        - Owned ability IDs
   * @param {object} chainProgress  - { [family]: rank }
   * @returns {object} Summary with counts and chain status
   */
  function getGlimmerSummary(baseClass, specId, owned, chainProgress) {
    if (!window.MudAbilities) return { discovered: 0, remaining: 0, chains: [] };

    const specAbilities = window.MudAbilities.getAllSpecAbilities(baseClass, specId) || [];
    const glimmerable = specAbilities.filter(a => a.glimmer);
    const discovered = glimmerable.filter(a => owned.includes(a.id));
    const remaining = glimmerable.filter(a => !owned.includes(a.id));

    // Chain summaries
    const chainFamilies = {};
    for (const a of specAbilities) {
      if (!a.chainFamily) continue;
      if (!chainFamilies[a.chainFamily]) {
        chainFamilies[a.chainFamily] = { family: a.chainFamily, maxRank: 0, abilities: [] };
      }
      chainFamilies[a.chainFamily].abilities.push(a);
      if (a.chainRank > chainFamilies[a.chainFamily].maxRank) {
        chainFamilies[a.chainFamily].maxRank = a.chainRank;
      }
    }

    const chains = Object.values(chainFamilies).map(cf => ({
      family: cf.family,
      currentRank: chainProgress[cf.family] || 0,
      maxRank: cf.maxRank,
      nextAbility: cf.abilities.find(a => a.chainRank === (chainProgress[cf.family] || 0) + 1) || null
    }));

    return {
      discovered: discovered.length,
      remaining: remaining.length,
      total: glimmerable.length,
      chains
    };
  }

  /**
   * Get the list of abilities the player could potentially glimmer next,
   * given their current owned abilities. Used for the 'abilities' command
   * to show "???" hints.
   *
   * @param {string} baseClass      - Player's base class
   * @param {string} specId         - Player's specialization
   * @param {string[]} owned        - Owned ability IDs
   * @param {object} chainProgress  - { [family]: rank }
   * @returns {object[]} Array of { hint, sparkFrom } for undiscovered abilities
   */
  function getGlimmerHints(baseClass, specId, owned, chainProgress) {
    if (!window.MudAbilities) return [];

    const specAbilities = window.MudAbilities.getAllSpecAbilities(baseClass, specId) || [];
    const ownedSet = new Set(owned);
    const hints = [];

    for (const a of specAbilities) {
      if (!a.glimmer) continue;
      if (ownedSet.has(a.id)) continue;
      if (!a.sparkFrom) continue;

      // Only show hints for abilities the player has the prerequisite for
      const hasPrereq = a.sparkFrom.some(sf => ownedSet.has(sf));
      if (!hasPrereq) continue;

      // Chain check
      if (a.chainFamily) {
        const currentRank = chainProgress[a.chainFamily] || 0;
        if (a.chainRank !== currentRank + 1) continue;
      }

      hints.push({
        hint: a.chainFamily
          ? `??? (Use ${a.sparkFrom.map(id => getAbilityName(id, specAbilities)).join(' or ')} against tough enemies)`
          : `??? (Spark from: ${a.sparkFrom.map(id => getAbilityName(id, specAbilities)).join(', ')})`,
        sparkFrom: a.sparkFrom,
        isChain: !!a.chainFamily,
        chainFamily: a.chainFamily || null
      });
    }

    return hints;
  }

  /**
   * Helper: get ability name by ID from a list, with fallback.
   */
  function getAbilityName(id, abilities) {
    const found = abilities.find(a => a.id === id);
    if (found) return found.name;
    // Check global lookup
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

    // Core
    resetCombatState,
    rollForGlimmer,
    updateChainProgress,
    getGlimmerMessage,

    // Query
    getCandidates,
    getGlimmerSummary,
    getGlimmerHints
  };
})();
