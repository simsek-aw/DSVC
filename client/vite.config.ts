import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Workspace packages are symlinked from node_modules; without this Vite/Rollup
    // follows the symlink to the real path outside node_modules and then skips
    // CJS-interop detection for that module, breaking named imports from @canos/shared.
    preserveSymlinks: true,
  },
  server: {
    host: true,
    port: 5173,
  },
});
