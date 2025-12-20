// Easy AI for Kings of the West (Simplified perception for easier play)
// Exposes EasyAI.chooseAction(state, player)

const EasyAI = (() => {
    const BOARD_ROWS = 6;
    const BOARD_COLS = 6;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    const getOpponent = (player) => (player === 1 ? 2 : 1);

    function getPieceAt(state, r, c) {
        for (const pl of [1, 2]) {
            for (const p of state.players[pl].pieces) {
                if (p.r === r && p.c === c && p.hp > 0) return p;
            }
        }
        return null;
    }

    // Determines all reachable tiles for a piece within a given number of steps
    function getReachable(state, startPiece, steps) {
        const queue = [{ r: startPiece.r, c: startPiece.c, dist: 0 }];
        const seen = new Set([`${startPiece.r},${startPiece.c}`]);
        const reachable = [];

        while (queue.length) {
            const { r, c, dist } = queue.shift();

            for (const [dr, dc] of DIRS) {
                const nr = r + dr;
                const nc = c + dc;
                const key = `${nr},${nc}`;

                if (nr < 0 || nr >= BOARD_ROWS || nc < 0 || nc >= BOARD_COLS) continue;
                if (seen.has(key) || getPieceAt(state, nr, nc)) {
                    seen.add(key); // Still mark as seen even if blocked, to prevent revisiting
                    continue;
                }

                const newDist = dist + 1;
                if (newDist > steps) {
                    seen.add(key);
                    continue;
                }

                reachable.push({ r: nr, c: nc });
                seen.add(key);
                queue.push({ r: nr, c: nc, dist: newDist });
            }
        }
        return reachable;
    }

    // Gets enemies in attack range from a given (r, c)
    function getEnemiesInAttackRange(state, piece, fromR, fromC) {
        const opp = getOpponent(piece.owner);
        const enemies = [];
        for (const e of state.players[opp].pieces) {
            if (e.hp <= 0) continue;
            const dist = Math.abs(e.r - fromR) + Math.abs(e.c - fromC);
            if (piece.type === 'gunslinger') {
                if (dist === 1 || (dist >= 2 && dist <= 3)) enemies.push(e);
            } else { // Melee
                if (dist === 1) enemies.push(e);
            }
        }
        return enemies;
    }

    // --- Simplified chooseAction for easier AI ---
    function chooseAction(rawState, player) {
        const state = rawState; // No need to clone for this simpler AI if we don't modify state
        const dice = state.dice || 0;
        const pieces = state.players[player].pieces.filter(p => p.hp > 0);

        // Determine max steps for movement based on dice
        let maxStep = 0;
        if (dice >= 1 && dice <= 3) maxStep = dice;
        if (dice === 4 || dice === 5) maxStep = 1; // Double or Triple Attack dice usually means 1 step movement

        // Shuffle pieces to add some non-determinism if multiple pieces can act
        pieces.sort(() => Math.random() - 0.5);

        for (const p of pieces) {
            // 1. Prioritize any immediate attack from current position
            const enemiesHere = getEnemiesInAttackRange(state, p, p.r, p.c);
            if (enemiesHere.length > 0) {
                // Pick a random enemy to attack
                const target = enemiesHere[Math.floor(Math.random() * enemiesHere.length)];
                return { pieceId: p.id, move: null, attackId: target.id };
            }

            // 2. If no immediate attack, try to move and then attack, or just move
            if (maxStep > 0) {
                const reachableTiles = getReachable(state, p, maxStep);
                // Also include staying in place as a "move" option (null)
                reachableTiles.push(null);

                // Shuffle reachable tiles to introduce randomness in movement
                reachableTiles.sort(() => Math.random() - 0.5);

                for (const t of reachableTiles) {
                    const moveTo = t ? { r: t.r, c: t.c } : null;
                    const fromR = moveTo ? moveTo.r : p.r;
                    const fromC = moveTo ? moveTo.c : p.c;

                    const enemiesFromMove = getEnemiesInAttackRange(state, p, fromR, fromC);
                    if (enemiesFromMove.length > 0) {
                        // If moving leads to an attack, take it. Pick a random enemy.
                        const target = enemiesFromMove[Math.floor(Math.random() * enemiesFromMove.length)];
                        return { pieceId: p.id, move: moveTo, attackId: target.id };
                    }
                }

                // If no attack is possible after moving, just pick a random valid move
                // (already shuffled reachableTiles, so the first one is effectively random)
                if (reachableTiles.length > 1) { // If there's at least one move option besides staying put
                    const randomMove = reachableTiles.find(move => move !== null); // Pick a non-null move if possible
                     if (randomMove) {
                        return { pieceId: p.id, move: randomMove, attackId: null };
                    }
                }
                 // If only staying in place is an option, do that (or if no moves were found at all)
                return { pieceId: p.id, move: null, attackId: null };
            }
        }

        // If no actions can be found for any piece, return null
        return null;
    }

    return { chooseAction };
})();

// Expose to global
if (typeof window !== 'undefined') window.EasyAI = EasyAI;