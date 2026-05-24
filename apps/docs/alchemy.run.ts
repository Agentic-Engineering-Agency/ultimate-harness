import alchemy from 'alchemy';
import { TanStackStart } from 'alchemy/cloudflare';

const app = await alchemy('uh-docs');

export const website = await TanStackStart('uh-docs', {
  build: 'bun run build',
  // CI runs with ephemeral Alchemy state (no persistent store yet), so the
  // pre-existing `uh-docs` Worker isn't tracked and a plain create fails
  // ("already exists"). Adopt it and update in place (forwarded to the Worker).
  adopt: true,
  // Worker assets: Pages-style _redirects (/* /index.html 200) is rejected (CF 10021).
  spa: true,
  wrangler: {
    transform: (spec) => ({
      ...spec,
      name: 'uh-docs',
    }),
  },
});

console.log({ url: website.url });

await app.finalize();
