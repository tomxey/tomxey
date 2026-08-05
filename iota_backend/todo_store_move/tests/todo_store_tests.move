#[test_only]
module todo_store::todo_store_tests;

use iota::test_scenario;
use todo_store::todo_store::{Self, TodoStore};

const OWNER: address = @0xA;

#[test]
fun create_set_and_destroy() {
    let mut scenario = test_scenario::begin(OWNER);
    todo_store::create(scenario.ctx());

    scenario.next_tx(OWNER);
    let mut store = scenario.take_from_sender<TodoStore>();
    assert!(todo_store::data(&store).is_empty());

    todo_store::set_data(&mut store, b"encrypted-bytes");
    assert!(todo_store::data(&store) == &b"encrypted-bytes");

    todo_store::destroy(store);
    scenario.end();
}
