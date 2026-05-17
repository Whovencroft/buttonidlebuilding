import { App } from './App';

/**
 * Central bootstrap entry for the modular host runtime.
 * The app shell still expects the current repo's DOM to exist in index.html.
 */
export async function bootstrap(): Promise<App> {
  const app = new App();
  await app.init();
  return app;
}
