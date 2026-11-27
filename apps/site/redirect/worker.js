// Permanent redirect from the retired docs domain to the new site. Paths do
// not map one to one (the old site used /docs/<slug>), so everything lands on
// the new home page except the few old routes that have a clear new home.
const NEW_ORIGIN = 'https://uh.agenticeng.app';
const MOVED = {
  '/docs': '/',
  '/docs/quickstart': '/start/install/',
  '/docs/roadmap': '/source/docs/roadmap/',
  '/docs/architecture/overview': '/system/architecture/',
  '/llms.txt': '/',
};

export default {
  fetch(request) {
    const { pathname } = new URL(request.url);
    const target = MOVED[pathname.replace(/\/$/, '') || '/'] ?? '/';
    return Response.redirect(`${NEW_ORIGIN}${target}`, 301);
  },
};
