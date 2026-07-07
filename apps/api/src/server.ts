import { createApp } from './app.js';
import { initStore } from './store.js';

const port = Number(process.env.PORT || 4000);
await initStore();

const app = createApp();
app.listen(port, () => {
  console.log(`law-ai-api listening on ${port}`);
});
