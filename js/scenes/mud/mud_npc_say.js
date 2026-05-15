/**
 * mud_npc_say.js — NPC Keyword Response System
 *
 * Makes NPCs respond to things the player says aloud.
 * When a player types "say <message>", NPCs in the room check
 * for keywords in the message and respond accordingly.
 *
 * Keyword types:
 *   - 'hail'/'hello'/'greet' → Generic greeting + opens shop if merchant
 *   - 'shop'/'buy'/'wares'/'trade' → Opens shop listing if merchant
 *   - 'quest'/'task'/'job'/'work' → Shows available quests
 *   - 'help'/'info'/'tell me' → Shows NPC's dialogue/lore
 *   - 'train'/'teach'/'learn' → Redirects to training if trainer
 *   - Custom keywords from mob.sayResponses (defined in mob data)
 */
(function () {
  'use strict';

  // ─── Universal Keyword Handlers ──────────────────────────────────────
  // These apply to any NPC regardless of their specific data.

  const KEYWORD_HANDLERS = [
    {
      // Greetings — any NPC responds, merchants also hint at shop
      keywords: ['hail', 'hello', 'greet', 'hi', 'hey', 'good day', 'howdy'],
      handler: (mob, player, roomVnum, allMobs) => {
        const output = [];
        // Pick a greeting from their dialogue if available
        const greeting = (mob.dialogue || []).find(d => !d.condition);
        if (greeting) {
          output.push({ type: 'dialogue', text: `${mob.name} says: "${greeting.text}"` });
        } else {
          output.push({ type: 'dialogue', text: `${mob.name} nods in acknowledgment.` });
        }
        // If merchant, hint at wares
        if (window.MudMerchants) {
          const shop = window.MudMerchants.getShopForMerchant(mob, roomVnum);
          if (shop) {
            output.push({ type: 'info', text: `${mob.name} gestures to their wares. "Care to browse? Type 'shop' to see what I've got."` });
          }
        }
        return output;
      }
    },
    {
      // Shopping — opens merchant inventory
      keywords: ['shop', 'buy', 'wares', 'trade', 'sell', 'browse', 'goods', 'stock', 'inventory'],
      handler: (mob, player, roomVnum) => {
        if (!window.MudMerchants) {
          return [{ type: 'info', text: `${mob.name} looks confused.` }];
        }
        const shop = window.MudMerchants.getShopForMerchant(mob, roomVnum);
        if (!shop) {
          return [{ type: 'dialogue', text: `${mob.name} says: "I'm not a merchant, friend."` }];
        }
        return window.MudMerchants.formatShopListing(mob, shop, player.gold);
      }
    },
    {
      // Quest inquiry — shows available quests from this NPC
      keywords: ['quest', 'task', 'job', 'work', 'mission', 'bounty', 'assignment'],
      handler: (mob, player, roomVnum, allMobs, quests) => {
        const mobVnum = mob.vnum;
        const available = Object.values(quests || {}).filter(q =>
          q.giver_vnum === mobVnum &&
          !(player.activeQuests || []).includes(q.id) &&
          !(player.completedQuests || []).includes(q.id)
        );
        if (available.length === 0) {
          return [{ type: 'dialogue', text: `${mob.name} says: "I've got nothing for you right now."` }];
        }
        const output = [{ type: 'dialogue', text: `${mob.name} says: "I could use some help with something..."` }];
        for (const q of available) {
          output.push({ type: 'quest', text: `  "${q.name}" - ${q.description}` });
          output.push({ type: 'info', text: `  Type 'quest ${q.name.toLowerCase()}' to accept.` });
        }
        return output;
      }
    },
    {
      // Help/info — shows NPC lore dialogue
      keywords: ['help', 'info', 'tell me', 'what do you know', 'rumor', 'rumors', 'news', 'gossip'],
      handler: (mob) => {
        const dialogues = (mob.dialogue || []).filter(d => !d.condition);
        if (dialogues.length === 0) {
          return [{ type: 'dialogue', text: `${mob.name} shrugs. "I don't know much."` }];
        }
        // Show all non-conditional dialogue
        const output = [];
        for (const d of dialogues) {
          output.push({ type: 'dialogue', text: `${mob.name} says: "${d.text}"` });
        }
        return output;
      }
    },
    {
      // Training — redirect to train command if in training room
      keywords: ['train', 'teach', 'learn', 'instruct', 'practice'],
      handler: (mob, player) => {
        const TRAINING_ROOM = 8;
        if (player.currentRoom === TRAINING_ROOM) {
          return [
            { type: 'dialogue', text: `${mob.name} says: "Ready to learn? Let me show you what I can teach."` },
            { type: 'info', text: `Type 'train' to see available abilities.` }
          ];
        }
        return [{ type: 'dialogue', text: `${mob.name} says: "You'll want to visit the Training Hall for that."` }];
      }
    },
    {
      // Farewell
      keywords: ['bye', 'goodbye', 'farewell', 'later', 'see you', 'take care'],
      handler: (mob) => {
        const farewells = [
          `${mob.name} nods. "Safe travels."`,
          `${mob.name} waves. "Until next time."`,
          `${mob.name} says: "Watch yourself out there."`,
          `${mob.name} says: "Come back anytime."`,
        ];
        return [{ type: 'dialogue', text: farewells[Math.floor(Math.random() * farewells.length)] }];
      }
    }
  ];

  /**
   * Process a "say" command and check if any NPC in the room responds.
   * @param {string} message - What the player said
   * @param {Array} roomMobVnums - Alive mob vnums in the room
   * @param {object} allMobs - Global mobs lookup
   * @param {object} player - Player object
   * @param {number} roomVnum - Current room vnum
   * @param {object} quests - Global quests lookup
   * @returns {Array} Output lines (player's speech + NPC responses)
   */
  function processSay(message, roomMobVnums, allMobs, player, roomVnum, quests) {
    const output = [];
    // Always echo what the player said
    output.push({ type: 'info', text: `You say: "${message}"` });
    if (!message || roomMobVnums.length === 0) return output;
    const msgLC = message.toLowerCase();
    // Check each NPC in the room for responses
    for (const vnum of roomMobVnums) {
      const mob = allMobs[vnum];
      if (!mob) continue;
      // Only NPCs respond (not hostile mobs)
      const isNpc = (mob.flags || []).includes('npc');
      if (!isNpc) continue;
      let responded = false;
      // Check custom sayResponses on the mob first
      if (mob.sayResponses) {
        for (const resp of mob.sayResponses) {
          const matched = (resp.keywords || []).some(kw => msgLC.includes(kw.toLowerCase()));
          if (matched) {
            output.push({ type: 'dialogue', text: `${mob.name} says: "${resp.text}"` });
            if (resp.effects) {
              // Apply any effects (give item, set flag, etc.)
              output.push(...applyEffects(resp.effects, player, mob));
            }
            responded = true;
            break;
          }
        }
      }
      // If no custom response, check universal keyword handlers
      if (!responded) {
        for (const handler of KEYWORD_HANDLERS) {
          const matched = handler.keywords.some(kw => msgLC.includes(kw));
          if (matched) {
            const response = handler.handler(mob, player, roomVnum, allMobs, quests);
            output.push(...response);
            responded = true;
            break;
          }
        }
      }
      // If the player addressed this NPC by name but no keyword matched
      if (!responded && msgLC.includes(mob.name.toLowerCase().split(' ')[0].toLowerCase())) {
        output.push({ type: 'dialogue', text: `${mob.name} looks at you expectantly.` });
      }
    }
    return output;
  }

  /**
   * Apply effects from a custom sayResponse.
   * @param {Array} effects - Effect definitions
   * @param {object} player - Player object
   * @param {object} mob - The responding mob
   * @returns {Array} Output lines
   */
  function applyEffects(effects, player, mob) {
    const output = [];
    for (const eff of effects) {
      switch (eff.type) {
        case 'give_gold':
          player.gold += eff.amount || 0;
          output.push({ type: 'success', text: `${mob.name} gives you ${eff.amount} gold.` });
          break;
        case 'give_item':
          if (eff.vnum) player.inventory.push(eff.vnum);
          output.push({ type: 'success', text: `${mob.name} gives you an item.` });
          break;
        case 'set_flag':
          if (eff.flag) player.worldFlags[eff.flag] = true;
          break;
        case 'heal':
          player.hp = Math.min(player.maxHp, player.hp + (eff.amount || 0));
          output.push({ type: 'success', text: `${mob.name} heals you for ${eff.amount} HP.` });
          break;
      }
    }
    return output;
  }

  // ─── Public API ──────────────────────────────────────────────────────
  window.MudNpcSay = {
    processSay,
    KEYWORD_HANDLERS
  };
})();
