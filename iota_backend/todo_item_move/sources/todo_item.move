// One top-level todo item = one object, so updates ship only the changed
// item's payload instead of the whole list.
//
// `data` is an XChaCha20-Poly1305 blob encrypted client-side (title, done
// flag, subitems); the chain never sees plaintext. Items are address-owned by
// the (abstract) account, which gives two protocol-level guarantees:
// only the owner can mutate, and every mutation must reference the exact
// object version it was based on — a stale update (someone else changed the
// item since you read it) fails instead of overwriting their change.
module todo_item::todo_item;

public struct TodoItem has key {
    id: UID,
    /// Encrypted, opaque payload (`nonce || ciphertext+tag`).
    data: vector<u8>,
}

/// Create an item owned by the transaction sender.
public fun create(data: vector<u8>, ctx: &mut TxContext) {
    transfer::transfer(TodoItem { id: object::new(ctx), data }, ctx.sender());
}

/// Replace the encrypted payload.
public fun set_data(item: &mut TodoItem, data: vector<u8>) {
    item.data = data;
}

/// Delete the item and reclaim its storage rebate.
public fun destroy(item: TodoItem) {
    let TodoItem { id, data: _ } = item;
    id.delete();
}

public fun data(item: &TodoItem): &vector<u8> {
    &item.data
}
