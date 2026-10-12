#!/usr/bin/env node
// One-command deploy to Cloudflare's free plan: login -> build -> deploy -> secrets.
// The D1 database needs no setup: Wrangler finds (or creates) the "moviematch" database on deploy.
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/** Run a shell command (shell:true so it also works with Windows .cmd shims). */
function sh(cmd, { input, inherit = false } = {}) {
  const r = spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    input,
    stdio: inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
  });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

const say = (msg = '') => console.log(msg);
function fail(msg, detail) {
  console.error(`\n✖ ${msg}`);
  if (detail) console.error(detail.trim().split('\n').slice(-12).join('\n'));
  process.exit(1);
}

/** Pull a JSON array/object out of output that may have banner lines around it. */
function parseJson(text, open, close) {
  const a = text.indexOf(open);
  const b = text.lastIndexOf(close);
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}

say('\n🍿 FlickPick → Cloudflare (free plan)\n');

// 1. Cloudflare login ---------------------------------------------------------
const loggedIn = () => {
  const r = sh('npx wrangler whoami');
  return r.ok && !/not authenticated|not logged in|not signed in/i.test(r.out);
};
if (!loggedIn()) {
  say('First, sign in to Cloudflare. A browser window will open — log in (or create a free account) and click Allow.\n');
  sh('npx wrangler login', { inherit: true });
  if (!loggedIn()) fail('Couldn’t confirm your Cloudflare login. Run `npx wrangler login` and try again.');
}
say('✔ Signed in to Cloudflare');

// 2. A couple of questions (skipped on re-deploys) ----------------------------
const existing = new Set();
{
  const r = sh('npx wrangler secret list --format json');
  const list = r.ok ? parseJson(r.out, '[', ']') : null;
  for (const s of list ?? []) existing.add(s.name);
}
const secrets = {};
if (!existing.has('APP_PASSCODE') || !(existing.has('TMDB_API_KEY') || existing.has('TMDB_READ_TOKEN'))) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  if (!existing.has('APP_PASSCODE')) {
    say('\nYour app will live at a public web address. A household passcode keeps strangers out (you both enter it once per phone).');
    const v = (await rl.question('Pick a passcode (or press Enter to skip): ')).trim();
    if (v) secrets.APP_PASSCODE = v;
  }
  if (!existing.has('TMDB_API_KEY') && !existing.has('TMDB_READ_TOKEN')) {
    say('\nYour free TMDB key (themoviedb.org/settings/api) powers posters and streaming info.');
    const v = (await rl.question('Paste it here (or press Enter to enter it in the app instead): ')).trim();
    if (v) secrets[v.length > 40 ? 'TMDB_READ_TOKEN' : 'TMDB_API_KEY'] = v;
  }
  rl.close();
}

// 4. Build and deploy ---------------------------------------------------------
say('\nBuilding the app…');
if (!sh('npm run build', { inherit: true }).ok) fail('The build failed (see above).');

say('\nDeploying…\n');
if (!sh('npx wrangler deploy', { inherit: true }).ok) fail('Deploy failed (see above).');

// 5. Secrets (after the Worker exists) -----------------------------------------
for (const [name, value] of Object.entries(secrets)) {
  const r = sh(`npx wrangler secret put ${name}`, { input: `${value}\n` });
  if (!r.ok) fail(`Couldn’t save ${name}.`, r.out);
  say(`✔ Saved ${name}`);
}

say('\n🎉 Done! Open the https://moviematch….workers.dev address printed above on both phones.');
say('   Then: Share → Add to Home Screen (iPhone Safari) or Install app (Android Chrome).');
say('   To update later after changes, just run `npm run deploy` again.\n');
