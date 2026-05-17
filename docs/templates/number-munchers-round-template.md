# Number Munchers Round Template

## Purpose
Defines reusable Number Munchers round configuration for grid size, prompt rules, and run limits.

## Template Definition
```js
{
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
}
```

## Field Reference
- `id` (string, required): stable configuration id.
- `startingLives` (number, required): lives at run start.
- `maxRounds` (number, required): run completion threshold.
- `maxMovesPerRound` (number, required): movement limit per round.
- `grid.rows`/`grid.cols` (number, required): visible board dimensions.
- `grid.min`/`grid.max` (number, required): generated number range.
- `prompts` (array, required): list of rule prompts rotated per round.
- `prompts[].type` (string, required): supported rule type (`divisible_by`, `greater_than`, `less_than`, `ends_with`).

## Usage Instructions
1. Copy template into `public/data/number-munchers-rounds.json`.
2. Fill required fields with concrete numeric values.
3. Keep rule types aligned with runtime support.
4. Keep grids readable for target devices.
5. Update runtime template + docs template together if schema changes.

## Example Instance
```js
{
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
}
```
