// One recipe = one object, mirroring `todo_item` so both kinds share the
// client-side blob plumbing. A separate type (rather than a `kind` field
// inside the blob) is what lets `getOwnedObjects` filter server-side, so
// opening the todo list never downloads and decrypts every recipe.
//
// `data` is an XChaCha20-Poly1305 blob encrypted client-side (the recipe's
// markdown); the chain never sees plaintext. Recipes are address-owned by the
// (abstract) account, which gives the same two protocol-level guarantees the
// todo list relies on: only the owner can mutate, and every mutation must
// reference the exact object version it was based on, so a stale update fails
// instead of overwriting a newer one.
module recipe::recipe;

public struct Recipe has key {
    id: UID,
    /// Encrypted, opaque payload (`nonce || ciphertext+tag`).
    data: vector<u8>,
}

/// Create a recipe owned by the transaction sender.
public fun create(data: vector<u8>, ctx: &mut TxContext) {
    transfer::transfer(Recipe { id: object::new(ctx), data }, ctx.sender());
}

/// Replace the encrypted payload.
public fun set_data(item: &mut Recipe, data: vector<u8>) {
    item.data = data;
}

/// Delete the recipe and reclaim its storage rebate.
public fun destroy(item: Recipe) {
    let Recipe { id, data: _ } = item;
    id.delete();
}

public fun data(item: &Recipe): &vector<u8> {
    &item.data
}
