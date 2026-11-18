import './styles/tokens.css';
import './styles/global.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/chat.css';

import { renderShell } from './components/layout/Shell.js';
import { defineRoute, startRouter } from './app/router.js';
import { registerServiceWorker, onConnectivityChange } from './services/OfflineService.js';

import home from './pages/home/home.js';
import assistant from './pages/assistant/assistant.js';
import settings from './pages/settings/settings.js';
import { directory, campusMap, guide, announcements, about } from './pages/placeholders.js';

const shell = renderShell(document.getElementById('app'));

defineRoute('/', home);
defineRoute('/assistant', assistant);
defineRoute('/directory', directory);
defineRoute('/map', campusMap);
defineRoute('/guide', guide);
defineRoute('/announcements', announcements);
defineRoute('/about', about);
defineRoute('/settings', settings);

onConnectivityChange((online) => shell.setOnline(online));
startRouter(shell.outlet, (path) => shell.setActive(path));
registerServiceWorker();
