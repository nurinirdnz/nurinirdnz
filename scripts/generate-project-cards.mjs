// Generates the static Featured Projects cards in assets/projects/.
// Edit PROJECTS below, then run:  node scripts/generate-project-cards.mjs
// SVG has no text wrapping, so each description is given as pre-broken lines (~48 chars max).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'projects');

const PROJECTS = [
  {
    file: 'simetown.svg',
    monogram: 'ST',
    tag: 'HACKATHON 2026 · TEAM LEADER',
    title: 'SimeTown',
    subtitle: 'Township Super-App',
    lines: ['Multi-role smart township prototype connecting', 'residents, merchants, couriers, guards and', 'township management.'],
    stackLabel: 'STACK',
    stack: ['TypeScript', 'Full-Stack', 'System Design', 'UI/UX'],
  },
  {
    file: 'final-year-project.svg',
    monogram: 'FY',
    tag: 'FINAL YEAR PROJECT · ONGOING',
    title: 'Fire Hotspot & Haze Risk',
    subtitle: 'AI · Environmental Analytics',
    lines: ['AI-based real-time classification and', 'prioritisation of fire hotspots for transboundary', 'haze risk in Sarawak.'],
    stackLabel: 'PLANNED STACK',
    stack: ['Python', 'scikit-learn', 'XGBoost', 'Streamlit'],
  },
  {
    file: 'jomdekan.svg',
    monogram: 'JD',
    tag: 'ACADEMIC COLLABORATION',
    title: 'JomDekan',
    subtitle: 'Academic Collaboration Platform',
    lines: ['Centralised student platform for resource', 'sharing, discussions, tutoring and AI-powered', 'study tools.'],
    stackLabel: 'STACK',
    stack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
  },
  {
    file: 'jombeli.svg',
    monogram: 'JB',
    tag: 'KADA BOOTCAMP · FULL-STACK',
    title: 'JomBeli',
    subtitle: 'Full-Stack E-Commerce',
    lines: ['Online shop with JWT auth, server-side price', 'checks, transactional orders and Redis', 'caching.'],
    stackLabel: 'STACK',
    stack: ['React', 'Express', 'PostgreSQL', 'Redis'],
  },
];

const C = { bg: '#FFFBEB', border: '#EAB308', ink: '#171717', muted: '#57534E', gold: '#8A6700', yellow: '#FACC15', soft: '#FEF3C7' };
const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Generous per-character estimate so chips never clip in wider fallback fonts.
const textWidth = (s, size) => s.length * size * 0.6;

function render(p) {
  const W = 400, H = 232;
  let x = 24;
  const chips = p.stack.map((t) => {
    const w = Math.ceil(textWidth(t, 11) + 16);
    const chip = `    <rect x="${x}" y="186" width="${w}" height="24" rx="12" fill="${C.ink}"/>
    <text x="${x + w / 2}" y="202" font-size="11" font-weight="600" fill="${C.yellow}" text-anchor="middle">${esc(t)}</text>`;
    x += w + 6;
    return chip;
  }).join('\n');
  if (x - 6 > W - 24) throw new Error(`${p.file}: stack chips overflow the card (${x - 6}px)`);
  const desc = p.lines.map((l, i) => `    <text x="24" y="${112 + i * 18}" font-size="13" fill="${C.muted}">${esc(l)}</text>`).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(`${p.title} — ${p.subtitle}`)}</title>
  <desc id="desc">${esc(`${p.lines.join(' ')} ${p.stackLabel}: ${p.stack.join(', ')}.`)}</desc>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${C.bg}"/>
  <path d="M1 15a14 14 0 0 1 14-14h${W - 30}a14 14 0 0 1 14 14v5H1z" fill="${C.yellow}"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="none" stroke="${C.border}" stroke-width="2"/>
  <g font-family="${FONT}">
    <rect x="24" y="36" width="44" height="44" rx="10" fill="${C.ink}"/>
    <text x="46" y="64" font-size="17" font-weight="800" fill="${C.yellow}" text-anchor="middle">${esc(p.monogram)}</text>
    <text x="80" y="50" font-size="10" font-weight="700" fill="${C.gold}" letter-spacing="0.8">${esc(p.tag)}</text>
    <text x="80" y="73" font-size="19" font-weight="800" fill="${C.ink}">${esc(p.title)}</text>
    <text x="376" y="50" font-size="11" font-weight="700" fill="${C.gold}" text-anchor="end">View repo →</text>
    <text x="24" y="94" font-size="12" font-weight="600" fill="${C.ink}" opacity="0.8">${esc(p.subtitle)}</text>
${desc}
    <text x="24" y="178" font-size="9.5" font-weight="700" fill="${C.gold}" letter-spacing="1">${esc(p.stackLabel)}</text>
${chips}
  </g>
</svg>
`;
}

await mkdir(OUT_DIR, { recursive: true });
for (const p of PROJECTS) {
  await writeFile(join(OUT_DIR, p.file), render(p));
  console.log(`wrote assets/projects/${p.file}`);
}
