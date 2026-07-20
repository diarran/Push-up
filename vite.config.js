import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false, // public/manifest.json fait deja foi, reference dans index.html
      includeAssets: ["icons/*.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg}"],
        runtimeCaching: [
          {
            // Modele et runtime MediaPipe (WASM, tflite) charges depuis le CDN
            urlPattern: ({ url }) =>
              url.origin === "https://cdn.jsdelivr.net" || url.origin === "https://storage.googleapis.com",
            handler: "CacheFirst",
            options: {
              cacheName: "mediapipe-assets",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true
  }
});
