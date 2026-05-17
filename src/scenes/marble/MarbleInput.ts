import { InputService, type InputSnapshot } from '../../core/input/InputService';

export interface MarbleInput {
  attach(): void;
  detach(): void;
  snapshot(): InputSnapshot;
  endFrame(): void;
}

export function createMarbleInput(service: InputService = new InputService()): MarbleInput {
  return {
    attach(): void {
      service.attach();
    },
    detach(): void {
      service.detach();
    },
    snapshot(): InputSnapshot {
      return service.snapshot();
    },
    endFrame(): void {
      service.endFrame();
    }
  };
}
