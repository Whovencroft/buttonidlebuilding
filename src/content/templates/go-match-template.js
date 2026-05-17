/**
 * Go match template for repeatable board/ruleset definitions.
 * Purpose: standardize go match instances used by the Go scene.
 */
export const GO_MATCH_TEMPLATE = {
  // Unique configuration id for reference/debug/versioning.
  id: 'go_match_id',
  // Board size in intersections per side. Valid: odd integer >= 5.
  boardSize: 9,
  // Komi value added to white during score comparison.
  komi: 0,
  // Whether captures are included in final score totals.
  captureScoring: true,
  // Human-readable deterministic description of this match preset.
  description: 'Go match configuration description.'
};

/**
 * Steps for creating a new Go match preset.
 */
export const GO_MATCH_USAGE = [
  '1) Copy GO_MATCH_TEMPLATE into public/data/go-matches.json.',
  '2) Set id/boardSize/komi/captureScoring/description with concrete values.',
  '3) Keep boardSize odd and >= 5 to match current board renderer grid assumptions.',
  '4) Set one preset as default for the active Go scene startup configuration.',
  '5) If fields change, update docs/templates/go-match-template.md in the same pass.'
];

/**
 * Complete deterministic example match preset.
 */
export const GO_MATCH_EXAMPLE = {
  id: 'go_standard_9x9',
  boardSize: 9,
  komi: 0,
  captureScoring: true,
  description: 'Default 9x9 scaffold match configuration.'
};
