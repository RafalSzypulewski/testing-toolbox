import { h, field, checkbox, outputPanel, statusLine, chips, copyText } from '../util.js';
import { counterString, MAX_LENGTH } from '../lib/strings.js';

export default {
  id: 'counter-string',
  name: 'Counter string',
  category: 'Generate',
  description: 'Text where every marker shows its own position (*3*5*7*10*). Find exactly where a field truncates input.',
  keywords: ['length', 'truncate', 'limit', 'maxlength', 'boundary'],
  render(root) {
    const length = h('input', { type: 'number', min: 1, max: MAX_LENGTH, value: 100 });
    const marker = h('input', { type: 'text', maxLength: 1, value: '*', size: 2 });
    const auto = checkbox('Copy to clipboard when generated', true);
    const status = statusLine();
    const out = outputPanel({ label: 'Counter string', filename: 'counter-string.txt' });

    const run = () => {
      try {
        const text = counterString(length.value, marker.value);
        out.set(text);
        status.ok(`Generated ${text.length.toLocaleString('en-US')} characters.`);
        if (auto.input.checked) copyText(text);
      } catch (err) {
        out.set('');
        status.error(err.message);
      }
    };

    root.append(
      h(
        'div',
        { class: 'form-row' },
        field('Length', length),
        field('Marker', marker),
        h('button', { class: 'primary', onclick: run }, 'Generate'),
      ),
      chips([10, 50, 100, 255, 256, 500, 1000, 4000, 4096, 65535], (n) => {
        length.value = n;
        run();
      }, (n) => n.toLocaleString('en-US')),
      auto.el,
      status.el,
      out.el,
      h(
        'p',
        { class: 'note' },
        'How to read it: the number in front of a marker is that marker’s position. If a field cuts the text after "…*5*7*1", it accepted exactly 17 characters.',
      ),
    );
    length.addEventListener('keydown', (e) => e.key === 'Enter' && run());
  },
};
