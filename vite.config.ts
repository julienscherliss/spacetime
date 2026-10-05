import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  // Lovable injects its managed Cloud settings into preview processes. Explicit
  // owned settings keep auth, recovery and every function URL on one backend.
  if (mode !== "test" && env.VITE_AUTH_BACKEND === "owned" && env.VITE_OWNED_SUPABASE_URL) {
    const names = ["URL", "PUBLISHABLE_KEY", "PROJECT_ID"];
    for (const name of names) {
      const value = env[`VITE_OWNED_SUPABASE_${name}`];
      if (!value) throw new Error(`Missing owned backend setting: ${name}`);
      define[`import.meta.env.VITE_SUPABASE_${name}`] = JSON.stringify(value);
    }
    if (env.VITE_OWNED_SUPABASE_URL !== `https://${env.VITE_OWNED_SUPABASE_PROJECT_ID}.supabase.co`) {
      throw new Error("Owned backend URL and project do not match");
    }
  }
  return {
  define,
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  };
});
