import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';

const links: LinkItemType[] = [
  { type: 'main', text: 'Docs', url: '/docs', active: 'nested-url' },
  {
    type: 'main',
    text: 'GitHub',
    url: 'https://github.com/Agentic-Engineering-Agency/ultimate-harness',
    external: true,
  },
  {
    type: 'main',
    text: 'Linear',
    url: 'https://linear.app/agentic-eng',
    external: true,
  },
];

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Ultimate Harness',
    },
    links,
    githubUrl: 'https://github.com/Agentic-Engineering-Agency/ultimate-harness',
  };
}
