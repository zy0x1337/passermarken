export const RISO_PALETTE = ['#FF0055', '#00E5FF', '#FFE600'] as const; // Pink, Cyan, Gelb
export const PAPER_COLOR = '#F4F1EA';
export const INK_DARK = '#1A1A1A';

export type RisoColor = typeof RISO_PALETTE[number];
export type Lane = 0 | 1 | 2;

export interface PlatformSegment {
  id: string;
  lane: Lane;
  targetLane: Lane;
  currentX: number;
  y: number;
  height: number;
  color: RisoColor;
  isMoving: boolean;
  hasShifted: boolean;
}

export interface PlayerState {
  lane: Lane;
  laneX: number;
  y: number;
  isJumping: boolean;
  jumpZ: number;
  jumpVelocity: number;
  colorIndex: number;
  nextColorIndex: number;
}
