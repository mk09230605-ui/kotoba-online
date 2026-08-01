const { getRoom, setRoom, isPersistent } = require('./_store');

const CARDS = [
  ['あ','薄いもの'],['い','今日目にしたもの'],['う','コンビニに売ってるもの'],['え','人間しか使わないもの'],['お','頭が良さそうなもの'],['か','細いもの'],['き','いつかは捨てるもの'],['く','身体にいいもの'],['け','ただ一つであるもの'],['こ','流行っているもの'],['さ','音を発するもの'],['し','100円ショップにあるもの'],['す','複雑なもの'],['せ','恐ろしいもの'],['そ','速く動くもの'],['た','街で見かけるもの'],['ち','たくさんあるもの'],['つ','自分より重いもの'],['て','高価なもの'],['と','気分のいいもの'],['な','仕事で使うもの'],['に','理解できないもの'],['ぬ','子供が好きなもの'],['ね','夏っぽいもの'],['の','手に持つもの'],['は','1万円以上するもの'],['ひ','白いもの'],['ふ','ゲームに出てくるもの'],['へ','人気があるもの'],['ほ','柔らかいもの'],['ま','液状のもの'],['み','家に置いてあるもの'],['む','冷たいもの'],['め','便利なもの'],['も','手で触れないもの'],['や','電気を使うもの'],['ゆ','食べるまたは飲むもの'],['よ','架空のもの'],['ら','生きているもの'],['り','自然界に存在しないもの'],['る','昔はなかったもの'],['れ','学校にあるもの'],['ろ','教科書に載ってるもの'],['わ','日本らしいもの']
].map(([kana, condition], id) => ({ id, kana, condition }));

const random = length => Array.from({ length }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const shuffle = values => [...values].sort(() => Math.random() - .5);
const normalize = value => String(value || '').trim().normalize('NFC');
const isOwner = (room, token) => room.players.findIndex(player => player.token === token);
const turnLimit = room => room.players.length === 2 ? 10 : 12;
const wordRevealTurn = room => room.players.length === 3 ? 3 : 4;

function publicWordMask(room, player, wordRevealed) {
  if (!wordRevealed || !player.secret) return undefined;
  const characters = Array.from(player.secret);
  const visible = new Set([characters[0]]);
  if (room.showHiraganaPositions) {
    room.declarations.forEach((declaration, index) => {
      if (declaration.mode === 'kana' && player.records[index] === 'YES') visible.add(declaration.label);
    });
  }
  return characters.map(character => visible.has(character) ? character : '○').join('');
}

function fail(message, status = 400) {
  const error = new Error(message); error.status = status; throw error;
}
function requirePlayer(room, token) {
  const index = isOwner(room, token);
  if (index < 0) fail('参加トークンが無効です。', 403);
  return index;
}
function publicRoom(room, me) {
  const wordRevealed = Boolean(room.showWordLength) && room.turns >= wordRevealTurn(room);
  return {
    id: room.id, phase: room.phase, playerCount: room.playerCount, setNumber: room.setNumber || 1, setCount: room.setCount || 1, selfJudge: room.selfJudge,
    showWordLength: Boolean(room.showWordLength), showHiraganaPositions: Boolean(room.showHiraganaPositions),
    showWrongGuessWord: Boolean(room.showWrongGuessWord), targetScoreMode: room.targetScoreMode || 'normal', wordRevealed, turn: room.turn,
    turns: room.turns, turnLimit: turnLimit(room), declarations: room.declarations,
    wrongGuesses: (room.wrongGuesses || []).map(guess => ({ targetIndex: guess.targetIndex, word: room.showWrongGuessWord ? guess.word : undefined })),
    hasVoted: (room.votes || []).some(vote => vote.voterIndex === me),
    pending: room.pending ? { mode: room.pending.mode, card: room.pending.card, answered: room.players.map((p, i) => Boolean(room.pending.answers[i])) } : null,
    message: room.message, persistent: isPersistent(),
    players: room.players.map((p, index) => ({
      name: p.name, ready: Boolean(p.secret),
      // 設定内容と秘密単語は本人にだけ返す。相手には設定済みかどうかだけを公開する。
      lead: index === me ? p.lead : undefined, cond: index === me ? p.cond : undefined, guesses: p.guesses,
      score: p.score, solved: p.solved, records: p.records, voteCount: (room.votes || []).filter(vote => vote.targetIndex === index).length, secretMask: publicWordMask(room, p, wordRevealed),
      secret: index === me || p.solved || room.phase === 'voting' || room.phase === 'ended' ? p.secret : undefined,
      own: index === me, hand: index === me ? p.hand : undefined
    }))
  };
}
function deal(room) {
  const deck = shuffle(CARDS);
  room.deck = deck.slice(room.playerCount * 5);
  room.players.forEach((p, index) => Object.assign(p, { hand: deck.slice(index * 5, index * 5 + 5), secret: '', lead: null, cond: null, guesses: 2, solved: false, records: [] }));
}
function maybeStart(room) {
  if (!room.players.every(p => p.secret)) return;
  room.turn = room.players.map((p, i) => ({ i, order: CARDS.findIndex(card => card.kana === p.lead) }))
    .sort((a, b) => a.order - b.order || Math.random() - .5)[0].i;
  room.phase = 'turn'; room.message = `${room.players[room.turn].name} の手番`;
}
function endTurn(room) {
  const player = room.players[room.turn];
  if (room.deck.length) player.hand.push(room.deck.pop());
  room.turns++;
  if (room.turns >= turnLimit(room) || room.players.every(p => p.solved)) {
    room.phase = 'voting'; room.message = 'セット終了。ほかのプレイヤーの単語へ投票する。'; return;
  }
  room.turn = (room.turn + 1) % room.players.length;
  room.phase = 'turn'; room.message = `${room.players[room.turn].name} の手番`;
}
function finishJudgement(room) {
  const pending = room.pending;
  room.declarations.push({ label: pending.mode === 'kana' ? pending.card.kana : pending.card.condition, mode: pending.mode });
  room.players.forEach((p, index) => {
    if (!p.solved && !(room.selfJudge === false && index === room.turn)) p.records[room.turns] = pending.answers[index];
  });
  room.pending = null; room.phase = 'guess'; room.message = '回答するか、回答せず終了を選ぶ。';
}
function action(room, me, body) {
  const player = room.players[me];
  if (body.type === 'setup') {
    if (room.phase !== 'setup' || player.secret) fail('いまは秘密単語を設定できません。');
    const leadIndex = Number(body.leadIndex), condIndex = Number(body.condIndex), secret = normalize(body.secret);
    if (!Number.isInteger(leadIndex) || !Number.isInteger(condIndex) || leadIndex === condIndex || !player.hand[leadIndex] || !player.hand[condIndex] || !secret) fail('異なる2枚と秘密単語を設定してください。');
    const lead = player.hand[leadIndex].kana;
    const first = Array.from(secret)[0];
    if (first !== lead) fail(`秘密単語は「${lead}」で始めてください。`);
    player.lead = lead; player.cond = player.hand[condIndex].condition; player.secret = secret;
    player.hand = player.hand.filter((_, i) => i !== leadIndex && i !== condIndex);
    room.message = `${player.name} が秘密単語を設定した。`; maybeStart(room); return;
  }
  if (body.type === 'judge') {
    if (room.phase !== 'turn' || room.turn !== me) fail('あなたの手番ではありません。');
    const cardIndex = Number(body.cardIndex), mode = body.mode;
    if (!['kana', 'cond'].includes(mode) || !player.hand[cardIndex]) fail('判定カードが不正です。');
    const card = player.hand.splice(cardIndex, 1)[0]; room.pending = { mode, card, answers: {} };
    if (mode === 'kana') {
      room.players.forEach((target, index) => { if (!target.solved && !(room.selfJudge === false && index === me)) room.pending.answers[index] = Array.from(target.secret).includes(card.kana) ? 'YES' : 'NO'; });
      finishJudgement(room);
    } else { room.phase = 'judgement'; room.message = '条件文への判定を選択中。'; }
    return;
  }
  if (body.type === 'answer') {
    if (room.phase !== 'judgement' || !room.pending || player.solved || (room.selfJudge === false && me === room.turn)) fail('判定回答を受け付けられません。');
    if (!['YES', 'NO', '？'].includes(body.answer) || room.pending.answers[me]) fail('判定回答が不正です。');
    room.pending.answers[me] = body.answer;
    if (room.players.every((p, index) => p.solved || (room.selfJudge === false && index === room.turn) || room.pending.answers[index])) finishJudgement(room);
    return;
  }
  if (body.type === 'guess') {
    if (room.phase !== 'guess' || room.turn !== me || player.guesses < 1) fail('いまは回答できません。');
    const targetIndex = Number(body.targetIndex), word = normalize(body.word), target = room.players[targetIndex];
    if (!word || !target || targetIndex === me || target.solved) fail('回答内容が不正です。');
    player.guesses--; const correct = word === target.secret;
    if (correct) { target.solved = true; player.score++; target.score += room.targetScoreMode === 'penalty' ? -1 : 1; room.message = `${player.name} が ${target.name} の単語を正解した。`; }
    else { room.wrongGuesses = room.wrongGuesses || []; room.wrongGuesses.push({ targetIndex, word }); room.message = `${player.name} の回答は不正解。`; }
    endTurn(room); return;
  }
  if (body.type === 'pass') {
    if (room.phase !== 'guess' || room.turn !== me) fail('いまは手番を終了できません。');
    endTurn(room); return;
  }
  if (body.type === 'vote') {
    if (room.phase !== 'voting' || (room.votes || []).some(vote => vote.voterIndex === me)) fail('いまは投票できません。');
    const targetIndex = Number(body.targetIndex), target = room.players[targetIndex];
    if (!target || targetIndex === me) fail('投票先が不正です。');
    room.votes = room.votes || []; room.votes.push({ voterIndex: me, targetIndex }); target.score += .5;
    if (room.votes.length >= room.players.length) {
      if (room.setNumber < room.setCount) { room.phase = 'nextSet'; room.message = '投票完了。次のセットへ進める。'; }
      else { room.phase = 'ended'; room.message = '投票完了。テスト対戦は終了した。'; }
    } else room.message = `${room.players[me].name} が投票した。`;
    return;
  }
  if (body.type === 'nextSet') {
    if (room.phase !== 'nextSet') fail('いまは次のセットへ進めません。');
    room.setNumber++; room.turns = 0; room.turn = 0; room.declarations = []; room.wrongGuesses = []; room.votes = []; room.pending = null;
    deal(room); room.phase = 'setup'; room.message = `セット ${room.setNumber}。各自、秘密単語を設定する。`;
    return;
  }
  fail('不明な操作です。');
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const { roomId, token } = req.query; const room = await getRoom(roomId);
      if (!room) fail('ルームが見つかりません。', 404);
      return res.status(200).json(publicRoom(room, requirePlayer(room, token)));
    }
    if (req.method !== 'POST') return res.status(405).end();
    const body = req.body || {};
    if (body.type === 'create') {
      const name = normalize(body.name); if (!name) fail('表示名を入力してください。');
      let id; do { id = random(6); } while (await getRoom(id));
      const setCount = Number(body.setCount), playerCount = Number(body.playerCount), token = random(32); const room = { id, playerCount: Number.isInteger(playerCount) && playerCount >= 2 && playerCount <= 4 ? playerCount : 2, setNumber: 1, setCount: Number.isInteger(setCount) && setCount >= 1 && setCount <= 4 ? setCount : 1, phase: 'waiting', selfJudge: body.selfJudge === false ? false : true, showWordLength: body.showWordLength === true, showHiraganaPositions: body.showHiraganaPositions === true, showWrongGuessWord: body.showWrongGuessWord === true, targetScoreMode: body.targetScoreMode === 'penalty' ? 'penalty' : 'normal', players: [{ name: name.slice(0, 20), token, score: 0 }], declarations: [], wrongGuesses: [], votes: [], turns: 0, turn: 0, message: '対戦相手の参加を待っている。' };
      await setRoom(room); return res.status(201).json({ roomId: id, token });
    }
    if (body.type === 'join') {
      const room = await getRoom(String(body.roomId || '').toUpperCase()); const name = normalize(body.name);
      if (!room) fail('ルームが見つかりません。', 404);
      if (room.phase !== 'waiting' || room.players.length >= room.playerCount) fail('このルームには参加できません。');
      if (!name) fail('表示名を入力してください。');
      const token = random(32); room.players.push({ name: name.slice(0, 20), token, score: 0 });
      if (room.players.length === room.playerCount) { deal(room); room.phase = 'setup'; room.message = '各自、秘密単語を設定する。'; }
      else room.message = `対戦相手の参加を待っている（${room.players.length}/${room.playerCount}）。`;
      await setRoom(room);
      return res.status(200).json({ roomId: room.id, token });
    }
    const room = await getRoom(body.roomId); if (!room) fail('ルームが見つかりません。', 404);
    const me = requirePlayer(room, body.token); action(room, me, body); await setRoom(room);
    return res.status(200).json(publicRoom(room, me));
  } catch (error) { return res.status(error.status || 500).json({ error: error.message || 'サーバーエラー' }); }
};
