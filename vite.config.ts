import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { defineConfig } from 'vitest/config';
import { buildTimeAppOrigin } from './src/lib/server/app-origin.ts';

export default defineConfig(({ command }) => {
  const appOrigin = buildTimeAppOrigin(command, process.env.APP_ORIGIN);
  return {
    plugins: [sveltekit({
      adapter: adapter(),
      ...(appOrigin ? { paths: { origin: appOrigin } } : {})
    })],
    define: command === 'build' ? { __BUILT_APP_ORIGIN__: JSON.stringify(appOrigin ?? '') } : {},
    test: { include: ['src/**/*.test.ts'], environment: 'node' }
  };
});
