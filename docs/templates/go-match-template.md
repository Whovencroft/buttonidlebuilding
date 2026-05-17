# Go Match Template

## Purpose
Defines a reusable Go match preset for board size and scoring behavior used by the Go scene.

## Template Definition
```js
{
  id: 'go_match_id',
  boardSize: 9,
  komi: 0,
  captureScoring: true,
  description: 'Go match configuration description.'
}
```

## Field Reference
- `id` (string, required): unique preset id.
- `boardSize` (number, required): odd integer >= 5.
- `komi` (number, required): white score adjustment.
- `captureScoring` (boolean, required): include captures in final scoring.
- `description` (string, required): deterministic preset summary.

## Usage Instructions
1. Copy template into `public/data/go-matches.json`.
2. Fill all required fields with concrete values.
3. Keep `boardSize` odd and >= 5.
4. Select one preset as `default` for scene startup.
5. Update runtime template and this doc together if schema changes.

## Extension Rules
- Do not remove required fields.
- Keep ids stable after release for compatibility.
- New fields require matching scene runtime support.

## Example Instance
```js
{
  id: 'go_standard_9x9',
  boardSize: 9,
  komi: 0,
  captureScoring: true,
  description: 'Default 9x9 scaffold match configuration.'
}
```
