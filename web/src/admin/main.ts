import '../styles/tokens.css';
import './admin.css';
import AdminApp from './AdminApp.svelte';
import { mount } from 'svelte';

const app = mount(AdminApp, {
  target: document.getElementById('app')!,
});

export default app;
