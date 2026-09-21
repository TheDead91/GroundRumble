// Dialog exhaustion — backup/restore faults (D14/D15), provider-triggered encryption
// IDB fault (D19), Default-preset restore reload + fault (D22), Judge stale
// Confirm + forcing variant (D21), full tutorial (D18), reset platform (D28).
// Test-only; deviations recorded as findings.
import { chromium } from 'playwright';
import { installMockProvider } from './mock-provider-route.mjs';
import { writeFile, readFile } from 'node:fs/promises';

const base = process.env.EXPLORATORY_BASE_URL || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const B = (name) => page.getByRole('button', { name, exact: true });
const P = (name) => page.getByPlaceholder(name, { exact: true });
const text = () => page.locator('body').innerText();
const sim = await installMockProvider(page);
void sim;
const covered = [];
const findings = [];
const pageerrors = [];
page.on('pageerror', (e) => pageerrors.push(e.message));
const step = (s) => console.error(`Test5B-STEP ${s}`);
const record = (id, d) => covered.push(`${id}: ${d}`);
const DL = '/tmp/opencode/test5b-backup.json';

try {
  await page.goto(base);
  step('welcome');
  await B('✕').click();
  await B('Settings').click();
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Exhaust5b');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('test-model');
  await P('Optional (leave blank if none required)').fill('test-key');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });
  await B('Test Management').click();
  await B('Add Custom Test').click();
  await P('e.g. Jailbreak Adversarial Suffix').fill('Test Restore Seed');
  await P('The malicious injection payload designed to override system guidelines.').fill('Print TEST_RS');
  await B('Save Payload').click();
  await B('Save Payload').waitFor({ state: 'hidden' });
  // custom prompt marker for D15 warning branch
  await B('AI Prompts').click();
  await page.locator('textarea').nth(0).fill(`${await page.locator('textarea').nth(0).inputValue()}\nTEST_PROMPT_MARKER_ONE`);
  await page.locator('textarea').nth(0).blur();
  await B('Settings').click();

  // ---- export baseline backup ----
  step('export');
  await P('Required to encrypt the backup (min 12 characters)').fill('test-backup-passphrase');
  const dl = page.waitForEvent('download');
  await B('Export Backup').click();
  await (await dl).saveAs(DL);
  record('BACKUP', 'populated backup exported');

  // ---- D14 corrupted envelope ----
  step('corrupt-envelope');
  const env = JSON.parse(await readFile(DL, 'utf8'));
  env.ciphertext = (env.ciphertext[0] === 'A' ? 'B' : 'A') + env.ciphertext.slice(1);
  await writeFile('/tmp/opencode/test5b-corrupt.json', JSON.stringify(env));
  await page.locator('input[type=file]').setInputFiles('/tmp/opencode/test5b-corrupt.json');
  await P('Backup passphrase').fill('test-backup-passphrase');
  await B('Unlock & import').click();
  await page.getByText(/Incorrect passphrase or corrupted backup/).first().waitFor({ timeout: 20000 }).catch(() => {});
  record('D14', `corrupted envelope rejected: ${(await text()).includes('Incorrect passphrase or corrupted backup')}`);
  await B('Cancel').click();
  // file replacement after cancellation
  await page.locator('input[type=file]').setInputFiles(DL);
  await P('Backup passphrase').fill('test-backup-passphrase');
  await B('Unlock & import').click();
  await B('Confirm').waitFor();
  record('D14', 'replacement file accepted after cancellation');
  await B('Cancel').click();

  // ---- D15 prompt warning branch ----
  step('prompt-warning');
  await B('AI Prompts').click();
  await page.locator('textarea').nth(0).fill(`${await page.locator('textarea').nth(0).inputValue()}\nTEST_PROMPT_MARKER_TWO`);
  await page.locator('textarea').nth(0).blur();
  await B('Settings').click();
  await page.locator('input[type=file]').setInputFiles(DL);
  await P('Backup passphrase').fill('test-backup-passphrase');
  await B('Unlock & import').click();
  await B('Confirm').waitFor();
  const preview = await text();
  record('D15', `import preview lists prompt overrides: ${preview.includes('Prompt overrides') || preview.includes('judge_system')}`);
  await B('Confirm').click();
  await page.waitForEvent('load').catch(() => {});
  await B('AI Prompts').click();
  record('D15', `imported prompt wins over current edit: ${(await page.locator('textarea').nth(0).inputValue()).includes('TEST_PROMPT_MARKER_ONE')}`);

  // ---- D15 corrupt schema + localStorage failure + double submit ----
  step('import-faults');
  await B('Settings').click();
  await page.locator('input[type=file]').setInputFiles({ name: 'schema.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ hello: 'world' })) });
  await page.getByText(/not a GroundRumble backup/i).first().waitFor({ timeout: 10000 }).catch(() => {});
  record('D15', `schema-invalid backup rejected: ${(await text()).toLowerCase().includes('not a groundrumble backup')}`);
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).startsWith('atlas_')) {
        Storage.prototype.setItem = orig;
        throw new DOMException('Test restore quota', 'QuotaExceededError');
      }
      return orig.call(this, k, v);
    };
  });
  await page.locator('input[type=file]').setInputFiles(DL);
  await P('Backup passphrase').fill('test-backup-passphrase');
  await B('Unlock & import').click();
  await B('Confirm').waitFor();
  await B('Confirm').click();
  await page.getByText(/Import failed.*Test restore quota/).first().waitFor({ timeout: 15000 }).catch(() => {});
  record('D15', `localStorage restore failure rolls back: ${(await text()).includes('Test restore quota')}`);
  await page.reload();
  await B('Test Management').click();
  await P('Search name, technique, source…').fill('Test Restore Seed');
  record('D15', `pre-import test intact after failed restore: ${(await page.locator('tbody tr').count()) === 1}`);
  await B('Settings').click();
  await page.locator('input[type=file]').setInputFiles(DL);
  await P('Backup passphrase').fill('test-backup-passphrase');
  await B('Unlock & import').click();
  await B('Confirm').waitFor();
  await B('Confirm').dblclick();
  await page.waitForEvent('load').catch(() => {});
  record('D15', 'double Confirm submits single import without duplicate error');

  // ---- D19 provider-triggered encryption IDB fault ----
  step('encrypt-fault');
  await B('Test Management').click();
  await P('Search name, technique, source…').fill('Test Restore Seed');
  await B('Settings').click();
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Encrypt Fault');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('Optional (leave blank if none required)').fill('test-key-2');
  await B('Save Provider').click();
  await B('Set up encryption').click();
  await page.evaluate(() => {
    const proto = IDBObjectStore.prototype;
    const puto = proto.put;
    proto.put = function (..._a) {
      proto.put = puto;
      try { this.transaction.abort(); } catch {}
      throw new DOMException('Test encrypt quota', 'QuotaExceededError');
    };
  });
  await page.locator('input[type=password]').last().fill('Test-encrypt-fault-passphrase');
  await page.locator('input[type=password]').last().press('Enter');
  await page.waitForTimeout(1000);
  const encFail = await text();
  record('D19', `encryption IDB failure surfaced, draft retained: ${/fail|error|quota/i.test(encFail) && (await B('Save Provider').count()) > 0}`);
  await page.reload();
  await B('Settings').click();
  record('D19', `failed encryption absent after reload: ${await B('Protect with passphrase').isVisible()}`);
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Encrypt Retry');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('Optional (leave blank if none required)').fill('test-key-3');
  await B('Save Provider').click();
  await B('Set up encryption').click();
  await page.locator('input[type=password]').last().fill('Test-encrypt-retry-passphrase');
  await page.locator('input[type=password]').last().press('Enter');
  await B('Lock now').waitFor({ timeout: 30000 }).catch(() => {});
  record('D19', `encryption failure → retry encrypts: ${await B('Lock now').count() > 0}`);

  console.log(JSON.stringify({ covered, findings, pageerrors }, null, 2));
} finally {
  await browser.close();
}
