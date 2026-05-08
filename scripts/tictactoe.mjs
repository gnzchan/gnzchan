import { readFileSync, writeFileSync } from 'node:fs'

const STATE_PATH = 'state.json'
const README_PATH = 'README.md'
const REPO = 'gnzchan/gnzchan'
const PLAYER = 'X'
const AI = 'O'

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

function freshState() {
  return {
    board: ['', '', '', '', '', '', '', '', ''],
    status: 'playing',
    winner: null,
    winLine: null,
    moves: 0,
    stats: { games: 0, draws: 0, playerWins: 0, aiWins: 0 },
  }
}

function loadState() {
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
    s.stats ||= { games: 0, draws: 0, playerWins: 0, aiWins: 0 }
    return s
  } catch {
    return freshState()
  }
}

function checkWin(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line }
    }
  }
  return null
}

const isFull = (board) => board.every((c) => c !== '')

function minimax(board, player, depth = 0) {
  const win = checkWin(board)
  if (win) return { score: win.winner === AI ? 10 - depth : depth - 10 }
  if (isFull(board)) return { score: 0 }

  let best = player === AI
    ? { score: -Infinity, idx: -1 }
    : { score: Infinity, idx: -1 }

  for (let i = 0; i < 9; i++) {
    if (board[i] !== '') continue
    board[i] = player
    const { score } = minimax(board, player === AI ? PLAYER : AI, depth + 1)
    board[i] = ''
    if (player === AI) {
      if (score > best.score) best = { score, idx: i }
    } else {
      if (score < best.score) best = { score, idx: i }
    }
  }
  return best
}

function applyMove(state, idx) {
  if (state.status !== 'playing') return { ok: false, reason: 'game-over' }
  if (!Number.isInteger(idx) || idx < 0 || idx > 8) return { ok: false, reason: 'invalid-idx' }
  if (state.board[idx] !== '') return { ok: false, reason: 'cell-taken' }

  state.board[idx] = PLAYER
  state.moves++
  let win = checkWin(state.board)
  if (win) return finishGame(state, win, 'playerWins')
  if (isFull(state.board)) return finishGame(state, null, 'draws')

  const aiIdx = minimax(state.board, AI).idx
  state.board[aiIdx] = AI
  state.moves++
  win = checkWin(state.board)
  if (win) return finishGame(state, win, 'aiWins')
  if (isFull(state.board)) return finishGame(state, null, 'draws')

  return { ok: true }
}

function finishGame(state, win, statKey) {
  if (win) {
    state.status = 'won'
    state.winner = win.winner
    state.winLine = win.line
  } else {
    state.status = 'draw'
  }
  state.stats.games++
  state.stats[statKey]++
  return { ok: true }
}

function resetGame(state) {
  const stats = state.stats
  Object.assign(state, freshState())
  state.stats = stats
}

function cellAsset(state, idx) {
  const v = state.board[idx]
  const isWinCell = state.winLine && state.winLine.includes(idx)
  if (v === PLAYER) return isWinCell ? 'x-win.svg' : 'x.svg'
  if (v === AI) return isWinCell ? 'o-win.svg' : 'o.svg'
  return 'empty.svg'
}

function moveUrl(idx) {
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`ttt|move|${idx}`)}`
}

function resetUrl() {
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent('ttt|reset')}`
}

function cellMarkup(state, idx) {
  const src = `assets/cells/${cellAsset(state, idx)}`
  const taken = state.board[idx] !== ''
  const playable = state.status === 'playing' && !taken
  const img = `<img src="${src}" width="80" height="80" alt="cell ${idx}"/>`
  return playable ? `<a href="${moveUrl(idx)}">${img}</a>` : img
}

function buildBoard(state) {
  const cells = Array.from({ length: 9 }, (_, i) => cellMarkup(state, i))
  return [
    '<table>',
    `  <tr><td>${cells[0]}</td><td>${cells[1]}</td><td>${cells[2]}</td></tr>`,
    `  <tr><td>${cells[3]}</td><td>${cells[4]}</td><td>${cells[5]}</td></tr>`,
    `  <tr><td>${cells[6]}</td><td>${cells[7]}</td><td>${cells[8]}</td></tr>`,
    '</table>',
  ].join('\n')
}

function statusLine(state) {
  if (state.status === 'playing') {
    return state.moves === 0 ? 'your move. you are X.' : 'your move.'
  }
  if (state.status === 'won') {
    const msg = state.winner === AI
      ? 'i win.'
      : 'you broke me. impossible. open an issue.'
    return `${msg} &nbsp; [new game →](${resetUrl()})`
  }
  return `draw. nobody loses. &nbsp; [new game →](${resetUrl()})`
}

function statsLine(state) {
  const { games, draws, aiWins, playerWins } = state.stats
  if (games === 0) return ''
  return `<sub>${games} played · ${draws} drawn · ${aiWins} lost · ${playerWins} won</sub>`
}

function renderSection(state) {
  const board = buildBoard(state)
  const status = statusLine(state)
  const stats = statsLine(state)
  const tail = stats ? `${status}\n\n${stats}` : status
  return `<!-- TTT_BOARD_START -->\n${board}\n\n${tail}\n<!-- TTT_BOARD_END -->`
}

function updateReadme(state) {
  const readme = readFileSync(README_PATH, 'utf8')
  const next = readme.replace(
    /<!-- TTT_BOARD_START -->[\s\S]*?<!-- TTT_BOARD_END -->/,
    renderSection(state),
  )
  writeFileSync(README_PATH, next)
}

function main() {
  const title = (process.env.ISSUE_TITLE || '').trim()
  const parts = title.split('|').map((p) => p.trim())
  if (parts[0] !== 'ttt') {
    console.log('not a ttt issue, skipping')
    return
  }
  const state = loadState()
  const cmd = parts[1]

  if (cmd === 'reset') {
    resetGame(state)
  } else if (cmd === 'move') {
    const idx = parseInt(parts[2], 10)
    const result = applyMove(state, idx)
    if (!result.ok) {
      console.log(`move rejected: ${result.reason}`)
      return
    }
  } else {
    console.log(`unknown command: ${cmd}`)
    return
  }

  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n')
  updateReadme(state)
}

main()
