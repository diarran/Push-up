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
            // Corps 3D (~8,5 Mo) : trop volumineux pour le precache, mais
            // mis en cache des la premiere visite de l'ecran de ciblage.
            urlPattern: ({ url }) => url.pathname.startsWith("/models/"),
            handler: "CacheFirst",
            options: {
              cacheName: "modeles-3d",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 },
              rangeRequests: true
            }
          },
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
