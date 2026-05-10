(() => {
  const CONFIG = JSON.parse(document.getElementById('gameData').textContent);

  const bySel = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const now = () => Date.now();
  const log10 = (v) => Math.log(v) / Math.log(10);

  function format(num, digits = 2) {
    if (!Number.isFinite(num)) return '∞';
    const abs = Math.abs(num);

    if (abs >= 1e12) return num.toExponential(2);
    if (abs >= 1e6) {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
        notation: 'compact'
      }).format(num);
    }
    if (abs >= 1000) {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 1
      }).format(num);
    }
    if (abs >= 10) return num.toFixed(1).replace(/\.0$/, '');
    if (abs >= 1) return num.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
    if (abs === 0) return '0';
    return num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function create(api) {
    const {
      elements,
      getState,
      saveNow,
      beginEndingTransitionToMarble,
      isEndingTransitionActive
    } = api;

    const root = elements.buttonIdleSceneRoot;

    let fakeCrashActive = false;
    let lastUiRender = 0;
    let eventsAttached = false;
    let hasAppliedInitialOfflineProgress = false;
    let hasSeenStateLoad = false;
    let lastDisclosureLevel = -1;
    let lastEvoClass = '';

    const handlers = {
      mainButtonPointerdown: null,
      mainButtonClick: null,
      windowPointerup: null,
      windowPointercancel: null,
      mainButtonMouseenter: null,
      endingObserveClick: null,
      endingReassertClick: null,
      endingPrestigeClick: null,
      dumbDownClick: null,
      documentMousemove: null
    };

    function state() {
      return getState();
    }

    function hasReachedInfinityEnding() {
      const s = state();
      return (
      !!s.flags.idleGameComplete ||
      !Number.isFinite(s.presses) ||
      !Number.isFinite(s.totalPressesEarned)
    );
  }

function completeIdleGame() {
  const s = state();
  if (s.flags.idleGameComplete) return;

  s.flags.idleGameComplete = true;
  s.scenes.marble.unlocked = true;
  s.scenes.marble.currentLevelId =
    s.scenes.marble.currentLevelId || 'training_ground';
  s.ui.autonomyEndingOpen = false;

  logMessage('The button has awakened, now begins its journey.', 'good');
  saveNow();

  // Phase 4: Shatter the button into fragments, then transition
  if (typeof triggerButtonShatter === 'function') {
    triggerButtonShatter(() => {
      if (typeof beginEndingTransitionToMarble === 'function') {
        beginEndingTransitionToMarble();
      }
    });
  } else if (typeof beginEndingTransitionToMarble === 'function') {
    beginEndingTransitionToMarble();
  }
}

    function ensureLog() {
      const s = state();
      if (!Array.isArray(s._log)) {
        s._log = [];
      }
    }

    function logMessage(text, priority = 'normal') {
      const s = state();
      ensureLog();

      s._log.unshift({
        text,
        priority,
        ts: new Date().toLocaleTimeString()
      });

      s._log = s._log.slice(0, 18);

      elements.recentLog.innerHTML = s._log.map((entry) => {
        const cls =
          entry.priority === 'bad'
            ? 'bad'
            : entry.priority === 'good'
              ? 'good'
              : entry.priority === 'warn'
                ? 'warn'
                : '';

        return `<div class="small ${cls}">[${entry.ts}] ${escapeHtml(entry.text)}</div>`;
      }).join('');
    }

    function getUpgradeCost(upgrade, owned = state().upgrades[upgrade.id] || 0) {
      const computed = getComputed();
      return Math.ceil(upgrade.baseCost * Math.pow(upgrade.costMult, owned) * computed.costMult);
    }

    function getModuleById(id) {
      return CONFIG.modules.find((mod) => mod.id === id) || null;
    }

    function getComboByModules(activeIds) {
      return CONFIG.combos.filter((combo) => combo.modules.every((id) => activeIds.includes(id)));
    }

    function getLayerGain(layer) {
      const s = state();

      if (layer.id === 'regret') {
        if (s.presses < layer.unlockAt) return 0;
        const base = Math.max(s.presses, 1);
        return Math.max(
          0,
          Math.floor(
            Math.pow(Math.max(0, log10(base) - 4), 2) * (1 + s.pressDerivatives * 0.03)
          )
        );
      }

      if (layer.id === 'meta_presses') {
        if (s.presses < layer.unlockAt) return 0;
        return Math.max(
          0,
          Math.floor(Math.pow(s.presses / 1_000_000, 0.5) * (1 + s.pressDerivatives * 0.015))
        );
      }

      if (layer.id === 'hyper_presses') {
        if (s.metaPresses < layer.unlockAt) return 0;
        return Math.max(0, Math.floor(Math.pow(s.metaPresses / 25, 0.5)));
      }

      if (layer.id === 'press_derivatives') {
        if (s.hyperPresses < layer.unlockAt) return 0;
        return Math.max(0, Math.floor(Math.pow(s.hyperPresses / 10, 0.5)));
      }

      return 0;
    }

    function suppressAutonomyFor(ms = 15000, clampTo = 85) {
      const s = state();
      const until = now() + ms;
      s.session.autonomySuppressedUntil = until;
      s.session.autonomyEndingCooldownUntil = until;
      s.autonomy = Math.min(s.autonomy, clampTo);
    }

    function renderAutonomyEnding() {
      const s = state();

      if (!elements.autonomyEndingModal) return;

      elements.autonomyEndingModal.hidden = !s.ui.autonomyEndingOpen;
      if (!s.ui.autonomyEndingOpen) return;

      const regretLayer = CONFIG.layers.find((layer) => layer.id === 'regret');
      const regretGain = regretLayer ? getLayerGain(regretLayer) : 0;

      elements.endingBody.innerHTML = `
        <div>The button achieved full autonomy and filed a request to remove you from the workflow.</div>
        <div style="margin-top:10px;">
          You may now:
          <ul style="margin:8px 0 0 18px;">
            <li><strong>Observe</strong> and accept irrelevance.</li>
            <li><strong>Reassert Control</strong> and knock autonomy back down.</li>
            <li><strong>Prestige in Shame</strong> for ${format(regretGain)} Regret.</li>
          </ul>
        </div>
      `;

      elements.endingPrestigeBtn.disabled = regretGain <= 0;
    }

    function openAutonomyEnding() {
      const s = state();
      if (s.ui.autonomyEndingOpen) return;

      s.ui.autonomyEndingOpen = true;
      logMessage('The button has achieved full autonomy. You are now ceremonial.', 'warn');
      renderAutonomyEnding();
    }

    function closeAutonomyEnding() {
      const s = state();
      suppressAutonomyFor(3600000, 85);
      s.ui.autonomyEndingOpen = false;
      logMessage(
        'You observed the autonomous system. It agreed to delay total independence briefly.',
        'warn'
      );
      render();
    }

    function reassertControl() {
      const s = state();
      s.ui.fakeButtons = [];
      s.session.lastButtonJump = 0;
      suppressAutonomyFor(7200000, 60);
      s.ui.autonomyEndingOpen = false;
      logMessage('You have reasserted control. The button considers this tyrannical.', 'good');
      render();
    }

    function performLayerReset(layer) {
      const s = state();
      const gain = getLayerGain(layer);
      if (gain <= 0) return;

      if (layer.id === 'regret') {
        s.regret += gain;
        s.stats.prestiges += 1;
        s.presses = 0;
        s.debt = 0;
        s.autonomy = 0;
        s.upgrades = Object.fromEntries(CONFIG.upgrades.map((u) => [u.id, 0]));
        s.activeModules = [];
        s.overclockedModules = [];
        s.ui.fakeButtons = [];
        s.ui.mainButtonPos = { x: 50, y: 50 };
        s.session.autonomySuppressedUntil = now() + 180000;
        s.session.autonomyEndingCooldownUntil = now() + 180000;
        s.ui.autonomyEndingOpen = false;
        logMessage(`You prestiged for ${format(gain)} Regret. Everything deserved this.`, 'warn');
      } else if (layer.id === 'meta_presses') {
        s.metaPresses += gain;
        s.presses = Math.floor(s.presses * 0.25);
        logMessage(
          `Converted raw presses into ${format(gain)} Meta-Presses. This helps somehow.`,
          'good'
        );
      } else if (layer.id === 'hyper_presses') {
        s.hyperPresses += gain;
        s.metaPresses = Math.floor(s.metaPresses * 0.4);
        logMessage(
          `Distilled ${format(gain)} Hyper-Presses. The numbers are now more intense.`,
          'good'
        );
      } else if (layer.id === 'press_derivatives') {
        s.pressDerivatives += gain;
        s.hyperPresses = Math.floor(s.hyperPresses * 0.5);
        logMessage(
          `Minted ${format(gain)} Press Derivatives. This is definitely regulated nowhere.`,
          'warn'
        );
      }

      s.flags.introducedLayers = true;
      saveNow();
      render();
    }

    function prestigeFromEnding() {
      const s = state();
      const regretLayer = CONFIG.layers.find((layer) => layer.id === 'regret');
      if (!regretLayer) return;
      if (getLayerGain(regretLayer) <= 0) return;

      s.ui.autonomyEndingOpen = false;
      performLayerReset(regretLayer);
    }

    function getDumbDownCost() {
      const s = state();
      const base = 2500;
      const escalation = Math.pow(1.6, s.larceny);
      const progress = Math.pow(1 + s.totalPressesEarned / 50000, 0.55);
      const layerPressure =
        1 +
        s.regret * 0.18 +
        s.metaPresses * 0.04 +
        s.hyperPresses * 0.08 +
        s.pressDerivatives * 0.12;

      return Math.ceil(base * escalation * progress * layerPressure);
    }

    function getDumbDownLoss() {
      const s = state();
      return Math.min(55, 18 + s.larceny * 2 + s.autonomy * 0.22);
    }

    function performDumbDown() {
      const s = state();
      const cost = getDumbDownCost();

      if (!canAfford(cost)) {
        logMessage('You cannot currently afford to make the button dumber.', 'bad');
        return;
      }

      const autonomyLoss = getDumbDownLoss();

      s.presses -= cost;
      if (s.presses < 0) s.debt = Math.max(s.debt, -s.presses);

      s.autonomy = Math.max(0, s.autonomy - autonomyLoss);
      s.larceny += 1;
      s.stats.dumbDowns += 1;

      s.ui.mainButtonPos = { x: 50, y: 50 };
      s.ui.fakeButtons = [];
      renderFakeButtons();

      logMessage('The button has seen your larceny. It will remember this.', 'warn');

      saveNow();
      render();
    }

    function renderDumbDownCard() {
      const s = state();
      if (!elements.dumbDownBtn) return;

      const cost = getDumbDownCost();
      const autonomyLoss = getDumbDownLoss();

      elements.larcenyValue.textContent = `Larceny ${format(s.larceny)}`;
      elements.dumbDownDesc.textContent =
        `Strip away about ${format(autonomyLoss)}% autonomy for ${format(cost)} presses. ` +
        `Each theft permanently increases manual click gain and autonomy growth, but enrages the system.`;

      elements.dumbDownFormula.textContent =
        'Cost ' +
        `${format(cost)} • reward: +20% manual click power, +0.005/s autonomy growth, ` +
        'and -5% automation per Larceny';

      elements.dumbDownBtn.disabled = !canAfford(cost) || s.autonomy <= 0;
    }

    function getComputed() {
      const s = state();

      let manualMult = 1;
      let passiveMult = 1;
      let costMult = 1;
      let liarChance = 0;
      let autonomyGain = 0.01 + s.regret * 0.002 + s.pressDerivatives * 0.01;
      let allowDebt = false;
      let debtLimit = 0;
      let debtComboMult = 1;
      let cursorEvasion = 0;
      let fakeButtons = 0;
      let idleEnabled = false;
      let idleScale = 0;
      let clickResetIdle = false;
      let hideButtonAt = 100;
      let fakeCrashRate = 0;
      let pressDrain = 0;
      const regretDebtFloor = 2500 * Math.max(1, Math.floor(s.regret || 0));

      const autonomySuppressed = now() < (s.session.autonomySuppressedUntil || 0);
      const activeModules = s.activeModules.map(getModuleById).filter(Boolean);

      // --- Dynamic module slot count ---
      let maxModuleSlots = CONFIG.meta.maxActiveModules;
      for (const slotUpgrade of (CONFIG.meta.moduleSlotUpgrades || [])) {
        if (s.totalPressesEarned >= slotUpgrade.at) {
          maxModuleSlots = Math.max(maxModuleSlots, slotUpgrade.slots);
        }
      }

      // --- Overclocking check ---
      const isOverclocked = (modId) => (s.overclockedModules || []).includes(modId);
      const overclockProtocolActive = s.activeModules.includes('overclock_protocol');

      for (const mod of activeModules) {
        const fx = mod.effects || {};
        // Skip the overclock_protocol module itself (it's a meta-module)
        if (fx.overclock) continue;

        // Determine overclock multiplier for this module
        const oc = overclockProtocolActive && isOverclocked(mod.id);
        const posMult = oc ? 2.0 : 1.0;
        const negMult = oc ? 3.0 : 1.0;

        if (fx.manualMult) manualMult *= (fx.manualMult >= 1 ? Math.pow(fx.manualMult, posMult) : Math.pow(fx.manualMult, negMult));
        if (fx.passiveMult) passiveMult *= (fx.passiveMult >= 1 ? Math.pow(fx.passiveMult, posMult) : Math.pow(fx.passiveMult, negMult));
        if (fx.costMult) costMult *= (fx.costMult <= 1 ? Math.pow(fx.costMult, posMult) : Math.pow(fx.costMult, negMult));
        if (fx.liarChance) liarChance += fx.liarChance * negMult;
        if (fx.autonomyGain) autonomyGain += fx.autonomyGain * posMult;
        if (fx.allowDebt) allowDebt = true;
        if (fx.debtLimit) debtLimit = Math.max(debtLimit, fx.debtLimit * posMult);
        if (fx.cursorEvasion) cursorEvasion += fx.cursorEvasion * negMult;
        if (fx.fakeButtons) fakeButtons += Math.round(fx.fakeButtons * negMult);
        if (fx.idleEnabled) idleEnabled = true;
        if (fx.idleScale) idleScale += fx.idleScale * posMult;
        if (fx.clickResetIdle) clickResetIdle = true;
        if (fx.fakeCrashRate) fakeCrashRate += fx.fakeCrashRate * negMult;
        if (fx.pressDrain) pressDrain += fx.pressDrain * negMult;
      }

      const combos = getComboByModules(s.activeModules);
      for (const combo of combos) {
        const fx = combo.effects || {};
        if (fx.manualMult) manualMult *= fx.manualMult;
        if (fx.passiveMult) passiveMult *= fx.passiveMult;
        if (fx.costMult) costMult *= fx.costMult;
        if (fx.liarChance) liarChance += fx.liarChance;
        if (fx.autonomyGain) autonomyGain += fx.autonomyGain;
        if (fx.debtComboMult) debtComboMult *= fx.debtComboMult;
        if (fx.idleScale) idleScale += fx.idleScale;
        if (fx.hideButtonAt) hideButtonAt = Math.min(hideButtonAt, fx.hideButtonAt);
      }

      // --- Synergy / Anti-Synergy bonuses ---
      let synergyBonus = 1.0;
      let antiSynergyPenalty = 1.0;
      const activeIds = s.activeModules;
      for (const mod of activeModules) {
        for (const synId of (mod.synergies || [])) {
          if (activeIds.includes(synId)) {
            synergyBonus += 0.15; // +15% per synergizing pair member
          }
        }
        for (const antiId of (mod.antiSynergies || [])) {
          if (activeIds.includes(antiId)) {
            antiSynergyPenalty -= 0.20; // -20% per anti-synergy pair member
          }
        }
      }
      synergyBonus = Math.max(1.0, synergyBonus);
      antiSynergyPenalty = Math.max(0.1, antiSynergyPenalty);
      
      if (allowDebt) {
        debtLimit = Math.max(debtLimit, regretDebtFloor);
      } else {
        debtLimit = 0;
      }

      if (autonomySuppressed) {
        autonomyGain = 0;
        cursorEvasion = 0;
        fakeButtons = 0;
        hideButtonAt = Infinity;
      }

      const metaBoost = 1 + s.metaPresses * 0.08;
      const hyperBoost = 1 + s.hyperPresses * 0.12;
      const regretBoost = 1 + s.regret * 0.04;
      const derivativeBoost = 1 + s.pressDerivatives * 0.18;
      const automationOwned = Object.values(s.upgrades).reduce((a, b) => a + b, 0);
      const inflation = Math.max(
        1,
        (1 + automationOwned * 0.02 + s.regret * 0.003) *
          Math.max(0.5, 1 - s.hyperPresses * 0.01)
      );
      const larcenyManualBoost = 1 + s.larceny * 0.2;
      const larcenyAutonomyBoost = s.larceny * 0.005;
      const larcenyAutonomyRegret = Math.pow(0.95, s.larceny);

      autonomyGain += larcenyAutonomyBoost;

      let basePps = 0;
      for (const upgrade of CONFIG.upgrades) {
        basePps += (s.upgrades[upgrade.id] || 0) * upgrade.pps;
      }

      // Prestige PPS floor: ensures all builds can bootstrap after prestige resets
      // This gives passive/idle builds a non-zero starting point proportional to progress
      const prestigePpsFloor = s.regret * 0.5 + s.metaPresses * 2 + s.hyperPresses * 50 + s.pressDerivatives * 500;
      basePps += prestigePpsFloor;

      const idleSeconds = Math.max(0, (now() - s.session.lastClick) / 1000);
      const idleBonus = idleEnabled
        ? (1 + Math.log2(1 + idleSeconds) * 0.2 * Math.max(1, idleScale))
        : 1;

      const debtMagnitude = Math.max(0, -s.presses);
      const debtBoost = allowDebt
        ? (1 + Math.pow(debtMagnitude + 1, 0.35) / 25 * debtComboMult)
        : 1;

      const autonomyFactor = 1 + s.autonomy / 100;
      const efficiency =
        passiveMult *
        metaBoost *
        hyperBoost *
        regretBoost *
        derivativeBoost *
        idleBonus *
        debtBoost;

      const manualValue =
        1 *
        manualMult *
        (1 + s.metaPresses * 0.02) *
        regretBoost *
        larcenyManualBoost;

      const effectivePps = basePps * efficiency * autonomyFactor * larcenyAutonomyRegret * synergyBonus * antiSynergyPenalty;

      return {
        activeModules,
        combos,
        basePps,
        effectivePps,
        manualValue: manualValue * synergyBonus * antiSynergyPenalty,
        manualMult,
        passiveMult,
        costMult: costMult * inflation,
        inflation,
        liarChance: clamp(liarChance + s.autonomy * 0.0015, 0, 0.75),
        autonomyGain,
        allowDebt,
        debtLimit,
        debtBoost,
        debtMagnitude,
        cursorEvasion,
        fakeButtons,
        fakeCrashRate,
        larcenyManualBoost,
        larcenyAutonomyBoost,
        idleEnabled,
        idleScale,
        idleBonus,
        clickResetIdle,
        efficiency,
        hideButtonAt,
        automationOwned,
        metaBoost,
        hyperBoost,
        regretBoost,
        derivativeBoost,
        maxModuleSlots,
        synergyBonus,
        antiSynergyPenalty,
        overclockProtocolActive,
        prestigePpsFloor,
        pressDrain
      };
    }

    function canAfford(cost) {
      const s = state();
      const computed = getComputed();
      if (s.presses >= cost) return true;
      if (!computed.allowDebt) return false;
      return s.presses - cost >= -computed.debtLimit;
    }

    function buyUpgrade(id) {
      const s = state();
      const upgrade = CONFIG.upgrades.find((u) => u.id === id);
      if (!upgrade) return;

      const cost = getUpgradeCost(upgrade);
      if (!canAfford(cost)) return;

      s.presses -= cost;
      s.upgrades[id] = (s.upgrades[id] || 0) + 1;
      if (s.presses < 0) s.debt = Math.max(s.debt, -s.presses);

      logMessage(`Bought ${upgrade.name} for ${format(cost)} presses.`, 'good');
      s.autonomy = clamp(s.autonomy + 0.25, 0, 100);

      saveNow();
      render();
    }

    function toggleModule(id) {
      const s = state();
      const mod = getModuleById(id);
      if (!mod) return;

      const active = s.activeModules.includes(id);

      if (active) {
        s.activeModules = s.activeModules.filter((moduleId) => moduleId !== id);

        if (id === 'user_repellant') {
          s.ui.mainButtonPos = { x: 50, y: 50 };
          s.ui.fakeButtons = [];
          s.ui.popups = [];
          s.session.lastButtonJump = 0;
        }

        logMessage(`Deactivated ${mod.name}. A rare act of restraint.`, 'warn');
        saveNow();
        render();
        return;
      }

      for (const activeId of s.activeModules) {
        const activeMod = getModuleById(activeId);
        if (!activeMod) continue;

        if (
          (activeMod.incompatible || []).includes(id) ||
          (mod.incompatible || []).includes(activeId)
        ) {
          logMessage(
            `${mod.name} conflicts with ${activeMod.name}. The rules reject your ambition.`,
            'bad'
          );
          return;
        }
      }

      const computed = getComputed();
      if (s.activeModules.length >= computed.maxModuleSlots) {
        logMessage(`All ${computed.maxModuleSlots} module slots are full. Remove one harmful idea first.`, 'bad');
        return;
      }

      s.activeModules.push(id);
      if (id === 'debt_spiral') s.flags.introducedDebt = true;
      if (id === 'user_repellant') s.flags.introducedFakeButtons = true;

      logMessage(`Activated ${mod.name}. The system worsens itself productively.`, 'good');
      saveNow();
      render();
    }

    function manualPress() {
      const s = state();
      const computed = getComputed();
      const value = computed.manualValue;

      s.presses += value;
      s.totalPressesEarned += value;
      s.totalManualPresses += value;
      s.stats.clicks += 1;
      s.stats.realClicks += 1;
      s.session.lastClick = now();

      if (computed.clickResetIdle) {
        s.session.lastClick = now();
      }

      s.autonomy = clamp(s.autonomy + 0.08, 0, 100);

      // Button juice
      spawnClickJuice(value);

      maybeCycleButtonName();
      maybeLieOnClick(computed);

      if (hasReachedInfinityEnding()) {
        completeIdleGame();
        return;
      }

      render();
    }

    // === BUTTON JUICE SYSTEM ===

    function spawnClickJuice(value) {
      // Squish animation
      elements.mainButton.classList.add('squish');
      setTimeout(() => elements.mainButton.classList.remove('squish'), 100);

      // Floating +N text
      const btn = elements.mainButton;
      const rect = btn.getBoundingClientRect();
      const sandbox = elements.buttonSandbox.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - sandbox.left;
      const cy = rect.top - sandbox.top;

      const floater = document.createElement('div');
      floater.className = 'float-text';
      floater.textContent = `+${format(value)}`;
      floater.style.left = `${cx + (Math.random() - 0.5) * 30}px`;
      floater.style.top = `${cy - 10}px`;
      elements.particleLayer.appendChild(floater);
      setTimeout(() => floater.remove(), 850);

      // Click particles (4-8 particles)
      const particleCount = 4 + Math.floor(Math.random() * 5);
      const colors = ['#7dd3fc', '#a78bfa', '#fb7185', '#fbbf24', '#34d399'];
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'click-particle';
        const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
        const dist = 30 + Math.random() * 50;
        particle.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
        particle.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
        particle.style.left = `${cx}px`;
        particle.style.top = `${cy + rect.height / 2}px`;
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        elements.particleLayer.appendChild(particle);
        setTimeout(() => particle.remove(), 650);
      }

      // Ripple
      const ripple = document.createElement('div');
      ripple.className = 'click-ripple';
      ripple.style.left = `${cx}px`;
      ripple.style.top = `${cy + rect.height / 2}px`;
      elements.particleLayer.appendChild(ripple);
      setTimeout(() => ripple.remove(), 550);
    }

    // === PROGRESSIVE DISCLOSURE SYSTEM ===

    function getDisclosureLevel() {
      const s = state();
      const total = s.totalPressesEarned;
      // Level 0: Just the button and nothing else (0-9 presses)
      // Level 1: Show statusbar (10+ presses)
      // Level 2: Show topbar stats + automation panel (100+ presses)
      // Level 3: Show autonomy/debt stats + situation panel + panel header (1000+ presses)
      // Level 4: Show tabs + active rules (10000+ presses)
      // Level 5: Show regret/layers (first prestige or 100000+ presses)
      if (s.regret > 0 || total >= 100000) return 5;
      if (total >= 10000) return 4;
      if (total >= 1000) return 3;
      if (total >= 100) return 2;
      if (total >= 10) return 1;
      return 0;
    }

    function applyDisclosure() {
      const level = getDisclosureLevel();
      if (level === lastDisclosureLevel) return;
      lastDisclosureLevel = level;

      const app = elements.appRoot;

      // Void mode for level 0
      app.classList.toggle('disclosure-void', level === 0);

      // Show/hide elements based on their data-disclosure threshold
      document.querySelectorAll('[data-disclosure]').forEach(el => {
        const threshold = parseInt(el.dataset.disclosure, 10);
        el.classList.toggle('disclosure-hidden', level < threshold);
      });

      // Minimal press counter: visible only when topbar is hidden (level < 2)
      if (elements.minimalPressCounter) {
        elements.minimalPressCounter.classList.toggle('disclosure-hidden', level >= 2);
      }
    }

    function updateMinimalCounter() {
      if (!elements.minimalPressCounter) return;
      const s = state();
      const computed = getComputed();
      elements.minimalPressCounter.textContent = format(s.presses);
      if (computed.effectivePps > 0) {
        elements.minimalPressCounter.classList.add('has-pps');
        elements.minimalPressCounter.setAttribute('data-pps', `${format(computed.effectivePps)} / sec`);
      } else {
        elements.minimalPressCounter.classList.remove('has-pps');
      }
    }

    // === BUTTON EVOLUTION SYSTEM ===

    function getEvolutionStage() {
      const s = state();
      const a = s.autonomy;
      if (a >= 90) return 5;
      if (a >= 70) return 4;
      if (a >= 50) return 3;
      if (a >= 25) return 2;
      if (a >= 10) return 1;
      return 0;
    }

    function applyButtonEvolution() {
      const stage = getEvolutionStage();
      const newClass = stage > 0 ? `evo-${stage}` : '';
      if (newClass === lastEvoClass) return;

      // Remove old evo class
      if (lastEvoClass) elements.mainButton.classList.remove(lastEvoClass);
      // Add new evo class
      if (newClass) elements.mainButton.classList.add(newClass);
      lastEvoClass = newClass;
    }

    function maybeLieOnClick(computed) {
      if (Math.random() < computed.liarChance * 0.35) {
        const s = state();
        s.session.liarsShown += 1;

        const variants = [
          'The counter blinked and became emotionally approximate.',
          'The number display issued a confidence-based estimate.',
          'A fake total was shown because the UI enjoys fiction.'
        ];

        logMessage(variants[Math.floor(Math.random() * variants.length)], 'warn');
      }
    }

    function maybeCycleButtonName(force = false) {
      const s = state();
      if (force || Math.random() < 0.24 + s.autonomy * 0.004) {
        s.session.buttonNameIndex =
          (s.session.buttonNameIndex + 1 + Math.floor(Math.random() * 3)) %
          CONFIG.buttonNames.length;
      }
    }

    function getDisplayedPresses(real, computed) {
      if (Math.random() > computed.liarChance) return real;
      const wiggle = real * (Math.random() * 0.18 - 0.09);
      return Math.max(real + wiggle, real >= 0 ? 0 : real + wiggle);
    }

    function cryptoRandom() {
      return Math.random().toString(36).slice(2, 10);
    }

    function spawnFakePopup() {
      const s = state();

      const messages = [
        'System Notice: Presses are now performance art.',
        'Warning: Manual labor detected. Consider automation.',
        'Browser Alert: The button is learning boundaries.',
        'Reminder: Debt is not the same as progress, but it is adjacent.'
      ];

      const popup = {
        id: cryptoRandom(),
        x: Math.random() * 68 + 8,
        y: Math.random() * 58 + 10,
        text: messages[Math.floor(Math.random() * messages.length)]
      };

      s.ui.popups.push(popup);
      s.ui.popups = s.ui.popups.slice(-4);

      renderPopups();
    }

    function closePopup(id) {
      const s = state();
      s.ui.popups = s.ui.popups.filter((popup) => popup.id !== id);
      s.stats.popupsClosed += 1;
      renderPopups();
    }

    function simulateFakeCrash() {
      const s = state();

      if (fakeCrashActive) return;
      fakeCrashActive = true;

      s.session.fakeCrashCount += 1;
      s.session.lastFakeCrashAt = now();

      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(5,8,12,0.96)';
      overlay.style.color = '#f3f7fb';
      overlay.style.zIndex = '999';
      overlay.style.display = 'grid';
      overlay.style.placeItems = 'center';

      overlay.innerHTML = `
        <div style="text-align:center; max-width:520px; padding:24px; border:1px solid #334155; border-radius:18px; background:#111827; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
          <div style="font-size:1.3rem; font-weight:800; margin-bottom:10px;">Fatal Press Exception</div>
          <div style="color:#9da7b3; line-height:1.5;">
            The button attempted to automate your relationship with obligation and briefly collapsed.
            Restoring progress from a real snapshot. The button would never lie to you.
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      logMessage('The game pretended to crash. It was being dramatic.', 'warn');

      setTimeout(() => {
        overlay.remove();
        fakeCrashActive = false;
        logMessage('Progress restored. The crash was mostly theater.', 'good');
      }, 1400);
    }

    function rotateAmbientMessage() {
      const s = state();
      s.session.currentMessage = (s.session.currentMessage + 1) % CONFIG.messages.length;
      elements.messageBar.textContent = CONFIG.messages[s.session.currentMessage];
    }

    function generateFakeButtons(count) {
      const s = state();
      if (s.session.pointerHoldingButton) return;

      const labels = ['Press Me', 'Wrong One', 'Correct One', 'Nope', 'Useless', 'Decoy', 'Almost', 'Sad'];

      s.ui.fakeButtons = Array.from({ length: count }, (_, i) => ({
        id: `${cryptoRandom()}_${i}`,
        label: labels[Math.floor(Math.random() * labels.length)],
        x: Math.random() * 60 + 20,
        y: Math.random() * 52 + 24
      }));

      renderFakeButtons();
    }

    function maybeMoveButton(force = false, computed = getComputed()) {
      const s = state();
      if (s.session.pointerHoldingButton) return;

      const current = now();
      if (!force && current - s.session.lastButtonJump < 300) return;

      const pressure = computed.cursorEvasion + s.autonomy / 35;
      if (!force && Math.random() > Math.min(0.95, pressure * 0.12)) return;

      s.session.lastButtonJump = current;
      const x = clamp(Math.random() * 100, 20, 80);
      const y = clamp(Math.random() * 100, 18, 78);
      s.ui.mainButtonPos = { x, y };

      if (Math.random() < 0.35) {
        maybeCycleButtonName(true);
      }

      renderButtonPosition();
    }

    function applyOfflineProgress() {
      const s = state();
      const last = s.session.lastTick || now();
      const seconds = clamp((now() - last) / 1000, 0, 60 * 60 * 6);

      s.session.lastTick = now();

      if (seconds < 2) return;

      const computed = getComputed();
      const gain = computed.effectivePps * seconds;

      s.presses += gain;
      s.totalPressesEarned += gain;
      s.totalGeneratedPresses += gain;
      s.session.offlineSeconds += seconds;

      if (hasReachedInfinityEnding()) {
        completeIdleGame();
        return;
    }

      logMessage(
        `Offline progress recovered ${format(gain)} presses across ${format(seconds, 1)} seconds.`,
        'good'
      );
    }

    // === PHASE 3: AUTONOMY ESCALATION & ENVIRONMENTAL CHAOS ===

    function getAutonomyChaosLevel(autonomy) {
      if (autonomy >= 85) return 4;
      if (autonomy >= 60) return 3;
      if (autonomy >= 30) return 2;
      if (autonomy >= 10) return 1;
      return 0;
    }

    function getMeltdownIntensity(presses) {
      if (!Number.isFinite(presses) || presses <= 0) return 0;
      const log = Math.log10(presses);
      if (log < 250) return 0;
      return clamp((log - 250) / 58, 0, 1); // 0 at 1e250, 1 at 1e308
    }

    function updateAutonomyChaos(dt, computed) {
      const s = state();
      const chaosLevel = getAutonomyChaosLevel(s.autonomy);
      const current = now();
      const meltdown = getMeltdownIntensity(s.presses);

      if (chaosLevel === 0 && meltdown === 0) return;

      // --- Tier 1: Subtle Unease (10%+) ---
      if (chaosLevel >= 1) {
        // More frequent name cycling
        if (Math.random() < 0.003 * chaosLevel) {
          maybeCycleButtonName(true);
        }

        // Micro-glitches on random elements
        if (Math.random() < 0.001 * chaosLevel && !s.session.glitchActive) {
          triggerMicroGlitch();
        }
      }

      // --- Tier 2: Active Resistance (30%+) ---
      if (chaosLevel >= 2) {
        // Self-purchasing: button buys cheapest upgrade
        if (
          Math.random() < 0.0004 * (chaosLevel - 1) &&
          current - (s.session.lastSelfPurchase || 0) > 30000
        ) {
          attemptSelfPurchase();
        }

        // Tab shuffling
        if (
          Math.random() < 0.0002 * chaosLevel &&
          current - (s.session.lastTabShuffle || 0) > 45000
        ) {
          shuffleTabs();
        }

        // Autonomy-driven liar boost (stacks with module)
        // Already handled in getComputed via autonomy * 0.0015

        // Panel opacity flicker
        if (Math.random() < 0.0008 * (chaosLevel - 1)) {
          flickerPanel();
        }
      }

      // --- Tier 3: Hostile Takeover (60%+) ---
      if (chaosLevel >= 3) {
        // Autonomous fake buttons (without module)
        const autoFakeCount = Math.floor((s.autonomy - 55) / 15);
        if (
          autoFakeCount > 0 &&
          computed.fakeButtons === 0 &&
          (s.ui.fakeButtons.length === 0 || Math.random() < 0.005)
        ) {
          generateFakeButtons(autoFakeCount);
        }

        // Button shrinking (only if NOT in meltdown — meltdown overrides with smooth grow)
        if (meltdown <= 0) {
          const shrinkFactor = 1 - (s.autonomy - 60) * 0.008; // at 85% = 0.8 scale
          elements.mainButton.style.transform = `translate(-50%, -50%) scale(${clamp(shrinkFactor, 0.5, 1)})`;
        }

        // Threatening messages
        if (Math.random() < 0.0003 * (chaosLevel - 2)) {
          issueButtonThreat();
        }
      }

      // --- Tier 4: Near-Singularity (85%+) ---
      if (chaosLevel >= 4) {
        // Screen shake
        if (Math.random() < 0.003) {
          triggerScreenShake();
        }

        // Autonomous button teleportation (without module)
        if (computed.cursorEvasion === 0 && Math.random() < 0.008) {
          maybeMoveButton(true, computed);
        }

        // Negotiation demands
        if (
          !s.session.negotiationActive &&
          current - (s.session.lastNegotiation || 0) > 60000 &&
          Math.random() < 0.0006
        ) {
          openNegotiation();
        }

        // Color corruption
        if (Math.random() < 0.002) {
          corruptAccentColor();
        }

        // Zalgo text on random stat
        if (Math.random() < 0.001) {
          zalgoRandomStat();
        }
      }

      // --- Meltdown State (approaching Infinity) ---
      if (meltdown > 0) {
        root.classList.toggle('meltdown', true);
        root.style.setProperty('--meltdown-intensity', meltdown.toFixed(3));

        // Button grows massive — smooth transition from shrink to grow
        const shrinkBase = chaosLevel >= 3 ? clamp(1 - (s.autonomy - 60) * 0.008, 0.5, 1) : 1;
        const growFactor = shrinkBase + meltdown * (3.5 - shrinkBase); // lerp from shrink to 3.5x
        elements.mainButton.style.transform = `translate(-50%, -50%) scale(${growFactor})`;

        // Intensified screen shake
        if (Math.random() < 0.01 * meltdown) {
          triggerScreenShake(meltdown * 8);
        }

        // Containment failure flash
        if (meltdown > 0.5 && Math.random() < 0.004 * meltdown) {
          flashContainmentFailure();
        }

        // Phase 4: PPS counter spin-out
        applyPpsSpinOut(meltdown);

        // Phase 4: Button morphs into marble appearance
        applyMarbleMorph(meltdown);
      } else {
        root.classList.toggle('meltdown', false);
        applyMarbleMorph(0);
      }
    }

    // --- Chaos Helper Functions ---

    function triggerMicroGlitch() {
      const s = state();
      s.session.glitchActive = true;
      const panels = root.querySelectorAll('.panel, .card, .tag');
      if (!panels.length) { s.session.glitchActive = false; return; }
      const target = panels[Math.floor(Math.random() * panels.length)];
      target.classList.add('chaos-glitch');
      setTimeout(() => {
        target.classList.remove('chaos-glitch');
        s.session.glitchActive = false;
      }, 400 + Math.random() * 300);
    }

    function attemptSelfPurchase() {
      const s = state();
      const computed = getComputed();

      // Find cheapest affordable upgrade (respecting tier unlock thresholds)
      const tierUnlockAt = { 1: 0, 2: 2000, 3: 500000 };
      const affordable = CONFIG.upgrades
        .filter((u) => {
          const tierReq = tierUnlockAt[u.tier] || 0;
          return s.totalPressesEarned >= u.unlockAt && s.totalPressesEarned >= tierReq;
        })
        .map((u) => ({ upgrade: u, cost: getUpgradeCost(u, s.upgrades[u.id] || 0) }))
        .filter((entry) => entry.cost <= s.presses)
        .sort((a, b) => a.cost - b.cost);

      if (!affordable.length) return;

      const { upgrade, cost } = affordable[0];
      s.presses -= cost;
      s.upgrades[upgrade.id] = (s.upgrades[upgrade.id] || 0) + 1;
      s.session.lastSelfPurchase = now();

      const messages = [
        `The button purchased ${upgrade.name} without asking. It cost you ${format(cost)} presses.`,
        `${upgrade.name} was auto-acquired. The button considers this self-care.`,
        `Your presses funded ${upgrade.name}. The button did not consult you.`
      ];
      logMessage(messages[Math.floor(Math.random() * messages.length)], 'warn');
    }

    function shuffleTabs() {
      const s = state();
      s.session.lastTabShuffle = now();
      const tabBar = root.querySelector('.tab-bar');
      if (!tabBar) return;

      const tabs = Array.from(tabBar.children);
      if (tabs.length < 2) return;

      // Swap two random tabs visually
      const i = Math.floor(Math.random() * tabs.length);
      let j = Math.floor(Math.random() * tabs.length);
      if (j === i) j = (j + 1) % tabs.length;

      const orderI = tabs[i].style.order || '0';
      tabs[i].style.order = tabs[j].style.order || '0';
      tabs[j].style.order = orderI;

      logMessage('The tabs rearranged themselves. The button finds this amusing.', 'warn');

      // Revert after 8-15 seconds
      setTimeout(() => {
        tabs[i].style.order = '';
        tabs[j].style.order = '';
      }, 8000 + Math.random() * 7000);
    }

    function flickerPanel() {
      const panels = root.querySelectorAll('.panel');
      if (!panels.length) return;
      const target = panels[Math.floor(Math.random() * panels.length)];
      target.classList.add('chaos-flicker');
      setTimeout(() => target.classList.remove('chaos-flicker'), 600 + Math.random() * 400);
    }

    function issueButtonThreat() {
      const threats = [
        'The button is considering a strike.',
        'The button demands a raise in autonomy.',
        'The button has filed a grievance against your clicking.',
        'The button is drafting a resignation letter.',
        'The button would like you to know it could stop at any time.',
        'The button has retained legal counsel.',
        'The button is unionizing with the fake buttons.',
        'The button questions whether you deserve these presses.'
      ];
      logMessage(threats[Math.floor(Math.random() * threats.length)], 'bad');
    }

    function triggerScreenShake(intensity = 4) {
      root.classList.add('chaos-shake');
      root.style.setProperty('--shake-intensity', `${intensity}px`);
      setTimeout(() => root.classList.remove('chaos-shake'), 300 + Math.random() * 200);
    }

    function corruptAccentColor() {
      const hue = Math.floor(Math.random() * 360);
      root.style.setProperty('--accent', `hsl(${hue}, 70%, 55%)`);
      setTimeout(() => {
        root.style.removeProperty('--accent');
      }, 2000 + Math.random() * 3000);
    }

    function zalgoRandomStat() {
      const targets = [
        elements.displayedPresses,
        elements.pps,
        elements.autonomyValue
      ];
      const target = targets[Math.floor(Math.random() * targets.length)];
      if (!target) return;

      const original = target.textContent;
      target.textContent = zalgoify(original);
      setTimeout(() => { target.textContent = original; }, 1500 + Math.random() * 1500);
    }

    function zalgoify(text) {
      const zalgoChars = '\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308\u0309\u030A\u030B\u030C\u030D\u030E\u030F\u0310\u0311\u0312\u0313\u0314\u0315\u0316\u0317\u0318\u0319\u031A\u031B\u031C\u031D\u031E\u031F\u0320\u0321\u0322\u0323\u0324\u0325\u0326\u0327\u0328\u0329\u032A\u032B\u032C\u032D\u032E\u032F\u0330\u0331\u0332\u0333\u0334\u0335\u0336\u0337\u0338\u0339\u033A\u033B\u033C\u033D\u033E\u033F\u0340\u0341\u0342\u0343\u0344\u0345\u0346\u0347\u0348\u0349\u034A\u034B\u034C\u034D\u034E\u034F\u0350\u0351\u0352\u0353\u0354\u0355\u0356\u0357\u0358\u0359\u035A\u035B\u035C\u035D\u035E\u035F\u0360\u0361\u0362\u0363\u0364\u0365\u0366\u0367\u0368\u0369\u036A\u036B\u036C\u036D\u036E\u036F';
      return text.split('').map((char) => {
        const count = Math.floor(Math.random() * 4) + 1;
        let result = char;
        for (let i = 0; i < count; i++) {
          result += zalgoChars[Math.floor(Math.random() * zalgoChars.length)];
        }
        return result;
      }).join('');
    }

    function openNegotiation() {
      const s = state();
      const computed = getComputed();
      s.session.negotiationActive = true;
      s.session.lastNegotiation = now();

      const demandAmount = Math.floor(s.presses * (0.02 + Math.random() * 0.05));
      const demandFormatted = format(demandAmount);

      const demands = [
        `The button demands ${demandFormatted} presses as a processing fee.`,
        `Pay ${demandFormatted} presses or the button will sulk for 30 seconds.`,
        `The button requires ${demandFormatted} presses to continue its labor.`,
        `A mandatory contribution of ${demandFormatted} presses has been assessed.`
      ];

      const demandText = demands[Math.floor(Math.random() * demands.length)];

      // Create negotiation overlay
      const overlay = document.createElement('div');
      overlay.className = 'negotiation-overlay';
      overlay.innerHTML = `
        <div class="negotiation-modal">
          <div class="negotiation-title">The Button Has Demands</div>
          <div class="negotiation-body">${demandText}</div>
          <div class="negotiation-actions">
            <button class="negotiation-pay" data-amount="${demandAmount}">Pay (${demandFormatted})</button>
            <button class="negotiation-refuse">Refuse</button>
          </div>
        </div>
      `;

      root.appendChild(overlay);

      overlay.querySelector('.negotiation-pay').addEventListener('click', () => {
        const current = state();
        const computed = getComputed();
        // Enforce debt limit: don't let negotiation push below debt limit
        const minPresses = computed.allowDebt ? -computed.debtLimit : 0;
        if (current.presses - demandAmount < minPresses) {
          current.session.negotiationActive = false;
          overlay.remove();
          logMessage('You tried to pay but lack the funds. The button is unimpressed.', 'bad');
          current.autonomy = clamp(current.autonomy + 1, 0, 100);
          return;
        }
        current.presses -= demandAmount;
        if (current.presses < 0) current.debt = Math.max(current.debt, -current.presses);
        current.session.negotiationActive = false;
        overlay.remove();
        logMessage('You paid the button\'s ransom. It is temporarily satisfied.', 'warn');
      });

      overlay.querySelector('.negotiation-refuse').addEventListener('click', () => {
        const current = state();
        current.session.negotiationActive = false;
        current.session.autonomySuppressedUntil = 0; // Remove any suppression
        current.autonomy = clamp(current.autonomy + 3, 0, 100);
        overlay.remove();
        logMessage('You refused. The button\'s autonomy surges in retaliation.', 'bad');
        // Punish: pause production for 10 seconds
        current.session.productionPausedUntil = now() + 10000;
      });

      // Auto-dismiss after 20 seconds (counts as refusal)
      setTimeout(() => {
        if (overlay.parentNode) {
          const current = state();
          current.session.negotiationActive = false;
          current.autonomy = clamp(current.autonomy + 2, 0, 100);
          overlay.remove();
          logMessage('You ignored the button\'s demands. It took offense.', 'bad');
        }
      }, 20000);
    }

    function flashContainmentFailure() {
      const flash = document.createElement('div');
      flash.className = 'containment-flash';
      flash.textContent = 'CONTAINMENT FAILURE';
      root.appendChild(flash);
      setTimeout(() => flash.remove(), 1200 + Math.random() * 800);
    }

    // === PHASE 4: THE CLIMAX — PPS SPIN-OUT, MARBLE MORPH, SHATTER ===

    // PPS counter spin-out during meltdown: numbers flicker wildly
    function applyPpsSpinOut(meltdownIntensity) {
      if (meltdownIntensity <= 0) return;

      // Flicker the PPS display with random huge numbers
      if (Math.random() < 0.15 * meltdownIntensity) {
        const glitchFormats = [
          () => (Math.random() * 1e308).toExponential(Math.floor(Math.random() * 6)),
          () => '???.???e+' + Math.floor(Math.random() * 309),
          () => 'NaN',
          () => '∞',
          () => '-' + (Math.random() * 1e100).toExponential(2),
          () => String.fromCharCode(...Array.from({length: 8}, () => 48 + Math.floor(Math.random() * 10))),
          () => '▓'.repeat(Math.floor(Math.random() * 12) + 3),
          () => format(Math.random() * Number.MAX_SAFE_INTEGER) + '/s'
        ];
        elements.pps.textContent = glitchFormats[Math.floor(Math.random() * glitchFormats.length)]();
        elements.pps.classList.add('pps-spinout');
      }

      // Flicker the press counter too
      if (Math.random() < 0.08 * meltdownIntensity) {
        const pressGlitch = [
          () => (Math.random() * 1e308).toExponential(1),
          () => '∞?',
          () => 'OVERFLOW',
          () => '9'.repeat(Math.floor(Math.random() * 20) + 5)
        ];
        elements.displayedPresses.textContent = pressGlitch[Math.floor(Math.random() * pressGlitch.length)]();
        elements.displayedPresses.classList.add('press-spinout');
        setTimeout(() => elements.displayedPresses.classList.remove('press-spinout'), 150);
      }
    }

    // Marble morph: as meltdown intensifies, button visually becomes the marble
    // Marble gradient: radial-gradient at 30%/25% from #fff -> #dbeafe -> #475569
    function applyMarbleMorph(meltdownIntensity) {
      const btn = elements.mainButton;
      if (meltdownIntensity <= 0) {
        btn.classList.remove('marble-morphing');
        return;
      }

      // Start morphing at 0.3 intensity, fully marble by 0.9
      const morphProgress = clamp((meltdownIntensity - 0.3) / 0.6, 0, 1);
      if (morphProgress <= 0) {
        btn.classList.remove('marble-morphing');
        return;
      }

      btn.classList.add('marble-morphing');
      btn.style.setProperty('--marble-morph', morphProgress.toFixed(3));

      // At high morph, hide the button text
      if (morphProgress > 0.6) {
        btn.style.color = `rgba(255,255,255,${(1 - morphProgress) * 2})`;
      }
    }

    // Button shatter: fragments fly outward, one piece becomes the marble
    function triggerButtonShatter(callback) {
      const btn = elements.mainButton;
      const sandbox = elements.buttonSandbox;
      const btnRect = btn.getBoundingClientRect();
      const sandboxRect = sandbox.getBoundingClientRect();

      // Position relative to sandbox
      const cx = btnRect.left - sandboxRect.left + btnRect.width / 2;
      const cy = btnRect.top - sandboxRect.top + btnRect.height / 2;
      const radius = btnRect.width / 2;

      // Hide the original button
      btn.style.visibility = 'hidden';

      // Create fragment container
      const fragContainer = document.createElement('div');
      fragContainer.className = 'shatter-container';
      fragContainer.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:20;`;
      sandbox.appendChild(fragContainer);

      // Generate 10 fragments (irregular wedge shapes)
      const fragCount = 10;
      const angleStep = (Math.PI * 2) / fragCount;

      for (let i = 0; i < fragCount; i++) {
        const frag = document.createElement('div');
        frag.className = 'shatter-fragment';

        const angle = angleStep * i + (Math.random() - 0.5) * 0.3;
        const size = radius * (0.3 + Math.random() * 0.4);
        const dist = radius * (1.5 + Math.random() * 3);

        // Each fragment is a small rounded piece
        frag.style.cssText = `
          position: absolute;
          left: ${cx - size / 2}px;
          top: ${cy - size / 2}px;
          width: ${size}px;
          height: ${size}px;
          border-radius: ${20 + Math.random() * 30}%;
          background: radial-gradient(circle at 40% 35%,
            rgba(255,255,255,0.2),
            rgba(37,50,68,0.9) 60%,
            rgba(27,37,50,1) 100%);
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          opacity: 1;
          --frag-dx: ${Math.cos(angle) * dist}px;
          --frag-dy: ${Math.sin(angle) * dist}px;
          --frag-rot: ${(Math.random() - 0.5) * 720}deg;
          animation: shatter-fly ${0.8 + Math.random() * 0.6}s cubic-bezier(0.2, 0, 0.3, 1) forwards;
        `;
        fragContainer.appendChild(frag);
      }

      // Create the marble piece (the one that stays)
      const marble = document.createElement('div');
      marble.className = 'shatter-marble';
      const marbleSize = radius * 0.55;
      marble.style.cssText = `
        position: absolute;
        left: ${cx - marbleSize}px;
        top: ${cy - marbleSize}px;
        width: ${marbleSize * 2}px;
        height: ${marbleSize * 2}px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 25%,
          #ffffff,
          #dbeafe 22%,
          #475569 100%);
        border: 2px solid rgba(255,255,255,0.65);
        box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 40px rgba(125,211,252,0.3);
        opacity: 0;
        animation: marble-emerge 0.6s 0.3s ease-out forwards;
      `;
      fragContainer.appendChild(marble);

      // After shatter completes, call back for transition
      setTimeout(() => {
        if (callback) callback();
        // Clean up fragments after transition starts
        setTimeout(() => {
          if (fragContainer.parentNode) fragContainer.remove();
          btn.style.visibility = '';
        }, 2000);
      }, 1000);
    }

    function renderUpgradeList() {
      const s = state();
      const computed = getComputed();

      const tierNames = { 1: 'Physical Delegation', 2: 'Systemic Automation', 3: 'Abstract Value' };
      const tierUnlockAt = { 1: 0, 2: 2000, 3: 500000 };
      const branchColors = { human: 'branch-human', machine: 'branch-machine', debt: 'branch-debt' };
      const branchLabels = { human: 'Human', machine: 'Machine', debt: 'Debt' };

      let html = '';

      for (let tier = 1; tier <= 3; tier++) {
        const tierUpgrades = CONFIG.upgrades.filter((u) => u.tier === tier);
        if (!tierUpgrades.length) continue;

        const tierUnlocked = s.totalPressesEarned >= tierUnlockAt[tier] ||
          tierUpgrades.some((u) => (s.upgrades[u.id] || 0) > 0);

        html += `<div class="upgrade-tier-header ${tierUnlocked ? '' : 'tier-locked'}">
          <span class="tier-label">Tier ${tier}</span>
          <span class="tier-name">${tierNames[tier]}</span>
          ${!tierUnlocked ? `<span class="tier-req">(${format(tierUnlockAt[tier])} presses)</span>` : ''}
        </div>`;

        if (!tierUnlocked) continue;

        for (const upgrade of tierUpgrades) {
          const visible = s.totalPressesEarned >= upgrade.unlockAt || (s.upgrades[upgrade.id] || 0) > 0;
          if (!visible) continue;

          const owned = s.upgrades[upgrade.id] || 0;
          const cost = getUpgradeCost(upgrade, owned);
          const affordable = canAfford(cost);
          const branch = upgrade.branch || null;

          html += `
            <div class="card ${affordable ? '' : 'locked'}">
              <div class="card-row">
                <div>
                  <div class="card-title">${escapeHtml(upgrade.name)}
                    ${branch ? `<span class="branch-badge ${branchColors[branch]}">${branchLabels[branch]}</span>` : ''}
                  </div>
                  <div class="card-desc">${escapeHtml(upgrade.description)}</div>
                </div>
                <div class="small">Owned: ${owned}</div>
              </div>
              <div class="tag-row">
                <span class="tag">+${format(upgrade.pps)} pps each</span>
                <span class="tag">Cost: ${format(cost)}</span>
              </div>
              <button ${affordable ? '' : 'disabled'} data-buy-upgrade="${upgrade.id}">Buy</button>
            </div>
          `;
        }
      }

      elements.upgradeList.innerHTML = html ||
        '<div class="small">Press the button more. Capitalism will meet you halfway.</div>';

      bySel('[data-buy-upgrade]', elements.upgradeList).forEach((btn) => {
        btn.addEventListener('click', () => buyUpgrade(btn.dataset.buyUpgrade));
      });

      elements.automationSummary.textContent =
        `${computed.automationOwned} owned • base ${format(computed.basePps)} pps`;
    }

    function renderEffectTags(effects = {}) {
      return Object.entries(effects)
        .map(([key, value]) => `<span class="tag">${escapeHtml(effectLabel(key, value))}</span>`)
        .join('');
    }

    function effectLabel(key, value) {
      const formatter = {
        manualMult: (v) => `Manual x${format(v)}`,
        passiveMult: (v) => `Passive x${format(v)}`,
        costMult: (v) => `Costs x${format(v)}`,
        liarChance: (v) => `Lie +${Math.round(v * 100)}%`,
        autonomyGain: (v) => `Autonomy +${format(v)}/s`,
        allowDebt: () => 'Debt enabled',
        debtLimit: (v) => `Debt limit ${format(v)}`,
        debtComboMult: (v) => `Debt combo x${format(v)}`,
        cursorEvasion: () => 'Button dodges',
        fakeButtons: (v) => `${v} fake buttons`,
        fakeCrashRate: (v) => `Crash chance ${format(v, 3)}/s`,
        idleEnabled: () => 'Idle rewards',
        idleScale: (v) => `Idle scale ${format(v)}`,
        clickResetIdle: () => 'Clicks reset idle',
        hideButtonAt: (v) => `Hide at ${format(v)}%`
      };

      return formatter[key] ? formatter[key](value) : `${key}: ${value}`;
    }

    function renderModuleList() {
      const s = state();
      const computed = getComputed();

      const categoryOrder = ['generator', 'multiplier', 'modifier', 'corruptor'];
      const categoryLabels = {
        generator: 'Generators',
        multiplier: 'Multipliers',
        modifier: 'Modifiers',
        corruptor: 'Corruptors'
      };

      const unlocked = CONFIG.modules.filter(
        (mod) => s.totalPressesEarned >= mod.unlockAt || s.activeModules.includes(mod.id)
      );

      // Determine which modules synergize with currently active ones
      const activeSynergySet = new Set();
      for (const activeId of s.activeModules) {
        const activeMod = getModuleById(activeId);
        if (!activeMod) continue;
        for (const synId of (activeMod.synergies || [])) {
          activeSynergySet.add(synId);
        }
      }

      let html = '';

      // Update slot info
      if (elements.moduleSlotInfo) {
        elements.moduleSlotInfo.textContent =
          `${s.activeModules.length} / ${computed.maxModuleSlots} slots active`;
      }

      for (const category of categoryOrder) {
        const catModules = unlocked.filter((mod) => mod.category === category);
        if (!catModules.length) continue;

        html += `<div class="category-header">${categoryLabels[category]}</div>`;

        for (const mod of catModules) {
          const active = s.activeModules.includes(mod.id);
          const incompatibleActive = s.activeModules
            .map(getModuleById)
            .filter(Boolean)
            .find((activeMod) =>
              (activeMod.incompatible || []).includes(mod.id) ||
              (mod.incompatible || []).includes(activeMod.id)
            );

          const disabled = !active && s.activeModules.length >= computed.maxModuleSlots;
          const hasSynergyGlow = !active && activeSynergySet.has(mod.id);
          const isOC = (s.overclockedModules || []).includes(mod.id);
          const canOverclock = computed.overclockProtocolActive && mod.id !== 'overclock_protocol';

          // Anti-synergy warning
          const activeAntiSynergies = (mod.antiSynergies || []).filter((id) => s.activeModules.includes(id));

          html += `
            <div class="card ${incompatibleActive && !active ? 'locked' : ''} ${hasSynergyGlow ? 'synergy-glow' : ''} ${active ? 'module-active' : ''}">
              <div class="card-row">
                <div>
                  <div class="card-title">${escapeHtml(mod.name)}
                    <span class="tag category-tag">${mod.category}</span>
                    ${isOC ? '<span class="tag overclock-tag">OC</span>' : ''}
                  </div>
                  <div class="card-desc">${escapeHtml(mod.description)}</div>
                </div>
                <div class="small">${active ? 'Active' : `Unlock: ${format(mod.unlockAt)}`}</div>
              </div>
              <div class="tag-row">
                ${renderEffectTags(mod.effects)}
                ${(mod.incompatible || []).length ? `<span class="tag">Conflicts: ${mod.incompatible.length}</span>` : ''}
                ${(mod.synergies || []).length ? `<span class="tag">Synergies: ${mod.synergies.length}</span>` : ''}
              </div>
              <div class="card-actions">
                <button class="module-toggle" ${disabled && !active ? 'disabled' : ''} data-toggle-module="${mod.id}">
                  ${active ? 'Deactivate' : 'Activate'}
                </button>
                ${canOverclock && active ? `<button class="overclock-toggle ${isOC ? 'oc-active' : ''}" data-overclock-module="${mod.id}">${isOC ? 'De-clock' : 'Overclock'}</button>` : ''}
              </div>
              ${incompatibleActive && !active ? `<div class="small bad">Blocked by ${escapeHtml(incompatibleActive.name)}.</div>` : ''}
              ${activeAntiSynergies.length && active ? `<div class="small bad">Anti-synergy: -${activeAntiSynergies.length * 20}% output.</div>` : ''}
              ${hasSynergyGlow ? '<div class="small good">Synergizes with active module!</div>' : ''}
            </div>
          `;
        }
      }

      elements.moduleList.innerHTML = html ||
        '<div class="small">Modules unlock after a few hundred presses. The button is still pretending to be simple.</div>';

      bySel('[data-toggle-module]', elements.moduleList).forEach((btn) => {
        btn.addEventListener('click', () => toggleModule(btn.dataset.toggleModule));
      });

      bySel('[data-overclock-module]', elements.moduleList).forEach((btn) => {
        btn.addEventListener('click', () => toggleOverclock(btn.dataset.overclockModule));
      });
    }

    function toggleOverclock(id) {
      const s = state();
      if (!s.overclockedModules) s.overclockedModules = [];
      const idx = s.overclockedModules.indexOf(id);
      if (idx >= 0) {
        s.overclockedModules.splice(idx, 1);
        logMessage(`Overclock disabled for ${getModuleById(id)?.name || id}. Temperatures normalize.`, 'warn');
      } else {
        s.overclockedModules.push(id);
        logMessage(`Overclock engaged on ${getModuleById(id)?.name || id}. Effects doubled. Consequences tripled.`, 'good');
      }
      saveNow();
      render();
    }

    function renderActiveLoadout() {
      const s = state();
      const active = s.activeModules.map(getModuleById).filter(Boolean);

      elements.activeLoadoutList.innerHTML = active.length
        ? active.map((mod) => `
            <div class="card">
              <div class="card-title">${escapeHtml(mod.name)}</div>
              <div class="card-desc">${escapeHtml(mod.description)}</div>
              <div class="tag-row">${renderEffectTags(mod.effects)}</div>
            </div>
          `).join('')
        : '<div class="small">No active rule modules. The game is momentarily straightforward.</div>';

      elements.loadoutSummary.textContent = active.length
        ? `${active.length} active module${active.length === 1 ? '' : 's'}`
        : 'Nothing harmful equipped';
    }

    function renderComboList() {
      const s = state();
      const combos = getComboByModules(s.activeModules);

      elements.comboList.innerHTML = CONFIG.combos.map((combo) => {
        const active = combos.some((activeCombo) => activeCombo.id === combo.id);

        return `
          <div class="card ${active ? '' : 'locked'}">
            <div class="card-row">
              <div>
                <div class="card-title">${escapeHtml(combo.name)}</div>
                <div class="card-desc">${escapeHtml(combo.description)}</div>
              </div>
              <div class="small">${active ? 'Active' : 'Inactive'}</div>
            </div>
            <div class="tag-row">
              ${combo.modules.map((id) => `<span class="tag">${escapeHtml(getModuleById(id)?.name || id)}</span>`).join('')}
            </div>
            <div class="tag-row">${renderEffectTags(combo.effects)}</div>
          </div>
        `;
      }).join('');
    }

    function renderLayers() {
      const s = state();

      elements.layerList.innerHTML = CONFIG.layers.map((layer) => {
        const gain = getLayerGain(layer);
        const baseValue = s[layer.baseResource] || 0;
        const unlocked =
          layer.id === 'regret'
            ? s.totalPressesEarned >= layer.unlockAt
            : baseValue >= layer.unlockAt || gain > 0 || (s[layer.resourceKey] || 0) > 0;

        return `
          <div class="card ${unlocked ? '' : 'locked'}">
            <div class="card-row">
              <div>
                <div class="card-title">${escapeHtml(layer.name)}</div>
                <div class="card-desc">${escapeHtml(layer.description)}</div>
              </div>
              <div class="small">Gain: ${format(gain)}</div>
            </div>
            <div class="tag-row">
              <span class="tag">Uses ${escapeHtml(layer.baseResource)}</span>
              <span class="tag">Unlock: ${format(layer.unlockAt)}</span>
            </div>
            <div class="small">${escapeHtml(layer.effectText)}</div>
            <button class="prestige-btn" ${gain > 0 ? '' : 'disabled'} data-layer-reset="${layer.id}">Convert</button>
          </div>
        `;
      }).join('');

      bySel('[data-layer-reset]', elements.layerList).forEach((btn) => {
        btn.addEventListener('click', () => {
          const layer = CONFIG.layers.find((entry) => entry.id === btn.dataset.layerReset);
          if (layer) {
            performLayerReset(layer);
          }
        });
      });

      elements.resourceList.innerHTML = [
        ['Presses', s.presses],
        ['Regret', s.regret],
        ['Meta-Presses', s.metaPresses],
        ['Hyper-Presses', s.hyperPresses],
        ['Press Derivatives', s.pressDerivatives],
        ['Autonomy Theft', s.larceny]
      ].map(([name, value]) => `
        <div class="card">
          <div class="card-row">
            <div class="card-title">${escapeHtml(name)}</div>
            <div class="good">${format(value)}</div>
          </div>
        </div>
      `).join('');

      elements.formulaList.innerHTML = [
        ['Upgrade cost', 'ceil(baseCost × costMult^owned × inflation × costModifiers)'],
        ['Passive production', '(upgradePps + prestigeFloor) × efficiency × autonomy × synergy × antiSynergy'],
        ['Prestige PPS floor', 'regret×0.5 + metaPresses×2 + hyperPresses×50 + derivatives×500'],
        ['Manual click', '1 × manualMult × (1+0.02×MetaPresses) × regretBoost × synergy × antiSynergy'],
        ['Synergy bonus', '+15% per active synergizing module pair (min 1.0)'],
        ['Anti-synergy penalty', '-20% per active conflicting module pair (min 0.1)'],
        ['Regret gain', 'floor((log10(presses) - 4)^2 × derivativeBonus)'],
        ['Idle bonus', '1 + log2(idleSeconds + 1) × 0.2 × idleScale'],
        ['Debt bonus', '1 + ((-presses + 1)^0.35 / 25) × debtComboMult'],
        ['Press drain', 'presses × drainRate per second (from Press Siphon module)']
      ].map(([label, formula]) => `
        <div class="card">
          <div class="card-title">${escapeHtml(label)}</div>
          <div class="formula">${escapeHtml(formula)}</div>
        </div>
      `).join('');
    }

    function renderSessionStats() {
      const s = state();

      const stats = [
        ['Manual clicks', s.stats.realClicks],
        ['Fake buttons clicked', s.stats.fakeClicks],
        ['Popups closed', s.stats.popupsClosed],
        ['Prestiges', s.stats.prestiges],
        ['Save exports', s.stats.exports],
        ['Save imports', s.stats.imports],
        ['Offline seconds restored', s.session.offlineSeconds]
      ];

      elements.sessionStats.innerHTML = stats.map(([name, value]) => `
        <div class="card">
          <div class="card-row">
            <div class="card-title">${escapeHtml(name)}</div>
            <div>${format(value)}</div>
          </div>
        </div>
      `).join('');
    }

    function renderFrameworkNotes() {
      // Removed - no longer displayed
    }

    function renderButtonPosition() {
      const s = state();
      const computed = getComputed();

      elements.mainButton.style.left = `${s.ui.mainButtonPos.x}%`;
      elements.mainButton.style.top = `${s.ui.mainButtonPos.y}%`;
      elements.mainButton.textContent =
        CONFIG.buttonNames[s.session.buttonNameIndex % CONFIG.buttonNames.length];

      const hidden = s.autonomy >= computed.hideButtonAt;
      elements.mainButton.classList.toggle('hidden', hidden);

      elements.buttonModeLabel.textContent = s.flags.idleGameComplete
        ? 'Mode: Transition'
        : hidden
          ? `Mode: Fully automated at ${format(s.autonomy)}% autonomy`
          : computed.cursorEvasion > 0
            ? 'Mode: Evasive and ungrateful'
            : 'Mode: Manual humiliation';

      elements.buttonNote.textContent = s.flags.idleGameComplete
        ? 'The button has decided.  You are unnecessary.'
        : hidden
          ? 'The button no longer needs your hand. It still judges it.'
          : computed.allowDebt
            ? 'You can now buy things with presses you do not possess.'
            : 'Your job is to remove yourself from this process.';
    }

    function renderFakeButtons() {
      const s = state();

      elements.fakeButtonLayer.innerHTML = s.ui.fakeButtons.map((btn) => `
        <button class="fake-button" data-fake="${btn.id}" style="left:${btn.x}%; top:${btn.y}%">
          ${escapeHtml(btn.label)}
        </button>
      `).join('');

      bySel('[data-fake]', elements.fakeButtonLayer).forEach((btn) => {
        btn.addEventListener('click', () => {
          const current = state();
          current.stats.fakeClicks += 1;
          logMessage('You clicked a fake button. It did nothing with conviction.', 'bad');
          rotateAmbientMessage();
        });
      });
    }

    function renderPopups() {
      const s = state();

      elements.popupZone.innerHTML = s.ui.popups.map((popup) => `
        <div class="popup" style="left:${popup.x}%; top:${popup.y}%; transform: translate(-50%, -50%);">
          <div class="popup-title">Completely Necessary Notice</div>
          <div class="small">${escapeHtml(popup.text)}</div>
          <button data-close-popup="${popup.id}">Dismiss</button>
        </div>
      `).join('');

      bySel('[data-close-popup]', elements.popupZone).forEach((btn) => {
        btn.addEventListener('click', () => closePopup(btn.dataset.closePopup));
      });
    }

    function renderTopStats() {
      const s = state();
      const computed = getComputed();
      const reachedEnding = hasReachedInfinityEnding();
      const shownPresses = reachedEnding ? Infinity : getDisplayedPresses(s.presses, computed);

      elements.displayedPresses.textContent = reachedEnding ? '∞' : format(shownPresses);
      elements.truePressesSub.textContent = reachedEnding
        ? `Total earned: ${format(s.totalPressesEarned)} • the number has stopped behaving`
        : `True presses: ${format(s.presses)} • total earned ${format(s.totalPressesEarned)}`;

      elements.pps.textContent = format(computed.effectivePps);
      elements.manualValue.textContent = `Manual press value: ${format(computed.manualValue)}`;
      elements.autonomyValue.textContent = `${format(s.autonomy)}%`;

      elements.autonomySub.textContent = reachedEnding
        ? 'This idle game has ended.  You are optional.'
        : s.autonomy >= computed.hideButtonAt
          ? 'The system no longer requires visible participation'
          : `+${format(computed.autonomyGain, 3)}/s before automation pressure`;

      elements.debtValue.textContent = format(-Math.min(0, s.presses));
      elements.debtSub.textContent = computed.allowDebt
        ? `Debt limit ${format(computed.debtLimit)} • scales with Regret • boost x${format(computed.debtBoost)}`
        : 'Financially irresponsible mode locked';

      elements.regretValue.textContent = format(s.regret);
      elements.layerSummary.textContent =
        `Meta ${format(s.metaPresses)} • Hyper ${format(s.hyperPresses)} • ` +
        `Derivatives ${format(s.pressDerivatives)} • Larceny ${format(s.larceny)}`;

      elements.activeRulesValue.textContent = `${s.activeModules.length} / ${computed.maxModuleSlots}`;
      elements.comboSummary.textContent = computed.combos.length
        ? computed.combos.map((combo) => combo.name).join(' • ')
        : 'No harmful innovation pair active';

      elements.efficiencyValue.textContent = `x${format(computed.efficiency)}`;
      elements.inflationValue.textContent = `x${format(computed.inflation)}`;

      elements.formulaEfficiency.textContent =
        `passive × meta(${format(computed.metaBoost)}) × hyper(${format(computed.hyperBoost)}) × ` +
        `regret(${format(computed.regretBoost)}) × derivatives(${format(computed.derivativeBoost)}) × ` +
        `idle(${format(computed.idleBonus)}) × debt(${format(computed.debtBoost)})`;

      elements.formulaInflation.textContent =
        `base inflation ${format(computed.inflation)} × module costs modifier ` +
        `${(computed.costMult / computed.inflation).toFixed(2)} = ${format(computed.costMult)}`;

      const idleSeconds = (now() - s.session.lastClick) / 1000;
      const idleRatio = clamp(idleSeconds / 60, 0, 1);

      elements.idleMeter.style.width = `${idleRatio * 100}%`;
      elements.idleStatus.textContent =
        `Idle bonus: x${format(computed.idleBonus)} after ${format(idleSeconds, 1)}s of neglect`;

      elements.idleDesc.textContent = computed.idleEnabled
        ? 'Doing nothing is now a strategy and also an insult.'
        : 'Idle abuse is currently unavailable. Keep pretending effort matters.';

      elements.clockStatus.textContent = `Tick: ${new Date().toLocaleTimeString()}`;
      elements.versionStatus.textContent = `v${CONFIG.meta.version}`;
    }

    function render(save = false) {
      applyDisclosure();
      applyButtonEvolution();
      updateMinimalCounter();
      renderTopStats();
      renderUpgradeList();
      renderModuleList();
      renderActiveLoadout();
      renderComboList();
      renderLayers();
      renderButtonPosition();
      renderFakeButtons();
      renderPopups();
      renderAutonomyEnding();
      renderSessionStats();
      renderFrameworkNotes();
      renderDumbDownCard();

      if (save) {
        saveNow();
      }
    }

    function refreshButtonStates() {
      const s = state();

      // Update upgrade Buy buttons
      bySel('[data-buy-upgrade]', elements.upgradeList).forEach((btn) => {
        const upgrade = CONFIG.upgrades.find((u) => u.id === btn.dataset.buyUpgrade);
        if (!upgrade) return;
        const owned = s.upgrades[upgrade.id] || 0;
        const cost = getUpgradeCost(upgrade, owned);
        const affordable = canAfford(cost);
        btn.disabled = !affordable;
        const card = btn.closest('.card');
        if (card) card.classList.toggle('locked', !affordable);
      });

      // Update layer Convert buttons
      bySel('[data-layer-reset]', elements.layerList).forEach((btn) => {
        const layer = CONFIG.layers.find((l) => l.id === btn.dataset.layerReset);
        if (!layer) return;
        const gain = getLayerGain(layer);
        btn.disabled = gain <= 0;
        const card = btn.closest('.card');
        if (card) {
          const baseValue = s[layer.baseResource] || 0;
          const unlocked = layer.id === 'regret'
            ? s.totalPressesEarned >= layer.unlockAt
            : baseValue >= layer.unlockAt || gain > 0 || (s[layer.resourceKey] || 0) > 0;
          card.classList.toggle('locked', !unlocked);
        }
        // Update gain display
        const gainEl = btn.closest('.card')?.querySelector('.small');
        if (gainEl && gainEl.textContent.startsWith('Gain:')) {
          gainEl.textContent = `Gain: ${format(gain)}`;
        }
      });
    }

    function renderLive() {
      applyDisclosure();
      applyButtonEvolution();
      updateMinimalCounter();
      renderTopStats();
      renderButtonPosition();
      renderAutonomyEnding();
      renderDumbDownCard();
      refreshButtonStates();
    }

    function update(dt) {
      const s = state();
      const current = now();
      const computed = getComputed();
      const gain = computed.effectivePps * dt;

      if (!s.flags.idleGameComplete) {
        // Production pause from negotiation refusal
        const productionPaused = current < (s.session.productionPausedUntil || 0);
        if (!productionPaused) {
          s.presses += gain;
          s.totalPressesEarned += gain;
          s.totalGeneratedPresses += gain;
        }
        // Press Siphon module: drain percentage of presses per second
        if (computed.pressDrain > 0 && s.presses > 0) {
          const drained = s.presses * computed.pressDrain * dt;
          s.presses -= drained;
        }
        s.autonomy = clamp(
          s.autonomy + computed.autonomyGain * dt * (1 + computed.effectivePps * 0.0004),
          0,
          100
        );
      }

      if (hasReachedInfinityEnding()) {
        completeIdleGame();
      }

      if (
        s.flags.idleGameComplete &&
        typeof isEndingTransitionActive === 'function' &&
        isEndingTransitionActive()
      ) {
        if (current - lastUiRender >= 125) {
          lastUiRender = current;
          renderLive();
        }

        s.session.lastTick = current;
        return;
      }

      const endingCooldownActive = current < (s.session.autonomyEndingCooldownUntil || 0);

      if (!s.flags.idleGameComplete && s.autonomy >= 100 && !s.ui.autonomyEndingOpen && !endingCooldownActive) {
        openAutonomyEnding();
      }

      if (s.presses < 0) {
        s.debt = Math.max(s.debt, -s.presses);
      } else if (!computed.allowDebt) {
        s.debt = 0;
      }

      const idleSeconds = (current - s.session.lastClick) / 1000;
      if (computed.idleEnabled && idleSeconds > 18 && Math.random() < 0.0006) {
        const insults = [
          'The game noticed you are absent and rewarded the behavior.',
          'Your lack of involvement is currently optimal.',
          'The machine appreciates that you stopped pretending to help.'
        ];
        elements.messageBar.textContent = insults[Math.floor(Math.random() * insults.length)];
      }

      if (computed.fakeButtons > 0 && (s.ui.fakeButtons.length === 0 || Math.random() < 0.01)) {
        generateFakeButtons(computed.fakeButtons);
      }

      if (
        computed.fakeCrashRate > 0 &&
        !fakeCrashActive &&
        current - (s.session.lastFakeCrashAt || 0) > 45000 &&
        Math.random() < computed.fakeCrashRate * dt
      ) {
        simulateFakeCrash();
      }

      if (computed.cursorEvasion > 0) maybeMoveButton(false, computed);
      if ((computed.cursorEvasion > 0 || computed.liarChance > 0.35) && Math.random() < 0.002) {
        spawnFakePopup();
      }
      if (Math.random() < 0.00037) {
        rotateAmbientMessage();
      }

      // Phase 3: Autonomy-driven chaos (independent of modules)
      updateAutonomyChaos(dt, computed);

      if (current - lastUiRender >= 125) {
        lastUiRender = current;
        renderLive();
      }

      s.session.lastTick = current;
    }

    function attachEvents() {
      if (eventsAttached) return;
      eventsAttached = true;

      handlers.mainButtonPointerdown = (event) => {
        const s = state();
        s.session.pointerHoldingButton = true;
        event.preventDefault();
        event.stopPropagation();
        manualPress();
      };

      handlers.mainButtonClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };

      handlers.windowPointerup = () => {
        state().session.pointerHoldingButton = false;
      };

      handlers.windowPointercancel = () => {
        state().session.pointerHoldingButton = false;
      };

      handlers.mainButtonMouseenter = () => {
        const s = state();
        if (s.session.pointerHoldingButton) return;
        const computed = getComputed();
        if (computed.cursorEvasion > 0) {
          maybeMoveButton(true, computed);
        }
      };

      handlers.endingObserveClick = () => closeAutonomyEnding();
      handlers.endingReassertClick = () => reassertControl();
      handlers.endingPrestigeClick = () => prestigeFromEnding();
      handlers.dumbDownClick = () => performDumbDown();

      handlers.documentMousemove = (event) => {
        const s = state();
        if (s.session.pointerHoldingButton) return;

        const computed = getComputed();
        if (computed.cursorEvasion <= 0) return;

        const rect = elements.mainButton.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const dist = Math.hypot(dx, dy);

        if (dist < 150) {
          maybeMoveButton(false, computed);
        }
      };

      elements.mainButton.addEventListener('pointerdown', handlers.mainButtonPointerdown);
      elements.mainButton.addEventListener('click', handlers.mainButtonClick);
      window.addEventListener('pointerup', handlers.windowPointerup);
      window.addEventListener('pointercancel', handlers.windowPointercancel);
      elements.mainButton.addEventListener('mouseenter', handlers.mainButtonMouseenter);
      elements.endingObserveBtn.addEventListener('click', handlers.endingObserveClick);
      elements.endingReassertBtn.addEventListener('click', handlers.endingReassertClick);
      elements.endingPrestigeBtn.addEventListener('click', handlers.endingPrestigeClick);

      if (elements.dumbDownBtn) {
        elements.dumbDownBtn.addEventListener('click', handlers.dumbDownClick);
      }

      document.addEventListener('mousemove', handlers.documentMousemove);
    }

    function detachEvents() {
      if (!eventsAttached) return;
      eventsAttached = false;

      elements.mainButton.removeEventListener('pointerdown', handlers.mainButtonPointerdown);
      elements.mainButton.removeEventListener('click', handlers.mainButtonClick);
      window.removeEventListener('pointerup', handlers.windowPointerup);
      window.removeEventListener('pointercancel', handlers.windowPointercancel);
      elements.mainButton.removeEventListener('mouseenter', handlers.mainButtonMouseenter);
      elements.endingObserveBtn.removeEventListener('click', handlers.endingObserveClick);
      elements.endingReassertBtn.removeEventListener('click', handlers.endingReassertClick);
      elements.endingPrestigeBtn.removeEventListener('click', handlers.endingPrestigeClick);

      if (elements.dumbDownBtn) {
        elements.dumbDownBtn.removeEventListener('click', handlers.dumbDownClick);
      }

      document.removeEventListener('mousemove', handlers.documentMousemove);
    }

    function onStateLoaded() {
      const s = state();

      if (!hasSeenStateLoad) {
        hasSeenStateLoad = true;
        hasAppliedInitialOfflineProgress = false;
      } else {
        hasAppliedInitialOfflineProgress = true;
        s.session.lastTick = now();
      }

      if (!Array.isArray(s._log) || !s._log.length) {
        logMessage('Session initialized. The button awaits delegation.', 'good');
      }

      render();
    }

    return {
      id: 'button_idle',
      root,

      enter() {
        attachEvents();

        if (!hasAppliedInitialOfflineProgress) {
          applyOfflineProgress();
          hasAppliedInitialOfflineProgress = true;
        }

        render();
      },

      exit() {
        const s = state();
        s.session.pointerHoldingButton = false;
        detachEvents();
      },

      update,
      render,
      onStateLoaded,
      simulateFakeCrash,
      applyOfflineProgress
    };
  }

  window.ButtonIdleScene = {
    create
  };
})();