import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copilotChatPlugin } from './server/chat-api';

export default defineConfig({
  plugins: [react(), copilotChatPlugin()],
  base: './',
});
