#[test_only]
module todo_item::todo_item_tests;

use iota::test_scenario;
use todo_item::todo_item::{Self, TodoItem};

const OWNER: address = @0xA;

#[test]
fun create_set_and_destroy() {
    let mut scenario = test_scenario::begin(OWNER);
    todo_item::create(b"encrypted-item", scenario.ctx());

    scenario.next_tx(OWNER);
    let mut item = scenario.take_from_sender<TodoItem>();
    assert!(todo_item::data(&item) == &b"encrypted-item");

    todo_item::set_data(&mut item, b"encrypted-item-v2");
    assert!(todo_item::data(&item) == &b"encrypted-item-v2");

    todo_item::destroy(item);
    scenario.end();
}
