/**
 * mud_systems_integration.js — System Integration Layer (v2)
 *
 * Registers all new system commands with the unified MudCommands registry
 * and adds middleware hooks for rest-state blocking, exhaustion, and
 * proficiency tracking. No longer intercepts execute() directly.
 *
 * This file wraps MudEngine.create() to:
 *   1. Extend the player state with new fields (momentum, stance, etc.)
 *   2. Register new commands via MudCommands.register()
 *   3. Register before/after middleware
 *   4. Extend update() for tick-based systems (rest, training)
 *   5. Extend getContext() with new UI-relevant data
 *   6. Extend getSaveSlice() to persist new state
 *
 * New commands registered:
 *   sense, rest, sleep, wake, stance, suppress, transform, detransform,
 *   class, mission, echo, release, cancel, proficiency, title
 */
(() => {
  'use strict';

  const previousCreate = window.MudEngine.create;

  window.MudEngine.create = function(opts) {
    const engine = previousCreate(opts);

    // ─── Extended Player State Defaults ─────────────────────────────────
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
      titleNotified: null,
      invasionState: null,
      coreStats: null
    };

    // ─── Non-persisted State ────────────────────────────────────────────
    let chargeState = null;
    let restTimer = 0;
    let trainingState = null;
    let trainingTimer = 0;
    let ghostFetchCooldown = 0;
    let lastRoomForGhosts = null;

    // ─── Helper Functions ───────────────────────────────────────────────

    /** Get player state from save slice (read-only snapshot). */
    function getPlayerFromSave() {
      return engine.getSaveSlice().player;
    }

    /** Set a single player field via resume(). */
    function setPlayerField(field, value) {
      const patch = {};
      patch[field] = value;
      engine.resume({ player: patch });
    }

    /** Clear rest state. */
    function clearRestState() {
      setPlayerField('restState', null);
      restTimer = 0;
    }

    /** Get or initialize invasion state from player data. */
    function getInvasionState() {
      const playerState = getPlayerFromSave();
      if (!window.MudInvasions) return null;
      return window.MudInvasions.loadInvasionState(playerState?.invasionState);
    }

    /** Persist invasion state changes. */
    function saveInvasionState(state) {
      setPlayerField('invasionState', state);
    }

    /**
     * Fetch ghosts for the current room and potentially trigger an invasion.
     * Called asynchronously on room entry (does not block movement).
     */
    function fetchGhostsAndCheckInvasion() {
      if (!window.MudAPI?.isLoggedIn()) return;
      if (!window.MudInvasions) return;

      const playerState = getPlayerFromSave();
      const roomVnum = playerState?.currentRoom;
      if (!roomVnum) return;

      // Avoid re-fetching for the same room
      if (roomVnum === lastRoomForGhosts) return;
      lastRoomForGhosts = roomVnum;

      const invasionState = getInvasionState();
      if (!invasionState) return;

      // Check if player entered a safe zone — reset kill streak
      const room = engine._internals.currentRoom();
      if (window.MudInvasions.isSafeZone(room)) {
        if (invasionState.killStreakSinceSafe > 0) {
          invasionState.killStreakSinceSafe = 0;
          saveInvasionState(invasionState);
          engine._pendingSystemOutput = (engine._pendingSystemOutput || []).concat([
            { type: 'info', text: 'You feel the tension ease as you enter safe ground.' }
          ]);
        }
        return;
      }

      // Async fetch ghosts
      window.MudAPI.getGhosts(roomVnum).then(ghosts => {
        if (!ghosts || ghosts.length === 0) return;
        const output = [];

        // Display ghost flavor text (up to 3)
        const displayed = ghosts.slice(0, 3);
        for (const g of displayed) {
          const actionText = {
            move: 'passed through here',
            attack: 'fought something here',
            flee: 'fled from here',
            train: 'trained here',
            buy: 'traded here',
            look: 'examined this place',
            quest: 'completed a task here'
          }[g.action] || 'lingered here';
          output.push({ type: 'ghost', text: `  A faint shimmer... the ghost of ${g.username} ${actionText}.` });
        }

        // Roll for invasion on each ghost
        const ctx = engine.getContext();
        for (const ghost of ghosts) {
          if (window.MudInvasions.shouldInvade({
            invasionState,
            room,
            inCombat: ctx.inCombat,
            isBossFight: false
          })) {
            // Trigger invasion!
            output.push(...window.MudInvasions.getInvasionAnnouncement(ghost.username));

            // Generate echo mob scaled to player
            const echoMob = window.MudInvasions.generateEchoMob(ghost, playerState, null);

            // Inject into the mobs registry so combat can find it
            engine._internals.mobs[echoMob.vnum] = echoMob;

            // Mark invasion time
            invasionState.lastInvasionTime = Date.now();
            saveInvasionState(invasionState);

            // Try to load ghost player's save for spec abilities (async, best-effort)
            // For now, initiate combat immediately with fallback stats
            output.push(...engine._internals.initiateCombat(echoMob.vnum));
            break; // Only one invasion per room entry
          }
        }

        if (output.length > 0) {
          engine._pendingSystemOutput = (engine._pendingSystemOutput || []).concat(output);
        }
      }).catch(() => {
        // Ghost fetch failed silently — no invasion
      });
    }

    // ─── Register Commands ──────────────────────────────────────────────

    window.MudCommands.registerAll([
      {
        name: 'stats',
        aliases: ['attributes', 'attr'],
        category: 'Info',
        help: 'View your core attributes and derived stats',
        usage: 'stats',
        handler: () => {
          if (!window.MudStats) return [{ type: 'error', text: 'Stat system not available.' }];
          const playerState = getPlayerFromSave();
          if (!playerState.coreStats) {
            return [{ type: 'info', text: 'Your attributes have not yet awakened.' }];
          }
          return window.MudStats.formatStatDisplay(playerState.coreStats, playerState.power || 0);
        }
      },
      {
        name: 'sense',
        aliases: ['scan'],
        category: 'Awareness',
        help: 'Gauge creature strength',
        usage: 'sense [target]',
        requires: { noCombat: true },
        handler: (parsed) => {
          if (!window.MudSense) return [{ type: 'error', text: 'Sense system not available.' }];
          const ctx = engine.getContext();
          return [
            { type: 'info', text: 'You reach out with your senses...' },
            ...ctx.roomMobs.map(name => ({ type: 'info', text: `  ${name} — present` })),
            ...(ctx.roomMobs.length === 0 ? [{ type: 'info', text: '  Nothing hostile nearby.' }] : [])
          ];
        }
      },
      {
        name: 'rest',
        aliases: [],
        category: 'Recovery',
        help: 'Sit and recover HP and Focus',
        usage: 'rest',
        requires: { noCombat: true },
        handler: () => {
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
      },
      {
        name: 'sleep',
        aliases: [],
        category: 'Recovery',
        help: 'Sleep for faster recovery',
        usage: 'sleep',
        requires: { noCombat: true },
        handler: () => {
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
      },
      {
        name: 'wake',
        aliases: ['stand'],
        category: 'Recovery',
        help: 'Stand up from rest',
        usage: 'wake',
        handler: () => {
          if (!window.MudRest) return [{ type: 'error', text: 'Rest system not available.' }];
          const playerState = getPlayerFromSave();
          const result = window.MudRest.doWake(playerState?.restState);
          setPlayerField('restState', result.state);
          return result.output;
        }
      },
      {
        name: 'stance',
        aliases: ['stances'],
        category: 'Combat',
        help: 'View or change combat stance',
        usage: 'stance [name]',
        handler: (parsed) => {
          if (!window.MudCombatSystems) return [{ type: 'error', text: 'Stance system not available.' }];
          const playerState = getPlayerFromSave();
          const specId = playerState?.specialization;
          const power = playerState?.power || 0;
          const available = window.MudCombatSystems.getAvailableStances(specId, power);

          if (!parsed.target) {
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
            s.id === parsed.target || s.name.toLowerCase() === parsed.target ||
            s.name.toLowerCase().startsWith(parsed.target)
          );
          if (!chosen) {
            return [{ type: 'error', text: `Unknown stance '${parsed.target}'. Type 'stance' to see options.` }];
          }
          setPlayerField('stance', chosen.id);
          return [
            { type: 'success', text: `You shift into ${chosen.name} stance.` },
            { type: 'info', text: `  ${chosen.desc}` }
          ];
        }
      },
      {
        name: 'suppress',
        aliases: [],
        category: 'Awareness',
        help: 'Suppress power for training bonus',
        usage: 'suppress <percent>',
        handler: (parsed) => {
          if (!window.MudSuppress) return [{ type: 'error', text: 'Suppress system not available.' }];
          const playerState = getPlayerFromSave();
          const result = window.MudSuppress.doSuppress(parsed.target, playerState);
          setPlayerField('suppressPercent', result.newPercent);
          return result.output;
        }
      },
      {
        name: 'transform',
        aliases: ['henshin', 'bankai', 'ascend'],
        category: 'Secret Class',
        help: 'Activate transformation (secret class)',
        usage: 'transform',
        handler: (parsed) => {
          if (!window.MudSecretClasses) return [{ type: 'error', text: 'Secret class system not available.' }];
          const playerState = getPlayerFromSave();
          const result = window.MudSecretClasses.doTransform(playerState, parsed.target || null);
          if (result.success) {
            setPlayerField('transformTier', result.tier);
            setPlayerField('transformAbilities', playerState.transformAbilities || []);
          }
          return result.output;
        }
      },
      {
        name: 'detransform',
        aliases: ['revert', 'powerdown'],
        category: 'Secret Class',
        help: 'Revert transformation',
        usage: 'detransform',
        handler: () => {
          if (!window.MudSecretClasses) return [{ type: 'error', text: 'Secret class system not available.' }];
          const playerState = getPlayerFromSave();
          const output = window.MudSecretClasses.doDetransform(playerState);
          setPlayerField('transformTier', -1);
          return output;
        }
      },
      {
        name: 'class',
        aliases: [],
        category: 'Secret Class',
        help: 'View secret class info',
        usage: 'class',
        handler: () => {
          if (!window.MudSecretClasses) return [{ type: 'error', text: 'Secret class system not available.' }];
          const playerState = getPlayerFromSave();
          return window.MudSecretClasses.displayClassInfo(playerState);
        }
      },
      {
        name: 'mission',
        aliases: ['missions', 'bounty', 'bounties'],
        category: 'Progression',
        help: 'View bounty board',
        usage: 'mission [accept|claim]',
        subcommands: {
          accept: (parsed) => {
            if (!window.MudMissions) return [{ type: 'error', text: 'Mission system not available.' }];
            const playerState = getPlayerFromSave();
            const num = parseInt(parsed.subTarget, 10);
            const available = playerState?.availableMissions || [];
            if (num >= 1 && num <= available.length) {
              const mission = available[num - 1];
              if (!playerState.activeMissions) playerState.activeMissions = [];
              playerState.activeMissions.push(mission);
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
          },
          claim: () => {
            if (!window.MudMissions) return [{ type: 'error', text: 'Mission system not available.' }];
            const playerState = getPlayerFromSave();
            const active = playerState?.activeMissions || [];
            const completed = active.filter(m => m.killsProgress >= m.killsRequired);
            if (completed.length === 0) {
              return [{ type: 'info', text: 'No completed missions to claim.' }];
            }
            const output = [];
            for (const m of completed) {
              output.push(...window.MudMissions.claimMission(m, playerState));
            }
            const remaining = active.filter(m => m.killsProgress < m.killsRequired);
            setPlayerField('activeMissions', remaining);
            return output;
          }
        },
        handler: (parsed) => {
          if (!window.MudMissions) return [{ type: 'error', text: 'Mission system not available.' }];
          const playerState = getPlayerFromSave();
          let available = playerState?.availableMissions || [];
          if (available.length === 0 && window.MudData) {
            const allMobs = window.MudData.mobs || {};
            available = window.MudMissions.generateMissions(allMobs, playerState?.power || 0);
            setPlayerField('availableMissions', available);
          }
          const active = playerState?.activeMissions || [];
          return window.MudMissions.displayBoard(active, available);
        }
      },
      {
        name: 'echo',
        aliases: ['echoes'],
        category: 'Awareness',
        help: 'Interact with death echoes',
        usage: 'echo',
        handler: () => {
          if (!window.MudEchoes) return [{ type: 'error', text: 'Echo system not available.' }];
          const playerState = getPlayerFromSave();
          const roomVnum = playerState?.currentRoom || 1;
          const echoes = window.MudEchoes.getEchoesInRoom(playerState?.echoes || [], roomVnum);
          if (echoes.length === 0) {
            return [{ type: 'info', text: 'No echoes linger here.' }];
          }
          const echo = echoes[0];
          const result = window.MudEchoes.readEcho(echo, playerState);
          setPlayerField('echoes', playerState.echoes);
          return result.output;
        }
      },
      {
        name: 'release',
        aliases: [],
        category: 'Combat',
        help: 'Release a charged ability early',
        usage: 'release',
        requires: { combat: true },
        handler: () => {
          if (!chargeState || !chargeState.active) {
            return [{ type: 'error', text: 'You are not charging anything.' }];
          }
          const mult = window.MudCharge?.getChargeDamageMultiplier(
            chargeState.roundsCharged, chargeState.requiredRounds
          ) || 1.0;
          const output = [{ type: 'combat', text: `You release early! (${Math.floor(mult * 100)}% charge power)` }];
          chargeState = null;
          return output;
        }
      },
      {
        name: 'cancel',
        aliases: [],
        category: 'Combat',
        help: 'Cancel a charging ability',
        usage: 'cancel',
        handler: () => {
          if (!chargeState || !chargeState.active) {
            return [{ type: 'info', text: 'Nothing to cancel.' }];
          }
          chargeState = null;
          return [{ type: 'info', text: 'You abort the charge. Focus wasted.' }];
        }
      },
      {
        name: 'proficiency',
        aliases: ['prof'],
        category: 'Progression',
        help: 'View ability mastery levels',
        usage: 'proficiency',
        handler: () => {
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
      },
      {
        name: 'title',
        aliases: ['titles'],
        category: 'Progression',
        help: 'View your current title',
        usage: 'title',
        handler: () => {
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
      }
    ]);

    // ─── Middleware: Rest State Blocking ─────────────────────────────────
    window.MudCommands.before((parsed, context) => {
      if (!window.MudRest) return null;
      const playerState = getPlayerFromSave();
      if (!playerState?.restState) return null;

      // Allow rest-related commands through
      const allowed = ['wake', 'stand', 'rest', 'sleep', 'look', 'help', 'status',
                       'inventory', 'equipment', 'abilities', 'proficiency', 'title',
                       'quest', 'mission', 'echo', 'sense', 'stance'];
      if (allowed.includes(parsed.verb)) return null;

      // Movement or combat interrupts rest
      const interruptors = ['go', 'attack', 'flee'];
      if (interruptors.includes(parsed.verb)) {
        clearRestState();
        return null; // Allow the command to proceed after clearing rest
      }

      // Block other commands while resting
      return [{ type: 'error', text: 'You are resting. Type "wake" to stand up first.' }];
    });

    // ─── Middleware: Exhaustion Check ───────────────────────────────────
    window.MudCommands.before((parsed, context) => {
      if (!window.MudCombatSystems) return null;
      const playerState = getPlayerFromSave();
      if (!playerState?.exhausted) return null;

      // Block combat abilities when exhausted
      const combatOnly = ['attack', 'release'];
      if (combatOnly.includes(parsed.verb)) {
        return [{ type: 'error', text: 'You are exhausted! Rest to recover before fighting.' }];
      }
      return null;
    });

    // ─── After-Middleware: Invasion Kill Streak & Karma ────────────────
    window.MudCommands.after((parsed, context, result) => {
      if (!window.MudInvasions) return;
      if (parsed.verb !== 'attack') return;

      // Check if the attack command resulted in a kill (look for defeat text)
      const hasKill = result && result.some(msg =>
        msg.text && msg.text.includes('has been defeated')
      );
      if (!hasKill) return;

      const invasionState = getInvasionState();
      if (!invasionState) return;

      // Check if we killed an echo invasion mob
      const isEchoKill = result.some(msg =>
        msg.text && msg.text.includes('INVASION DEFEATED')
      );

      if (isEchoKill) {
        // Echo invasion kill — rewards already handled by combat
        invasionState.invasionKills += 1;
        saveInvasionState(invasionState);
        return;
      }

      // Check if we killed a friendly NPC (karma penalty)
      const playerState = getPlayerFromSave();
      const room = engine._internals.currentRoom();
      const roomMobs = (room?.mob_spawns || room?.mobs || []);
      // We can't easily tell which mob was killed from here,
      // but the handleMobKill already ran. Track kill streak regardless.
      window.MudInvasions.recordMobKill(invasionState);
      saveInvasionState(invasionState);
    });

    // ─── NPC Kill Karma Hook ────────────────────────────────────────────
    // Wrap handleMobKill to detect friendly NPC kills and apply karma.
    const originalHandleMobKill = engine._internals.handleMobKill;
    engine._internals.handleMobKill = function(mob) {
      const output = originalHandleMobKill(mob);

      if (window.MudInvasions && window.MudInvasions.isFriendlyNpc(mob)) {
        const invasionState = getInvasionState();
        if (invasionState) {
          const karmaOutput = window.MudInvasions.recordNpcKill(invasionState);
          saveInvasionState(invasionState);
          output.push(...karmaOutput);
        }
      }

      // Handle echo invasion kill rewards
      if (mob.isEchoInvasion && window.MudInvasions) {
        const playerState = getPlayerFromSave();
        const rewards = window.MudInvasions.calculateInvasionRewards(mob, playerState);
        output.push(...rewards.output);
        setPlayerField('power', (playerState.power || 0) + rewards.powerGain);
        if (rewards.itemDrop && playerState.inventory.length < 99) {
          const inv = [...(playerState.inventory || []), rewards.itemDrop];
          setPlayerField('inventory', inv);
        }

        // Create notification for the ghost player (stored locally for now)
        const notification = window.MudInvasions.createInvasionNotification(
          playerState.specName || 'Unknown',
          false,
          mob.echoUsername
        );
        // Store notification via API if available
        if (window.MudAPI?.isLoggedIn()) {
          window.MudAPI.recordGhost(playerState.currentRoom, 'invasion_defeat', mob.echoUsername).catch(() => {});
        }

        // Clean up temporary echo mob from registry
        delete engine._internals.mobs[mob.vnum];
      }

      return output;
    };

    // ─── Update Intercept (tick-based systems) ──────────────────────────
    const originalUpdate = engine.update.bind(engine);

    engine.update = function(dt) {
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

      // Ghost fetch and invasion check on room change
      if (window.MudInvasions) {
        const playerState = getPlayerFromSave();
        if (playerState?.currentRoom !== lastRoomForGhosts) {
          fetchGhostsAndCheckInvasion();
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

      ctx.momentum = playerState?.momentum ?? 6;
      ctx.momentumLabel = window.MudCombatSystems?.MOMENTUM_LABELS?.[ctx.momentum] || 'Neutral';
      ctx.stance = playerState?.stance || 'balanced';
      ctx.restState = playerState?.restState || null;
      ctx.suppressPercent = playerState?.suppressPercent ?? 100;
      ctx.secretClass = playerState?.secretClass || null;
      ctx.transformTier = playerState?.transformTier ?? -1;
      ctx.exhausted = playerState?.exhausted || false;

      if (window.MudTitles && playerState?.baseClass) {
        ctx.title = window.MudTitles.getTitle(playerState.baseClass, playerState.power || 0);
      }

      // Core stats context
      if (window.MudStats && playerState?.coreStats) {
        ctx.coreStats = playerState.coreStats;
        ctx.derived = window.MudStats.computeDerived(playerState.coreStats, playerState.power || 0);
      }

      // Invasion context
      if (window.MudInvasions) {
        const invState = window.MudInvasions.loadInvasionState(playerState?.invasionState);
        ctx.invasionChance = window.MudInvasions.getInvasionChanceText(invState);
        ctx.killStreakSinceSafe = invState.killStreakSinceSafe;
        ctx.karmaDebt = invState.karmaDebt;
        ctx.invasionKills = invState.invasionKills;
      }

      return ctx;
    };

    // ─── Save Extension ─────────────────────────────────────────────────
    const originalGetSaveSlice = engine.getSaveSlice.bind(engine);

    engine.getSaveSlice = function() {
      const save = originalGetSaveSlice();
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

    // ─── Initialize Defaults on First Load ──────────────────────────────
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

    // Initialize core stats if MudStats is loaded and player has none
    if (window.MudStats) {
      const checkPlayer = engine.getSaveSlice().player;
      if (!checkPlayer.coreStats) {
        engine.resume({ player: { coreStats: window.MudStats.createDefaultStats() } });
      }
    }

    return engine;
  };
})();
