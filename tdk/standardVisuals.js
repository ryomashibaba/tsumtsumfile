// Canvas-native defaults; callbacks may be replaced per Tsum. No game/config import.
export function createStandardVisuals(color, label) {
  return {
    theme: { outer: ['#183c50', '#102030'], field: ['#164050', '#102030'], accent: color, secondary: '#ffffff', tint: 0.4, outerAlpha: 0.8, motif: 'none' },
    presentation(ctx, game) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,15,30,0.65)';
      ctx.fillRect(0, 0, 414, 736);
      ctx.fillStyle = color;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, 207, 355);
      ctx.restore();
      return true;
    },
    clear(game, pos) { game.createShockwave?.(pos.x, pos.y, color, 4, 12, 0.25, 120); },
    end(game) { game.pushCenterMessage?.('TDK END', color, 0.5); }
  };
}
