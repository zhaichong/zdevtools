import { createApp } from 'vue';
import App from './App.vue';
import '../../assets/styles/main.css';

console.log('[Dashboard] Mounting Vue app...');
createApp(App).mount('#app');
console.log('[Dashboard] Vue app mounted successfully!');
