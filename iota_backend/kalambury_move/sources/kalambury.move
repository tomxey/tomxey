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
use iota::event;
use iota::hash;

const PHASE_LOBBY: u8 = 0;
const PHASE_READY: u8 = 1;
const PHASE_DRAWING: u8 = 2;
const PHASE_REVEAL: u8 = 3;

/// Host plus fifteen guests. The vectors are scanned linearly and the whole
/// game is one object, so this is a bound on gas and object size rather than a
/// rule of the game; raise it if a bigger party ever needs it.
const MAX_PLAYERS: u64 = 16;
const MAX_GUESS_BYTES: u64 = 64;

/// A 48×48 grid, run-length encoded as (count, colour) pairs. The worst case
/// is a pair per pixel — a canvas where no two neighbours match — so anything
/// larger than that is not a canvas.
const CANVAS_SIDE: u64 = 48;
const MAX_CANVAS_BYTES: u64 = CANVAS_SIDE * CANVAS_SIDE * 2;

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
#[error(code = 20)]
const EWrongCanvas: vector<u8> = b"That canvas does not belong to this game.";
#[error(code = 21)]
const ECanvasTooBig: vector<u8> = b"That drawing is larger than a full canvas.";
#[error(code = 22)]
const ENotInLobby: vector<u8> = b"The roster can only be added to before the game starts.";
#[error(code = 23)]
const ENoSlots: vector<u8> = b"This room has no slots to remove.";
#[error(code = 24)]
const ESlotTaken: vector<u8> = b"That slot has been claimed — remove the player instead.";

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

/// Emitted so a host can find their own rooms again. A Game is a shared
/// object, so it is owned by nobody and `getOwnedObjects` will never list it;
/// without this the only record of a room is whatever the browser remembered,
/// and clearing localStorage stranded it — along with any gas still sitting in
/// its guest slots.
public struct RoomCreated has copy, drop {
    game: ID,
    canvas: ID,
    host: address,
    room_index: u32,
}

/// Emitted on close so a client can drop a room from its list without having
/// to probe for a deleted object.
public struct RoomClosed has copy, drop {
    game: ID,
    host: address,
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

    event::emit(RoomCreated {
        game: object::id(&game),
        canvas: canvas_id,
        host: ctx.sender(),
        room_index,
    });

    transfer::share_object(canvas);
    transfer::share_object(game);
}

/// Delete a finished room and return its storage deposit to the host.
///
/// Both objects are taken by value because they are deleted; a Canvas that
/// outlived its Game would be unreachable, and its deposit unreclaimable.
/// Shared objects may be deleted — what they may not do is become owned again.
///
/// This does not touch the guests' gas: those coins sit in the guests' own
/// addresses, so sweep before closing or the keys are still the only way to
/// reach them.
public fun close_game(game: Game, canvas: Canvas, ctx: &mut TxContext) {
    assert!(ctx.sender() == game.host, ENotHost);
    assert!(object::id(&canvas) == game.canvas_id, EWrongCanvas);

    event::emit(RoomClosed { game: object::id(&game), host: game.host });

    // Every field except the UID has `drop`, so `..` discards them and only
    // the two UIDs need deleting explicitly.
    let Game { id, .. } = game;
    object::delete(id);
    let Canvas { id: canvas_uid, .. } = canvas;
    object::delete(canvas_uid);
}

/// Add one more guest slot to a room that is still open.
///
/// Appends, never inserts: the host's client derives slot keys from its seed
/// by position, so the new slot must land at the end or every QR after the
/// insertion point would stop matching the address recorded here.
public fun add_slot(game: &mut Game, who: address, ctx: &mut TxContext) {
    assert!(ctx.sender() == game.host, ENotHost);
    assert!(game.open, ERoomClosed);
    // The host occupies a player entry without occupying a slot.
    assert!(game.slots.length() + 1 < MAX_PLAYERS, ETooManyPlayers);

    game.slots.push_back(Slot { who, claimed: false });
}

/// Drop the last slot, for a host who added more than they needed.
///
/// The last one specifically, for the same reason `add_slot` appends. A slot
/// somebody has already claimed is left alone — that is a player now, and
/// `kick` is how a player is removed, which keeps every index stable.
public fun remove_last_slot(game: &mut Game, ctx: &mut TxContext) {
    assert!(ctx.sender() == game.host, ENotHost);
    assert!(game.open, ERoomClosed);
    assert!(!game.slots.is_empty(), ENoSlots);
    assert!(!game.slots[game.slots.length() - 1].claimed, ESlotTaken);

    game.slots.pop_back();
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
    // Player zero is the host, and the host may have taken themselves off the
    // roster to run the lobby without playing. Starting on an inactive drawer
    // would leave the first round startable only by someone who is not in the
    // game — everyone else would have to wait out READY_MS and skip them.
    game.drawer = first_active(game);
    game.deadline_ms = clock.timestamp_ms() + READY_MS;
}

/// Put a player the host removed back on the roster.
///
/// Lobby only. The host composes the roster before starting; afterwards
/// removal stays one-way, because re-admitting mid-game would revive a player
/// the rotation has already passed and `drawer` may point anywhere.
public fun readmit(game: &mut Game, player: u16, ctx: &mut TxContext) {
    assert!(ctx.sender() == game.host, ENotHost);
    assert!(game.phase == PHASE_LOBBY, ENotInLobby);
    let index = player as u64;
    assert!(index < game.players.length(), ENoSuchPlayer);

    game.players[index].active = true;
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

/// Publish the drawing. Only the drawer, only while drawing.
///
/// `pixels` is opaque to the contract: the client run-length encodes a 48×48
/// palette-indexed grid, and the only thing checked here is that it cannot be
/// bigger than the worst case for that grid. Keeping the format out of Move
/// means a mostly-empty canvas costs a few dozen bytes instead of 2304, which
/// is what makes a snapshot every couple of seconds affordable.
///
/// `version` increments so a viewer can tell "nothing new" from "blank canvas"
/// without comparing 2304 pixels, and so a late frame is recognisable.
public fun paint(
    game: &Game,
    canvas: &mut Canvas,
    pixels: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(game.phase == PHASE_DRAWING, EWrongPhase);
    assert!(ctx.sender() == game.players[game.drawer as u64].who, ENotDrawer);
    assert!(object::id(canvas) == game.canvas_id, EWrongCanvas);
    assert!(pixels.length() <= MAX_CANVAS_BYTES, ECanvasTooBig);

    canvas.pixels = pixels;
    canvas.version = canvas.version + 1;
}

public fun canvas_version(canvas: &Canvas): u32 { canvas.version }

public fun canvas_pixels(canvas: &Canvas): &vector<u8> { &canvas.pixels }

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

/// The lowest-numbered player who is playing. `start_game` has already
/// asserted at least two are, so the fallback is unreachable in practice.
fun first_active(game: &Game): u16 {
    let mut i = 0;
    while (i < game.players.length()) {
        if (game.players[i].active) return i as u16;
        i = i + 1;
    };
    0
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
