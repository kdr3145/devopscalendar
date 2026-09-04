import { defineConfig } from "vite";

// base: "./" → GitHub Pages 하위 경로(https://<id>.github.io/<repo>/)에서도 자산 경로가 맞습니다.
export default defineConfig({
  base: "./",
  build: { outDir: "dist" },
});
