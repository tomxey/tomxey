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

const PHASE_LOBBY: u8 = 0;
const PHASE_READY: u8 = 1;
const PHASE_DRAWING: u8 = 2;
const PHASE_REVEAL: u8 = 3;

const MAX_PLAYERS: u64 = 8;

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
public fun create_game(slot_addresses: vector<address>, ctx: &mut TxContext) {
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
public fun guess_count(game: &Game): u64 { game.guesses.length() }
