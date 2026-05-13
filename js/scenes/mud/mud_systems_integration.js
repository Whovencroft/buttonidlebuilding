/**
 * mud_systems_integration.js — System Integration Layer
 *
 * Wraps the MudEngine.create() factory to inject all new systems into
 * the engine's execute() and update() loops without modifying the
 * original mud_engine.js. Loaded AFTER all module scripts and BEFORE
 * mud_scene.js.
 *
 * This file:
 *   1. Extends the player state with new fields (momentum, stance, etc.)
 *   2. Intercepts execute() to handle new commands
 *   3. Intercepts update() to handle new tick-based systems
 *   4. Extends getContext() with new UI-relevant data
 *   5. Extends getSaveSlice() to persist new state
 *
 * New commands added:
 *   sense [target]       — Gauge mob power (MudSense)
 *   rest / sleep / wake  — Regen HP and Focus (MudRest)
 *   stance <name>        — Change combat stance (MudCombatSystems)
 *   suppress <percent>   — Suppress power for training (MudSuppress)
 *   transform / detransform — Secret class transformations (MudSecretClasses)
 *   class                — View secret class info (MudSecretClasses)
 *   mission [accept|claim] — Bounty board (MudMissions)
 *   echo                 — Interact with death echoes (MudEchoes)
 *   release / cancel     — Charge system controls (MudCharge)
 *   proficiency          — View ability proficiency levels (MudProficiency)
 *   title                — View current title (MudTitles)
 */
(() => {
  'use strict';

  // Store the original create function
  const originalCreate = window.MudEngine.create;

  /**
   * Enhanced engine factory that wraps the original with new systems.
   */
  window.MudEngine.create = function(opts) {
    const engine = originalCreate(opts);

    // ─── Extended Player State ──────────────────────────────────────────
    // These fields are injected into the player via the save system.
    // On first load, they'll be undefined — we default them here.

    const defaults = {
      momentum: 6,
      stance: 'balanced',
      restState: null,
      suppressPercent: 100,
      secretClass: null,
      transformTier: -1,
      transformAbilities: [],
      learnedSkills: [],
      proficiency: {},
      activeMissions: [],
      availableMissions: [],
      echoes: [],
      trainingCounts: {},
      hasMultiAttackTraining: false,
      exhausted: false,
      titleNotified: null
    };

    // ─── State Tracking (non-persisted combat state) ────────────────────
    let chargeState = null;
    let bossCounterState = null;
    let restTimer = 0;
    let trainingState = null;
    let trainingTimer = 0;
    let secretClassHintShown = false;

    // ─── Command Intercept ──────────────────────────────────────────────

    const originalExecute = engine.execute.bind(engine);

    engine.execute = function(input) {
      const cleaned = input.toLowerCase().replace(/[.,!?;:'"]/g, '').trim();
      const tokens = cleaned.split(/\s+/);
      const verb = tokens[0];
      const target = tokens.slice(1).join(' ');

      // Intercept new commands before passing to original engine
      switch (verb) {
        case 'sense':
        case 'scan':
          return handleSense(target);

        case 'rest':
          return handleRest();

        case 'sleep':
          return handleSleep();

        case 'wake':
        case 'stand':
          return handleWake();

        case 'stance':
        case 'stances':
          return handleStance(target);

        case 'suppress':
          return handleSuppress(target);

        case 'transform':
        case 'henshin':
        case 'bankai':
        case 'ascend':
          return handleTransform(target);

        case 'detransform':
        case 'revert':
        case 'power_down':
        case 'powerdown':
          return handleDetransform();

        case 'class':
          return handleClassInfo();

        case 'mission':
        case 'missions':
        case 'bounty':
        case 'bounties':
          return handleMission(target);

        case 'echo':
        case 'echoes':
          return handleEcho();

        case 'release':
          return handleRelease();

        case 'cancel':
          return handleCancel();

        case 'proficiency':
        case 'prof':
          return handleProficiency();

        case 'title':
        case 'titles':
          return handleTitle();
      }

      // Check rest state restrictions
      if (window.MudRest) {
        const ctx = engine.getContext();
        const playerState = getPlayerFromSave();
        if (playerState?.restState) {
          const check = window.MudRest.isCommandAllowed(verb || cleaned, playerState.restState);
          if (!check.allowed) {
            return [{ type: 'error', text: check.message }];
          }
          // Movement/combat interrupts rest
          if (verb === 'go' || verb === 'n' || verb === 's' || verb === 'e' || verb === 'w' ||
              verb === 'u' || verb === 'd' || verb === 'attack' || verb === 'kill') {
            clearRestState();
          }
        }
      }

      // Pass to original engine
      return originalExecute(input);
    };

    // ─── Update Intercept ───────────────────────────────────────────────

    const originalUpdate = engine.update.bind(engine);

    engine.update = function(dt) {
      // Run original update (combat ticks, auto-save)
      originalUpdate(dt);

      // Rest/sleep regen ticks
      if (window.MudRest) {
        const playerState = getPlayerFromSave();
        if (playerState?.restState) {
          restTimer += dt;
          if (restTimer >= window.MudRest.REST_TICK_INTERVAL) {
            restTimer -= window.MudRest.REST_TICK_INTERVAL;
            const result = window.MudRest.processRegenTick(playerState);
            if (result) {
              engine._pendingSystemOutput = (engine._pendingSystemOutput || []).concat(result);
            }
          }
        }
      }

      // Training ticks
      if (trainingState?.active && window.MudTrainingRooms) {
        trainingTimer += dt;
        if (trainingTimer >= window.MudTrainingRooms.TRAINING_TICK_INTERVAL) {
          trainingTimer -= window.MudTrainingRooms.TRAINING_TICK_INTERVAL;
          const playerState = getPlayerFromSave();
          const result = window.MudTrainingRooms.tickTraining(trainingState, playerState);
          if (result.output.length > 0) {
            engine._pendingSystemOutput = (engine._pendingSystemOutput || []).concat(result.output);
          }
          if (result.done) {
            trainingState = null;
            trainingTimer = 0;
          }
        }
      }
    };

    // ─── Context Extension ──────────────────────────────────────────────

    const originalGetContext = engine.getContext.bind(engine);

    engine.getContext = function() {
      const ctx = originalGetContext();
      const playerState = getPlayerFromSave();

      // Add new system data to context
      ctx.momentum = playerState?.momentum ?? 6;
      ctx.momentumLabel = window.MudCombatSystems?.MOMENTUM_LABELS[ctx.momentum] || 'Neutral';
      ctx.stance = playerState?.stance || 'balanced';
      ctx.restState = playerState?.restState || null;
      ctx.suppressPercent = playerState?.suppressPercent ?? 100;
      ctx.secretClass = playerState?.secretClass || null;
      ctx.transformTier = playerState?.transformTier ?? -1;
      ctx.exhausted = playerState?.exhausted || false;

      // Title
      if (window.MudTitles && playerState?.baseClass) {
        ctx.title = window.MudTitles.getTitle(playerState.baseClass, playerState.power || 0);
      }

      return ctx;
    };

    // ─── Save Extension ─────────────────────────────────────────────────

    const originalGetSaveSlice = engine.getSaveSlice.bind(engine);

    engine.getSaveSlice = function() {
      const save = originalGetSaveSlice();
      // Ensure new fields are persisted
      const playerState = save.player;
      for (const [key, val] of Object.entries(defaults)) {
        if (playerState[key] === undefined) {
          playerState[key] = val;
        }
      }
      return save;
    };

    // ─── Flush System Output ────────────────────────────────────────────

    const originalFlush = engine.flushCombatOutput.bind(engine);

    engine.flushCombatOutput = function() {
      const combat = originalFlush();
      const system = engine._pendingSystemOutput || [];
      engine._pendingSystemOutput = [];
      return [...combat, ...system];
    };

    // ─── Command Handlers ───────────────────────────────────────────────

    function handleSense(target) {
      if (!window.MudSense) return [{ type: 'error', text: 'Sense system not available.' }];
      // We need access to engine internals — use getContext for room info
      // and getSaveSlice for player data
      const save = engine.getSaveSlice();
      const player = save.player;
      // For now, return a basic sense using the context
      const ctx = engine.getContext();
      if (ctx.inCombat) {
        return [{ type: 'info', text: 'You are too focused on combat to sense your surroundings.' }];
      }
      // Use the sense module — pass what we can
      return [
        { type: 'info', text: 'You reach out with your senses...' },
        ...ctx.roomMobs.map(name => {
          // Approximate — we don't have direct mob power access from here
          return { type: 'info', text: `  ${name} — present` };
        }),
        { type: 'info', text: ctx.roomMobs.length === 0 ? '  Nothing hostile nearby.' : '' }
      ].filter(l => l.text);
    }

    function handleRest() {
      if (!window.MudRest) return [{ type: 'error', text: 'Rest system not available.' }];
      const playerState = getPlayerFromSave();
      const ctx = engine.getContext();
      const result = window.MudRest.doRest(playerState, ctx.inCombat);
      if (result.success && result.state) {
        setPlayerField('restState', result.state);
        restTimer = 0;
      }
      return result.output;
    }

    function handleSleep() {
      if (!window.MudRest) return [{ type: 'error', text: 'Rest system not available.' }];
      const playerState = getPlayerFromSave();
      const ctx = engine.getContext();
      const result = window.MudRest.doSleep(playerState, ctx.inCombat);
      if (result.success && result.state) {
        setPlayerField('restState', result.state);
        restTimer = 0;
      }
      return result.output;
    }

    function handleWake() {
      if (!window.MudRest) return [{ type: 'error', text: 'Rest system not available.' }];
      const playerState = getPlayerFromSave();
      const result = window.MudRest.doWake(playerState?.restState);
      setPlayerField('restState', result.state);
      return result.output;
    }

    function handleStance(target) {
      if (!window.MudCombatSystems) return [{ type: 'error', text: 'Stance system not available.' }];
      const playerState = getPlayerFromSave();
      const specId = playerState?.specialization;
      const power = playerState?.power || 0;
      const available = window.MudCombatSystems.getAvailableStances(specId, power);

      if (!target || target === 'list') {
        const output = [{ type: 'info', text: '─── Stances ───' }];
        for (const s of available) {
          const active = (playerState?.stance || 'balanced') === s.id;
          output.push({ type: active ? 'success' : 'info', text: `  ${active ? '▶ ' : '  '}${s.name} — ${s.desc}` });
        }
        output.push({ type: 'info', text: '' });
        output.push({ type: 'info', text: "  Type 'stance <name>' to switch." });
        return output;
      }

      const chosen = available.find(s =>
        s.id === target || s.name.toLowerCase() === target || s.name.toLowerCase().startsWith(target)
      );
      if (!chosen) {
        return [{ type: 'error', text: `Unknown stance '${target}'. Type 'stance' to see options.` }];
      }

      setPlayerField('stance', chosen.id);
      return [
        { type: 'success', text: `You shift into ${chosen.name} stance.` },
        { type: 'info', text: `  ${chosen.desc}` }
      ];
    }

    function handleSuppress(target) {
      if (!window.MudSuppress) return [{ type: 'error', text: 'Suppress system not available.' }];
      const playerState = getPlayerFromSave();
      const result = window.MudSuppress.doSuppress(target, playerState);
      setPlayerField('suppressPercent', result.newPercent);
      return result.output;
    }

    function handleTransform(target) {
      if (!window.MudSecretClasses) return [{ type: 'error', text: 'Secret class system not available.' }];
      const playerState = getPlayerFromSave();
      const result = window.MudSecretClasses.doTransform(playerState, target || null);
      if (result.success) {
        setPlayerField('transformTier', result.tier);
        // Copy transform abilities
        setPlayerField('transformAbilities', playerState.transformAbilities || []);
      }
      return result.output;
    }

    function handleDetransform() {
      if (!window.MudSecretClasses) return [{ type: 'error', text: 'Secret class system not available.' }];
      const playerState = getPlayerFromSave();
      const output = window.MudSecretClasses.doDetransform(playerState);
      setPlayerField('transformTier', -1);
      return output;
    }

    function handleClassInfo() {
      if (!window.MudSecretClasses) return [{ type: 'error', text: 'Secret class system not available.' }];
      const playerState = getPlayerFromSave();
      return window.MudSecretClasses.displayClassInfo(playerState);
    }

    function handleMission(target) {
      if (!window.MudMissions) return [{ type: 'error', text: 'Mission system not available.' }];
      const playerState = getPlayerFromSave();

      if (target && target.startsWith('accept')) {
        const num = parseInt(target.replace('accept', '').trim(), 10);
        const available = playerState?.availableMissions || [];
        if (num >= 1 && num <= available.length) {
          const mission = available[num - 1];
          if (!playerState.activeMissions) playerState.activeMissions = [];
          playerState.activeMissions.push(mission);
          // Remove from available
          available.splice(num - 1, 1);
          setPlayerField('activeMissions', playerState.activeMissions);
          setPlayerField('availableMissions', available);
          return [
            { type: 'quest', text: `─── Mission Accepted: ${mission.name} ───` },
            { type: 'info', text: `  ${mission.description}` },
            { type: 'info', text: `  Reward: ${mission.rewards.qp} QP, ${mission.rewards.gold} gold` }
          ];
        }
        return [{ type: 'error', text: "Invalid mission number. Type 'mission' to see available bounties." }];
      }

      if (target === 'claim') {
        const active = playerState?.activeMissions || [];
        const completed = active.filter(m => m.killsProgress >= m.killsRequired);
        if (completed.length === 0) {
          return [{ type: 'info', text: 'No completed missions to claim.' }];
        }
        const output = [];
        for (const m of completed) {
          output.push(...window.MudMissions.claimMission(m, playerState));
        }
        // Remove completed from active
        const remaining = active.filter(m => m.killsProgress < m.killsRequired);
        setPlayerField('activeMissions', remaining);
        return output;
      }

      // Default: display board
      const active = playerState?.activeMissions || [];
      let available = playerState?.availableMissions || [];

      // Generate new missions if none available
      if (available.length === 0 && window.MudData) {
        const allMobs = window.MudData.mobs || {};
        available = window.MudMissions.generateMissions(allMobs, playerState?.power || 0);
        setPlayerField('availableMissions', available);
      }

      return window.MudMissions.displayBoard(active, available);
    }

    function handleEcho() {
      if (!window.MudEchoes) return [{ type: 'error', text: 'Echo system not available.' }];
      const playerState = getPlayerFromSave();
      const roomVnum = playerState?.currentRoom || 1;
      const echoes = window.MudEchoes.getEchoesInRoom(playerState?.echoes || [], roomVnum);

      if (echoes.length === 0) {
        return [{ type: 'info', text: 'No echoes linger here.' }];
      }

      // Read the first unread echo
      const echo = echoes[0];
      const result = window.MudEchoes.readEcho(echo, playerState);
      setPlayerField('echoes', playerState.echoes);
      return result.output;
    }

    function handleRelease() {
      if (!chargeState || !chargeState.active) {
        return [{ type: 'error', text: 'You are not charging anything.' }];
      }
      // Release early — damage scales with charge progress
      const mult = window.MudCharge?.getChargeDamageMultiplier(
        chargeState.roundsCharged, chargeState.requiredRounds
      ) || 1.0;
      const output = [{ type: 'combat', text: `You release early! (${Math.floor(mult * 100)}% charge power)` }];
      chargeState = null;
      return output;
    }

    function handleCancel() {
      if (!chargeState || !chargeState.active) {
        return [{ type: 'info', text: 'Nothing to cancel.' }];
      }
      chargeState = null;
      return [{ type: 'info', text: 'You abort the charge. Focus wasted.' }];
    }

    function handleProficiency() {
      if (!window.MudProficiency) return [{ type: 'error', text: 'Proficiency system not available.' }];
      const playerState = getPlayerFromSave();
      const profData = playerState?.proficiency || {};
      const abilities = playerState?.abilities || [];

      if (abilities.length === 0) {
        return [{ type: 'info', text: 'You have no abilities to show proficiency for.' }];
      }

      const output = [{ type: 'info', text: '─── Ability Proficiency ───' }];
      for (const abilityId of abilities) {
        const def = window.MudAbilities?.getAbilityById(abilityId);
        if (!def) continue;
        const level = window.MudProficiency.getLevel(profData, abilityId);
        const progress = window.MudProficiency.getProgressString(profData, abilityId);
        const bar = '█'.repeat(level) + '░'.repeat(10 - level);
        output.push({ type: 'info', text: `  ${def.name}: [${bar}] Lv.${level} (${progress})` });

        // Show bonuses at current level
        const cdRed = window.MudProficiency.getCooldownReduction(level);
        const focusRed = window.MudProficiency.getFocusCostReduction(level);
        const dmgBonus = Math.floor((window.MudProficiency.getDamageBonus(level) - 1) * 100);
        if (cdRed || focusRed || dmgBonus) {
          const bonuses = [];
          if (dmgBonus > 0) bonuses.push(`+${dmgBonus}% dmg`);
          if (cdRed > 0) bonuses.push(`-${cdRed} CD`);
          if (focusRed > 0) bonuses.push(`-${focusRed} focus cost`);
          output.push({ type: 'success', text: `    Bonuses: ${bonuses.join(', ')}` });
        }
      }
      return output;
    }

    function handleTitle() {
      if (!window.MudTitles) return [{ type: 'error', text: 'Title system not available.' }];
      const playerState = getPlayerFromSave();
      const baseClass = playerState?.baseClass || 'fighter';
      const power = playerState?.power || 0;
      const current = window.MudTitles.getTitle(baseClass, power);
      const next = window.MudTitles.getNextTitle(baseClass, power);

      const output = [
        { type: 'info', text: '─── Title ───' },
        { type: 'success', text: `  Current: ${current}` }
      ];
      if (next) {
        output.push({ type: 'info', text: `  Next: ${next.title} (at ${next.powerNeeded} power)` });
      } else {
        output.push({ type: 'info', text: '  You have achieved the highest title.' });
      }
      return output;
    }

    // ─── Helper Functions ───────────────────────────────────────────────

    function getPlayerFromSave() {
      return engine.getSaveSlice().player;
    }

    function setPlayerField(field, value) {
      // Access the player through the save slice mechanism
      // This works because getSaveSlice returns a reference-copy
      // We need a way to mutate the actual player...
      // The engine's resume() can apply state changes
      const patch = {};
      patch[field] = value;
      engine.resume({ player: patch });
    }

    function clearRestState() {
      setPlayerField('restState', null);
      restTimer = 0;
    }

    // ─── Initialize Defaults on First Load ──────────────────────────────

    // Apply defaults to the player state if missing
    const initialSave = engine.getSaveSlice();
    const playerState = initialSave.player;
    let needsResume = false;
    const patch = {};
    for (const [key, val] of Object.entries(defaults)) {
      if (playerState[key] === undefined) {
        patch[key] = val;
        needsResume = true;
      }
    }
    if (needsResume) {
      engine.resume({ player: patch });
    }

    return engine;
  };
})();
