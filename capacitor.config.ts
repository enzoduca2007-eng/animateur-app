import type { CapacitorConfig } from "@capacitor/cli";

// L'app native charge directement le site déjà en ligne (Vercel) plutôt
// qu'un export statique : Next.js utilise des API routes et du rendu
// serveur (auth Supabase via cookies, etc.) qui ne s'exportent pas en
// statique. C'est l'approche recommandée par Capacitor pour ce cas de
// figure ("live reload" en dev, "remote URL" en prod) — l'app est une
// coquille native qui affiche le site dans une WebView.
const config: CapacitorConfig = {
  appId: "com.animateurapp.app",
  appName: "AnimTaStructure",
  webDir: "public",
  server: {
    url: "https://animateur-app.vercel.app",
    androidScheme: "https",
  },
};

export default config;
