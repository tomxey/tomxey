#[test_only]
module recipe::recipe_tests;

use iota::test_scenario;
use recipe::recipe::{Self, Recipe};

const OWNER: address = @0xA;

#[test]
fun create_set_and_destroy() {
    let mut scenario = test_scenario::begin(OWNER);
    recipe::create(b"encrypted-recipe", scenario.ctx());

    scenario.next_tx(OWNER);
    let mut item = scenario.take_from_sender<Recipe>();
    assert!(recipe::data(&item) == &b"encrypted-recipe");

    recipe::set_data(&mut item, b"encrypted-recipe-v2");
    assert!(recipe::data(&item) == &b"encrypted-recipe-v2");

    recipe::destroy(item);
    scenario.end();
}
