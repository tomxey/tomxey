// Minimal encrypted blob store, used as the backing storage for the todo app.
//
// The chain never sees plaintext: `data` is an XChaCha20-Poly1305 blob
// encrypted client-side with a key derived from the owner's password. The
// store is an address-owned object, so only a transaction authenticated as
// the owning (abstract) account can mutate or destroy it.
module todo_store::todo_store;

public struct TodoStore has key {
    id: UID,
    /// Encrypted, opaque payload (`nonce || ciphertext+tag`).
    data: vector<u8>,
}

/// Create an empty store owned by the transaction sender.
public fun create(ctx: &mut TxContext) {
    transfer::transfer(TodoStore { id: object::new(ctx), data: vector::empty() }, ctx.sender());
}

/// Replace the encrypted payload.
public fun set_data(store: &mut TodoStore, data: vector<u8>) {
    store.data = data;
}

/// Delete the store and reclaim its storage rebate.
public fun destroy(store: TodoStore) {
    let TodoStore { id, data: _ } = store;
    id.delete();
}

public fun data(store: &TodoStore): &vector<u8> {
    &store.data
}
