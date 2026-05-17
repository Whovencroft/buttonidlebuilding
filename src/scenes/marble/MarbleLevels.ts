export interface MarbleVector2 {
  x: number;
  y: number;
}

export interface MarbleLevel {
  id: string;
  name: string;
  width: number;
  height: number;
  start: MarbleVector2;
  goal: MarbleVector2;
}

const LEVELS: MarbleLevel[] = [
  {
    id: 'training_run',
    name: 'Training Run',
    width: 16,
    height: 10,
    start: { x: 2, y: 5 },
    goal: { x: 13, y: 5 }
  }
];

export function getMarbleLevels(): MarbleLevel[] {
  return LEVELS.map((level) => ({ ...level, start: { ...level.start }, goal: { ...level.goal } }));
}

export function getMarbleLevelById(levelId: string): MarbleLevel {
  const level = LEVELS.find((entry) => entry.id === levelId);
  if (!level) {
    throw new Error(`Unknown marble level "${levelId}".`);
  }

  return { ...level, start: { ...level.start }, goal: { ...level.goal } };
}
