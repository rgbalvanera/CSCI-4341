// Kings of the West - simple 6x6 tactical duel
const ROWS = 6, COLS = 6;

const state = {
	board: [], // cells
	players: {1:{pieces:[]},2:{pieces:[]}},
	currentPlayer: null,
	phase: 'setup', // setup, placement, play
	selectedPiece: null,
	dice: null,
	awaitingPlacement: 0,
};

const el = {
	board: document.getElementById('board'),
	startBtn: document.getElementById('start-btn'),
	rollBtn: document.getElementById('roll-btn'),
	diceResult: document.getElementById('dice-result'),
	playerTurn: document.getElementById('player-turn'),
	actionDesc: document.getElementById('action-desc'),
	controls: document.getElementById('controls'),
	messages: document.getElementById('messages'),
	resetBtn: document.getElementById('reset-btn'),
};

function log(...args){
	const d = document.createElement('div');
	d.textContent = args.join(' ');
	el.messages.prepend(d);
}

function resetHighlights(){
	document.querySelectorAll('.cell').forEach(c=>c.classList.remove('highlight-move','highlight-attack'));
}

function createBoard(){
	state.board = [];
	el.board.innerHTML = '';
	for(let r=0;r<ROWS;r++){
		for(let c=0;c<COLS;c++){
			const idx = r*COLS + c;
			state.board[idx] = {r,c,el:null};
			const cell = document.createElement('div');
			cell.className = 'cell';
			cell.dataset.r = r; cell.dataset.c = c; cell.dataset.idx = idx;
			const coord = document.createElement('div'); coord.className='coord'; coord.textContent = `${r},${c}`;
			cell.appendChild(coord);
			cell.addEventListener('click', ()=>onCellClick(r,c));
			el.board.appendChild(cell);
			state.board[idx].el = cell;
		}
	}
}

function uid(prefix){return prefix+'-'+Math.random().toString(36).slice(2,9)}

function placePiece(owner,type,r,c,isKing=false){
	const piece = {id:uid('p'), owner, type, r,c, hp: type==='king'?10:(type==='gunslinger'?7:8), isKing:!!isKing};
	state.players[owner].pieces.push(piece);
	renderBoard();
}

function renderBoard(){
	// clear pieces
	document.querySelectorAll('.cell .piece') .forEach(n=>n.remove());
	for(const p of [...state.players[1].pieces, ...state.players[2].pieces]){
		const idx = p.r*COLS + p.c;
		const cell = state.board[idx].el;
		const div = document.createElement('div'); div.className = `piece ${p.owner===1? 'p1':'p2'}`;
		if(p.isKing) div.classList.add('p-king');
		div.innerHTML = `<div>${p.type[0].toUpperCase()}</div><div class="hp">${p.hp}</div>`;
		div.title = `${p.type} (${p.hp} HP)`;
		div.dataset.id = p.id;
		div.addEventListener('click', (ev)=>{ ev.stopPropagation(); onPieceClick(p); });
		cell.appendChild(div);
		cell.classList.toggle('dead', p.hp<=0);
	}
	updateTurnInfo();
}

function findPieceById(id){
	for(const pl of [1,2]){
		for(const p of state.players[pl].pieces) if(p.id===id) return p;
	}
}

function onCellClick(r,c){
	if(state.phase === 'placement' && state.awaitingPlacement>0){
		// only allow placing in appropriate rows for player 1 during setup
		const owner = 1;
		const validRows = [4,5];
		if(!validRows.includes(r)){ log('Choose a tile in your back two rows'); return; }
		// if occupied
		if(getPieceAt(r,c)){ log('Tile occupied'); return; }
		// place next piece from pendingPlacement array
		const pending = state.pendingPlacement.shift();
		placePiece(owner, pending, r, c, pending==='king');
		state.awaitingPlacement--;
		if(state.awaitingPlacement===0){
			finishPlayer1Placement();
		} else {
			log(`Placed ${pending}. ${state.awaitingPlacement} left to place.`);
		}
		return;
	}

	if(state.phase==='play'){
		// if selecting a highlighted move target
		const cell = getPieceAt(r,c);
		// if selection is a move target highlighted (no piece present)
		const elCell = state.board[r*COLS+c].el;
		if(elCell.classList.contains('highlight-move') && state.selectedPiece && state.selectedPiece.owner===state.currentPlayer){
			// move
			movePiece(state.selectedPiece, r, c);
		}
		if(elCell.classList.contains('highlight-attack') && state.selectedPiece){
			const target = getPieceAt(r,c);
			if(target) performAttack(state.selectedPiece, target, state.diceMultiplier || 1);
		}
	}
}

function onPieceClick(p){
	if(state.phase==='placement') return;
	if(state.phase==='play' && state.currentPlayer && p.owner===state.currentPlayer){
		// selecting own piece
		state.selectedPiece = p;
		resetHighlights();
		// If dice is 1-3, highlight reachable tiles
		if(state.dice>=1 && state.dice<=3){
			const tiles = getReachable(p, state.dice);
			tiles.forEach(t=>state.board[t.r*COLS+t.c].el.classList.add('highlight-move'));
			// also highlight attackable enemies in current position (if no move chosen)
			const enemies = getEnemiesInAttackRange(p, p.r, p.c);
			enemies.forEach(e=>state.board[e.r*COLS+e.c].el.classList.add('highlight-attack'));
			el.actionDesc.textContent = `Move up to ${state.dice} and optionally attack`;
		} else if(state.dice===4 || state.dice===5){
			// attack-only with multiplier
			const mult = state.dice===4?2:3;
			state.diceMultiplier = mult;
			const enemies = getEnemiesInAttackRange(p, p.r, p.c, /*allowLong*/true);
			enemies.forEach(e=>state.board[e.r*COLS+e.c].el.classList.add('highlight-attack'));
			el.actionDesc.textContent = `Attack with ${mult}x damage - choose target`;
		} else if(state.dice===6){
			el.actionDesc.textContent = 'This unit is skipped (rolled 6).';
		}
	}
}

function getPieceAt(r,c){
	for(const p of [...state.players[1].pieces, ...state.players[2].pieces]) if(p.r===r && p.c===c && p.hp>0) return p;
	return null;
}

function getReachable(p, steps){
	// BFS orthogonal not passing through pieces
	const q=[{r:p.r,c:p.c,dist:0}];
	const seen = new Set([p.r+','+p.c]);
	const reachable = [];
	while(q.length){
		const cur = q.shift();
		const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
		for(const d of dirs){
			const nr = cur.r + d[0], nc = cur.c + d[1];
			if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
			const key = nr+','+nc;
			if(seen.has(key)) continue;
			// cannot move into occupied cells
			if(getPieceAt(nr,nc)) { seen.add(key); continue; }
			const nd = cur.dist+1;
			if(nd>steps) { seen.add(key); continue; }
			reachable.push({r:nr,c:nc});
			seen.add(key);
			q.push({r:nr,c:nc,dist:nd});
		}
	}
	return reachable;
}

function getEnemiesInAttackRange(p, fromR, fromC, allowLong=false){
	const opp = p.owner===1?2:1;
	const enemies = [];
	for(const e of state.players[opp].pieces){
		if(e.hp<=0) continue;
		const dist = Math.abs(e.r-fromR)+Math.abs(e.c-fromC);
		if(p.type==='gunslinger'){
			if(dist===1) enemies.push(e);
			else if(dist>=2 && dist<=3) enemies.push(e);
		} else { // bruiser or king
			if(dist===1) enemies.push(e);
		}
	}
	return enemies;
}

function movePiece(p, r,c){
	p.r = r; p.c = c; renderBoard();
	// after moving, allow attack if enemies in range
	const enemies = getEnemiesInAttackRange(p, r, c);
	if(enemies.length){
		enemies.forEach(e=>state.board[e.r*COLS+e.c].el.classList.add('highlight-attack'));
		el.actionDesc.textContent = 'Choose an enemy to attack or end turn.';
		// if player clicks attack highlight, handled elsewhere
	} else {
		endTurn();
	}
}

function performAttack(attacker, target, multiplier=1){
	const dist = Math.abs(attacker.r-target.r)+Math.abs(attacker.c-target.c);
	let dmg = 0;
	if(attacker.type==='gunslinger'){
		dmg = dist===1?3: (dist>=2 && dist<=3?2:0);
	} else { dmg = dist===1?3:0; }
	dmg *= multiplier;
	if(dmg<=0){ log('Target out of range'); return; }
	target.hp -= dmg;
	log(`Player ${attacker.owner}'s ${attacker.type} hits Player ${target.owner}'s ${target.type} for ${dmg} damage.`);
	if(target.hp<=0){
		log(`${target.type} (Player ${target.owner}) was eliminated.`);
		// remove piece
		state.players[target.owner].pieces = state.players[target.owner].pieces.filter(x=>x.id!==target.id);
	}
	// clear dice multiplier
	state.diceMultiplier = 1;
	renderBoard();
	checkWin();
	endTurn();
}

function endTurn(){
	resetHighlights();
	state.selectedPiece = null;
	state.dice = null; state.diceMultiplier = 1;
	el.diceResult.textContent = '-'; el.actionDesc.textContent='-';
	state.currentPlayer = state.currentPlayer===1?2:1;
	updateTurnInfo();
}

function updateTurnInfo(){
	el.playerTurn.textContent = state.currentPlayer?`Player ${state.currentPlayer}`:'-';
}

function rollDice(){ return Math.floor(Math.random()*6)+1; }

function onRoll(){
	if(state.phase!=='play') return;
	const r = rollDice(); state.dice = r; el.diceResult.textContent = r; log(`Player ${state.currentPlayer} rolled ${r}`);
	if(r===6){ log('Unlucky! Turn skipped.'); endTurn(); return; }
	// player must now select a piece to act
	el.actionDesc.textContent = (r>=1 && r<=3)?`Select a piece to move up to ${r}`: `Select a piece to attack (x${r===4?2:3})`;
}

function checkWin(){
	for(const pl of [1,2]){
		const opponent = pl===1?2:1;
		const oppPieces = state.players[opponent].pieces;
		const kingAlive = oppPieces.some(p=>p.isKing);
		const fightersAlive = oppPieces.filter(p=>!p.isKing).length;
		if(!kingAlive || fightersAlive===0){
			// pl wins
			log(`Player ${pl} wins!`);
			alert(`Player ${pl} wins!`);
			state.phase='finished';
			el.controls.classList.add('hidden');
			return true;
		}
	}
	return false;
}

function startPlacement(){
	state.phase='placement';
	// read selected choices
	const choices = Array.from(document.querySelectorAll('.p-choice')).filter(i=>i.checked).map(i=>i.value);
	if(choices.length!==4){
		alert('Please select exactly 4 additional pieces (plus the king makes 5).');
		return;
	}
	// prepare pending placement: include king forced first? We auto-place king at bottom-left
	state.pendingPlacement = [...choices];
	state.awaitingPlacement = choices.length;
	// place player1 king at bottom-left (row5,col0)
	placePiece(1,'king',5,0,true);
	log('Player 1 king placed at (5,0). Place remaining pieces by clicking your back two rows (rows 4-5).');
	el.startBtn.disabled = true; el.startBtn.textContent='Placing...';
}

function finishPlayer1Placement(){
	// auto-place player2 mirrored roster: king at (0,5), others random in rows 0-1
	placePiece(2,'king',0,5,true);
	// copy pendingPlacement originally chosen
	const roster = [];
	document.querySelectorAll('.p-choice').forEach(i=>{ if(i.checked) roster.push(i.value); });
	const spots = [];
	for(let r=0;r<=1;r++) for(let c=0;c<COLS;c++) spots.push({r,c});
	// remove occupied
	const free = spots.filter(s=>!getPieceAt(s.r,s.c));
	// shuffle and assign
	shuffleArray(free);
	for(let i=0;i<roster.length;i++){
		const s = free[i]; if(!s) break; placePiece(2, roster[i], s.r, s.c, roster[i]==='king');
	}
	log('Player 2 auto-placed their roster (king at 0,5).');
	// decide who starts by dice
	decideFirstPlayer();
}

function decideFirstPlayer(){
	let a = rollDice(), b = rollDice();
	while(a===b){ a=rollDice(); b=rollDice(); }
	const starter = a>b?1:2;
	state.currentPlayer = starter; state.phase='play'; el.controls.classList.remove('hidden'); el.startBtn.style.display='none';
	log(`Player 1 rolled ${a}, Player 2 rolled ${b}. Player ${starter} goes first.`);
	renderBoard(); updateTurnInfo();
}

function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }

function init(){
	createBoard();
	renderBoard();
	el.startBtn.addEventListener('click', startPlacement);
	el.rollBtn.addEventListener('click', onRoll);
	el.resetBtn.addEventListener('click', ()=>location.reload());
	el.controls.classList.add('hidden');
}

init();

