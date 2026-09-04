#[test_only]
module kalambury::kalambury_tests;

use iota::test_scenario;
use kalambury::kalambury::{Self, Game};

const HOST: address = @0xA;
const ANNA: address = @0xB;
const PIOTR: address = @0xC;

#[test]
fun create_records_slots_and_opens_the_lobby() {
    let mut scenario = test_scenario::begin(HOST);
    kalambury::create_game(vector[ANNA, PIOTR], scenario.ctx());

    scenario.next_tx(HOST);
    let game = scenario.take_shared<Game>();
    assert!(kalambury::phase(&game) == kalambury::phase_lobby());
    assert!(kalambury::slot_count(&game) == 2);
    assert!(kalambury::player_count(&game) == 1); // the host joins itself
    assert!(kalambury::is_open(&game));
    test_scenario::return_shared(game);
    scenario.end();
}
