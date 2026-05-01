
const SIZE = 6;

let enemyBoard;
let playerBoard;
let ships;
let playerShips;
let turn;
let gameOver;
let botTargets = [];
let botLastHits = new Set();
let botShots = new Set();
let lastBotShot = null;
let lastHitCells = new Set();

//--------------------------------------------\
function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill("water"));
}

//--------------------------------------------\
function randomInt(max) {
  return Math.floor(Math.random() * max);
}

//--------------------------------------------\
const SHIP_SIZES = [3, 2, 2, 1, 1, 1];
const MAX_ATTEMPTS = 200;
const MAX_RESTARTS = 100;

function placeShips(board) {
  for (let restart = 0; restart < MAX_RESTARTS; restart++) {
    let ships = [];
    let ok = true;

    for (let size of SHIP_SIZES) {
      let placed = false;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (tryPlaceShip(board, ships, size)) {
          placed = true;
          break;
        }
      }

      if (!placed) {
        ok = false;
        break;
      }
    }

    if (ok) return ships;

    // ❗ очищаем доску и пробуем заново
    board.forEach(row => row.fill("water"));
  }

  // 💥 fallback как в Python
  const fallback = [
    [[2,3],[2,4],[2,2]],
    [[4,4],[4,5]],
    [[4,0],[4,1]],
    [[0,3]],
    [[1,0]],
    [[0,5]]
  ];

  fallback.forEach(ship => {
    ship.forEach(([x,y]) => board[x][y] = "ship");
  });

  return fallback;
}

//--------------------------------------------\
function startGame() {
  botTargets = [];
  botLastHits.clear();
  botShots = new Set();
  lastBotShot = null;
  lastHitCells.clear();

  const status = document.getElementById("status");
  status.style.backgroundColor = "";

  enemyBoard = createEmptyBoard();
  playerBoard = createEmptyBoard();

  ships = placeShips(enemyBoard);
  playerShips = placeShips(playerBoard);

  turn = "player";
  gameOver = false;

  render();
}

//--------------------------------------------\
function shootEnemy(x, y) {
  if (gameOver || turn !== "player") return;

  let cell = enemyBoard[x][y];

  if (cell === "hit" || cell === "miss" || cell === "near" || cell === "sunk") {
    return;
  }

  // 🎯 ПОПАДАНИЕ
  if (cell === "ship") {
    console.log(window.Telegram);
    vibrate("medium");
    console.log(window.Telegram);
    enemyBoard[x][y] = "hit";
    lastHitCells.add(`enemy-${x}-${y}`);

    let ship = findShipAt(ships, x, y);

    if (isShipSunk(ship, enemyBoard)) {
      vibrate("heavy");

      // 💀 делаем клетки корабля "sunk"
      ship.forEach(([sx, sy]) => {
        enemyBoard[sx][sy] = "sunk";
        lastHitCells.add(`enemy-${sx}-${sy}`);
      });

      markAroundEnemySunkShip(ship);

      if (!hasShipsLeft(enemyBoard)) {
        gameOver = true;

        const status = document.getElementById("status");
        status.innerText = "🎉 ПОБЕДА!";
        status.className = "win";
        status.style.backgroundColor = "green";

        render();
        return;
      }

      // 🔥 убит → ход остаётся у игрока
      render();
      return;
    }

    // 🎯 ранен → ход остаётся
    render();
    return;
  }

  // ❌ ПРОМАХ
  enemyBoard[x][y] = "miss";
  turn = "bot";

  render();
  setTimeout(botMove, 400);
}

//--------------------------------------------\
function botMove() {
  if (gameOver || turn !== "bot") return;

  let result = botSingleShot();

  render();

  // ⬇️ пауза зависит от результата
  let delay = (result === "hit") ? 1000 : 400;

  if (result === "miss") {
    turn = "player";
    render(); // 👈 ВАЖНО: обновить текст "Твой ход"
    return;
  }

  if (result === "game_over") {
    render(); // 👈 на всякий случай
    return;
  }

  // 🔁 продолжаем серию
  setTimeout(botMove, delay);
}

//--------------------------------------------\
function botSingleShot() {

  let x, y;

  // 🔴 режим добивания
if (botTargets.length > 0) {

  while (botTargets.length > 0) {
    [x, y] = botTargets.shift();
    if (!botShots.has(`${x},${y}`)) break;
  }

  // если всё выстреляно — fallback в поиск
  if (botShots.has(`${x},${y}`)) {
    x = undefined;
    y = undefined;
  }
}

// 🟢 режим поиска
if (x === undefined) {
  let attempts = 0;

  while (true) {
    attempts++;
    if (attempts > SIZE * SIZE * SIZE) {
      turn = "player";
      return "miss";
    }

    x = randomInt(SIZE);
    y = randomInt(SIZE);

    if (!botShots.has(`${x},${y}`)) break;
  }
}

  botShots.add(`${x},${y}`);
  lastBotShot = [x, y];

  // 🎯 попадание
  if (playerBoard[x][y] === "ship") {
    vibrate("medium");

    playerBoard[x][y] = "hit";
    lastHitCells.add(`player-${x}-${y}`);
    botLastHits.add(`${x},${y}`);

    // добавляем соседей
    for (let [nx, ny] of botNeighbors(x, y)) {
      if (!botTargets.some(t => t[0] === nx && t[1] === ny)) {
        botTargets.push([nx, ny]);
      }
    }

    // 🔧 умное добивание (ориентация)
    if (botLastHits.size >= 2) {
      let hits = Array.from(botLastHits).map(s => s.split(",").map(Number));

      let [x1, y1] = hits[0];
      let [x2, y2] = hits[1];

      if (x1 === x2) {
        botTargets = botTargets.filter(([tx, ty]) => tx === x1);
      } else if (y1 === y2) {
        botTargets = botTargets.filter(([tx, ty]) => ty === y1);
      }
    }

    // 💀 проверка: убит ли корабль
    let ship = findShipAt(playerShips, x, y);

    if (isShipSunk(ship, playerBoard)) {

      markAroundPlayerSunkShip(ship);

      botTargets = [];
      botLastHits.clear();

      if (!hasShipsLeft(playerBoard)) {
        gameOver = true;

        const status = document.getElementById("status");
        status.innerText = "💀 ПОРАЖЕНИЕ!";
        status.className = "lose";
        status.style.backgroundColor = "red";

        return "game_over";
      }

      return "hit";
    }

    return "hit";
  }

  // ❌ промах
  playerBoard[x][y] = "miss";
  return "miss";
}

//--------------------------------------------\
// Вспомогательные функции: соседи / поиск корабля / проверка "потоплен" / есть ли корабли
//--------------------------------------------\
function botNeighbors(x, y) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

  return dirs
    .map(([dx,dy]) => [x+dx, y+dy])
    .filter(([nx,ny]) =>
      nx >= 0 && ny >= 0 &&
      nx < SIZE && ny < SIZE &&
      !botShots.has(`${nx},${ny}`)
    );
}

function findShipAt(ships, x, y) {
  return ships.find(ship =>
    ship.some(([sx, sy]) => sx === x && sy === y)
  );
}

function isShipSunk(ship, board) {
  return ship.every(([x, y]) => board[x][y] === "hit");
}

function hasShipsLeft(board) {
  return board.flat().includes("ship");
}

//--------------------------------------------\
// Подсветка вокруг убитого корабля игрока (после хода бота)
function markAroundPlayerSunkShip(ship) {

  for (let [x, y] of ship) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {

        let nx = x + dx;
        let ny = y + dy;

        if (
          nx >= 0 && ny >= 0 &&
          nx < SIZE && ny < SIZE &&
          !botShots.has(`${nx},${ny}`)
        ) {
          botShots.add(`${nx},${ny}`);

          if (playerBoard[nx][ny] === "water") {
            playerBoard[nx][ny] = "near"; // 👈 новое состояние
          }
        }
      }
    }
  }
}

//--------------------------------------------\
// Подсветка вокруг убитого корабля противника (после хода игрока)
function markAroundEnemySunkShip(ship) {

  for (let [x, y] of ship) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {

        let nx = x + dx;
        let ny = y + dy;

        if (
          nx >= 0 && ny >= 0 &&
          nx < SIZE && ny < SIZE
        ) {
          if (enemyBoard[nx][ny] === "water") {
            enemyBoard[nx][ny] = "near";
          }
        }
      }
    }
  }
}

//--------------------------------------------\
function checkWin() {
  let enemyLeft = enemyBoard.flat().includes("ship");
  let playerLeft = playerBoard.flat().includes("ship");

  if (!enemyLeft) {
    document.getElementById("status").innerText = "🎉 Победа!!!!!";
    gameOver = true;
  }

  if (!playerLeft) {
    document.getElementById("status").innerText = "💀 Поражение!!!";
    gameOver = true;
  }
}

//--------------------------------------------\
function render() {
  const enemyDiv = document.getElementById("enemyBoard");
  const playerDiv = document.getElementById("playerBoard");

  const status = document.getElementById("status");
  status.className = "";

  enemyDiv.innerHTML = "";
  playerDiv.innerHTML = "";

  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {

      // враг
      let cell = document.createElement("div");
      cell.className = "cell";

      let val = enemyBoard[x][y];
      if (val === "hit") cell.classList.add("hit");
      if (val === "miss") cell.classList.add("miss");
      if (val === "near") cell.classList.add("near");
      if (val === "sunk") cell.classList.add("sunk");
//      if (val === "hit" || val === "sunk") {
//            cell.classList.add("flash");
//      }
      if (lastHitCells.has(`enemy-${x}-${y}`)) {
        cell.classList.add("flash");
      }

      cell.onclick = () => shootEnemy(x, y);
      enemyDiv.appendChild(cell);

      // игрок
      let pcell = document.createElement("div");
      pcell.className = "cell";

      if (lastBotShot && lastBotShot[0] === x && lastBotShot[1] === y) {
        pcell.classList.add("last");
      }

      let pval = playerBoard[x][y];

      if (pval === "ship") pcell.classList.add("ship");
      if (pval === "hit") pcell.classList.add("hit");
      if (pval === "miss") pcell.classList.add("miss");
      if (pval === "near") pcell.classList.add("near");
//      if (pval === "hit") {
//        pcell.classList.add("flash");
//      }
      if (lastHitCells.has(`player-${x}-${y}`)) {
        pcell.classList.add("flash");
      }

      playerDiv.appendChild(pcell);
    }
  }

  if (!gameOver) {
    document.getElementById("status").innerText = ""
//      turn === "player" ? "🧭 Твой ход" : "🤖 Ход бота";
  }

  const enemyContainer = document.querySelector("#enemyBoard").parentElement;

  if (turn === "bot" && !gameOver) {
    enemyContainer.classList.add("locked");
  } else {
    enemyContainer.classList.remove("locked");
  }

  lastHitCells.clear();
}

//--------------------------------------------\
// вспомогательная функция для function placeShips(board)
function tryPlaceShip(board, ships, size) {
  let horizontal = Math.random() > 0.5;

  let x = randomInt(SIZE);
  let y = randomInt(SIZE);

  let cells = [];

  for (let i = 0; i < size; i++) {
    let nx = x + (horizontal ? 0 : i);
    let ny = y + (horizontal ? i : 0);
    cells.push([nx, ny]);
  }

  if (!canPlace(board, ships, cells)) return false;

  cells.forEach(([x, y]) => board[x][y] = "ship");
  ships.push(cells);

  return true;
}

//--------------------------------------------\
// вспомогательная функция для function placeShips(board)
function canPlace(board, ships, cells) {

  // собираем занятые + окружение
  let occupied = new Set();

  for (let ship of ships) {
    for (let [x, y] of ship) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          occupied.add(`${x+dx},${y+dy}`);
        }
      }
    }
  }

  for (let [x, y] of cells) {
    if (
      x < 0 || y < 0 ||
      x >= SIZE || y >= SIZE ||
      occupied.has(`${x},${y}`)
    ) {
      return false;
    }
  }

  return true;
}

//--------------------------------------------\
function vibrate(type = "light") {

  // ✅ Telegram Haptic
  if (window.Telegram?.WebApp?.HapticFeedback) {
    Telegram.WebApp.HapticFeedback.impactOccurred(type);
    return;
  }

  // ✅ fallback (обычная вибрация браузера)
  if (navigator.vibrate) {
    if (type === "light") navigator.vibrate(20);
    else if (type === "medium") navigator.vibrate(40);
    else if (type === "heavy") navigator.vibrate(80);
  }
}
//--------------------------------------------\
//function vibrate(type = "light") {
//  if (window.Telegram?.WebApp?.HapticFeedback) {
//    Telegram.WebApp.HapticFeedback.impactOccurred(type);
//  }
//}

//--------------------------------------------\

startGame();