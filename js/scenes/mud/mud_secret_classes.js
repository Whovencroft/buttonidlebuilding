/**
 * mud_secret_classes.js — Secret Unlockable Classes & Transformations
 *
 * Hidden classes that players discover through gameplay. These are full
 * "anime" classes with transformation systems. They replace the player's
 * current spec (keeping old abilities) and unlock a transformation tree.
 *
 * Secret Classes:
 *   1. Spirit Fighter — Unlocked by reaching 5000 power as any fighter anime spec
 *      Transforms: Power Release → Ascended → Transcendent
 *      (DBZ-inspired power escalation)
 *
 *   2. Soul Reaper — Unlocked by reaching 5000 power as any rogue anime spec
 *      Transforms: Shikai → Bankai → Final Release
 *      (Bleach-inspired blade awakening)
 *
 *   3. Sage — Unlocked by reaching 5000 power as any mage anime spec
 *      Transforms: Nature Mode → Sage Mode → Perfect Sage
 *      (Naruto-inspired nature energy)
 *
 *   4. Sentinel — Unlocked by reaching 5000 power as any cleric anime spec
 *      Transforms: Henshin → Armored Form → Final Form
 *      (Kamen Rider / Power Rangers inspired)
 *
 * Transformations:
 *   - Cost Focus per second to maintain
 *   - Multiply ATK and DEF by a tier-based amount
 *   - Unlock a unique ability per transformation tier
 *   - Higher tiers require higher power thresholds
 *   - Dropping to 0 Focus forces de-transformation
 *
 * Unlock conditions are checked silently. When met, the player receives
 * a mysterious message hinting at the class. They must then find a
 * specific NPC or location to complete the unlock.
 *
 * Exposes window.MudSecretClasses for integration with mud_engine.js.
 */
(() => {
  'use strict';

  // ─── Secret Class Definitions ───────────────────────────────────────────

  const SECRET_CLASSES = {
    spirit_fighter: {
      id: 'spirit_fighter',
      name: 'Spirit Fighter',
      baseClass: 'fighter',
      requiredGenre: 'anime',
      unlockPower: 5000,
      unlockHint: 'A surge of raw power courses through you. Something dormant awakens...',
      unlockLocation: null, // null = auto-unlock on threshold
      description: 'A warrior who has broken through mortal limits. Channel raw spirit energy to ascend.',
      transformations: [
        {
          id: 'power_release',
          name: 'Power Release',
          powerRequired: 5000,
          atkMod: 1.5,
          defMod: 1.3,
          focusCostPerTick: 2,
          aura: 'A white aura flares around you!',
          deactivate: 'Your aura fades.',
          ability: { id: 'spirit_wave', name: 'Spirit Wave', type: 'attack', desc: 'Concentrated spirit energy. 300% damage.', multiplier: 3.0, cooldown: 5 }
        },
        {
          id: 'ascended',
          name: 'Ascended',
          powerRequired: 15000,
          atkMod: 2.0,
          defMod: 1.6,
          focusCostPerTick: 4,
          aura: 'Golden energy erupts around you! Your hair stands on end!',
          deactivate: 'The golden light fades. You return to normal.',
          ability: { id: 'spirit_cannon', name: 'Spirit Cannon', type: 'attack', desc: 'Massive energy beam. 500% damage.', multiplier: 5.0, cooldown: 8, chargeRounds: 2 }
        },
        {
          id: 'transcendent',
          name: 'Transcendent',
          powerRequired: 50000,
          atkMod: 3.0,
          defMod: 2.0,
          focusCostPerTick: 8,
          aura: 'Reality warps around you. You have surpassed all limits!',
          deactivate: 'The transcendent state collapses. You feel drained.',
          ability: { id: 'final_flash', name: 'Final Flash', type: 'attack', desc: 'Everything you have in one blast. 1000% damage.', multiplier: 10.0, cooldown: 99, chargeRounds: 3 }
        }
      ]
    },

    soul_reaper: {
      id: 'soul_reaper',
      name: 'Soul Reaper',
      baseClass: 'rogue',
      requiredGenre: 'anime',
      unlockPower: 5000,
      unlockHint: 'Your blade whispers to you. It has a name...',
      unlockLocation: null,
      description: 'A warrior whose weapon has awakened. Each release unlocks deeper power.',
      transformations: [
        {
          id: 'shikai',
          name: 'Shikai',
          powerRequired: 5000,
          atkMod: 1.6,
          defMod: 1.2,
          focusCostPerTick: 2,
          aura: 'Your blade shifts form! "Awaken!"',
          deactivate: 'Your blade returns to its sealed state.',
          ability: { id: 'blade_arc', name: 'Blade Arc', type: 'attack', desc: 'Crescent slash of spiritual pressure. 280% damage.', multiplier: 2.8, cooldown: 4 }
        },
        {
          id: 'bankai',
          name: 'Bankai',
          powerRequired: 15000,
          atkMod: 2.2,
          defMod: 1.5,
          focusCostPerTick: 5,
          aura: 'BANKAI! Spiritual pressure explodes outward!',
          deactivate: 'Bankai fades. Your blade seals itself.',
          ability: { id: 'getsuga', name: 'Getsuga Tensho', type: 'attack', desc: 'Moon-fang slash. 550% damage.', multiplier: 5.5, cooldown: 7, chargeRounds: 2 }
        },
        {
          id: 'final_release',
          name: 'Final Release',
          powerRequired: 50000,
          atkMod: 3.0,
          defMod: 2.0,
          focusCostPerTick: 8,
          aura: 'You merge with your blade. This is the final form!',
          deactivate: 'The merger breaks. You separate from your blade.',
          ability: { id: 'mugetsu', name: 'Mugetsu', type: 'attack', desc: 'The final Getsuga. 1200% damage. Ends transformation.', multiplier: 12.0, cooldown: 99, chargeRounds: 3 }
        }
      ]
    },

    sage: {
      id: 'sage',
      name: 'Sage',
      baseClass: 'mage',
      requiredGenre: 'anime',
      unlockPower: 5000,
      unlockHint: 'The world around you pulses with natural energy. You can feel it...',
      unlockLocation: null,
      description: 'A caster who draws power from nature itself. Stillness becomes strength.',
      transformations: [
        {
          id: 'nature_mode',
          name: 'Nature Mode',
          powerRequired: 5000,
          atkMod: 1.4,
          defMod: 1.4,
          focusCostPerTick: 2,
          aura: 'Natural energy flows into you. Your senses sharpen!',
          deactivate: 'The natural energy dissipates.',
          ability: { id: 'nature_fist', name: 'Nature Fist', type: 'attack', desc: 'Nature-enhanced strike. 260% damage.', multiplier: 2.6, cooldown: 4 }
        },
        {
          id: 'sage_mode',
          name: 'Sage Mode',
          powerRequired: 15000,
          atkMod: 2.0,
          defMod: 1.8,
          focusCostPerTick: 4,
          aura: 'Sage Mode activated! Your eyes change — you see everything!',
          deactivate: 'Sage Mode fades. The world dulls.',
          ability: { id: 'rasenshuriken', name: 'Rasenshuriken', type: 'attack', desc: 'Spiraling sphere of nature energy. 480% damage.', multiplier: 4.8, cooldown: 7, chargeRounds: 2 }
        },
        {
          id: 'perfect_sage',
          name: 'Perfect Sage',
          powerRequired: 50000,
          atkMod: 2.8,
          defMod: 2.2,
          focusCostPerTick: 7,
          aura: 'Perfect balance achieved. You ARE nature!',
          deactivate: 'The perfect state shatters. Reality reasserts itself.',
          ability: { id: 'truth_seeking', name: 'Truth-Seeking Orb', type: 'attack', desc: 'Orb of creation and destruction. 900% damage.', multiplier: 9.0, cooldown: 99, chargeRounds: 3 }
        }
      ]
    },

    sentinel: {
      id: 'sentinel',
      name: 'Sentinel',
      baseClass: 'cleric',
      requiredGenre: 'anime',
      unlockPower: 5000,
      unlockHint: 'A voice calls to you: "Will you accept this power to protect others?"',
      unlockLocation: null,
      description: 'A guardian who dons armor of light. Each form grants greater protection and power.',
      transformations: [
        {
          id: 'henshin',
          name: 'Henshin',
          powerRequired: 5000,
          atkMod: 1.3,
          defMod: 1.6,
          focusCostPerTick: 2,
          aura: 'HENSHIN! Light engulfs you — armor materializes!',
          deactivate: 'The armor dissolves into motes of light.',
          ability: { id: 'rider_kick', name: 'Rider Kick', type: 'attack', desc: 'Signature flying kick. 250% damage.', multiplier: 2.5, cooldown: 4 }
        },
        {
          id: 'armored_form',
          name: 'Armored Form',
          powerRequired: 15000,
          atkMod: 1.8,
          defMod: 2.2,
          focusCostPerTick: 4,
          aura: 'CHOU HENSHIN! Heavy armor locks into place!',
          deactivate: 'The heavy armor ejects. Standard form restored.',
          ability: { id: 'justice_crash', name: 'Justice Crash', type: 'attack', desc: 'Full-armored charge. 420% damage + heal 20% HP.', multiplier: 4.2, healPercent: 0.2, cooldown: 7 }
        },
        {
          id: 'final_form',
          name: 'Final Form',
          powerRequired: 50000,
          atkMod: 2.5,
          defMod: 3.0,
          focusCostPerTick: 7,
          aura: 'ULTIMATE FORM! Wings of light unfurl — you are the shield of all!',
          deactivate: 'The wings shatter. You return to mortal form.',
          ability: { id: 'final_justice', name: 'Final Justice', type: 'attack', desc: 'Orbital dive. 800% damage + heal 50% HP.', multiplier: 8.0, healPercent: 0.5, cooldown: 99, chargeRounds: 2 }
        }
      ]
    }
  };

  // ─── Unlock Logic ───────────────────────────────────────────────────────

  /**
   * Check if a player qualifies to unlock any secret class.
   * @param {object} player - Player state
   * @returns {object|null} The secret class definition, or null
   */
  function checkUnlockEligibility(player) {
    if (!player.spec || !player.baseClass) return null;

    // Already has a secret class
    if (player.secretClass) return null;

    // Get current spec's genre
    const specDef = window.MudAbilities?.getSpec(player.baseClass, player.spec);
    if (!specDef || specDef.genre !== 'anime') return null;

    // Find matching secret class
    for (const sc of Object.values(SECRET_CLASSES)) {
      if (sc.baseClass === player.baseClass && player.power >= sc.unlockPower) {
        return sc;
      }
    }
    return null;
  }

  /**
   * Unlock a secret class for the player.
   * @param {object} player - Player state (mutated)
   * @param {string} secretClassId - ID of the secret class to unlock
   * @returns {Array} Output messages
   */
  function unlockSecretClass(player, secretClassId) {
    const sc = SECRET_CLASSES[secretClassId];
    if (!sc) return [{ type: 'error', text: 'Unknown class.' }];

    player.secretClass = secretClassId;
    player.transformTier = -1; // Not transformed
    player.transformAbilities = []; // Unlocked transform abilities

    return [
      { type: 'quest', text: '═══════════════════════════════════════' },
      { type: 'quest', text: `  SECRET CLASS UNLOCKED: ${sc.name}` },
      { type: 'quest', text: '═══════════════════════════════════════' },
      { type: 'info', text: `  ${sc.description}` },
      { type: 'info', text: '' },
      { type: 'success', text: `  Type 'transform' to access your new power.` },
      { type: 'success', text: `  Type 'class' to view your transformation tree.` }
    ];
  }

  // ─── Transformation Logic ───────────────────────────────────────────────

  /**
   * Get available transformation tiers for the player.
   * @param {object} player - Player state
   * @returns {Array} Available transformations (with unlocked flag)
   */
  function getAvailableTransforms(player) {
    if (!player.secretClass) return [];
    const sc = SECRET_CLASSES[player.secretClass];
    if (!sc) return [];

    return sc.transformations.map((t, idx) => ({
      ...t,
      tier: idx,
      unlocked: player.power >= t.powerRequired
    }));
  }

  /**
   * Attempt to transform (or ascend to next tier).
   * @param {object} player - Player state
   * @param {string|null} targetTier - Specific tier name, or null for next available
   * @returns {{ success: boolean, output: Array, tier: number }}
   */
  function doTransform(player, targetTier) {
    if (!player.secretClass) {
      return { success: false, output: [{ type: 'error', text: "You haven't unlocked a secret class yet." }], tier: -1 };
    }

    const sc = SECRET_CLASSES[player.secretClass];
    const transforms = sc.transformations;

    // If already at max tier
    if (player.transformTier >= transforms.length - 1) {
      return { success: false, output: [{ type: 'info', text: 'You are already at maximum transformation.' }], tier: player.transformTier };
    }

    // Determine target tier
    let nextTier;
    if (targetTier) {
      nextTier = transforms.findIndex(t => t.id === targetTier || t.name.toLowerCase() === targetTier.toLowerCase());
      if (nextTier === -1) {
        return { success: false, output: [{ type: 'error', text: `Unknown transformation: ${targetTier}` }], tier: player.transformTier };
      }
    } else {
      nextTier = player.transformTier + 1;
    }

    const transform = transforms[nextTier];
    if (!transform) {
      return { success: false, output: [{ type: 'error', text: 'No further transformations available.' }], tier: player.transformTier };
    }

    // Check power requirement
    if (player.power < transform.powerRequired) {
      return {
        success: false,
        output: [{ type: 'error', text: `Not enough power for ${transform.name}. Need ${transform.powerRequired}, have ${player.power}.` }],
        tier: player.transformTier
      };
    }

    // Check focus (need at least 20% to transform)
    const minFocus = Math.floor(player.maxFocus * 0.2);
    if (player.focus < minFocus) {
      return {
        success: false,
        output: [{ type: 'error', text: `Not enough focus to transform. Need at least ${minFocus}.` }],
        tier: player.transformTier
      };
    }

    // Transform!
    player.transformTier = nextTier;

    // Unlock the transformation's unique ability if not already owned
    if (transform.ability && !player.transformAbilities.includes(transform.ability.id)) {
      player.transformAbilities.push(transform.ability.id);
    }

    const output = [
      { type: 'success', text: transform.aura },
      { type: 'quest', text: `─── ${transform.name} ───` },
      { type: 'info', text: `  ATK ×${transform.atkMod} | DEF ×${transform.defMod}` },
      { type: 'info', text: `  Focus drain: ${transform.focusCostPerTick}/tick` }
    ];

    if (transform.ability) {
      output.push({ type: 'success', text: `  New ability unlocked: ${transform.ability.name}` });
    }

    return { success: true, output, tier: nextTier };
  }

  /**
   * Revert transformation (de-transform).
   * @param {object} player - Player state
   * @returns {Array} Output messages
   */
  function doDetransform(player) {
    if (!player.secretClass || player.transformTier < 0) {
      return [{ type: 'info', text: 'You are not transformed.' }];
    }

    const sc = SECRET_CLASSES[player.secretClass];
    const transform = sc.transformations[player.transformTier];
    player.transformTier = -1;

    return [{ type: 'info', text: transform?.deactivate || 'You revert to normal.' }];
  }

  /**
   * Get the current transformation modifiers (for combat calculations).
   * @param {object} player - Player state
   * @returns {{ atkMod: number, defMod: number, focusCost: number }|null}
   */
  function getTransformMods(player) {
    if (!player.secretClass || player.transformTier < 0) return null;
    const sc = SECRET_CLASSES[player.secretClass];
    if (!sc) return null;
    const transform = sc.transformations[player.transformTier];
    if (!transform) return null;
    return {
      atkMod: transform.atkMod,
      defMod: transform.defMod,
      focusCost: transform.focusCostPerTick
    };
  }

  /**
   * Process transformation focus drain (called each combat tick).
   * Returns de-transform message if focus runs out.
   * @param {object} player - Player state (mutated)
   * @returns {Array|null} Output if de-transformed, null otherwise
   */
  function tickTransformDrain(player) {
    const mods = getTransformMods(player);
    if (!mods) return null;

    player.focus -= mods.focusCost;
    if (player.focus <= 0) {
      player.focus = 0;
      const output = doDetransform(player);
      output.unshift({ type: 'error', text: 'Your focus is depleted!' });
      return output;
    }
    return null;
  }

  /**
   * Get the secret class info display (for 'class' command).
   * @param {object} player - Player state
   * @returns {Array} Output lines
   */
  function displayClassInfo(player) {
    if (!player.secretClass) {
      return [{ type: 'info', text: 'You have not unlocked a secret class. Keep growing stronger...' }];
    }

    const sc = SECRET_CLASSES[player.secretClass];
    const output = [
      { type: 'quest', text: `─── ${sc.name} ───` },
      { type: 'info', text: `  ${sc.description}` },
      { type: 'info', text: '' },
      { type: 'info', text: '  Transformation Tree:' }
    ];

    for (let i = 0; i < sc.transformations.length; i++) {
      const t = sc.transformations[i];
      const unlocked = player.power >= t.powerRequired;
      const active = player.transformTier === i;
      const prefix = active ? '  ▶ ' : unlocked ? '  ✓ ' : '  ✗ ';
      output.push({ type: unlocked ? 'success' : 'info', text: `${prefix}${t.name} (Power: ${t.powerRequired})` });
      output.push({ type: 'info', text: `      ATK ×${t.atkMod} | DEF ×${t.defMod} | Drain: ${t.focusCostPerTick}/tick` });
      if (t.ability) {
        output.push({ type: 'items', text: `      Ability: ${t.ability.name} — ${t.ability.desc}` });
      }
    }

    output.push({ type: 'info', text: '' });
    output.push({ type: 'info', text: "  Type 'transform' to power up, 'detransform' to revert." });

    return output;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudSecretClasses = {
    SECRET_CLASSES,
    checkUnlockEligibility,
    unlockSecretClass,
    getAvailableTransforms,
    doTransform,
    doDetransform,
    getTransformMods,
    tickTransformDrain,
    displayClassInfo
  };
})();
