import type { SceneId } from '../core/state/AppState';

export type ProgressionSceneId = SceneId | string;
export type ChapterId = string;
export type EndingId = string;

export interface ChapterNode {
  id: ChapterId;
  sceneId: ProgressionSceneId;
  title: string;
  endings: EndingId[];
  next: Partial<Record<EndingId | 'complete' | 'fail', ProgressionSceneId>>;
  unlocks?: ProgressionSceneId[];
}

export interface ChapterGraphDefinition {
  startSceneId: ProgressionSceneId;
  chapters: ChapterNode[];
}

/**
 * The current repo only knows about button_idle and marble in AppState.
 * This graph is intentionally broader so future scenes can be registered here
 * before the save schema is expanded to include every planned genre.
 */
export const DEFAULT_CHAPTER_GRAPH: ChapterGraphDefinition = {
  startSceneId: 'button_idle',
  chapters: [
    {
      id: 'chapter_0',
      sceneId: 'button_idle',
      title: 'The Button',
      endings: ['button_idle_complete'],
      next: {
        button_idle_complete: 'marble'
      },
      unlocks: ['marble']
    },
    {
      id: 'chapter_1',
      sceneId: 'marble',
      title: 'The Drop',
      endings: ['marble_complete'],
      next: {}
    }
  ]
};

export class ChapterGraph {
  private readonly bySceneId = new Map<ProgressionSceneId, ChapterNode>();
  private readonly byChapterId = new Map<ChapterId, ChapterNode>();
  private readonly definition: ChapterGraphDefinition;

  public constructor(definition: ChapterGraphDefinition = DEFAULT_CHAPTER_GRAPH) {
    this.definition = {
      startSceneId: definition.startSceneId,
      chapters: [...definition.chapters]
    };

    for (const chapter of this.definition.chapters) {
      this.bySceneId.set(chapter.sceneId, chapter);
      this.byChapterId.set(chapter.id, chapter);
    }
  }

  public getStartSceneId(): ProgressionSceneId {
    return this.definition.startSceneId;
  }

  public getChapterBySceneId(sceneId: ProgressionSceneId): ChapterNode | null {
    return this.bySceneId.get(sceneId) ?? null;
  }

  public getChapterById(chapterId: ChapterId): ChapterNode | null {
    return this.byChapterId.get(chapterId) ?? null;
  }

  public getNextSceneId(sceneId: ProgressionSceneId, endingId?: EndingId | null): ProgressionSceneId | null {
    const chapter = this.getChapterBySceneId(sceneId);
    if (!chapter) {
      return null;
    }

    if (endingId && chapter.next[endingId]) {
      return chapter.next[endingId] ?? null;
    }

    return chapter.next.complete ?? null;
  }

  public getUnlocksForScene(sceneId: ProgressionSceneId): ProgressionSceneId[] {
    const chapter = this.getChapterBySceneId(sceneId);
    return chapter?.unlocks ? [...chapter.unlocks] : [];
  }

  public listChapters(): ChapterNode[] {
    return [...this.definition.chapters];
  }
}
