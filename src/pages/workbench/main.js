import { createApp } from 'vue';
import App from './App.vue';
import '../../assets/styles/main.css';
import '../../assets/styles/workbench.css';

console.log('[Workbench] Mounting Vue app...');
createApp(App).mount('#app');
console.log('[Workbench] Vue app mounted successfully!');
