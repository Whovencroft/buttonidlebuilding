import { App } from './App.js';

/**
 * Creates and initializes the Milestone 1 host app entrypoint.
 */
export async function bootstrap() {
  const app = new App();
  await app.init();
  return app;
}
