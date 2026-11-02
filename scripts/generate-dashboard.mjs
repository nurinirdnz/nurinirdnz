// Generates the GitHub dashboard SVGs in assets/dashboard/ from the GitHub GraphQL API.
// Zero dependencies (Node 18+). Run by .github/workflows/update-dashboard.yml every 24 hours.
//
//   GITHUB_TOKEN=... GH_USER=nurinirdnz node scripts/generate-dashboard.mjs
//
// If any request fails the script exits non-zero *before* writing, so the last good
// SVGs stay in place and the README never shows a broken image.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER = process.env.GH_USER || 'nurinirdnz';
const TOKEN = process.env.GITHUB_TOKEN;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'dashboard');
const ACTIVITY_DAYS = 31;

const C = {
  bg: '#FFFBEB', border: '#EAB308', ink: '#171717', muted: '#57534E',
  gold: '#8A6700', gold2: '#B8860B', amber: '#EAB308', yellow: '#FACC15',
  soft: '#FEF3C7', grid: '#F1E2B0',
};
const LANG_COLORS = ['#171717', '#8A6700', '#B8860B', '#EAB308', '#FACC15', '#FDE68A'];
const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif";

if (!TOKEN) {
  console.error('GITHUB_TOKEN is not set.');
  process.exit(1);
}

// ---------------------------------------------------------------- data

async function gql(query, variables = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': `${USER}-readme-dashboard` },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json();
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      return json.data;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.warn(`GraphQL attempt ${attempt} failed, retrying: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function fetchProfile() {
  const { user } = await gql(`query($login: String!) {
    user(login: $login) {
      followers { totalCount }
      pullRequests { totalCount }
      issues { totalCount }
      contributionsCollection { totalCommitContributions contributionYears contributionCalendar { totalContributions } }
    }
  }`, { login: USER });
  return user;
}

async function fetchRepos() {
  const repos = [];
  let cursor = null;
  do {
    const { user } = await gql(`query($login: String!, $cursor: String) {
      user(login: $login) {
        repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
          pageInfo { hasNextPage endCursor }
          nodes { languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } } }
        }
      }
    }`, { login: USER, cursor });
    repos.push(...user.repositories.nodes);
    cursor = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (cursor);
  return repos;
}

async function fetchCalendar(years) {
  const now = new Date();
  const days = new Map();
  for (const year of years) {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = year === now.getUTCFullYear() ? now : new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const { user } = await gql(`query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) { contributionsCollection(from: $from, to: $to) {
        contributionCalendar { weeks { contributionDays { date contributionCount } } }
      } }
    }`, { login: USER, from: from.toISOString(), to: to.toISOString() });
    for (const week of user.contributionsCollection.contributionCalendar.weeks)
      for (const d of week.contributionDays) days.set(d.date, d.contributionCount);
  }
  const today = now.toISOString().slice(0, 10);
  return [...days.entries()]
    .filter(([date]) => date <= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

function computeStreaks(days) {
  const total = days.reduce((s, d) => s + d.count, 0);
  const first = days.find((d) => d.count > 0)?.date ?? null;

  let longest = { length: 0, start: null, end: null };
  let run = { length: 0, start: null };
  for (const d of days) {
    if (d.count > 0) {
      if (run.length === 0) run.start = d.date;
      run.length++;
      if (run.length > longest.length) longest = { length: run.length, start: run.start, end: d.date };
    } else run = { length: 0, start: null };
  }

  // Today without contributions doesn't break the streak yet: the day isn't over.
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  const current = { length: 0, start: null, end: i >= 0 ? days[i].date : null };
  while (i >= 0 && days[i].count > 0) { current.length++; current.start = days[i].date; i--; }
  if (current.length === 0) current.end = null;

  return { total, first, current, longest };
}

function aggregateLanguages(repos) {
  const sizes = new Map();
  for (const repo of repos)
    for (const { size, node } of repo.languages.edges) sizes.set(node.name, (sizes.get(node.name) || 0) + size);
  const total = [...sizes.values()].reduce((a, b) => a + b, 0);
  const sorted = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, LANG_COLORS.length - 1);
  const rest = sorted.slice(LANG_COLORS.length - 1).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push(['Other', rest]);
  return { total, langs: top.map(([name, size]) => ({ name, pct: total ? (size / total) * 100 : 0 })) };
}

// ---------------------------------------------------------------- svg helpers

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => n.toLocaleString('en-US');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso, withYear = true) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
};
const range = (a, b) => (a && b ? (a === b ? fmtDate(a) : `${fmtDate(a, a.slice(0, 4) !== b.slice(0, 4))} – ${fmtDate(b)}`) : 'No active streak');

function card(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">
  <title id="title">${esc(title)}</title>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="${C.bg}" stroke="${C.border}" stroke-width="2"/>
  <g font-family="${FONT}">
${body}
  </g>
</svg>
`;
}

// ---------------------------------------------------------------- renderers

function renderStats(p, repoCount, updated) {
  const rows = [
    ['Commits (past year)', p.contributionsCollection.totalCommitContributions],
    ['Pull requests', p.pullRequests.totalCount],
    ['Issues', p.issues.totalCount],
    ['Public repositories', repoCount],
    ['Followers', p.followers.totalCount],
  ];
  const yearTotal = p.contributionsCollection.contributionCalendar.totalContributions;
  const list = rows.map(([label, value], i) => {
    const y = 78 + i * 25;
    return `    <rect x="26" y="${y - 9}" width="9" height="9" rx="2" fill="${i % 2 ? C.ink : C.amber}"/>
    <text x="44" y="${y}" font-size="13" fill="${C.muted}">${esc(label)}</text>
    <text x="262" y="${y}" font-size="13" font-weight="700" fill="${C.ink}" text-anchor="end">${num(value)}</text>`;
  }).join('\n');
  return card(440, 222, `GitHub statistics for ${USER}`, `    <text x="26" y="40" font-size="18" font-weight="700" fill="${C.ink}">GitHub Stats</text>
${list}
    <circle cx="358" cy="118" r="50" fill="${C.soft}" stroke="${C.amber}" stroke-width="7"/>
    <text x="358" y="124" font-size="24" font-weight="800" fill="${C.ink}" text-anchor="middle">${num(yearTotal)}</text>
    <text x="358" y="190" font-size="11" fill="${C.gold}" text-anchor="middle" font-weight="600">contributions · past year</text>
    <text x="26" y="206" font-size="10" fill="${C.muted}">Public data · updated ${esc(updated)}</text>`);
}

function renderLanguages({ langs }, repoCount) {
  const x0 = 26, w = 308;
  let x = x0;
  const segs = langs.map((l, i) => {
    const sw = (l.pct / 100) * w;
    const seg = `      <rect x="${x.toFixed(2)}" y="58" width="${Math.max(sw, 0).toFixed(2)}" height="12" fill="${LANG_COLORS[i]}"/>`;
    x += sw;
    return seg;
  }).join('\n');
  const legend = langs.map((l, i) => {
    const cx = i % 2 ? 186 : 26, cy = 102 + Math.floor(i / 2) * 28;
    return `    <rect x="${cx}" y="${cy - 10}" width="11" height="11" rx="3" fill="${LANG_COLORS[i]}" stroke="${C.gold2}" stroke-width="0.6"/>
    <text x="${cx + 18}" y="${cy}" font-size="13" fill="${C.ink}" font-weight="600">${esc(l.name)} <tspan fill="${C.muted}" font-weight="400">${l.pct.toFixed(1)}%</tspan></text>`;
  }).join('\n');
  const empty = langs.length ? '' : `    <text x="26" y="110" font-size="13" fill="${C.muted}">No language data in public repositories yet.</text>`;
  return card(360, 222, `Most-used languages for ${USER}`, `    <text x="26" y="40" font-size="18" font-weight="700" fill="${C.ink}">Most-Used Languages</text>
    <clipPath id="bar"><rect x="${x0}" y="58" width="${w}" height="12" rx="6"/></clipPath>
    <rect x="${x0}" y="58" width="${w}" height="12" rx="6" fill="${C.soft}"/>
    <g clip-path="url(#bar)">
${segs}
    </g>
${legend}${empty}
    <text x="26" y="206" font-size="10" fill="${C.muted}">By code size across ${repoCount} public repositories</text>`);
}

function renderStreak(s) {
  const col = (cx, value, label, sub, accent) => `    <text x="${cx}" y="100" font-size="38" font-weight="800" fill="${C.ink}" text-anchor="middle">${num(value)}</text>
    <text x="${cx}" y="156" font-size="18" font-weight="700" fill="${accent}" text-anchor="middle">${esc(label)}</text>
    <text x="${cx}" y="180" font-size="15" fill="${C.muted}" text-anchor="middle">${esc(sub)}</text>`;
  const today = new Date().toISOString().slice(0, 10);
  return card(800, 214, `Contribution streak for ${USER}`, `    <line x1="267" y1="34" x2="267" y2="172" stroke="${C.grid}" stroke-width="2"/>
    <line x1="533" y1="34" x2="533" y2="172" stroke="${C.grid}" stroke-width="2"/>
${col(133, s.total, 'Total Contributions', s.first ? `${fmtDate(s.first)} – Present` : 'No contributions yet', C.ink)}
    <circle cx="400" cy="86" r="44" fill="${C.soft}" stroke="${C.amber}" stroke-width="7"/>
    <path d="M400 26c6 8 10 13 10 19a10 10 0 0 1-20 0c0-6 4-11 10-19z" fill="${C.gold2}" stroke="${C.bg}" stroke-width="3"/>
${col(400, s.current.length, 'Current Streak', range(s.current.start, s.current.end), C.gold)}
${col(667, s.longest.length, 'Longest Streak', range(s.longest.start, s.longest.end), C.ink)}
    <text x="774" y="202" font-size="12" fill="${C.muted}" text-anchor="end">Updated ${esc(fmtDate(today))}</text>`);
}

function renderActivity(days, updated) {
  const data = days.slice(-ACTIVITY_DAYS);
  const W = 800, H = 330, L = 64, R = 34, T = 86, B = 270;
  const max = Math.max(...data.map((d) => d.count), 0);
  const step = max <= 4 ? 1 : Math.ceil(max / 4 / (max > 20 ? 5 : 1)) * (max > 20 ? 5 : 1);
  const top = Math.max(step * Math.ceil(max / step), step);
  const xs = (i) => L + (i * (W - L - R)) / Math.max(data.length - 1, 1);
  const ys = (v) => B - (v / top) * (B - T);

  const grid = [];
  for (let v = 0; v <= top; v += step)
    grid.push(`    <line x1="${L}" y1="${ys(v).toFixed(1)}" x2="${W - R}" y2="${ys(v).toFixed(1)}" stroke="${C.grid}" stroke-width="1" ${v ? 'stroke-dasharray="4 4"' : ''}/>
    <text x="${L - 12}" y="${(ys(v) + 5).toFixed(1)}" font-size="14" fill="${C.muted}" text-anchor="end">${v}</text>`);
  const pts = data.map((d, i) => `${xs(i).toFixed(1)},${ys(d.count).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${xs(data.length - 1).toFixed(1)},${B} L${L},${B} Z`;
  const dots = data.map((d, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(d.count).toFixed(1)}" r="3.2" fill="${C.ink}"/>`).join('');
  const labels = data.map((d, i) => (i % 5 === 0 || i === data.length - 1)
    ? `    <text x="${xs(i).toFixed(1)}" y="${B + 26}" font-size="14" fill="${C.muted}" text-anchor="middle">${esc(fmtDate(d.date, false))}</text>` : '').filter(Boolean).join('\n');
  const total = data.reduce((s, d) => s + d.count, 0);

  return card(W, H, `Contribution activity for ${USER} over the last ${data.length} days`, `    <text x="28" y="42" font-size="22" font-weight="700" fill="${C.ink}">Contribution Activity</text>
    <text x="28" y="64" font-size="15" fill="${C.muted}">${num(total)} contributions in the last ${data.length} days</text>
    <text x="${W - R}" y="42" font-size="14" fill="${C.gold}" font-weight="600" text-anchor="end">Daily contributions</text>
${grid.join('\n')}
    <path d="${area}" fill="${C.yellow}" fill-opacity="0.35"/>
    <path d="${line}" fill="none" stroke="${C.gold2}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <g>${dots}</g>
${labels}
    <text x="${W - R}" y="${H - 12}" font-size="12" fill="${C.muted}" text-anchor="end">Updated ${esc(updated)}</text>`);
}

// ---------------------------------------------------------------- main

const profile = await fetchProfile();
const repos = await fetchRepos();
const days = await fetchCalendar(profile.contributionsCollection.contributionYears);
if (!days.length) throw new Error('Contribution calendar came back empty; refusing to overwrite existing SVGs.');

const updated = fmtDate(new Date().toISOString().slice(0, 10));
const files = {
  'stats.svg': renderStats(profile, repos.length, updated),
  'languages.svg': renderLanguages(aggregateLanguages(repos), repos.length),
  'streak.svg': renderStreak(computeStreaks(days)),
  'activity.svg': renderActivity(days, updated),
};

await mkdir(OUT_DIR, { recursive: true });
for (const [name, svg] of Object.entries(files)) {
  await writeFile(join(OUT_DIR, name), svg);
  console.log(`wrote assets/dashboard/${name}`);
}
