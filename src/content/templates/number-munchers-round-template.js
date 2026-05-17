/**
 * Number Munchers round-config template.
 * Purpose: standardize puzzle tuning payloads used by the Number Munchers scene.
 */
export const NUMBER_MUNCHERS_ROUND_TEMPLATE = {
  id: 'number_munchers_config_id',
  startingLives: 3,
  maxRounds: 5,
  maxMovesPerRound: 24,
  grid: {
    rows: 6,
    cols: 8,
    min: 1,
    max: 60
  },
  prompts: [
    {
      id: 'div2',
      text: 'Eat numbers divisible by 2',
      type: 'divisible_by',
      value: 2
    }
  ]
};

export const NUMBER_MUNCHERS_ROUND_USAGE = [
  '1) Copy NUMBER_MUNCHERS_ROUND_TEMPLATE into public/data/number-munchers-rounds.json under default.',
  '2) Set concrete id/lives/round limits/grid dimensions/range values.',
  '3) Define prompt rules using currently supported types: divisible_by, greater_than, less_than, ends_with.',
  '4) Keep rows*cols reasonable for current canvas readability (recommended <= 64 cells).',
  '5) If schema changes, update docs/templates/number-munchers-round-template.md in same pass.'
];

export const NUMBER_MUNCHERS_ROUND_EXAMPLE = {
  id: 'number_munchers_standard_v1',
  startingLives: 3,
  maxRounds: 5,
  maxMovesPerRound: 24,
  grid: {
    rows: 6,
    cols: 8,
    min: 1,
    max: 60
  },
  prompts: [
    { id: 'div2', text: 'Eat numbers divisible by 2', type: 'divisible_by', value: 2 },
    { id: 'gt30', text: 'Eat numbers greater than 30', type: 'greater_than', value: 30 }
  ]
};
