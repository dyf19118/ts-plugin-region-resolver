import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: './src/main.ts',
      formats: ['umd'],
      name: 'ts-plugin-region-resolver',
    },
    outDir: 'lib'
  },
})