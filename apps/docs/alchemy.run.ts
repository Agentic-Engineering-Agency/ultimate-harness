import alchemy from 'alchemy';
import { TanStackStart } from 'alchemy/cloudflare';

const app = await alchemy('uh-docs');

export const website = await TanStackStart('uh-docs', {
  build: 'bun run build',
  wrangler: {
    transform: (spec) => ({
      ...spec,
      name: 'uh-docs',
    }),
  },
});

console.log({ url: website.url });

await app.finalize();
