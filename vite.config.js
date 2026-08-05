import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [
    viteSingleFile(),
    {
      name: 'strip-file-redirect',
      transformIndexHtml(html) {
        return html.replace(/<script data-file-redirect>[\s\S]*?<\/script>/, '');
      },
    },
  ],
  build: {
    target: 'es2018',
  },
});
