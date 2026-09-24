#!/usr/bin/env node
// Generate the "Code map" pages from the Understand-Anything knowledge graph.
//
// Input:  apps/site/codemap/knowledge-graph.json (committed; produced by the
//         Understand-Anything `/understand` pipeline, see /contributing/site/).
// Output: src/content/docs/codemap/** (gitignored) and
//         public/explorer/knowledge-graph.json (gitignored) for the explorer.
//
// Every page is derived from the graph, so refreshing the graph refreshes the
// pages. Summaries are model-written; the structure (files, symbols, imports,
// calls) comes from tree-sitter extraction.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const graphPath = join(siteRoot, 'codemap', 'knowledge-graph.json');
const outRoot = join(siteRoot, 'src', 'content', 'docs', 'codemap');
const repoUrl = 'https://github.com/Agentic-Engineering-Agency/ultimate-harness';

rmSync(outRoot, { recursive: true, force: true });
if (!existsSync(graphPath)) {
  console.log('sync-codemap: no codemap/knowledge-graph.json, skipping');
  process.exit(0);
}

const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
mkdirSync(join(siteRoot, 'public', 'explorer'), { recursive: true });
copyFileSync(graphPath, join(siteRoot, 'public', 'explorer', 'knowledge-graph.json'));
const metaPath = join(siteRoot, 'codemap', 'meta.json');
if (existsSync(metaPath)) copyFileSync(metaPath, join(siteRoot, 'public', 'explorer', 'meta.json'));

const FILE_LEVEL = new Set(['file', 'config', 'document', 'service', 'pipeline', 'table', 'schema', 'resource', 'endpoint']);
const commit = graph.project?.gitCommitHash ?? 'main';
const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
const layers = graph.layers ?? [];
const layerOf = new Map();
for (const layer of layers) for (const id of layer.nodeIds) layerOf.set(id, layer);

/** The file-level node that owns a node (itself, or its file). */
function ownerOf(id) {
  const n = nodes.get(id);
  if (!n) return undefined;
  if (FILE_LEVEL.has(n.type)) return id;
  for (const prefix of ['file:', 'config:', 'document:']) {
    const candidate = `${prefix}${n.filePath}`;
    if (nodes.has(candidate)) return candidate;
  }
  return undefined;
}

// File-level dependency edges (imports and calls rolled up to files).
const fileEdges = new Map();
const addEdge = (a, b) => {
  const key = `${a}\u0000${b}`;
  fileEdges.set(key, (fileEdges.get(key) ?? 0) + 1);
};
for (const e of graph.edges) {
  if (!['imports', 'calls', 'depends_on'].includes(e.type)) continue;
  const a = ownerOf(e.source);
  const b = ownerOf(e.target);
  if (a && b && a !== b) addEdge(a, b);
}
const fanIn = new Map();
const fanOut = new Map();
for (const key of fileEdges.keys()) {
  const [a, b] = key.split('\u0000');
  fanOut.set(a, (fanOut.get(a) ?? 0) + 1);
  fanIn.set(b, (fanIn.get(b) ?? 0) + 1);
}
const symbolsOf = new Map();
for (const n of graph.nodes) {
  if (FILE_LEVEL.has(n.type)) continue;
  const owner = ownerOf(n.id);
  if (!owner) continue;
  if (!symbolsOf.has(owner)) symbolsOf.set(owner, []);
  symbolsOf.get(owner).push(n);
}

const slug = (layer) => layer.id.replace(/^layer:/, '');
const esc = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const fileLink = (n) => `[\`${n.filePath ?? n.name}\`](${repoUrl}/blob/${commit}/${n.filePath ?? ''})`;
const page = (title, description, body) =>
  `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`;
const write = (rel, content) => {
  const file = join(outRoot, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

const fileNodes = graph.nodes.filter((n) => FILE_LEVEL.has(n.type));
const typeCounts = graph.nodes.reduce((acc, n) => ((acc[n.type] = (acc[n.type] ?? 0) + 1), acc), {});
const edgeCounts = graph.edges.reduce((acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc), {});
const provenance = `:::note[Generated]
Built from the knowledge graph of commit [\`${String(commit).slice(0, 7)}\`](${repoUrl}/tree/${commit}) (${graph.project?.analyzedAt?.slice(0, 10) ?? 'unknown date'}), produced by [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything). Structure (files, symbols, imports, calls) comes from tree-sitter; summaries are model-written. Regenerate with the steps in [This site](/contributing/site/#code-map).
:::`;

// Overview.
const layerRows = layers
  .map((l) => `| [${esc(l.name)}](/codemap/layers/${slug(l)}/) | ${l.nodeIds.length} | ${esc(l.description)} |`)
  .join('\n');
write(
  'index.md',
  page(
    'Code map',
    'A generated map of the Ultimate Harness codebase: layers, a guided tour, hotspots and an interactive explorer.',
    `${provenance}

This section is generated from a knowledge graph of the v0.11 release line: every source file, its significant functions and classes, and how they import and call each other.

**[Open the interactive explorer →](/explorer/)** Pan, zoom, search by name or meaning, follow a node's neighbours and take the guided tour inside the graph.

## At a glance

| | Count |
|---|---|
| Files analyzed | ${fileNodes.length} |
| Functions | ${typeCounts.function ?? 0} |
| Classes | ${typeCounts.class ?? 0} |
| Import edges | ${edgeCounts.imports ?? 0} |
| Call edges | ${edgeCounts.calls ?? 0} |
| Layers | ${layers.length} |
| Tour steps | ${(graph.tour ?? []).length} |

Tests, fixtures, the acceptance campaign and prose documentation were left out of the analysis; the prose docs are under Source documents instead.

## Layers

| Layer | Files | What belongs there |
|---|---|---|
${layerRows}

## Where to go next

- [Guided tour](/codemap/tour/): read the code in dependency order.
- [Hotspots](/codemap/hotspots/): the files everything else depends on, and the files that depend on everything.
- [Architecture map](/system/architecture/): the hand-written overview this generated map complements.
`,
  ),
);

// Guided tour.
const tour = [...(graph.tour ?? [])].sort((a, b) => a.order - b.order);
write(
  'tour.md',
  page(
    'Guided tour',
    'A walk through the codebase in dependency order, generated from the knowledge graph.',
    `${provenance}

${tour
  .map((step) => {
    const files = step.nodeIds
      .map((id) => nodes.get(id))
      .filter(Boolean)
      .map((n) => `- ${fileLink(n)}: ${esc(n.summary)}`)
      .join('\n');
    const lesson = step.languageLesson ? `\n\n:::tip[Language note]\n${step.languageLesson.trim()}\n:::` : '';
    return `## ${step.order}. ${step.title}\n\n${step.description.trim()}\n\n${files}${lesson}`;
  })
  .join('\n\n')}
`,
  ),
);

// Hotspots.
const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const hotRow = ([id, count]) => {
  const n = nodes.get(id);
  const layer = layerOf.get(id);
  return `| ${fileLink(n)} | ${count} | ${layer ? `[${esc(layer.name)}](/codemap/layers/${slug(layer)}/)` : ''} | ${esc(n.summary)} |`;
};
const largest = [...symbolsOf.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15);
write(
  'hotspots.md',
  page(
    'Hotspots',
    'The most depended-on files, the files with the most dependencies, and the files with the most symbols.',
    `${provenance}

Counts are distinct files connected by an import, call or runtime dependency. A file many others depend on is expensive to change; a file that depends on many others is hard to test in isolation. Both are where refactoring pays off first (see the [debt register](/release/debt/)).

## Most depended on (fan-in)

| File | Dependents | Layer | Summary |
|---|---|---|---|
${top(fanIn, 15).map(hotRow).join('\n')}

## Most dependencies (fan-out)

| File | Depends on | Layer | Summary |
|---|---|---|---|
${top(fanOut, 15).map(hotRow).join('\n')}

## Most significant symbols

| File | Functions and classes | Layer | Summary |
|---|---|---|---|
${largest.map(([id, syms]) => hotRow([id, syms.length])).join('\n')}
`,
  ),
);

// One page per layer.
for (const layer of layers) {
  const members = layer.nodeIds.map((id) => nodes.get(id)).filter(Boolean);
  const outTo = new Map();
  const inFrom = new Map();
  for (const key of fileEdges.keys()) {
    const [a, b] = key.split('\u0000');
    const la = layerOf.get(a);
    const lb = layerOf.get(b);
    if (!la || !lb || la === lb) continue;
    if (la === layer) outTo.set(lb, (outTo.get(lb) ?? 0) + 1);
    if (lb === layer) inFrom.set(la, (inFrom.get(la) ?? 0) + 1);
  }
  const rel = (map) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([l, c]) => `[${esc(l.name)}](/codemap/layers/${slug(l)}/) (${c})`)
      .join(', ') || 'none';
  const rows = members
    .sort((a, b) => (a.filePath ?? '').localeCompare(b.filePath ?? ''))
    .map((n) => {
      const syms = (symbolsOf.get(n.id) ?? [])
        .slice()
        .sort((a, b) => (a.lineRange?.[0] ?? 0) - (b.lineRange?.[0] ?? 0))
        .slice(0, 8)
        .map((s) => `\`${s.name}\``)
        .join(', ');
      const more = (symbolsOf.get(n.id)?.length ?? 0) > 8 ? ', ...' : '';
      return `| ${fileLink(n)} | ${esc(n.summary)} | ${syms}${more} |`;
    })
    .join('\n');
  write(
    `layers/${slug(layer)}.md`,
    page(
      layer.name,
      layer.description,
      `${provenance}

${layer.description}

**Depends on:** ${rel(outTo)}

**Used by:** ${rel(inFrom)}

(Numbers are distinct file-to-file dependencies.)

## Files

| File | Summary | Key symbols |
|---|---|---|
${rows}
`,
    ),
  );
}

console.log(`sync-codemap: ${layers.length} layers, ${tour.length} tour steps, ${fileNodes.length} files`);
