(() => {
      const CONFIG = JSON.parse(document.getElementById('gameData').textContent);
      const $ = (id) => document.getElementById(id);
      const bySel = (sel, root = document) => Array.from(root.querySelectorAll(sel));
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const now = () => Date.now();
      const log10 = (v) => Math.log(v) / Math.log(10);

      const defaultState = () => ({
        presses: 0,
        totalPressesEarned: 0,
        totalManualPresses: 0,
        totalGeneratedPresses: 0,
        regret: 0,
        metaPresses: 0,
        hyperPresses: 0,
        pressDerivatives: 0,
        autonomy: 0,
        debt: 0,
        larceny: 0,
        upgrades: Object.fromEntries(CONFIG.upgrades.map(u => [u.id, 0])),
        activeModules: [],
        unlockedLayers: [],
        stats: {
          clicks: 0,
          realClicks: 0,
          fakeClicks: 0,
          popupsClosed: 0,
          prestiges: 0,
          dumbDowns: 0,
          imports: 0,
          exports: 0
        },
        session: {
          lastTick: now(),
          lastSave: 0,
          lastClick: now(),
          currentMessage: 0,
          buttonNameIndex: 0,
          liarsShown: 0,
          lastButtonJump: 0,
          fakeCrashCount: 0,
          offlineSeconds: 0,
          pointerHoldingButton: false,
          autonomySuppressedUntil: 0,
          autonomyEndingCooldownUntil: 0,
          lastFakeCrashAt: 0
        },
        ui: {
          activeTab: 'play',
          mainButtonPos: { x: 50, y: 50 },
          fakeButtons: [],
          popups: [],
          autonomyEndingOpen: false
        },
        flags: {
          introducedDebt: false,
          introducedFakeButtons: false,
          introducedLayers: false,
          autonomyEndingSeen: false
        }
      });

      let state = loadGame() || defaultState();
      let tickHandle = null;
      let saveHandle = null;
      let lastFrame = now();
      let lastUiRender = 0;
      let fakeCrashActive = false;

      const elements = {
        tabs: $('tabs'),
        displayedPresses: $('displayedPresses'),
        truePressesSub: $('truePressesSub'),
        pps: $('pps'),
        manualValue: $('manualValue'),
        autonomyValue: $('autonomyValue'),
        autonomySub: $('autonomySub'),
        debtValue: $('debtValue'),
        debtSub: $('debtSub'),
        regretValue: $('regretValue'),
        layerSummary: $('layerSummary'),
        activeRulesValue: $('activeRulesValue'),
        comboSummary: $('comboSummary'),
        buttonModeLabel: $('buttonModeLabel'),
        buttonNote: $('buttonNote'),
        mainButton: $('mainButton'),
        buttonSandbox: $('buttonSandbox'),
        fakeButtonLayer: $('fakeButtonLayer'),
        popupZone: $('popupZone'),
        autonomyEndingModal: $('autonomyEndingModal'),
        endingBody: $('endingBody'),
        endingObserveBtn: $('endingObserveBtn'),
        endingReassertBtn: $('endingReassertBtn'),
        endingPrestigeBtn: $('endingPrestigeBtn'),
        dumbDownBtn: $('dumbDownBtn'),
        dumbDownFormula: $('dumbDownFormula'),
        dumbDownDesc: $('dumbDownDesc'),
        larcenyValue: $('larcenyValue'),
        upgradeList: $('upgradeList'),
        moduleList: $('moduleList'),
        activeLoadoutList: $('activeLoadoutList'),
        comboList: $('comboList'),
        layerList: $('layerList'),
        resourceList: $('resourceList'),
        formulaList: $('formulaList'),
        frameworkNotes: $('frameworkNotes'),
        configPreview: $('configPreview'),
        recentLog: $('recentLog'),
        messageBar: $('messageBar'),
        autosaveStatus: $('autosaveStatus'),
        clockStatus: $('clockStatus'),
        versionStatus: $('versionStatus'),
        automationSummary: $('automationSummary'),
        efficiencyValue: $('efficiencyValue'),
        formulaEfficiency: $('formulaEfficiency'),
        inflationValue: $('inflationValue'),
        formulaInflation: $('formulaInflation'),
        idleMeter: $('idleMeter'),
        idleStatus: $('idleStatus'),
        idleDesc: $('idleDesc'),
        loadoutSummary: $('loadoutSummary'),
        sessionStats: $('sessionStats'),
        saveField: $('saveField'),
        saveStatus: $('saveStatus')
      };

      function format(num, digits = 2) {
        if (!Number.isFinite(num)) return '∞';
        const abs = Math.abs(num);
        if (abs >= 1e12) return num.toExponential(2);
        if (abs >= 1e6) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: 'compact' }).format(num);
        if (abs >= 1000) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(num);
        if (abs >= 10) return num.toFixed(1).replace(/\.0$/, '');
        if (abs >= 1) return num.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
        if (abs === 0) return '0';
        return num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
      }

      function logMessage(text, priority = 'normal') {
        state._log = state._log || [];
        state._log.unshift({ text, priority, ts: new Date().toLocaleTimeString() });
        state._log = state._log.slice(0, 18);
        elements.recentLog.innerHTML = state._log.map(entry => {
          const cls = entry.priority === 'bad' ? 'bad' : entry.priority === 'good' ? 'good' : entry.priority === 'warn' ? 'warn' : '';
          return `<div class="small ${cls}">[${entry.ts}] ${escapeHtml(entry.text)}</div>`;
        }).join('');
      }

      function escapeHtml(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function saveGame(showStatus = false) {
        state.session.lastTick = now();
        localStorage.setItem(CONFIG.meta.saveKey, JSON.stringify(state));
        state.session.lastSave = now();
        elements.autosaveStatus.textContent = `Autosave: ${new Date(state.session.lastSave).toLocaleTimeString()}`;
        if (showStatus) elements.saveStatus.textContent = `Saved at ${new Date(state.session.lastSave).toLocaleTimeString()}. The button remains.`;
      }

      function loadGame() {
        try {
          const raw = localStorage.getItem(CONFIG.meta.saveKey);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          const merged = deepMerge(defaultState(), parsed);
          return merged;
        } catch (err) {
          console.error(err);
          return null;
        }
      }

      function deepMerge(target, source) {
        if (!source || typeof source !== 'object') return target;
        for (const key of Object.keys(source)) {
          if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
            deepMerge(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
        return target;
      }

      function exportSave() {
        saveGame();
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
        elements.saveField.value = encoded;
        state.stats.exports += 1;
        logMessage('Exported save data. Very portable shame.', 'good');
        render();
      }

      function importSave() {
        try {
          const raw = elements.saveField.value.trim();
          if (!raw) {
            logMessage('Import failed because the save field was empty.', 'bad');
            return;
          }
          const parsed = JSON.parse(decodeURIComponent(escape(atob(raw))));
          state = deepMerge(defaultState(), parsed);
          state.stats.imports += 1;
          state.session.lastTick = now();
          saveGame(true);
          logMessage('Imported save data. The button remembers.', 'warn');
          render();
        } catch (err) {
          console.error(err);
          logMessage('Import failed. The button rejects malformed memory.', 'bad');
          elements.saveStatus.textContent = 'Import failed. Save string is not valid.';
        }
      }

      function hardReset() {
        state = defaultState();
        saveGame(true);
        logMessage('Hard reset complete. The button forgives nothing.', 'warn');
        render();
      }

      function getUpgradeCost(upgrade, owned = state.upgrades[upgrade.id] || 0) {
        const computed = getComputed();
        return Math.ceil(upgrade.baseCost * Math.pow(upgrade.costMult, owned) * computed.costMult);
      }

      function getModuleById(id) {
        return CONFIG.modules.find(m => m.id === id);
      }

      function getComboByModules(activeIds) {
        return CONFIG.combos.filter(combo => combo.modules.every(id => activeIds.includes(id)));
      }

      function getLayerGain(layer) {
        if (layer.id === 'regret') {
          if (state.presses < layer.unlockAt) return 0;
          const base = Math.max(state.presses, 1);
          return Math.max(0, Math.floor(Math.pow(Math.max(0, log10(base) - 4), 2) * (1 + state.pressDerivatives * 0.03)));
        }
        if (layer.id === 'meta_presses') {
          if (state.presses < layer.unlockAt) return 0;
          return Math.max(0, Math.floor(Math.pow(state.presses / 1_000_000, 0.5) * (1 + state.pressDerivatives * 0.015)));
        }
        if (layer.id === 'hyper_presses') {
          if (state.metaPresses < layer.unlockAt) return 0;
          return Math.max(0, Math.floor(Math.pow(state.metaPresses / 25, 0.5)));
        }
        if (layer.id === 'press_derivatives') {
          if (state.hyperPresses < layer.unlockAt) return 0;
          return Math.max(0, Math.floor(Math.pow(state.hyperPresses / 10, 0.5)));
        }
        return 0;
      }

      function performLayerReset(layer) {
        const gain = getLayerGain(layer);
        if (gain <= 0) return;

        if (layer.id === 'regret') {
          state.regret += gain;
          state.stats.prestiges += 1;
          state.presses = 0;
          state.debt = 0;
          state.autonomy = 0;
          state.upgrades = Object.fromEntries(CONFIG.upgrades.map(u => [u.id, 0]));
          state.activeModules = [];
          state.ui.fakeButtons = [];
          state.ui.mainButtonPos = { x: 50, y: 50 };
          state.session.autonomySuppressedUntil = now() + 180000;
          state.session.autonomyEndingCooldownUntil = now() + 180000;
          state.ui.autonomyEndingOpen = false;
          logMessage(`You prestiged for ${format(gain)} Regret. Everything deserved this.`, 'warn');
        } else if (layer.id === 'meta_presses') {
          state.metaPresses += gain;
          state.presses = Math.floor(state.presses * 0.25);
          logMessage(`Converted raw presses into ${format(gain)} Meta-Presses. This helps somehow.`, 'good');
        } else if (layer.id === 'hyper_presses') {
          state.hyperPresses += gain;
          state.metaPresses = Math.floor(state.metaPresses * 0.4);
          logMessage(`Distilled ${format(gain)} Hyper-Presses. The numbers are now more intense.`, 'good');
        } else if (layer.id === 'press_derivatives') {
          state.pressDerivatives += gain;
          state.hyperPresses = Math.floor(state.hyperPresses * 0.5);
          logMessage(`Minted ${format(gain)} Press Derivatives. This is definitely regulated nowhere.`, 'warn');
        }

        state.flags.introducedLayers = true;
        saveGame();
        render();
      }

    function renderAutonomyEnding() {
      if (!elements.autonomyEndingModal) return;

      elements.autonomyEndingModal.hidden = !state.ui.autonomyEndingOpen;
      if (!state.ui.autonomyEndingOpen) return;

      const regretLayer = CONFIG.layers.find(l => l.id === 'regret');
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
      if (state.ui.autonomyEndingOpen) return;
      state.ui.autonomyEndingOpen = true;
      logMessage('The button has achieved full autonomy. You are now ceremonial.', 'warn');
      renderAutonomyEnding();
    }

    function closeAutonomyEnding() {
      suppressAutonomyFor(3600000, 85);
      state.ui.autonomyEndingOpen = false;
      logMessage('You observed the autonomous system. It agreed to delay total independence briefly.', 'warn');
      render();
    }

    function reassertControl() {
      state.ui.fakeButtons = [];
      state.session.lastButtonJump = 0;
      suppressAutonomyFor(7200000, 60);
      state.ui.autonomyEndingOpen = false;
      logMessage('You have reasserted control. The button considers this tyrannical.', 'good');
      render();
    }

    function prestigeFromEnding() {
      const regretLayer = CONFIG.layers.find(l => l.id === 'regret');
      if (!regretLayer) return;
      if (getLayerGain(regretLayer) <= 0) return;

      state.ui.autonomyEndingOpen = false;
      performLayerReset(regretLayer);
    }

    function suppressAutonomyFor(ms = 15000, clampTo = 85) {
      const until = now() + ms;
      state.session.autonomySuppressedUntil = until;
      state.session.autonomyEndingCooldownUntil = until;
      state.autonomy = Math.min(state.autonomy, clampTo);
    }

    function getDumbDownCost() {
      const base = 2500;
      const escalation = Math.pow(1.6, state.larceny);
      const progress = Math.pow(1 + state.totalPressesEarned / 50000, 0.55);
      const layerPressure =
        1 +
       state.regret * 0.18 +
       state.metaPresses * 0.04 +
       state.hyperPresses * 0.08 +
       state.pressDerivatives * 0.12;

      return Math.ceil(base * escalation * progress * layerPressure);
    }

    function getDumbDownLoss() {
      return Math.min(55, 18 + state.larceny * 2 + state.autonomy * 0.22);
    }

    function performDumbDown() {
      const cost = getDumbDownCost();

     if (!canAfford(cost)) {
        logMessage('You cannot currently afford to make the button dumber.', 'bad');
        return;
      }

      const autonomyLoss = getDumbDownLoss();

      state.presses -= cost;
     if (state.presses < 0) state.debt = Math.max(state.debt, -state.presses);

     state.autonomy = Math.max(0, state.autonomy - autonomyLoss);
     state.larceny += 1;
      state.stats.dumbDowns += 1;

     state.ui.mainButtonPos = { x: 50, y: 50 };
     state.ui.fakeButtons = [];
     renderFakeButtons();

     logMessage('The button has seen your larceny. It will remember this.', 'warn');

     saveGame();
     render();
    }

    function renderDumbDownCard() {
     if (!elements.dumbDownBtn) return;

     const cost = getDumbDownCost();
     const autonomyLoss = getDumbDownLoss();

     elements.larcenyValue.textContent = `Larceny ${format(state.larceny)}`;
     elements.dumbDownDesc.textContent =
       `Strip away about ${format(autonomyLoss)}% autonomy for ${format(cost)} presses. Each theft permanently increases manual click gain and autonomy growth, but enrages the system.`;

     elements.dumbDownFormula.textContent =
       `Cost ${format(cost)} • reward: +20% manual click power, +0.005/s autonomy growth, and -5% automation per Larceny`;

     elements.dumbDownBtn.disabled = !canAfford(cost) || state.autonomy <= 0;
    }
      function getComputed() {
        let manualMult = 1;
        let passiveMult = 1;
        let costMult = 1;
        let liarChance = 0;
        let autonomyGain = 0.01 + state.regret * 0.002 + state.pressDerivatives * 0.01;
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

        const autonomySuppressed = now() < (state.session.autonomySuppressedUntil || 0);
        const activeModules = state.activeModules.map(getModuleById).filter(Boolean);
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

        const combos = getComboByModules(state.activeModules);
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

          if (autonomySuppressed) {
            autonomyGain = 0;
            cursorEvasion = 0;
            fakeButtons = 0;
            hideButtonAt = Infinity;
          }

        const metaBoost = 1 + state.metaPresses * 0.08;
        const hyperBoost = 1 + state.hyperPresses * 0.12;
        const regretBoost = 1 + state.regret * 0.04;
        const derivativeBoost = 1 + state.pressDerivatives * 0.18;
        const automationOwned = Object.values(state.upgrades).reduce((a, b) => a + b, 0);
        const inflation = Math.max(1, (1 + automationOwned * 0.02 + state.regret * 0.003) * Math.max(0.5, 1 - state.hyperPresses * 0.01));
        const larcenyManualBoost = 1 + state.larceny * 0.2;
        const larcenyAutonomyBoost = state.larceny * 0.005;
        const larcenyAutonomyRegret = Math.pow(0.95, state.larceny);
        autonomyGain += larcenyAutonomyBoost;
        let basePps = 0;
        for (const upgrade of CONFIG.upgrades) {
          basePps += (state.upgrades[upgrade.id] || 0) * upgrade.pps;
        }

        const idleSeconds = Math.max(0, (now() - state.session.lastClick) / 1000);
        const idleBonus = idleEnabled ? (1 + Math.log2(1 + idleSeconds) * 0.2 * Math.max(1, idleScale)) : 1;
        const debtMagnitude = Math.max(0, -state.presses);
        const debtBoost = allowDebt ? (1 + Math.pow(debtMagnitude + 1, 0.35) / 25 * debtComboMult) : 1;
        const autonomyFactor = 1 + state.autonomy / 100;
        const efficiency = passiveMult * metaBoost * hyperBoost * regretBoost * derivativeBoost * idleBonus * debtBoost;
        const manualValue =
        1 *
        manualMult *
        (1 + state.metaPresses * 0.02) *
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
          liarChance: clamp(liarChance + state.autonomy * 0.0015, 0, 0.75),
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
        const computed = getComputed();
        if (state.presses >= cost) return true;
        if (!computed.allowDebt) return false;
        return state.presses - cost >= -computed.debtLimit;
      }

      function buyUpgrade(id) {
        const upgrade = CONFIG.upgrades.find(u => u.id === id);
        if (!upgrade) return;
        const cost = getUpgradeCost(upgrade);
        if (!canAfford(cost)) return;
        state.presses -= cost;
        state.upgrades[id] = (state.upgrades[id] || 0) + 1;
        if (state.presses < 0) state.debt = Math.max(state.debt, -state.presses);
        logMessage(`Bought ${upgrade.name} for ${format(cost)} presses.`, 'good');
        state.autonomy = clamp(state.autonomy + 0.25, 0, 100);
        saveGame();
        render();
      }

      function toggleModule(id) {
        const mod = getModuleById(id);
        if (!mod) return;
        const active = state.activeModules.includes(id);
        if (active) {
          state.activeModules = state.activeModules.filter(m => m !== id);

          if (id === 'user_repellant') {
            state.ui.mainButtonPos = { x: 50, y: 50 };
            state.ui.fakeButtons = [];
            state.ui.popups = [];
            state.session.lastButtonJump = 0;
          }

          logMessage(`Deactivated ${mod.name}. A rare act of restraint.`, 'warn');
          saveGame();
          render();
          return;
        }

        for (const activeId of state.activeModules) {
          const activeMod = getModuleById(activeId);
          if (!activeMod) continue;
          if ((activeMod.incompatible || []).includes(id) || (mod.incompatible || []).includes(activeId)) {
            logMessage(`${mod.name} conflicts with ${activeMod.name}. The rules reject your ambition.`, 'bad');
            return;
          }
        }

        if (state.activeModules.length >= CONFIG.meta.maxActiveModules) {
          logMessage('Module slots are full. Remove one harmful idea first.', 'bad');
          return;
        }

        state.activeModules.push(id);
        if (id === 'debt_spiral') state.flags.introducedDebt = true;
        if (id === 'user_repellant') state.flags.introducedFakeButtons = true;
        logMessage(`Activated ${mod.name}. The system worsens itself productively.`, 'good');
        saveGame();
        render();
      }

      function manualPress() {
        const computed = getComputed();
        const value = computed.manualValue;
        state.presses += value;
        state.totalPressesEarned += value;
        state.totalManualPresses += value;
        state.stats.clicks += 1;
        state.stats.realClicks += 1;
        state.session.lastClick = now();
        if (computed.clickResetIdle) state.session.lastClick = now();
        state.autonomy = clamp(state.autonomy + 0.08, 0, 100);
        maybeCycleButtonName();
        maybeLieOnClick(computed);
        render();
      }

      function maybeLieOnClick(computed) {
        if (Math.random() < computed.liarChance * 0.35) {
          state.session.liarsShown += 1;
          const variants = [
            'The counter blinked and became emotionally approximate.',
            'The number display issued a confidence-based estimate.',
            'A fake total was shown because the UI enjoys fiction.'
          ];
          logMessage(variants[Math.floor(Math.random() * variants.length)], 'warn');
        }
      }

      function maybeCycleButtonName(force = false) {
        if (force || Math.random() < 0.24 + state.autonomy * 0.004) {
          state.session.buttonNameIndex = (state.session.buttonNameIndex + 1 + Math.floor(Math.random() * 3)) % CONFIG.buttonNames.length;
        }
      }

      function getDisplayedPresses(real, computed) {
        if (Math.random() > computed.liarChance) return real;
        const wiggle = real * (Math.random() * 0.18 - 0.09);
        return Math.max(real + wiggle, real >= 0 ? 0 : real + wiggle);
      }

      function spawnFakePopup() {
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
        state.ui.popups.push(popup);
        state.ui.popups = state.ui.popups.slice(-4);
        renderPopups();
      }

      function closePopup(id) {
        state.ui.popups = state.ui.popups.filter(p => p.id !== id);
        state.stats.popupsClosed += 1;
        renderPopups();
      }

      function cryptoRandom() {
        return Math.random().toString(36).slice(2, 10);
      }

      function simulateFakeCrash() {
        if (fakeCrashActive) return;

        fakeCrashActive = true;
        state.session.fakeCrashCount += 1;
        state.session.lastFakeCrashAt = now();

       const overlay = document.createElement('div');
       overlay.style.position = 'fixed';
       overlay.style.inset = '0';
       overlay.style.background = 'rgba(5,8,12,0.96)';
       overlay.style.color = '#f3f7fb';
       overlay.style.zIndex = '999';
       overlay.style.display = 'grid';
       overlay.style.placeItems = 'center';

        overlay.innerHTML = `
           <div style="text-align:center; max-width: 520px; padding: 24px; border:1px solid #334155; border-radius:18px; background:#111827; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
           <div style="font-size:1.3rem; font-weight:800; margin-bottom:10px;">Fatal Press Exception</div>
           <div style="color:#9da7b3; line-height:1.5;">
             The button attempted to automate your relationship with obligation and briefly collapsed.
             Restoring progress from a real snapshot.  The button would never lie to you.
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

      function tick() {
        const current = now();
        let dt = (current - lastFrame) / 1000;
        lastFrame = current;
        if (!Number.isFinite(dt) || dt <= 0) dt = 1 / CONFIG.meta.ticksPerSecond;
        dt = Math.min(dt, 1);

        const computed = getComputed();
        const gain = computed.effectivePps * dt;
        state.presses += gain;
        state.totalPressesEarned += gain;
        state.totalGeneratedPresses += gain;
        state.autonomy = clamp(state.autonomy + computed.autonomyGain * dt * (1 + computed.effectivePps * 0.0004), 0, 100);

        const endingCooldownActive = current < (state.session.autonomyEndingCooldownUntil || 0);

        if (
          state.autonomy >= 100 &&
          !state.ui.autonomyEndingOpen &&
          !endingCooldownActive
        ) {
            openAutonomyEnding();
        }

        if (state.presses < 0) state.debt = Math.max(state.debt, -state.presses);
        else if (!computed.allowDebt) state.debt = 0;

        const idleSeconds = (current - state.session.lastClick) / 1000;
        if (computed.idleEnabled && idleSeconds > 18 && Math.random() < 0.008) {
          const insults = [
            'The game noticed you are absent and rewarded the behavior.',
            'Your lack of involvement is currently optimal.',
            'The machine appreciates that you stopped pretending to help.'
          ];
          elements.messageBar.textContent = insults[Math.floor(Math.random() * insults.length)];
        }

        if (computed.fakeButtons > 0 && (state.ui.fakeButtons.length === 0 || Math.random() < 0.01)) {
          generateFakeButtons(computed.fakeButtons);
        }

        if (
          computed.fakeCrashRate > 0 &&
          !fakeCrashActive &&
          current - (state.session.lastFakeCrashAt || 0) > 45000 &&
          Math.random() < computed.fakeCrashRate * dt
        ) {
          simulateFakeCrash();
        }

        if (computed.cursorEvasion > 0) maybeMoveButton(false, computed);
        if ((computed.cursorEvasion > 0 || computed.liarChance > 0.35) && Math.random() < 0.006) spawnFakePopup();
        if (Math.random() < 0.0025) rotateAmbientMessage();

        if (current - lastUiRender >= 125) {
          lastUiRender = current;
          renderLive();
        }
      }

      function rotateAmbientMessage() {
        state.session.currentMessage = (state.session.currentMessage + 1) % CONFIG.messages.length;
        elements.messageBar.textContent = CONFIG.messages[state.session.currentMessage];
      }

      function generateFakeButtons(count) {
        if (state.session.pointerHoldingButton) return;

        const labels = ['Press Me', 'Wrong One', 'Correct One', 'Nope', 'Useless', 'Decoy', 'Almost', 'Sad'];
        state.ui.fakeButtons = Array.from({ length: count }, (_, i) => ({
          id: `${cryptoRandom()}_${i}`,
          label: labels[Math.floor(Math.random() * labels.length)],
          x: Math.random() * 60 + 20,
          y: Math.random() * 52 + 24
        }));
        renderFakeButtons();
      }

      function maybeMoveButton(force = false, computed = getComputed()) {
        if (state.session.pointerHoldingButton) return;

        const current = now();
        if (!force && current - state.session.lastButtonJump < 300) return;
        const pressure = computed.cursorEvasion + state.autonomy / 35;
        if (!force && Math.random() > Math.min(0.95, pressure * 0.12)) return;

        state.session.lastButtonJump = current;
        const sandbox = elements.buttonSandbox.getBoundingClientRect();
        const padding = 18;
        const width = 30;
        const height = 30;
        const x = clamp(Math.random() * 100, 20, 80);
        const y = clamp(Math.random() * 100, 18, 78);
        state.ui.mainButtonPos = { x, y };

        if (Math.random() < 0.35) maybeCycleButtonName(true);
        renderButtonPosition();
      }

      function applyOfflineProgress() {
        const last = state.session.lastTick || now();
        const seconds = clamp((now() - last) / 1000, 0, 60 * 60 * 6);
        if (seconds < 2) return;
        const computed = getComputed();
        const gain = computed.effectivePps * seconds;
        state.presses += gain;
        state.totalPressesEarned += gain;
        state.totalGeneratedPresses += gain;
        state.session.offlineSeconds += seconds;
        logMessage(`Offline progress recovered ${format(gain)} presses across ${format(seconds, 1)} seconds.`, 'good');
      }

      function renderTabs() {
        elements.tabs.innerHTML = CONFIG.tabs.map(tab => `
          <button class="tab-btn ${state.ui.activeTab === tab.id ? 'active' : ''}" data-tab-target="${tab.id}">${escapeHtml(tab.label)}</button>
        `).join('');

        bySel('.tab-btn', elements.tabs).forEach(btn => {
          btn.addEventListener('click', () => {
            state.ui.activeTab = btn.dataset.tabTarget;
            bySel('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.tab === state.ui.activeTab));
            renderTabs();
          });
        });
      }

      function renderUpgradeList() {
        const computed = getComputed();
        const unlocked = CONFIG.upgrades.filter(u => state.totalPressesEarned >= u.unlockAt || (state.upgrades[u.id] || 0) > 0);
        elements.upgradeList.innerHTML = unlocked.map(upgrade => {
          const owned = state.upgrades[upgrade.id] || 0;
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
        }).join('') || `<div class="small">Press the button more. Capitalism will meet you halfway.</div>`;

        bySel('[data-buy-upgrade]', elements.upgradeList).forEach(btn => {
          btn.addEventListener('click', () => buyUpgrade(btn.dataset.buyUpgrade));
        });

        elements.automationSummary.textContent = `${computed.automationOwned} owned • base ${format(computed.basePps)} pps`;
      }

      function renderModuleList() {
        const unlocked = CONFIG.modules.filter(mod => state.totalPressesEarned >= mod.unlockAt || state.activeModules.includes(mod.id));
        elements.moduleList.innerHTML = unlocked.map(mod => {
          const active = state.activeModules.includes(mod.id);
          const incompatibleActive = state.activeModules
            .map(getModuleById)
            .filter(Boolean)
            .find(activeMod => (activeMod.incompatible || []).includes(mod.id) || (mod.incompatible || []).includes(activeMod.id));
          const disabled = !active && state.activeModules.length >= CONFIG.meta.maxActiveModules;
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
              <button class="module-toggle" ${disabled && !active ? 'disabled' : ''} data-toggle-module="${mod.id}">${active ? 'Deactivate' : 'Activate'}</button>
              ${incompatibleActive && !active ? `<div class="small bad">Blocked by ${escapeHtml(incompatibleActive.name)}.</div>` : ''}
            </div>
          `;
        }).join('') || `<div class="small">Modules unlock after a few hundred presses. The button is still pretending to be simple.</div>`;

        bySel('[data-toggle-module]', elements.moduleList).forEach(btn => {
          btn.addEventListener('click', () => toggleModule(btn.dataset.toggleModule));
        });
      }

      function renderActiveLoadout() {
        const active = state.activeModules.map(getModuleById).filter(Boolean);
        elements.activeLoadoutList.innerHTML = active.length ? active.map(mod => `
          <div class="card">
            <div class="card-title">${escapeHtml(mod.name)}</div>
            <div class="card-desc">${escapeHtml(mod.description)}</div>
            <div class="tag-row">${renderEffectTags(mod.effects)}</div>
          </div>
        `).join('') : `<div class="small">No active rule modules. The game is momentarily straightforward.</div>`;

        elements.loadoutSummary.textContent = active.length
          ? `${active.length} active module${active.length === 1 ? '' : 's'}`
          : 'Nothing harmful equipped';
      }

      function renderComboList() {
        const combos = getComboByModules(state.activeModules);
        elements.comboList.innerHTML = CONFIG.combos.map(combo => {
          const active = combos.some(c => c.id === combo.id);
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
                ${combo.modules.map(id => `<span class="tag">${escapeHtml(getModuleById(id)?.name || id)}</span>`).join('')}
              </div>
              <div class="tag-row">${renderEffectTags(combo.effects)}</div>
            </div>
          `;
        }).join('');
      }

      function renderLayers() {
        elements.layerList.innerHTML = CONFIG.layers.map(layer => {
          const gain = getLayerGain(layer);
          const baseValue = state[layer.baseResource] || 0;
          const unlocked = layer.id === 'regret' ? state.totalPressesEarned >= layer.unlockAt : baseValue >= layer.unlockAt || gain > 0 || (state[layer.resourceKey] || 0) > 0;
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

        bySel('[data-layer-reset]', elements.layerList).forEach(btn => {
          btn.addEventListener('click', () => {
            const layer = CONFIG.layers.find(l => l.id === btn.dataset.layerReset);
            if (layer) performLayerReset(layer);
          });
        });

        elements.resourceList.innerHTML = [
          ['Presses', state.presses],
          ['Regret', state.regret],
          ['Meta-Presses', state.metaPresses],
          ['Hyper-Presses', state.hyperPresses],
          ['Press Derivatives', state.pressDerivatives],
          ['Autonomy Theft', state.larceny]
        ].map(([name, val]) => `
          <div class="card">
            <div class="card-row">
              <div class="card-title">${escapeHtml(name)}</div>
              <div class="good">${format(val)}</div>
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
        const stats = [
          ['Manual clicks', state.stats.realClicks],
          ['Fake buttons clicked', state.stats.fakeClicks],
          ['Popups closed', state.stats.popupsClosed],
          ['Prestiges', state.stats.prestiges],
          ['Save exports', state.stats.exports],
          ['Save imports', state.stats.imports],
          ['Offline seconds restored', state.session.offlineSeconds]
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
        elements.frameworkNotes.innerHTML = CONFIG.frameworkNotes.map(note => `
          <div class="card"><div class="card-desc">${escapeHtml(note)}</div></div>
        `).join('');
        elements.configPreview.textContent = JSON.stringify(CONFIG, null, 2);
      }

      function renderEffectTags(effects = {}) {
        return Object.entries(effects).map(([key, value]) => `<span class="tag">${escapeHtml(effectLabel(key, value))}</span>`).join('');
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

      function renderButtonPosition() {
        const computed = getComputed();
        elements.mainButton.style.left = `${state.ui.mainButtonPos.x}%`;
        elements.mainButton.style.top = `${state.ui.mainButtonPos.y}%`;
        elements.mainButton.textContent = CONFIG.buttonNames[state.session.buttonNameIndex % CONFIG.buttonNames.length];
        const hidden = state.autonomy >= computed.hideButtonAt;
        elements.mainButton.classList.toggle('hidden', hidden);
        elements.buttonModeLabel.textContent = hidden
          ? `Mode: Fully automated at ${format(state.autonomy)}% autonomy`
          : computed.cursorEvasion > 0
            ? 'Mode: Evasive and ungrateful'
            : 'Mode: Manual humiliation';
        elements.buttonNote.textContent = hidden
          ? 'The button no longer needs your hand. It still judges it.'
          : computed.allowDebt
            ? 'You can now buy things with presses you do not possess.'
            : 'Your job is to remove yourself from this process.';
      }

      function renderFakeButtons() {
        elements.fakeButtonLayer.innerHTML = state.ui.fakeButtons.map(btn => `
          <button class="fake-button" data-fake="${btn.id}" style="left:${btn.x}%; top:${btn.y}%">${escapeHtml(btn.label)}</button>
        `).join('');
        bySel('[data-fake]', elements.fakeButtonLayer).forEach(btn => {
          btn.addEventListener('click', () => {
            state.stats.fakeClicks += 1;
            logMessage('You clicked a fake button. It did nothing with conviction.', 'bad');
            rotateAmbientMessage();
          });
        });
      }

      function renderPopups() {
        elements.popupZone.innerHTML = state.ui.popups.map(popup => `
          <div class="popup" style="left:${popup.x}%; top:${popup.y}%; transform: translate(-50%, -50%);">
            <div class="popup-title">Completely Necessary Notice</div>
            <div class="small">${escapeHtml(popup.text)}</div>
            <button data-close-popup="${popup.id}">Dismiss</button>
          </div>
        `).join('');
        bySel('[data-close-popup]', elements.popupZone).forEach(btn => {
          btn.addEventListener('click', () => closePopup(btn.dataset.closePopup));
        });
      }

      function renderTopStats() {
        const computed = getComputed();
        const shownPresses = getDisplayedPresses(state.presses, computed);
        elements.displayedPresses.textContent = format(shownPresses);
        elements.truePressesSub.textContent = `True presses: ${format(state.presses)} • total earned ${format(state.totalPressesEarned)}`;
        elements.pps.textContent = format(computed.effectivePps);
        elements.manualValue.textContent = `Manual press value: ${format(computed.manualValue)}`;
        elements.autonomyValue.textContent = `${format(state.autonomy)}%`;
        elements.autonomySub.textContent = state.autonomy >= computed.hideButtonAt
          ? 'The system no longer requires visible participation'
          : `+${format(computed.autonomyGain, 3)}/s before automation pressure`;
        elements.debtValue.textContent = format(-Math.min(0, state.presses));
        elements.debtSub.textContent = computed.allowDebt
          ? `Debt limit ${format(computed.debtLimit)} • boost x${format(computed.debtBoost)}`
          : 'Financially irresponsible mode locked';
        elements.regretValue.textContent = format(state.regret);
        elements.layerSummary.textContent =
          `Meta ${format(state.metaPresses)} • Hyper ${format(state.hyperPresses)} • Derivatives ${format(state.pressDerivatives)} • Larceny ${format(state.larceny)}`;
        elements.activeRulesValue.textContent = `${state.activeModules.length} / ${CONFIG.meta.maxActiveModules}`;
        elements.comboSummary.textContent = computed.combos.length
          ? computed.combos.map(c => c.name).join(' • ')
          : 'No harmful innovation pair active';
        elements.efficiencyValue.textContent = `x${format(computed.efficiency)}`;
        elements.inflationValue.textContent = `x${format(computed.inflation)}`;
        elements.formulaEfficiency.textContent = `passive × meta(${format(computed.metaBoost)}) × hyper(${format(computed.hyperBoost)}) × regret(${format(computed.regretBoost)}) × derivatives(${format(computed.derivativeBoost)}) × idle(${format(computed.idleBonus)}) × debt(${format(computed.debtBoost)})`;
        elements.formulaInflation.textContent = `base inflation ${format(computed.inflation)} × module costs modifier ${(computed.costMult / computed.inflation).toFixed(2)} = ${format(computed.costMult)}`;
        const idleSeconds = (now() - state.session.lastClick) / 1000;
        const idleRatio = clamp(idleSeconds / 60, 0, 1);
        elements.idleMeter.style.width = `${idleRatio * 100}%`;
        elements.idleStatus.textContent = `Idle bonus: x${format(computed.idleBonus)} after ${format(idleSeconds, 1)}s of neglect`;
        elements.idleDesc.textContent = computed.idleEnabled
          ? 'Doing nothing is now a strategy and also an insult.'
          : 'Idle abuse is currently unavailable. Keep pretending effort matters.';
        elements.clockStatus.textContent = `Tick: ${new Date().toLocaleTimeString()}`;
        elements.versionStatus.textContent = `Framework v${CONFIG.meta.version}`;
      }

      function render(save = false) {
        renderTabs();
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
        if (save) saveGame();
      }

      function renderLive() {
        renderTopStats();
        renderButtonPosition();
        renderAutonomyEnding();
        renderDumbDownCard();
      }
      
      function attachEvents() {
        elements.mainButton.addEventListener('pointerdown', (event) => {
        state.session.pointerHoldingButton = true;
        event.preventDefault();
        event.stopPropagation();
        manualPress();
      });

      elements.mainButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      window.addEventListener('pointerup', () => {
        state.session.pointerHoldingButton = false;
      });

      window.addEventListener('pointercancel', () => {
        state.session.pointerHoldingButton = false;
      });

      elements.mainButton.addEventListener('mouseenter', () => {
        if (state.session.pointerHoldingButton) return;
        const computed = getComputed();
        if (computed.cursorEvasion > 0) maybeMoveButton(true, computed);
      });

      elements.endingObserveBtn.addEventListener('click', closeAutonomyEnding);

      elements.endingReassertBtn.addEventListener('click', reassertControl);

      elements.endingPrestigeBtn.addEventListener('click', prestigeFromEnding);
      
      if (elements.dumbDownBtn) {
        elements.dumbDownBtn.addEventListener('click', performDumbDown);
      }

      
      document.addEventListener('mousemove', (event) => {
        if (state.session.pointerHoldingButton) return;
        const computed = getComputed();
        if (computed.cursorEvasion <= 0) return;
        const rect = elements.mainButton.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 150) maybeMoveButton(false, computed);
      });



        $('saveBtn').addEventListener('click', () => saveGame(true));
        $('exportBtn').addEventListener('click', exportSave);
        $('importBtn').addEventListener('click', importSave);
        $('resetBtn').addEventListener('click', hardReset);
        $('fakeCrashBtn').addEventListener('click', simulateFakeCrash);

        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            applyOfflineProgress();
            lastFrame = now();
            render();
          } else {
            saveGame();
          }
        });

        window.addEventListener('beforeunload', () => saveGame());
      }

      function init() {
        if (!state._log || !state._log.length) {
          logMessage('Session initialized. The button awaits delegation.', 'good');
        }
        applyOfflineProgress();
        render();
        attachEvents();
        lastFrame = now();
        tickHandle = setInterval(tick, 1000 / CONFIG.meta.ticksPerSecond);
        saveHandle = setInterval(() => saveGame(), 5000);
      }

      init();
    })();
