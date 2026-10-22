import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Replaces __CARD_VERSION__ in the source with the package.json version, so the
// version shown on the card always matches the bundle it ships in.
export default function cardVersion() {
  return {
    name: 'card-version',
    transform(code, id) {
      if (!id.includes('/src/') || !code.includes('__CARD_VERSION__')) return null;
      return { code: code.replaceAll('__CARD_VERSION__', JSON.stringify(version)), map: null };
    },
  };
}
