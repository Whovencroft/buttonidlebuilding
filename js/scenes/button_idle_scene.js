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
    s.scenes.marble.currentLevelId || 'training_run';
  s.ui.autonomyEndingOpen = false;

  logMessage('The button has awakened, now begins its journey.', 'good');
  saveNow();

  if (typeof beginEndingTransitionToMarble === 'function') {
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
      const regretDebtFloor = 2500 * Math.max(1, Math.floor(s.regret || 0));

      const autonomySuppressed = now() < (s.session.autonomySuppressedUntil || 0);
      const activeModules = s.activeModules.map(getModuleById).filter(Boolean);

      for (const mod of activeModules) {
        const fx = mod.effects || {};
        if (fx.manualMult) manualMult *= fx.manualMult;
        if (fx.passiveMult) passiveMult *= fx.passiveMult;
        if (fx.costMult) costMult *= fx.costMult;
        if (fx.liarChance) liarChance += fx.liarChance;
        if (fx.autonomyGain) autonomyGain += fx.autonomyGain;
        if (fx.allowDebt) allowDebt = true;
        if (fx.debtLimit) debtLimit = Math.max(debtLimit, fx.debtLimit);
        if (fx.cursorEvasion) cursorEvasion += fx.cursorEvasion;
        if (fx.fakeButtons) fakeButtons += fx.fakeButtons;
        if (fx.idleEnabled) idleEnabled = true;
        if (fx.idleScale) idleScale += fx.idleScale;
        if (fx.clickResetIdle) clickResetIdle = true;
        if (fx.fakeCrashRate) fakeCrashRate += fx.fakeCrashRate;
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

      const effectivePps = basePps * efficiency * autonomyFactor * larcenyAutonomyRegret;

      return {
        activeModules,
        combos,
        basePps,
        effectivePps,
        manualValue,
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
        derivativeBoost
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

      if (s.activeModules.length >= CONFIG.meta.maxActiveModules) {
        logMessage('Module slots are full. Remove one harmful idea first.', 'bad');
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

      maybeCycleButtonName();
      maybeLieOnClick(computed);

      if (hasReachedInfinityEnding()) {
        completeIdleGame();
        return;
      }

      render();
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

    function renderUpgradeList() {
      const s = state();
      const computed = getComputed();

      const unlocked = CONFIG.upgrades.filter(
        (upgrade) => s.totalPressesEarned >= upgrade.unlockAt || (s.upgrades[upgrade.id] || 0) > 0
      );

      elements.upgradeList.innerHTML =
        unlocked.map((upgrade) => {
          const owned = s.upgrades[upgrade.id] || 0;
          const cost = getUpgradeCost(upgrade, owned);
          const affordable = canAfford(cost);

          return `
            <div class="card ${affordable ? '' : 'locked'}">
              <div class="card-row">
                <div>
                  <div class="card-title">${escapeHtml(upgrade.name)}</div>
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
        }).join('') ||
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

      const unlocked = CONFIG.modules.filter(
        (mod) => s.totalPressesEarned >= mod.unlockAt || s.activeModules.includes(mod.id)
      );

      elements.moduleList.innerHTML =
        unlocked.map((mod) => {
          const active = s.activeModules.includes(mod.id);
          const incompatibleActive = s.activeModules
            .map(getModuleById)
            .filter(Boolean)
            .find((activeMod) =>
              (activeMod.incompatible || []).includes(mod.id) ||
              (mod.incompatible || []).includes(activeMod.id)
            );

          const disabled = !active && s.activeModules.length >= CONFIG.meta.maxActiveModules;

          return `
            <div class="card ${incompatibleActive && !active ? 'locked' : ''}">
              <div class="card-row">
                <div>
                  <div class="card-title">${escapeHtml(mod.name)}</div>
                  <div class="card-desc">${escapeHtml(mod.description)}</div>
                </div>
                <div class="small">Unlock: ${format(mod.unlockAt)}</div>
              </div>
              <div class="tag-row">
                ${renderEffectTags(mod.effects)}
                ${(mod.incompatible || []).length ? `<span class="tag">Conflicts: ${mod.incompatible.length}</span>` : ''}
              </div>
              <button class="module-toggle" ${disabled && !active ? 'disabled' : ''} data-toggle-module="${mod.id}">
                ${active ? 'Deactivate' : 'Activate'}
              </button>
              ${incompatibleActive && !active ? `<div class="small bad">Blocked by ${escapeHtml(incompatibleActive.name)}.</div>` : ''}
            </div>
          `;
        }).join('') ||
        '<div class="small">Modules unlock after a few hundred presses. The button is still pretending to be simple.</div>';

      bySel('[data-toggle-module]', elements.moduleList).forEach((btn) => {
        btn.addEventListener('click', () => toggleModule(btn.dataset.toggleModule));
      });
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
        ['Passive production', 'sum(upgrade.pps × owned) × efficiency × (1 + autonomy/100)'],
        ['Manual click', '1 × manualModifiers × (1 + 0.02 × Meta-Presses) × regretBoost'],
        ['Regret gain', 'floor((log10(presses) - 4)^2 × derivativeBonus)'],
        ['Idle bonus', '1 + log2(idleSeconds + 1) × 0.2 × idleScale'],
        ['Debt bonus', '1 + ((-presses + 1)^0.35 / 25) × debtComboMult']
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
      elements.frameworkNotes.innerHTML = CONFIG.frameworkNotes
        .map((note) => `<div class="card"><div class="card-desc">${escapeHtml(note)}</div></div>`)
        .join('');

      elements.configPreview.textContent = JSON.stringify(CONFIG, null, 2);
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

      elements.activeRulesValue.textContent = `${s.activeModules.length} / ${CONFIG.meta.maxActiveModules}`;
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
      elements.versionStatus.textContent = `Framework v${CONFIG.meta.version}`;
    }

    function render(save = false) {
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

    function renderLive() {
      renderTopStats();
      renderButtonPosition();
      renderAutonomyEnding();
      renderDumbDownCard();
    }

    function update(dt) {
      const s = state();
      const current = now();
      const computed = getComputed();
      const gain = computed.effectivePps * dt;

      if (!s.flags.idleGameComplete) {
        s.presses += gain;
        s.totalPressesEarned += gain;
        s.totalGeneratedPresses += gain;
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
      if (computed.idleEnabled && idleSeconds > 18 && Math.random() < 0.008) {
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
      if ((computed.cursorEvasion > 0 || computed.liarChance > 0.35) && Math.random() < 0.006) {
        spawnFakePopup();
      }
      if (Math.random() < 0.0025) {
        rotateAmbientMessage();
      }

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