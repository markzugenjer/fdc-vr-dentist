import { App } from './core/app.js';
import { setupOverlay } from './overlay.js';
import { createClinic } from './game/game.js';

const app = new App(document.getElementById('app'), { clinic: createClinic });
setupOverlay(app);
app.goTo('clinic');

window.fdcApp = app; // handy in the browser console
