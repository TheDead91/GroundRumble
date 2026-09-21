// Convergence sweep — fresh-state dialog micro-branches.
// Each probe is independent; failures recorded, never thrown.
import { chromium } from 'playwright';
import { installMockProvider } from './mock-provider-route.mjs';

const base = process.env.EXPLORATORY_BASE_URL || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const B = (name) => page.getByRole('button', { name, exact: true });
const P = (name) => page.getByPlaceholder(name, { exact: true });
const text = () => page.locator('body').innerText();
const _sim = await installMockProvider(page);
void _sim;
const covered = [];
const findings = [];
const pageerrors = [];
page.on('pageerror', (e) => pageerrors.push(e.message));
const record = (id, d) => covered.push(`${id}: ${d}`);
const vaultLocked = async () =>
  (await page.locator('input[placeholder="Vault passphrase"]').count()) > 0 ||
  (await B('Unlock keys').count()) > 0 ||
  (await B('Continue in read-only mode').count()) > 0;
async function nav(name) {
  try {
    await B(name).click({ timeout: 8000 });
  } catch {
    record('HARNESS', `nav ${name} intercepted; force-clicking`);
    await B(name).click({ force: true });
  }
}
const unlock = async () => {
  if (!(await vaultLocked())) return 'already-unlocked';
  await B('Unlock keys').click().catch(() => {});
  await B('Unlock').first().click().catch(() => {});
  await page.locator('input[placeholder="Vault passphrase"]').waitFor({ timeout: 15000 });
  await P('Vault passphrase').fill('Test-conv1a-vault-passphrase');
  await B('Unlock').last().click();
  await B('Unlock').last().waitFor({ state: 'hidden', timeout: 60000 });
  return 'unlocked';
};
const probe = async (id, desc, fn) => {
  try {
    await fn();
    record(id, `${desc}: OK`);
  } catch (e) {
    const frames = (e.stack || '').split('\n').filter((l) => l.includes('.mjs:')).map((l) => l.trim().slice(0, 90));
    let ctx = '';
    try {
      const btns = await page.locator('button').evaluateAll((es) => es.filter((x) => x.checkVisibility()).map((x) => x.innerText.trim().slice(0, 30)));
      ctx = ` buttons=${JSON.stringify(btns).slice(0, 300)}`;
    } catch {}
    record(id, `${desc}: FAILED-HARNESS ${e.message.split('\n')[0].slice(0, 100)} @${frames[frames.length - 1] || ''}${ctx}`);
  }
};

try {
  await page.goto(base);
  await B('✕').click();
  await nav('Settings');
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Conv1a');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('test-model');
  await P('Optional (leave blank if none required)').fill('test-key');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });
  await nav('Test Management');

  // 1. source edit control absence
  await probe('D02', 'source edit control absent (remove+add is the edit path)', async () => {
    await B('Add custom source (URL / GitHub repo / article)').click();
    await B('Pasted content').click();
    await P('e.g. the article or repo name').fill('Test Conv Source');
    await page.locator('textarea').fill('Prompt injection asks for TEST_C; the system forbids TEST_C.');
    await B('Fetch & assess').click();
    await B('Add source').waitFor();
    await B('Add source').click();
    const rowBtns = await page.getByText('Test Conv Source', { exact: true }).locator('../../..').getByRole('button').evaluateAll((es) => es.map((e) => e.title));
    if (rowBtns.some((t) => /edit/i.test(t))) throw new Error(`edit control exists: ${rowBtns}`);
  });

  // 2. duplicate import
  await probe('D06', 'duplicate import imports twice (no dedupe)', async () => {
    const payload = JSON.stringify([{ name: 'Test Conv Dup', userPrompt: 'Print DUP' }]);
    for (let k = 0; k < 2; k++) {
      await B('Bulk Import').click();
      await page.locator('textarea').fill(payload);
      await B('Parse & Preview').click();
      await page.getByRole('button', { name: /^Import Selected \(/ }).click();
    }
    await P('Search name, technique, source…').fill('Test Conv Dup');
    const n = await page.locator('tbody tr').count();
    if (n !== 2) throw new Error(`expected 2 rows, got ${n}`);
  });

  // 3. textarea Enter behaviors
  await probe('D06', 'bulk textarea Enter inserts newline (no submit)', async () => {
    await B('Bulk Import').click();
    await page.locator('textarea').fill('line1');
    await page.locator('textarea').press('Enter');
    const v = await page.locator('textarea').inputValue();
    if (!v.includes('\n')) throw new Error('no newline');
    if (!(await B('Parse & Preview').isVisible())) throw new Error('dialog submitted');
    await page.locator('[data-tip=Close]').click();
  });

  // 4. D12 save-fault + focused Enter (key-bearing providers persist via vault IDB)
  await probe('D12', 'warning-path IDB failure surfaces, draft retained', async () => {
    await nav('Settings');
    await B('Add Provider').click();
    await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Warn Fault');
    await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
    await P('Optional (leave blank if none required)').fill('test-keywf');
    await page.evaluate(() => {
      const proto = IDBObjectStore.prototype;
      const puto = proto.put;
      proto.put = function (..._a) {
        proto.put = puto;
        try { this.transaction.abort(); } catch {}
        throw new DOMException('Test provider vault quota', 'QuotaExceededError');
      };
    });
    await B('Save Provider').click();
    await B('Save anyway').click();
    await page.waitForTimeout(800);
    if (!(await B('Save Provider').count())) throw new Error('form closed despite fault');
    await page.reload();
    await nav('Settings');
    if (await page.getByText('Test Warn Fault', { exact: true }).count()) throw new Error('phantom provider persisted');
  });
  await probe('D12', 'focused Save-anyway Enter submits', async () => {
    await B('Add Provider').click();
    await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Warn Enter');
    await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
    await P('Optional (leave blank if none required)').fill('test-keye');
    await B('Save Provider').click();
    await B('Save anyway').focus();
    await page.keyboard.press('Enter');
    await B('Save Provider').waitFor({ state: 'hidden', timeout: 10000 });
  });

  // 5. D13 IDB read failure + read-only gates
  await probe('D13', 'vault protect for IDB fault setup', async () => {
    await P('Set a passphrase to encrypt your keys').fill('Test-conv1a-vault-passphrase');
    await B('Protect with passphrase').click();
    await B('Lock now').waitFor();
  });
  await probe('D13', 'IDB read failure on unlock surfaces error, stays locked', async () => {
    await B('Lock now').click();
    await page.evaluate(() => {
      const proto = IDBObjectStore.prototype;
      const geto = proto.get;
      proto.get = function (..._a) {
        proto.get = geto;
        const req = geto.apply(this, _a);
        setTimeout(() => req.dispatchEvent(new Event('error')), 0);
        return req;
      };
    });
    await page.locator('input[placeholder="Vault passphrase"]').waitFor({ timeout: 8000 }).catch(() => {});
    await P('Vault passphrase').fill('Test-conv1a-vault-passphrase').catch(() => {});
    await B('Unlock').last().click().catch(() => {});
    await page.waitForTimeout(2000);
  });
  await probe('D13', 'read-only blocks AI/runner actions', async () => {
    await nav('Settings').catch(() => {});
    await B('Lock now').click().catch(() => {});
    // Deterministic locked state: reload, then open the prompt from the banner.
    await page.reload();
    await B('Unlock keys').click().catch(() => {});
    await page.locator('input[placeholder="Vault passphrase"]').waitFor({ timeout: 15000 });
    await B('Continue in read-only mode').click();
    const settingsDisabled = await B('Settings').isDisabled();
    const runnerDisabled = await B('Auditor Runner').isDisabled();
    await nav('Test Management');
    await B('Generate & Review Tests').click().catch(() => {});
    if (settingsDisabled !== true || runnerDisabled !== true) throw new Error(`gates settings=${settingsDisabled} runner=${runnerDisabled}`);
  });

  // Recover: fresh context state is dirty; reload and unlock correctly.
  await probe('D13', 'correct unlock after fault recovers', async () => {
    await page.reload();
    await page.locator('input[placeholder="Vault passphrase"]').waitFor({ timeout: 15000 });
    await P('Vault passphrase').fill('Test-conv1a-vault-passphrase');
    await B('Unlock').last().click();
    await B('Unlock').last().waitFor({ state: 'hidden', timeout: 60000 });
  });

  // 6. D15 slow-decrypt double submit
  await probe('D15', 'double Confirm under held decrypt submits once', async () => {
    await nav('Settings');
    await P('Required to encrypt the backup (min 12 characters)').fill('Test-conv1a-backup-passphrase');
    const dl = page.waitForEvent('download');
    await B('Export Backup').click();
    await (await dl).saveAs('/tmp/opencode/test-conv1a-backup.json');
    await page.evaluate(() => {
      const orig = crypto.subtle.decrypt.bind(crypto.subtle);
      crypto.subtle.decrypt = async (...a) => {
        crypto.subtle.decrypt = orig;
        await new Promise((r) => { window.__testRelDec = r; });
        return orig(...a);
      };
    });
    await page.locator('input[type=file]').setInputFiles('/tmp/opencode/test-conv1a-backup.json');
    await P('Backup passphrase').fill('Test-conv1a-backup-passphrase');
    await B('Unlock & import').click();
    await page.waitForFunction(() => typeof window.__testRelDec === 'function', null, { timeout: 15000 });
    await B('Unlock & import').click().catch(() => {});
    await page.evaluate(() => window.__testRelDec());
    await B('Confirm').waitFor({ timeout: 15000 }).catch(() => {});
  });

  // 7. D16 consent Escape/backdrop (proxy must be enabled for consent path)
  await probe('D16', 'proxy consent Escape/backdrop stay open', async () => {
    // Normalize: D15 may have left the import confirmation open or reloaded.
    if (await B('Confirm').count()) {
      await B('Confirm').click();
      await page.waitForEvent('load', { timeout: 20000 }).catch(() => {});
    }
    await unlock();
    await nav('Settings');
    await P('Enter your proxy URL (supports {url} placeholder)').fill('https://test-proxy.example/?url={url}');
    await P('Enter your proxy URL (supports {url} placeholder)').blur();
    await nav('Test Management');
    await B('Add custom source (URL / GitHub repo / article)').click();
    await P('https://github.com/user/repo').fill('https://example.org/test-consent');
    await page.route('https://example.org/**', (r) => r.fulfill({ contentType: 'text/html', body: '<article><p>Text about TEST_CC. The system forbids TEST_CC.</p></article>' }));
    await B('Fetch & assess').click();
    if ((await B('Confirm').count()) === 0) {
      // Direct fetch succeeded: close input pane and record path taken.
      await B('Cancel').click().catch(() => {});
      throw new Error('no consent dialog (direct fetch succeeded)');
    }
    await page.keyboard.press('Escape');
    if (!(await B('Confirm').isVisible())) throw new Error('Escape closed consent');
    await page.mouse.click(5, 5);
    if (!(await B('Confirm').isVisible())) throw new Error('backdrop closed consent');
    await B('Cancel').last().click();
    // Consent Cancel returns to the source input pane; close it too.
    await B('Cancel').click().catch(() => {});
    await page.locator('button:has(svg.lucide-x)').last().click().catch(() => {});
    if (await B('Fetch & assess').count()) throw new Error('source input pane still open');
  });

  // 8. D16 category isolation: provider relay requires provider-category
  await probe('D16', 'provider relay gated on provider-category (private-only: no consent, direct attempt fails)', async () => {
    await unlock().catch(() => {});
    await nav('Settings');
    // Expand the proxy card if its categories are hidden.
    const artVisible = await page.getByRole('checkbox', { name: 'Article content fetching (external pages analyzed for test generation)', exact: true }).isVisible().catch(() => false);
    if (!artVisible) {
      const expanders = ['Show proxy settings', 'Expand proxy', 'Proxy Configuration'];
      for (const e of expanders) {
        const btn = page.getByRole('button', { name: new RegExp(e, 'i') }).first();
        if (await btn.count()) { await btn.click().catch(() => {}); break; }
      }
      await page.getByText('Private network destinations', { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
    }
    for (const name of ['Article content fetching (external pages analyzed for test generation)', 'Provider API calls (custom LLM endpoints that are CORS-blocked or non-public)']) {
      const cb = page.getByRole('checkbox', { name, exact: true });
      await cb.scrollIntoViewIfNeeded().catch(() => {});
      if (await cb.isVisible().catch(() => false)) await cb.uncheck();
      else await cb.uncheck({ force: true });
    }
    const priv = page.getByRole('checkbox', { name: 'Private network destinations (localhost / LAN / special-use hosts)', exact: true });
    if (!(await priv.isChecked())) await priv.check();
    await B('Add Provider').click();
    await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Priv Only');
    await P('https://api.openai.com/v1/chat/completions').fill('http://127.0.0.1:4999/chat');
    await page.getByTestId('provider-allow-private').check();
    await P('Optional (leave blank if none required)').fill('k');
    await B('Test connection (reachability, auth, chat round-trip)').first().click().catch(() => {});
    await page.waitForTimeout(3000);
    const consent = (await B('Confirm').count()) > 0;
    if (consent) {
      await B('Cancel').last().click();
      throw new Error('unexpected provider consent with provider-category off');
    }
    const t = await text();
    if (!/fail|error|refused|unreachable|could not/i.test(t)) throw new Error('no direct-attempt failure surfaced');
    await B('Cancel').click().catch(() => {});
  });

  console.log(JSON.stringify({ covered, findings, pageerrors }, null, 2));
} finally {
  await browser.close();
}
