import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./index.css";
import { startProtectedApp } from './lib/protectedBootstrap';

// App, stores and the Auth client must remain behind this dynamic import.
// Fonts/CSS and the recovery module have no store/Auth initialization effects.
void startProtectedApp(document.getElementById('root')!, () => localStorage, async () => {
  const { startApp } = await import('./startApp');
  startApp();
}, import.meta.env.VITE_AUTH_BACKEND === 'owned');
