import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'rolldown/experimental';

// Load the actual app modules (including JSX) rather than extracted function
// strings. Inline maps let c8 attribute execution to the original source.
const sourceRoot = new URL('../../src/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith(sourceRoot)) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of ['', '.js', '.jsx']) {
        const candidate = `${url.href}${suffix}`;
        if (/\.(js|jsx)$/.test(candidate) && existsSync(fileURLToPath(candidate))) {
          return { url: candidate, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.jsx')) {
      const filename = fileURLToPath(url);
      const output = transformSync(filename, readFileSync(filename, 'utf8'), {
        lang: 'jsx', jsx: { runtime: 'automatic' }, sourcemap: true,
      });
      if (output.errors.length) throw new Error(JSON.stringify(output.errors));
      const map = Buffer.from(JSON.stringify(output.map)).toString('base64');
      return { format: 'module', shortCircuit: true,
        source: `${output.code}\n//# sourceMappingURL=data:application/json;base64,${map}` };
    }
    return nextLoad(url, context);
  },
});
