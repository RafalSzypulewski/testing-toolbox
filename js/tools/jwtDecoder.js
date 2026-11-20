import { h, field, statusLine } from '../util.js';
import { decodeJwt } from '../lib/jwt.js';

const pretty = (v) => JSON.stringify(v, null, 2);

export default {
  id: 'jwt-decoder',
  name: 'JWT decoder',
  category: 'Inspect',
  description: 'Read the header, payload and expiry of a JSON Web Token. Decode only; nothing is verified or sent.',
  keywords: ['token', 'bearer', 'auth', 'claims', 'exp', 'jwt', 'oauth'],
  render(root) {
    const input = h('textarea', { rows: 5, spellcheck: false, placeholder: 'eyJhbGciOi…' });
    const status = statusLine();
    const result = h('div');

    const update = () => {
      result.replaceChildren();
      if (!input.value.trim()) return status.clear();
      try {
        const d = decodeJwt(input.value);
        status[d.status === 'Expired' || d.status === 'Not valid yet' ? 'error' : 'ok'](d.status);
        result.append(
          h('h3', {}, 'Header'),
          h('pre', { class: 'visual' }, pretty(d.header)),
          h('h3', {}, 'Payload'),
          h('pre', { class: 'visual' }, pretty(d.payload)),
          d.times.length
            ? h('table', {}, h('tr', {}, h('th', {}, 'Claim'), h('th', {}, 'Epoch'), h('th', {}, 'UTC time')),
                d.times.map((t) => h('tr', {}, h('td', {}, `${t.label} (${t.claim})`), h('td', { class: 'mono' }, String(t.seconds)), h('td', { class: 'mono' }, t.iso))))
            : '',
          h('h3', {}, 'Signature'),
          h('pre', { class: 'visual' }, d.signature || '(none)'),
        );
      } catch (err) {
        status.error(err.message);
      }
    };
    input.addEventListener('input', update);

    root.append(
      field('Token', input),
      status.el,
      result,
      h('p', { class: 'note' }, 'This tool only decodes. It does not verify the signature, so never treat decoded claims as trustworthy. Avoid pasting production tokens into any website you do not control; this page runs entirely in your browser and sends nothing anywhere.'),
    );
  },
};
