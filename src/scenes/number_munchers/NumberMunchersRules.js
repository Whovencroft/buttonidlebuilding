/**
 * Number Munchers rule helpers for target validation and round generation.
 */
export function matchesPromptRule(value, rule) {
  if (!Number.isFinite(value) || !rule || typeof rule !== 'object') return false;

  switch (rule.type) {
    case 'divisible_by':
      return Number.isFinite(rule.value) && rule.value !== 0 && value % rule.value === 0;
    case 'greater_than':
      return Number.isFinite(rule.value) && value > rule.value;
    case 'less_than':
      return Number.isFinite(rule.value) && value < rule.value;
    case 'ends_with': {
      const suffix = String(rule.value ?? '');
      return suffix.length > 0 && String(value).endsWith(suffix);
    }
    default:
      return false;
  }
}

export function buildGridRound(config, roundIndex) {
  const rows = clampInt(config?.grid?.rows, 4, 12, 6);
  const cols = clampInt(config?.grid?.cols, 4, 12, 8);
  const min = clampInt(config?.grid?.min, 1, 999, 1);
  const max = clampInt(config?.grid?.max, min + 1, 999, 60);
  const prompts = Array.isArray(config?.prompts) && config.prompts.length > 0
    ? config.prompts
    : [{ id: 'even', text: 'Eat numbers divisible by 2', type: 'divisible_by', value: 2 }];
  const prompt = prompts[roundIndex % prompts.length];

  const totalCells = rows * cols;
  const minTargetCount = Math.max(4, Math.floor(totalCells * 0.2));
  let values = [];
  let targets = new Set();

  for (let attempt = 0; attempt < 32; attempt += 1) {
    values = [];
    targets = new Set();

    for (let i = 0; i < totalCells; i += 1) {
      const value = randomInt(min, max);
      values.push(value);
      if (matchesPromptRule(value, prompt)) {
        targets.add(i);
      }
    }

    if (targets.size >= minTargetCount) break;
  }

  return {
    rows,
    cols,
    prompt,
    values,
    targets: Array.from(targets).sort((a, b) => a - b)
  };
}

export function getRoundOutcome(round, progress) {
  const eatenCount = countEaten(progress?.eatenTargets);
  const totalTargets = round.targets.length;
  const maxMoves = Number.isFinite(progress?.maxMoves) ? progress.maxMoves : Infinity;

  if (eatenCount >= totalTargets && totalTargets > 0) {
    return { status: 'round_complete', reason: 'all_targets_eaten' };
  }

  if (progress.moves >= maxMoves) {
    return { status: 'round_failed', reason: 'out_of_moves' };
  }

  if (progress.lives <= 0) {
    return { status: 'failed', reason: 'out_of_lives' };
  }

  return { status: 'playing', reason: 'continue' };
}

export function getNextLevelStatus(config, levelIndex) {
  const maxRounds = clampInt(config?.maxRounds, 1, 99, 5);
  if (levelIndex + 1 >= maxRounds) {
    return { status: 'complete', nextLevelIndex: levelIndex };
  }

  return { status: 'playing', nextLevelIndex: levelIndex + 1 };
}

function clampInt(value, min, max, fallback) {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function countEaten(eatenTargets) {
  if (eatenTargets instanceof Set) return eatenTargets.size;
  if (Array.isArray(eatenTargets)) return eatenTargets.length;
  if (eatenTargets && typeof eatenTargets === 'object') return Object.keys(eatenTargets).length;
  return 0;
}
