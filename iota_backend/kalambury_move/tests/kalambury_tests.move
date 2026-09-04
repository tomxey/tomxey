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
    kalambury::create_game(7, vector[ANNA, PIOTR], scenario.ctx());

    scenario.next_tx(HOST);
    let game = scenario.take_shared<Game>();
    assert!(kalambury::phase(&game) == kalambury::phase_lobby());
    assert!(kalambury::slot_count(&game) == 2);
    // Recorded so a host who lost their browser storage can still re-derive
    // the slot keys from their password alone.
    assert!(kalambury::room_index(&game) == 7);
    assert!(kalambury::player_count(&game) == 1); // the host joins itself
    assert!(kalambury::is_open(&game));
    test_scenario::return_shared(game);
    scenario.end();
}

#[test]
fun a_slot_holder_can_join_once() {
    let mut scenario = test_scenario::begin(HOST);
    kalambury::create_game(0, vector[ANNA, PIOTR], scenario.ctx());

    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::join(&mut game, b"Anna".to_string(), scenario.ctx());
    assert!(kalambury::player_count(&game) == 2);
    test_scenario::return_shared(game);
    scenario.end();
}

#[test, expected_failure]
fun a_stranger_cannot_join() {
    let mut scenario = test_scenario::begin(HOST);
    kalambury::create_game(0, vector[ANNA], scenario.ctx());

    scenario.next_tx(@0xDEAD);
    let mut game = scenario.take_shared<Game>();
    kalambury::join(&mut game, b"Intruder".to_string(), scenario.ctx());
    test_scenario::return_shared(game);
    scenario.end();
}

#[test, expected_failure]
fun a_slot_cannot_be_claimed_twice() {
    let mut scenario = test_scenario::begin(HOST);
    kalambury::create_game(0, vector[ANNA], scenario.ctx());

    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::join(&mut game, b"Anna".to_string(), scenario.ctx());
    kalambury::join(&mut game, b"Anna again".to_string(), scenario.ctx());
    test_scenario::return_shared(game);
    scenario.end();
}

#[test]
fun kicking_marks_inactive_without_shifting_indices() {
    let mut scenario = test_scenario::begin(HOST);
    kalambury::create_game(0, vector[ANNA, PIOTR], scenario.ctx());

    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::join(&mut game, b"Anna".to_string(), scenario.ctx());
    test_scenario::return_shared(game);

    scenario.next_tx(PIOTR);
    let mut game = scenario.take_shared<Game>();
    kalambury::join(&mut game, b"Piotr".to_string(), scenario.ctx());
    test_scenario::return_shared(game);

    scenario.next_tx(HOST);
    let mut game = scenario.take_shared<Game>();
    kalambury::kick(&mut game, 1, scenario.ctx());
    // Anna is index 1 and stays at index 1; Piotr is still index 2.
    assert!(kalambury::player_count(&game) == 3);
    assert!(!kalambury::is_active(&game, 1));
    assert!(kalambury::is_active(&game, 2));
    test_scenario::return_shared(game);
    scenario.end();
}

#[test, expected_failure]
fun only_the_host_can_kick() {
    let mut scenario = test_scenario::begin(HOST);
    kalambury::create_game(0, vector[ANNA], scenario.ctx());

    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::join(&mut game, b"Anna".to_string(), scenario.ctx());
    kalambury::kick(&mut game, 0, scenario.ctx());
    test_scenario::return_shared(game);
    scenario.end();
}
