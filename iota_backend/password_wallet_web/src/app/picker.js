// A modal single-choice picker, shared by the tabs.
//
// It lives at page level rather than inside a tab's section: a <dialog> whose
// ancestor is hidden cannot be shown, so a per-section dialog only works
// while that section happens to be visible.

const $ = (id) => document.getElementById(id);

/// Show the picker and resolve to what the user chose:
///   { value }   — an option
///   { created } — a name typed into the "new" field
///   null        — dismissed
///
/// `options` are `{label, sublabel, value}`. Pass `newLabel` to offer a text
/// field for creating something that does not exist yet.
export function pick({ title, hint = '', options = [], newLabel = null, emptyText = '' }) {
  const dialog = $('picker');
  const listEl = $('picker-list');
  const form = $('picker-new-form');
  const input = $('picker-new-input');

  $('picker-title').textContent = title;
  $('picker-hint').textContent = hint;
  $('picker-hint').hidden = !hint;

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener('close', onDismiss);
      form.removeEventListener('submit', onCreate);
      $('picker-cancel').removeEventListener('click', onDismiss);
      dialog.close();
      resolve(result);
    };

    const onDismiss = () => finish(null);
    const onCreate = (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (name) finish({ created: name });
    };

    listEl.replaceChildren();
    if (!options.length && emptyText) {
      const empty = document.createElement('li');
      empty.className = 'picker-empty';
      empty.textContent = emptyText;
      listEl.appendChild(empty);
    }
    for (const option of options) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'picker-row';

      const label = document.createElement('span');
      label.textContent = option.label;
      button.appendChild(label);

      if (option.sublabel) {
        const sub = document.createElement('span');
        sub.className = 'picker-sublabel';
        sub.textContent = option.sublabel;
        button.appendChild(sub);
      }

      button.addEventListener('click', () => finish({ value: option.value }));
      row.appendChild(button);
      listEl.appendChild(row);
    }

    form.hidden = newLabel === null;
    input.value = '';
    if (newLabel !== null) input.placeholder = newLabel;

    // Esc and backdrop dismissal both surface as `close`.
    dialog.addEventListener('close', onDismiss);
    form.addEventListener('submit', onCreate);
    $('picker-cancel').addEventListener('click', onDismiss);

    dialog.showModal();
  });
}
