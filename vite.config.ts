import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [!process.env.VITEST && reactRouter()],
  server: { port: Number(process.env.PORT) || 4444, strictPort: true },
});
