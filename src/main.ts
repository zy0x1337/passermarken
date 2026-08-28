import { PassermarkenGame } from './game';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const game = new PassermarkenGame(canvas);

let lastTime = 0;

function gameLoop(timestamp: number) {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  game.update(dt);
  game.render();

  requestAnimationFrame(gameLoop);
}

// Key Controls
window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') game.moveLane(-1);
  if (e.code === 'ArrowRight' || e.code === 'KeyD') game.moveLane(1);
  if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') game.jump();
});

// Touch / Swipe Controls
let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', (e) => {
  const diffX = e.changedTouches[0].clientX - touchStartX;
  const diffY = e.changedTouches[0].clientY - touchStartY;

  if (Math.abs(diffX) > Math.abs(diffY)) {
    if (Math.abs(diffX) > 30) {
      game.moveLane(diffX > 0 ? 1 : -1);
    }
  } else {
    if (diffY < -30) {
      game.jump();
    } else if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10) {
      game.jump(); // Tap als Restart/Jump Event
    }
  }
}, { passive: true });

requestAnimationFrame(gameLoop);
