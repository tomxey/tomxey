// The recipes tab: a list / detail / editor view over Recipe objects, plus
// copying a recipe's ingredients into a todo item as subitems.
//
// Saving is explicit — every save is a paid transaction, so autosave would
// cost gas per keystroke. On a version conflict the draft text is kept in the
// editor rather than discarded: unlike a todo checkbox, retyping a recipe is
// not cheap.
import { isVersionConflict } from '../app/blobStore.js';
import { MAX_PAYLOAD_BYTES, payloadBytes } from '../app/payload.js';
import { pick } from '../app/picker.js';
import { addUnloadGuard, enqueue, log, refreshGas, run } from '../app/shell.js';
import { DEFAULT_LIST_LABEL, listOf } from '../todo/content.js';
import {
  bodyBelowTitle,
  ingredientsOf,
  servingsOf,
  newRecipeContent,
  parseIngredients,
  sortedByTitle,
  titleOf,
} from './content.js';
import { renderNutrition } from '../nutrition/panel.js';
import { renderMarkdown } from './markdown.js';
import { scaleLine, scaleSegments, scaledIngredientLines } from './scale.js';

const $ = (id) => document.getElementById(id);

/// Segments from `scale.js` -> inline nodes the markdown renderer understands.
/// Scaled quantities become `mark`, which is what makes them visible.
const segmentsToNodes = (segments) =>
  segments.map((segment) =>
    segment.scaled
      ? { type: 'mark', inline: [{ type: 'text', text: segment.text }] }
      : { type: 'text', text: segment.text },
  );

const listLabel = (name) => name || DEFAULT_LIST_LABEL;

const INGREDIENTS_PLACEHOLDER = '500g flour\n2 large eggs\n200g twaróg';
const BODY_PLACEHOLDER = '# New recipe\n\n## Method\n\n1. ';

/// `todo` is the todo tab, used only as the destination for copied
/// ingredients. `configured` is false when no recipe package ID is set, in
/// which case the tab explains itself instead of making chain calls that
/// cannot work.
export function createRecipesTab({ store, todo, configured = true }) {
  let recipes = []; // [{ref, content}]
  let selected = null; // entry shown in detail / being edited
  let draft = null; // { ingredients, md, isNew } while the editor is open
  let loaded = false;
  let filter = '';
  // Display-only, never written on chain: a recipe is always stored at one
  // portion. Reset whenever a recipe is opened.
  let portions = 1;
  // How many servings the batch divides into, for the nutrition panel only.
  // A recipe is a batch, not a plate: without this the panel reports a whole
  // tray of waffles as one person's intake.
  let servings = 1;

  // The shell's unload warning covers queued writes; an editor holding
  // unsaved text needs its own guard.
  addUnloadGuard(() => draft !== null && isDirty());

  function isDirty() {
    const base = selected
      ? {
          servings: servingsOf(selected.content),
          ingredients: ingredientsOf(selected.content),
          md: selected.content.md ?? '',
        }
      : { servings: 1, ingredients: '', md: BODY_PLACEHOLDER };
    return (
      draft.ingredients !== base.ingredients ||
      draft.md !== base.md ||
      Number($('recipe-edit-servings').value) !== base.servings
    );
  }

  // --- view switching -------------------------------------------------------

  function show(view) {
    $('recipe-list-view').hidden = view !== 'list';
    $('recipe-detail-view').hidden = view !== 'detail';
    $('recipe-editor-view').hidden = view !== 'editor';
  }

  /// Load on first open, so the todo tab's unlock never pays for recipes.
  async function activate() {
    if (!configured) {
      show('list');
      $('recipe-list').textContent =
        'no recipe package configured — set “recipePackageId” under Settings on the wallet page';
      $('recipe-new').disabled = true;
      return;
    }
    if (!loaded) {
      $('recipe-list').textContent = 'loading…';
      await reload();
      loaded = true;
    }
    if (draft) show('editor');
    else if (selected) show('detail');
    else show('list');
  }

  async function reload() {
    const loadedRecipes = await store.fetchRecipes();
    recipes = loadedRecipes.recipes;
    // Keep the open recipe pointing at the freshly loaded object.
    if (selected) {
      selected = recipes.find((r) => r.ref.objectId === selected.ref.objectId) ?? null;
    }
    renderList();
  }

  // --- list -----------------------------------------------------------------

  function renderList() {
    const listEl = $('recipe-list');
    listEl.replaceChildren();

    // Sorted on every render, not just on load: a recipe created (or
    // restored after a failed delete) must land in its right place rather
    // than at the bottom until the next reload.
    const needle = filter.trim().toLowerCase();
    const ordered = sortedByTitle(recipes);
    const shown = needle ? ordered.filter((entry) => matches(entry, needle)) : ordered;

    if (!recipes.length) {
      listEl.textContent = 'no recipes yet — add one with “New recipe”';
      return;
    }
    if (!shown.length) {
      listEl.textContent = `nothing matches “${filter.trim()}”`;
      return;
    }

    for (const entry of shown) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'recipe-row';
      button.textContent = titleOf(entry.content);
      button.addEventListener('click', () => openDetail(entry));
      row.appendChild(button);
      listEl.appendChild(row);
    }
  }

  /// The filter searches ingredients as well as the body, so "twaróg" finds
  /// every recipe that uses it.
  function matches(entry, needle) {
    const haystack = `${entry.content.md ?? ''}\n${ingredientsOf(entry.content)}`;
    return haystack.toLowerCase().includes(needle);
  }

  $('recipe-filter').addEventListener('input', (event) => {
    filter = event.target.value;
    renderList();
  });

  $('recipe-new').addEventListener('click', () =>
    openEditor(null, { servings: 1, ingredients: '', md: BODY_PLACEHOLDER }),
  );

  // --- detail ---------------------------------------------------------------

  function openDetail(entry) {
    selected = entry;
    draft = null;
    portions = 1;
    servings = servingsOf(entry.content);
    $('recipe-portions').value = '1';
    $('recipe-servings').value = String(servings);
    $('recipe-title').textContent = titleOf(entry.content);
    renderDetail();
    show('detail');
  }

  /// Re-renders both fields at the current scale. Nothing here writes: the
  /// stored recipe is always one portion.
  function renderDetail() {
    if (!selected) return;
    const ingredients = parseIngredients(ingredientsOf(selected.content));

    const listEl = $('recipe-ingredients-view');
    listEl.replaceChildren();
    for (const line of ingredients) {
      const li = document.createElement('li');
      for (const segment of scaleLine(line, portions)) {
        if (segment.scaled) {
          const mark = document.createElement('mark');
          mark.textContent = segment.text;
          li.appendChild(mark);
        } else {
          li.appendChild(document.createTextNode(segment.text));
        }
      }
      listEl.appendChild(li);
    }
    $('recipe-ingredients-section').hidden = ingredients.length === 0;
    $('recipe-copy').disabled = ingredients.length === 0;

    // Derived from the ingredients at the current scale; nothing is stored.
    $('recipe-nutrition').hidden = ingredients.length === 0;
    renderNutrition($('recipe-nutrition-body'), ingredientsOf(selected.content), portions, servings);

    // The opening heading is already the title above, so it is not rendered
    // a second time here.
    $('recipe-body').replaceChildren(
      renderMarkdown(bodyBelowTitle(selected.content), document, {
        transformText: (text) => segmentsToNodes(scaleSegments(text, portions)),
      }),
    );
  }

  $('recipe-portions').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    // Junk or non-positive input shows the recipe as written rather than
    // blanking it while the user is mid-type.
    portions = Number.isFinite(value) && value > 0 ? value : 1;
    renderDetail();
  });

  $('recipe-servings').addEventListener('input', (event) => {
    const value = Math.floor(Number(event.target.value));
    servings = Number.isFinite(value) && value >= 1 ? value : 1;
    renderDetail();
  });

  // Resets portions only, as its label says. Servings has its own field and
  // its own stored default, so clearing it here would be a surprise.
  $('recipe-portions-reset').addEventListener('click', () => {
    portions = 1;
    $('recipe-portions').value = '1';
    renderDetail();
  });

  $('recipe-back').addEventListener('click', () => {
    selected = null;
    show('list');
  });

  $('recipe-edit').addEventListener('click', () => {
    if (selected) {
      openEditor(selected, {
        servings: servingsOf(selected.content),
        ingredients: ingredientsOf(selected.content),
        md: selected.content.md ?? '',
      });
    }
  });

  $('recipe-delete').addEventListener('click', () => {
    if (!selected) return;
    const entry = selected;
    if (!confirm(`Delete “${titleOf(entry.content)}”? This cannot be undone.`)) return;

    recipes = recipes.filter((r) => r !== entry);
    selected = null;
    renderList();
    show('list');

    run(null, () =>
      enqueue(async () => {
        try {
          await store.remove(entry.ref);
          log(`deleted “${titleOf(entry.content)}”`);
          await refreshGas();
        } catch (error) {
          if (isVersionConflict(error)) {
            log('this recipe changed on-chain — reloading…');
            await reload();
            return;
          }
          // Put it back; the delete never happened.
          recipes.push(entry);
          renderList();
          throw error;
        }
      }),
    );
  });

  // --- copying ingredients into a todo item ---------------------------------

  $('recipe-copy').addEventListener('click', () => {
    if (!selected) return;
    // Scaled, not stored: what you see on screen is what lands in the list.
    const texts = scaledIngredientLines(ingredientsOf(selected.content), portions);
    if (!texts.length) {
      log('this recipe has no ingredients to copy');
      return;
    }
    openPicker(texts);
  });

  /// Ask which top-level todo item the ingredients should go under. The
  /// choice is made every time — there is no remembered default, because the
  /// right destination depends on the recipe.
  function openPicker(texts) {
    const targets = todo.topLevelItems();
    const scale = portions === 1 ? '' : ` ×${portions}`;

    run(null, async () => {
      const choice = await pick({
        title: `${texts.length} ingredient${texts.length === 1 ? '' : 's'}${scale} → which item?`,
        hint: 'Added as subitems of the item you pick.',
        // Titles can repeat across lists, so each option names its list.
        options: targets.map((item) => ({
          label: item.content.title,
          sublabel: listLabel(listOf(item.content)),
          value: item,
        })),
        emptyText: 'no todo items yet — add one on the Items tab first',
      });
      if (choice) copyInto(choice.value, texts);
    });
  }

  function copyInto(item, texts) {
    run(null, async () => {
      // Throws synchronously for the cases worth reporting immediately (no
      // ingredients, unconfirmed item, would exceed the blob cap). Otherwise
      // resolves to whether the write actually landed — a conflict is logged
      // by the todo tab and must not be reported here as a success.
      const applied = await todo.addSubitems(item, texts);
      if (applied) {
        const scale = portions === 1 ? '' : ` ×${portions}`;
        log(`copied ${texts.length} ingredient(s)${scale} into “${item.content.title}”`);
      }
    });
  }

  // --- editor ---------------------------------------------------------------

  function openEditor(entry, text) {
    selected = entry;
    draft = { ...text, isNew: entry === null };
    $('recipe-edit-servings').value = String(text.servings ?? 1);
    $('recipe-ingredients').value = text.ingredients;
    $('recipe-ingredients').placeholder = INGREDIENTS_PLACEHOLDER;
    $('recipe-text').value = text.md;
    updateByteCounter();
    show('editor');
    $('recipe-ingredients').focus();
  }

  function currentDraftContent() {
    return newRecipeContent({
      servings: Number($('recipe-edit-servings').value),
      ingredients: $('recipe-ingredients').value,
      md: $('recipe-text').value,
    });
  }

  /// Both fields share one on-chain blob, so the counter budgets their
  /// combined size rather than either one alone.
  function updateByteCounter() {
    const bytes = payloadBytes(currentDraftContent());
    const counter = $('recipe-bytes');
    const count = parseIngredients($('recipe-ingredients').value).length;
    counter.textContent = `${count} ingredient${count === 1 ? '' : 's'} · ${bytes} / ${MAX_PAYLOAD_BYTES} bytes`;
    counter.classList.toggle('over', bytes > MAX_PAYLOAD_BYTES);
    // Warn before the cliff, not at it.
    counter.classList.toggle('near', bytes > MAX_PAYLOAD_BYTES * 0.9 && bytes <= MAX_PAYLOAD_BYTES);
  }

  for (const id of ['recipe-ingredients', 'recipe-text', 'recipe-edit-servings']) {
    $(id).addEventListener('input', () => {
      if (draft) {
        draft.ingredients = $('recipe-ingredients').value;
        draft.md = $('recipe-text').value;
      }
      updateByteCounter();
    });
  }

  $('recipe-cancel').addEventListener('click', () => {
    draft = null;
    if (selected) openDetail(selected);
    else show('list');
  });

  $('recipe-save').addEventListener('click', () => {
    if (!draft) return;
    const content = currentDraftContent();

    const bytes = payloadBytes(content);
    if (bytes > MAX_PAYLOAD_BYTES) {
      log(
        `❌ recipe is ${bytes} bytes; the on-chain limit is ${MAX_PAYLOAD_BYTES}. Shorten it and save again.`,
      );
      return;
    }
    if (!content.md.trim() && !content.ingredients.trim()) {
      log('❌ an empty recipe has nothing to save');
      return;
    }

    // Captured now, not read inside the queued task: the write may run after
    // the user has hit Cancel (clearing `draft`) or opened another recipe,
    // and reading them late would save into the wrong place.
    const target = selected;
    const isNew = draft.isNew;

    run($('recipe-save'), () =>
      enqueue(async () => {
        try {
          if (isNew) {
            const created = await store.create(content);
            recipes.push(created);
            selected = created;
          } else {
            target.ref = await store.update(target.ref, content);
            target.content = content;
            selected = target;
          }
          draft = null;
          log(`saved “${titleOf(content)}”`);
          await refreshGas();
          renderList();
          openDetail(selected);
        } catch (error) {
          if (isVersionConflict(error)) {
            // Deliberately keep the editor open with the user's text.
            log(
              '⚠ this recipe changed on-chain since you opened it — your draft is still here. Copy it, reload, and re-apply.',
            );
            await reload();
            return;
          }
          throw error;
        }
      }),
    );
  });

  return { activate, reload };
}
