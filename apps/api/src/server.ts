import 'dotenv/config';
import { createApp, ensureUploadDirs } from './app.js';

const port = Number(process.env.PORT ?? 4000);
ensureUploadDirs();
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
});
