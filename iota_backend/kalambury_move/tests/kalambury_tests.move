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

// --- the round ---------------------------------------------------------------

#[test_only]
fun nonce_fixture(): vector<u8> {
    let mut nonce = vector[];
    let mut i = 0;
    while (i < 32) { nonce.push_back(7u8); i = i + 1; };
    nonce
}

/// Pinned to the literal that `password_auth_core::hashing` and
/// `commitment.test.js` both assert, so the three implementations agree on a
/// constant rather than merely on each other.
#[test_only]
fun commitment_fixture(): vector<u8> {
    let expected = x"99a8e6a7153fb5f5e586ffad68b1c2883d9ee13c3e1276f9ddfc167f2492acec";
    let mut preimage = b"harmonijka";
    preimage.append(nonce_fixture());
    assert!(iota::hash::blake2b256(&preimage) == expected, 999);
    expected
}

#[test_only]
fun started_game(scenario: &mut test_scenario::Scenario, clock: &iota::clock::Clock): Game {
    kalambury::create_game(0, vector[ANNA], scenario.ctx());
    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::join(&mut game, b"Anna".to_string(), scenario.ctx());
    test_scenario::return_shared(game);

    scenario.next_tx(HOST);
    let mut game = scenario.take_shared<Game>();
    kalambury::start_game(&mut game, clock, scenario.ctx());
    game
}

#[test]
fun a_full_round_scores_both_players() {
    let mut scenario = test_scenario::begin(HOST);
    let clock = iota::clock::create_for_testing(scenario.ctx());
    let mut game = started_game(&mut scenario, &clock);

    kalambury::start_round(&mut game, commitment_fixture(), &clock, scenario.ctx());
    assert!(kalambury::phase(&game) == kalambury::phase_drawing());
    test_scenario::return_shared(game);

    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::guess(&mut game, b"harmonijka".to_string(), &clock, scenario.ctx());
    assert!(kalambury::guess_count(&game) == 1);
    test_scenario::return_shared(game);

    scenario.next_tx(HOST);
    let mut game = scenario.take_shared<Game>();
    kalambury::claim_winner(&mut game, 0, &clock, scenario.ctx());
    assert!(kalambury::phase(&game) == kalambury::phase_reveal());

    kalambury::reveal(&mut game, b"harmonijka".to_string(), nonce_fixture(), &clock, scenario.ctx());
    assert!(kalambury::score(&game, 0) == 1); // drawer understood
    assert!(kalambury::score(&game, 1) == 1); // guesser correct
    assert!(kalambury::phase(&game) == kalambury::phase_ready());
    assert!(kalambury::guess_count(&game) == 0);
    assert!(kalambury::drawer(&game) == 1);

    test_scenario::return_shared(game);
    clock.destroy_for_testing();
    scenario.end();
}

#[test, expected_failure]
fun reveal_with_the_wrong_word_is_rejected() {
    let mut scenario = test_scenario::begin(HOST);
    let clock = iota::clock::create_for_testing(scenario.ctx());
    let mut game = started_game(&mut scenario, &clock);
    kalambury::start_round(&mut game, commitment_fixture(), &clock, scenario.ctx());
    test_scenario::return_shared(game);

    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::guess(&mut game, b"akordeon".to_string(), &clock, scenario.ctx());
    test_scenario::return_shared(game);

    scenario.next_tx(HOST);
    let mut game = scenario.take_shared<Game>();
    kalambury::claim_winner(&mut game, 0, &clock, scenario.ctx());
    kalambury::reveal(&mut game, b"akordeon".to_string(), nonce_fixture(), &clock, scenario.ctx());
    test_scenario::return_shared(game);
    clock.destroy_for_testing();
    scenario.end();
}

#[test, expected_failure]
fun claiming_a_guess_that_is_not_the_word_is_rejected() {
    let mut scenario = test_scenario::begin(HOST);
    let clock = iota::clock::create_for_testing(scenario.ctx());
    let mut game = started_game(&mut scenario, &clock);
    kalambury::start_round(&mut game, commitment_fixture(), &clock, scenario.ctx());
    test_scenario::return_shared(game);

    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::guess(&mut game, b"akordeon".to_string(), &clock, scenario.ctx());
    test_scenario::return_shared(game);

    scenario.next_tx(HOST);
    let mut game = scenario.take_shared<Game>();
    // The drawer points at a wrong guess, then reveals the real word: the
    // commitment checks out but the claimed guess is not it.
    kalambury::claim_winner(&mut game, 0, &clock, scenario.ctx());
    kalambury::reveal(&mut game, b"harmonijka".to_string(), nonce_fixture(), &clock, scenario.ctx());
    test_scenario::return_shared(game);
    clock.destroy_for_testing();
    scenario.end();
}

#[test, expected_failure]
fun the_drawer_cannot_guess() {
    let mut scenario = test_scenario::begin(HOST);
    let clock = iota::clock::create_for_testing(scenario.ctx());
    let mut game = started_game(&mut scenario, &clock);
    kalambury::start_round(&mut game, commitment_fixture(), &clock, scenario.ctx());
    kalambury::guess(&mut game, b"harmonijka".to_string(), &clock, scenario.ctx());
    test_scenario::return_shared(game);
    clock.destroy_for_testing();
    scenario.end();
}

#[test, expected_failure]
fun guessing_in_ready_is_rejected() {
    let mut scenario = test_scenario::begin(HOST);
    let clock = iota::clock::create_for_testing(scenario.ctx());
    let game = started_game(&mut scenario, &clock);
    test_scenario::return_shared(game);

    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    // No commitment exists yet, so there is nothing to guess against.
    kalambury::guess(&mut game, b"harmonijka".to_string(), &clock, scenario.ctx());
    test_scenario::return_shared(game);
    clock.destroy_for_testing();
    scenario.end();
}

#[test]
fun an_abandoned_round_can_be_timed_out_by_anyone() {
    let mut scenario = test_scenario::begin(HOST);
    let mut clock = iota::clock::create_for_testing(scenario.ctx());
    let mut game = started_game(&mut scenario, &clock);
    kalambury::start_round(&mut game, commitment_fixture(), &clock, scenario.ctx());
    test_scenario::return_shared(game);

    clock.increment_for_testing(121_000);
    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::timeout_round(&mut game, &clock, scenario.ctx());
    assert!(kalambury::phase(&game) == kalambury::phase_ready());
    assert!(kalambury::score(&game, 0) == 0);
    assert!(kalambury::drawer(&game) == 1);
    test_scenario::return_shared(game);
    clock.destroy_for_testing();
    scenario.end();
}

#[test]
fun a_drawer_who_never_reveals_forfeits() {
    let mut scenario = test_scenario::begin(HOST);
    let mut clock = iota::clock::create_for_testing(scenario.ctx());
    let mut game = started_game(&mut scenario, &clock);
    kalambury::start_round(&mut game, commitment_fixture(), &clock, scenario.ctx());
    test_scenario::return_shared(game);

    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::guess(&mut game, b"harmonijka".to_string(), &clock, scenario.ctx());
    test_scenario::return_shared(game);

    scenario.next_tx(HOST);
    let mut game = scenario.take_shared<Game>();
    kalambury::claim_winner(&mut game, 0, &clock, scenario.ctx());
    test_scenario::return_shared(game);

    clock.increment_for_testing(61_000);
    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::forfeit_round(&mut game, &clock, scenario.ctx());
    assert!(kalambury::phase(&game) == kalambury::phase_ready());
    assert!(kalambury::score(&game, 0) == 0);
    assert!(kalambury::score(&game, 1) == 0);
    test_scenario::return_shared(game);
    clock.destroy_for_testing();
    scenario.end();
}

#[test]
fun a_drawer_who_never_commits_can_be_skipped() {
    let mut scenario = test_scenario::begin(HOST);
    let mut clock = iota::clock::create_for_testing(scenario.ctx());
    let game = started_game(&mut scenario, &clock);
    test_scenario::return_shared(game);

    clock.increment_for_testing(121_000);
    scenario.next_tx(ANNA);
    let mut game = scenario.take_shared<Game>();
    kalambury::skip_drawer(&mut game, &clock, scenario.ctx());
    assert!(kalambury::drawer(&game) == 1);
    assert!(kalambury::phase(&game) == kalambury::phase_ready());
    test_scenario::return_shared(game);
    clock.destroy_for_testing();
    scenario.end();
}

// --- closing a room -----------------------------------------------------------

#[test]
fun the_host_can_close_a_room_and_reclaim_the_storage() {
    let mut scenario = test_scenario::begin(HOST);
    kalambury::create_game(0, vector[ANNA], scenario.ctx());

    scenario.next_tx(HOST);
    let game = scenario.take_shared<Game>();
    let canvas = scenario.take_shared<kalambury::Canvas>();
    kalambury::close_game(game, canvas, scenario.ctx());

    // Nothing shared is left to take, which is what makes the deposit
    // refundable rather than locked forever.
    scenario.next_tx(HOST);
    assert!(!test_scenario::has_most_recent_shared<Game>(), 0);
    assert!(!test_scenario::has_most_recent_shared<kalambury::Canvas>(), 1);
    scenario.end();
}

#[test, expected_failure]
fun a_guest_cannot_close_the_room() {
    let mut scenario = test_scenario::begin(HOST);
    kalambury::create_game(0, vector[ANNA], scenario.ctx());

    scenario.next_tx(ANNA);
    let game = scenario.take_shared<Game>();
    let canvas = scenario.take_shared<kalambury::Canvas>();
    kalambury::close_game(game, canvas, scenario.ctx());
    abort
}

#[test, expected_failure]
fun closing_with_another_room_s_canvas_is_rejected() {
    // Two rooms exist, so passing the wrong canvas is a real mistake a client
    // could make — and it would delete a canvas still belonging to a live room.
    let mut scenario = test_scenario::begin(HOST);
    kalambury::create_game(0, vector[ANNA], scenario.ctx());
    scenario.next_tx(HOST);
    let first_canvas = scenario.take_shared<kalambury::Canvas>();

    kalambury::create_game(1, vector[PIOTR], scenario.ctx());
    scenario.next_tx(HOST);
    let second_game = scenario.take_shared<Game>();

    kalambury::close_game(second_game, first_canvas, scenario.ctx());
    abort
}

// --- the canvas ---------------------------------------------------------------

#[test]
fun the_drawer_can_paint_and_the_version_advances() {
    let mut scenario = test_scenario::begin(HOST);
    let clock = iota::clock::create_for_testing(scenario.ctx());
    let mut game = started_game(&mut scenario, &clock);
    kalambury::start_round(&mut game, commitment_fixture(), &clock, scenario.ctx());

    scenario.next_tx(HOST);
    let mut canvas = scenario.take_shared<kalambury::Canvas>();
    assert!(kalambury::canvas_version(&canvas) == 0, 0);

    // Two runs: 255 white then the rest, the shape a real empty canvas takes.
    kalambury::paint(&game, &mut canvas, vector[255, 0, 9, 0], scenario.ctx());
    assert!(kalambury::canvas_version(&canvas) == 1, 1);
    assert!(kalambury::canvas_pixels(&canvas) == vector[255, 0, 9, 0], 2);

    kalambury::paint(&game, &mut canvas, vector[1, 1], scenario.ctx());
    assert!(kalambury::canvas_version(&canvas) == 2, 3);

    test_scenario::return_shared(canvas);
    test_scenario::return_shared(game);
    clock.destroy_for_testing();
    scenario.end();
}

#[test, expected_failure]
fun a_guesser_cannot_paint() {
    let mut scenario = test_scenario::begin(HOST);
    let clock = iota::clock::create_for_testing(scenario.ctx());
    let mut game = started_game(&mut scenario, &clock);
    kalambury::start_round(&mut game, commitment_fixture(), &clock, scenario.ctx());

    scenario.next_tx(ANNA);
    let mut canvas = scenario.take_shared<kalambury::Canvas>();
    kalambury::paint(&game, &mut canvas, vector[1, 1], scenario.ctx());
    abort
}

#[test, expected_failure]
fun painting_before_the_round_starts_is_rejected() {
    // READY, not DRAWING: the canvas must not be usable between rounds.
    let mut scenario = test_scenario::begin(HOST);
    let clock = iota::clock::create_for_testing(scenario.ctx());
    let game = started_game(&mut scenario, &clock);

    scenario.next_tx(HOST);
    let mut canvas = scenario.take_shared<kalambury::Canvas>();
    kalambury::paint(&game, &mut canvas, vector[1, 1], scenario.ctx());
    abort
}

#[test, expected_failure]
fun a_drawing_larger_than_the_grid_is_rejected() {
    let mut scenario = test_scenario::begin(HOST);
    let clock = iota::clock::create_for_testing(scenario.ctx());
    let mut game = started_game(&mut scenario, &clock);
    kalambury::start_round(&mut game, commitment_fixture(), &clock, scenario.ctx());

    scenario.next_tx(HOST);
    let mut canvas = scenario.take_shared<kalambury::Canvas>();
    let mut oversized = vector[];
    let mut i = 0;
    while (i <= 48 * 48 * 2) { oversized.push_back(0u8); i = i + 1; };
    kalambury::paint(&game, &mut canvas, oversized, scenario.ctx());
    abort
}
