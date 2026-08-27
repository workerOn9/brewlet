import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 把重 vendor 拆成独立 chunk（@xyflow/@dagre 另被 App.tsx React.lazy 懒加载），
// 避免单 chunk > 500KB 的构建警告，并优化浏览器分包缓存（Tauri 本地加载同样有益）。
const manualChunks = (id: string): string | undefined => {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("node_modules/@xyflow") || id.includes("node_modules/@dagrejs"))
    return "flow";
  if (id.includes("node_modules/@tanstack/react-query")) return "query";
  // 只匹配 react / react-dom 本身，不误伤 @tanstack/react-* 与其它含 react 的包。
  if (id.includes("node_modules/react-dom") || /node_modules\/react\//.test(id))
    return "react";
  return undefined;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    rollupOptions: { output: { manualChunks } },
  },
});
