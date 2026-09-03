// Recipe storage: a blob store bound to the Recipe Move type, plus the
// title-based ordering the list view uses.
import { makeBlobStore } from '../app/blobStore.js';
import { sortedByTitle } from './content.js';

export const RECIPE_MODULE = 'recipe';
export const RECIPE_STRUCT = 'Recipe';

export function recipeType(packageId) {
  return `${packageId}::${RECIPE_MODULE}::${RECIPE_STRUCT}`;
}

export function makeRecipeStore(config) {
  const store = makeBlobStore({ ...config, module: RECIPE_MODULE, struct: RECIPE_STRUCT });
  return {
    ...store,
    async fetchRecipes() {
      const { entries, lastUpdatedMs } = await store.fetchAll();
      return { recipes: sortedByTitle(entries), lastUpdatedMs };
    },
  };
}
