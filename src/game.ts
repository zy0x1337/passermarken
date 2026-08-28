import { RISO_PALETTE, PAPER_COLOR, INK_DARK, Lane, PlatformSegment, PlayerState } from './types';
import { sounds } from './audio';

export class PassermarkenGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private isGameOver = false;
  private score = 0;
  private multiplier = 1;

  private speed = 400;
  private pulseInterval = 3.5;
  private pulseTimer = 3.5;

  private player!: PlayerState;
  private platforms: PlatformSegment[] = [];
  private laneWidth = 100;
  private lanePositions = [60, 160, 260];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = 420;
    this.canvas.height = 760;
    this.resetGame();
  }

  public resetGame(): void {
    this.score = 0;
    this.multiplier = 1;
    this.speed = 400;
    this.pulseInterval = 3.5;
    this.pulseTimer = this.pulseInterval;
    this.isGameOver = false;

    this.player = {
      lane: 1,
      laneX: this.lanePositions[1],
      y: 580,
      isJumping: false,
      jumpZ: 0,
      jumpVelocity: 0,
      colorIndex: 0,
      nextColorIndex: 1
    };

    this.platforms = [];
    this.seedInitialPlatforms();
  }

  private seedInitialPlatforms(): void {
    for (let y = 800; y > -200; y -= 130) {
      this.spawnPlatformRow(y, true);
    }
  }

  private spawnPlatformRow(yPos: number, isInitial = false): void {
    const lane = Math.floor(Math.random() * 3) as Lane;
    const color = isInitial ? RISO_PALETTE[0] : RISO_PALETTE[Math.floor(Math.random() * RISO_PALETTE.length)];
    const isMoving = !isInitial && Math.random() > 0.5;
    let targetLane = lane;

    if (isMoving) {
      const options: Lane[] = ([0, 1, 2] as Lane[]).filter(l => l !== lane);
      targetLane = options[Math.floor(Math.random() * options.length)];
    }

    this.platforms.push({
      id: Math.random().toString(36).substr(2, 9),
      lane: lane,
      targetLane: targetLane,
      currentX: this.lanePositions[lane],
      y: yPos,
      height: 110,
      color: color,
      isMoving: isMoving,
      hasShifted: false
    });
  }

  public moveLane(direction: -1 | 1): void {
    if (this.isGameOver) return;
    const newLane = (this.player.lane + direction) as Lane;
    if (newLane >= 0 && newLane <= 2) {
      this.player.lane = newLane;
      sounds.playLaneSwitch();
    }
  }

  public jump(): void {
    if (this.isGameOver) {
      this.resetGame();
      return;
    }
    if (!this.player.isJumping) {
      this.player.isJumping = true;
      this.player.jumpVelocity = 14;
      sounds.playLaneSwitch();
    }
  }

  public update(dt: number): void {
    if (this.isGameOver) return;

    this.speed += dt * 6;
    this.pulseInterval = Math.max(1.6, this.pulseInterval - dt * 0.015);
    this.score += dt * 100 * this.multiplier;

    // Pulse Timer
    this.pulseTimer -= dt;
    if (this.pulseTimer <= 0) {
      this.player.colorIndex = this.player.nextColorIndex;
      this.player.nextColorIndex = (this.player.colorIndex + 1) % RISO_PALETTE.length;
      this.pulseTimer = this.pulseInterval;
      sounds.playPulseSwitch();
    }

    // Player Interpolation
    const targetX = this.lanePositions[this.player.lane];
    this.player.laneX += (targetX - this.player.laneX) * (1 - Math.exp(-18 * dt));

    if (this.player.isJumping) {
      this.player.jumpZ += this.player.jumpVelocity;
      this.player.jumpVelocity -= 45 * dt;
      if (this.player.jumpZ <= 0) {
        this.player.jumpZ = 0;
        this.player.isJumping = false;
      }
    }

    // Platforms Update
    for (const p of this.platforms) {
      p.y += this.speed * dt;

      // Platform Lateral Shift (bei Annäherung)
      if (p.isMoving && !p.hasShifted && p.y > 250) {
        p.lane = p.targetLane;
        p.hasShifted = true;
      }

      const targetPx = this.lanePositions[p.lane];
      p.currentX += (targetPx - p.currentX) * (1 - Math.exp(-12 * dt));
    }

    if (this.platforms.length > 0 && this.platforms[this.platforms.length - 1].y > 0) {
      this.spawnPlatformRow(this.platforms[this.platforms.length - 1].y - 130);
    }

    this.platforms = this.platforms.filter(p => p.y < this.canvas.height + 150);

    this.checkCollisions();
  }

  private checkCollisions(): void {
    if (this.player.isJumping) return;

    const currentColor = RISO_PALETTE[this.player.colorIndex];
    let onValidPlatform = false;

    for (const p of this.platforms) {
      const inY = this.player.y >= p.y && this.player.y <= p.y + p.height;
      const inX = Math.abs(this.player.laneX - p.currentX) < 40;

      if (inY && inX) {
        if (p.color === currentColor) {
          onValidPlatform = true;
          this.multiplier = Math.min(8, this.multiplier + 0.002);
        } else {
          this.triggerGameOver();
          return;
        }
      }
    }

    if (!onValidPlatform) {
      this.triggerGameOver();
    }
  }

  private triggerGameOver(): void {
    this.isGameOver = true;
    sounds.playGameOver();
  }

  public render(): void {
    this.ctx.fillStyle = PAPER_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Track Grid
    this.ctx.strokeStyle = 'rgba(26, 26, 26, 0.08)';
    this.ctx.lineWidth = 2;
    for (const pos of this.lanePositions) {
      this.ctx.beginPath();
      this.ctx.moveTo(pos + 40, 0);
      this.ctx.lineTo(pos + 40, this.canvas.height);
      this.ctx.stroke();
    }

    // Platforms
    for (const p of this.platforms) {
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.currentX + 5, p.y, this.laneWidth - 10, p.height);
      this.ctx.fillStyle = INK_DARK;
      this.ctx.fillRect(p.currentX + 5, p.y + p.height - 4, this.laneWidth - 10, 4);
    }

    // Player Render
    const isWarning = this.pulseTimer < 1.0;
    const currentColor = RISO_PALETTE[this.player.colorIndex];

    this.ctx.save();
    this.ctx.translate(this.player.laneX + 40, this.player.y - this.player.jumpZ);

    // Shadows / Offset
    this.ctx.fillStyle = INK_DARK;
    this.ctx.fillRect(-17, -17, 36, 36);

    // Body
    if (isWarning && Math.floor(Date.now() / 80) % 2 === 0) {
      this.ctx.fillStyle = RISO_PALETTE[this.player.nextColorIndex];
    } else {
      this.ctx.fillStyle = currentColor;
    }
    this.ctx.fillRect(-20, -20, 36, 36);
    this.ctx.restore();

    this.renderUI();
  }

  private renderUI(): void {
    this.ctx.fillStyle = INK_DARK;
    this.ctx.font = 'bold 18px monospace';
    this.ctx.fillText(`SCORE ${Math.floor(this.score)}`, 20, 40);
    this.ctx.fillText(`${this.multiplier.toFixed(1)}x`, 20, 65);

    // Pulse Bar
    const barWidth = Math.max(0, (this.pulseTimer / this.pulseInterval) * 100);
    this.ctx.fillStyle = INK_DARK;
    this.ctx.strokeRect(295, 25, 100, 14);
    this.ctx.fillStyle = RISO_PALETTE[this.player.nextColorIndex];
    this.ctx.fillRect(295, 25, barWidth, 14);

    if (this.isGameOver) {
      this.ctx.fillStyle = 'rgba(244, 241, 234, 0.9)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.fillStyle = INK_DARK;
      this.ctx.font = 'bold 36px monospace';
      this.ctx.fillText('FEHLDRUCK', 110, 340);

      this.ctx.fillStyle = RISO_PALETTE[0];
      this.ctx.font = 'bold 20px monospace';
      this.ctx.fillText(`SCORE: ${Math.floor(this.score)}`, 140, 380);

      this.ctx.fillStyle = INK_DARK;
      this.ctx.font = '14px monospace';
      this.ctx.fillText('TAP ODER LEERTASTE ZUM STARTEN', 80, 440);
    }
  }
  }
  
