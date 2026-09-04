// Kalambury refereed on chain. The contract owns the rules: who may act, in
// what phase, and whether a claimed win is real. A modified client achieves
// nothing.
//
// Guests are plain addresses the host funded at setup — holding the key to a
// recorded slot IS the invitation, so no secret is ever submitted or verified.
// The host generates those keys, which means the host could act as any player;
// that is a deliberate trade for scan-and-play, documented in the design.
module kalambury::kalambury;

use std::string::String;
use iota::clock::Clock;
use iota::hash;

const PHASE_LOBBY: u8 = 0;
const PHASE_READY: u8 = 1;
const PHASE_DRAWING: u8 = 2;
const PHASE_REVEAL: u8 = 3;

const MAX_PLAYERS: u64 = 8;
const MAX_GUESS_BYTES: u64 = 64;

const READY_MS: u64 = 120_000;
const ROUND_MS: u64 = 120_000;
const REVEAL_MS: u64 = 60_000;

// Error constants follow `password_account.move`: a named `vector<u8>` with an
// `#[error]` attribute, so a failed assert reports a sentence rather than a
// number.
#[error(code = 1)]
const ETooManyPlayers: vector<u8> = b"A room holds at most 8 players.";
#[error(code = 2)]
const ERoomClosed: vector<u8> = b"This room is no longer accepting players.";
#[error(code = 3)]
const ENotASlot: vector<u8> = b"That address is not an invited slot, or the slot is taken.";
#[error(code = 4)]
const ENotHost: vector<u8> = b"Only the host may do that.";
#[error(code = 5)]
const EWrongPhase: vector<u8> = b"That action is not allowed in this phase.";
#[error(code = 6)]
const ENotEnoughPlayers: vector<u8> = b"At least two active players are needed.";
#[error(code = 7)]
const ENotDrawer: vector<u8> = b"Only the current drawer may do that.";
#[error(code = 8)]
const EDrawerCannotGuess: vector<u8> = b"The drawer already knows the word.";
#[error(code = 9)]
const EPastDeadline: vector<u8> = b"The deadline for this phase has passed.";
#[error(code = 10)]
const ENotYetExpired: vector<u8> = b"The deadline has not passed yet.";
#[error(code = 11)]
const EBadCommitment: vector<u8> = b"A commitment must be exactly 32 bytes.";
#[error(code = 12)]
const ECommitmentMismatch: vector<u8> = b"The revealed word does not match the commitment.";
#[error(code = 13)]
const EClaimMismatch: vector<u8> = b"The claimed guess is not the revealed word.";
#[error(code = 14)]
const ENoClaim: vector<u8> = b"Nothing has been claimed yet.";
#[error(code = 15)]
const EGuessTooLong: vector<u8> = b"A guess is at most 64 bytes.";
#[error(code = 16)]
const ENotAPlayer: vector<u8> = b"You are not in this game.";
#[error(code = 17)]
const EInactivePlayer: vector<u8> = b"You have been removed from this game.";
#[error(code = 18)]
const ENoSuchPlayer: vector<u8> = b"No such player.";
#[error(code = 19)]
const ENoSuchGuess: vector<u8> = b"No such guess.";

public struct Player has store, drop {
    who: address,
    name: String,
    score: u16,
    /// Kicked players are marked, never removed: `drawer` and every
    /// `Guess.player` are indices into this vector, so removing one would
    /// silently reassign the drawer and misattribute past guesses.
    active: bool,
}

public struct Slot has store, drop {
    who: address,
    claimed: bool,
}

public struct Guess has store, drop {
    player: u16,
    text: String,
}

public struct Canvas has key {
    id: UID,
    // No back-reference to the Game: it is created first, so it cannot know
    // the game's id, and `Game.canvas_id` already links the pair.
    pixels: vector<u8>,
    version: u32,
}

public struct Game has key {
    id: UID,
    host: address,
    /// Which room this is for the host, counted by their own client. Slot keys
    /// are derived from the host's password seed and this index, so the host
    /// can re-derive them after a reload and re-show a guest's QR — and a host
    /// who lost their browser storage can recover the index from here.
    ///
    /// Public and useless on its own: without the host's seed it derives
    /// nothing. The seed itself must never be stored on chain, because a
    /// shared object is readable by everyone.
    room_index: u32,
    slots: vector<Slot>,
    players: vector<Player>,
    open: bool,
    phase: u8,
    drawer: u16,
    round: u16,
    commitment: vector<u8>,
    guesses: vector<Guess>,
    claimed: u16,      // meaningful only while `has_claim` is true
    has_claim: bool,
    deadline_ms: u64,
    canvas_id: ID,
}

/// Create a room. `slot_addresses` are the guest addresses the host has just
/// generated and is about to fund in the same transaction. The host is player
/// zero and does not occupy a slot.
public fun create_game(room_index: u32, slot_addresses: vector<address>, ctx: &mut TxContext) {
    assert!(slot_addresses.length() + 1 <= MAX_PLAYERS, ETooManyPlayers);

    let canvas = Canvas { id: object::new(ctx), pixels: vector[], version: 0 };
    let canvas_id = object::id(&canvas);

    let mut slots = vector[];
    let mut i = 0;
    while (i < slot_addresses.length()) {
        slots.push_back(Slot { who: slot_addresses[i], claimed: false });
        i = i + 1;
    };

    let mut players = vector[];
    players.push_back(Player {
        who: ctx.sender(),
        name: b"host".to_string(),
        score: 0,
        active: true,
    });

    let game = Game {
        id: object::new(ctx),
        host: ctx.sender(),
        room_index,
        slots,
        players,
        open: true,
        phase: PHASE_LOBBY,
        drawer: 0,
        round: 0,
        commitment: vector[],
        guesses: vector[],
        claimed: 0,
        has_claim: false,
        deadline_ms: 0,
        canvas_id,
    };

    transfer::share_object(canvas);
    transfer::share_object(game);
}

/// Join by holding the key to a recorded slot. Membership needs no secret:
/// the host chose these addresses and funded them, so possession is proof.
public fun join(game: &mut Game, name: String, ctx: &mut TxContext) {
    assert!(game.open, ERoomClosed);
    assert!(game.players.length() < MAX_PLAYERS, ETooManyPlayers);

    let sender = ctx.sender();
    let mut i = 0;
    let mut found = false;
    while (i < game.slots.length()) {
        if (game.slots[i].who == sender && !game.slots[i].claimed) {
            game.slots[i].claimed = true;
            found = true;
            break
        };
        i = i + 1;
    };
    assert!(found, ENotASlot);

    game.players.push_back(Player { who: sender, name, score: 0, active: true });
}

/// Host-only. Marks the player inactive rather than removing them, and ends
/// the round if the current drawer is the one removed — otherwise the game
/// would point at someone who can no longer act.
public fun kick(game: &mut Game, player: u16, ctx: &mut TxContext) {
    assert!(ctx.sender() == game.host, ENotHost);
    let index = player as u64;
    assert!(index < game.players.length(), ENoSuchPlayer);

    game.players[index].active = false;
    if (game.drawer == player && game.phase != PHASE_LOBBY) {
        end_round_without_score(game);
    }
}

public fun start_game(game: &mut Game, clock: &Clock, ctx: &mut TxContext) {
    assert!(ctx.sender() == game.host, ENotHost);
    assert!(game.phase == PHASE_LOBBY, EWrongPhase);
    assert!(active_count(game) >= 2, ENotEnoughPlayers);

    game.open = false;
    game.phase = PHASE_READY;
    game.deadline_ms = clock.timestamp_ms() + READY_MS;
}

// --- the round ---------------------------------------------------------------

/// The drawer commits to a word before anyone guesses. The commitment is
/// blake2b256(normalised_word || nonce); the word is normalised client-side
/// because Move cannot fold Polish text.
public fun start_round(
    game: &mut Game,
    commitment: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(game.phase == PHASE_READY, EWrongPhase);
    assert!(ctx.sender() == game.players[game.drawer as u64].who, ENotDrawer);
    assert!(commitment.length() == 32, EBadCommitment);

    game.commitment = commitment;
    game.guesses = vector[];
    game.has_claim = false;
    game.phase = PHASE_DRAWING;
    game.round = game.round + 1;
    game.deadline_ms = clock.timestamp_ms() + ROUND_MS;
}

public fun guess(game: &mut Game, text: String, clock: &Clock, ctx: &mut TxContext) {
    assert!(game.phase == PHASE_DRAWING, EWrongPhase);
    assert!(clock.timestamp_ms() <= game.deadline_ms, EPastDeadline);
    assert!(text.as_bytes().length() <= MAX_GUESS_BYTES, EGuessTooLong);

    let player = player_index(game, ctx.sender());
    assert!(player != game.drawer, EDrawerCannotGuess);
    assert!(game.players[player as u64].active, EInactivePlayer);

    game.guesses.push_back(Guess { player, text });
}

/// The drawer's client knows the word, so it detects the match itself. The
/// claim is only provisional: `reveal` proves it.
public fun claim_winner(game: &mut Game, index: u16, clock: &Clock, ctx: &mut TxContext) {
    assert!(game.phase == PHASE_DRAWING, EWrongPhase);
    assert!(ctx.sender() == game.players[game.drawer as u64].who, ENotDrawer);
    assert!((index as u64) < game.guesses.length(), ENoSuchGuess);

    game.claimed = index;
    game.has_claim = true;
    game.phase = PHASE_REVEAL;
    game.deadline_ms = clock.timestamp_ms() + REVEAL_MS;
}

/// Two checks, and both matter: the commitment proves the drawer fixed the
/// word before any guessing, and the equality proves the claimed guess really
/// is that word. Together the drawer can neither deny a correct guess nor
/// invent one.
public fun reveal(
    game: &mut Game,
    word: String,
    nonce: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(game.phase == PHASE_REVEAL, EWrongPhase);
    assert!(ctx.sender() == game.players[game.drawer as u64].who, ENotDrawer);
    assert!(game.has_claim, ENoClaim);

    let mut preimage = *word.as_bytes();
    preimage.append(nonce);
    assert!(hash::blake2b256(&preimage) == game.commitment, ECommitmentMismatch);

    let claimed_text = game.guesses[game.claimed as u64].text;
    assert!(claimed_text.as_bytes() == word.as_bytes(), EClaimMismatch);

    let winner = game.guesses[game.claimed as u64].player;
    let current_drawer = game.drawer;
    game.players[winner as u64].score = game.players[winner as u64].score + 1;
    game.players[current_drawer as u64].score =
        game.players[current_drawer as u64].score + 1;

    rotate(game, clock);
}

public fun timeout_round(game: &mut Game, clock: &Clock, _ctx: &mut TxContext) {
    assert!(game.phase == PHASE_DRAWING, EWrongPhase);
    assert!(clock.timestamp_ms() > game.deadline_ms, ENotYetExpired);
    rotate(game, clock);
}

public fun forfeit_round(game: &mut Game, clock: &Clock, _ctx: &mut TxContext) {
    assert!(game.phase == PHASE_REVEAL, EWrongPhase);
    assert!(clock.timestamp_ms() > game.deadline_ms, ENotYetExpired);
    rotate(game, clock);
}

/// A drawer who never commits would freeze the game between rounds, which is
/// the same failure the in-round timeouts prevent.
public fun skip_drawer(game: &mut Game, clock: &Clock, _ctx: &mut TxContext) {
    assert!(game.phase == PHASE_READY, EWrongPhase);
    assert!(clock.timestamp_ms() > game.deadline_ms, ENotYetExpired);
    rotate(game, clock);
}

/// Every path out of a round leaves a fresh READY deadline behind. Without
/// that, a drawer who revealed would hand the next drawer whatever time
/// happened to remain, and `skip_drawer` would fire immediately or never.
fun rotate(game: &mut Game, clock: &Clock) {
    game.phase = PHASE_READY;
    game.guesses = vector[];
    game.commitment = vector[];
    game.has_claim = false;
    game.drawer = next_active(game, game.drawer);
    game.deadline_ms = clock.timestamp_ms() + READY_MS;
}

fun player_index(game: &Game, who: address): u16 {
    let mut i = 0;
    while (i < game.players.length()) {
        if (game.players[i].who == who) return i as u16;
        i = i + 1;
    };
    abort ENotAPlayer
}

public fun is_active(game: &Game, player: u64): bool { game.players[player].active }

fun active_count(game: &Game): u64 {
    let mut n = 0;
    let mut i = 0;
    while (i < game.players.length()) {
        if (game.players[i].active) n = n + 1;
        i = i + 1;
    };
    n
}

/// Reached from `kick`, which has no `Clock`. It leaves `deadline_ms` alone,
/// which is safe: `skip_drawer` only needs a deadline already in the past to
/// be callable, and the kicked drawer's stale deadline is exactly that.
fun end_round_without_score(game: &mut Game) {
    game.phase = PHASE_READY;
    game.guesses = vector[];
    game.commitment = vector[];
    game.has_claim = false;
    game.drawer = next_active(game, game.drawer);
}

fun next_active(game: &Game, from: u16): u16 {
    let count = game.players.length();
    let mut step = 1;
    while (step <= count) {
        let candidate = ((from as u64 + step) % count) as u16;
        if (game.players[candidate as u64].active) return candidate;
        step = step + 1;
    };
    from
}

public fun phase_lobby(): u8 { PHASE_LOBBY }
public fun phase_ready(): u8 { PHASE_READY }
public fun phase_drawing(): u8 { PHASE_DRAWING }
public fun phase_reveal(): u8 { PHASE_REVEAL }

public fun phase(game: &Game): u8 { game.phase }
public fun is_open(game: &Game): bool { game.open }
public fun slot_count(game: &Game): u64 { game.slots.length() }
public fun player_count(game: &Game): u64 { game.players.length() }
public fun score(game: &Game, player: u64): u16 { game.players[player].score }
public fun drawer(game: &Game): u16 { game.drawer }
public fun room_index(game: &Game): u32 { game.room_index }
public fun guess_count(game: &Game): u64 { game.guesses.length() }
