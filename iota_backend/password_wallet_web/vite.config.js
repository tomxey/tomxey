import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under a GitHub Pages subpath.
  base: './',
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        todo: new URL('./todo.html', import.meta.url).pathname,
      },
    },
  },
});
