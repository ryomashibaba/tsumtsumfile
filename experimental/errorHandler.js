// errorHandler.js - エラーハンドリングとUI通知システム

// エラー通知のタイプ
export const ERROR_TYPES = {
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
  SUCCESS: 'success'
};

// エラー通知マネージャ
export class ErrorNotifier {
  constructor(game) {
    this.game = game;
    this.notifications = [];
    this.maxNotifications = 5;
    this.notificationDuration = 3.0; // 通知表示時間（秒）
  }

  // エラー通知を追加
  notify(message, type = ERROR_TYPES.ERROR, duration = null) {
    const notification = {
      id: Date.now() + Math.random(),
      message,
      type,
      duration: duration || this.notificationDuration,
      timer: 0,
      alpha: 1,
      y: 0
    };

    this.notifications.push(notification);

    // 最大数を超えたら古いものを削除
    if (this.notifications.length > this.maxNotifications) {
      this.notifications.shift();
    }

    // コンソールにも出力（デバッグ用）
    switch (type) {
      case ERROR_TYPES.ERROR:
        console.error(`[TsumTsum] ${message}`);
        break;
      case ERROR_TYPES.WARNING:
        console.warn(`[TsumTsum] ${message}`);
        break;
      case ERROR_TYPES.INFO:
        console.log(`[TsumTsum] ${message}`);
        break;
      case ERROR_TYPES.SUCCESS:
        console.log(`[TsumTsum] ✓ ${message}`);
        break;
    }

    return notification.id;
  }

  // 更新処理
  update(dt) {
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      const notif = this.notifications[i];
      notif.timer += dt;

      // 通知時間の80%でフェードアウト開始
      const fadeStartTime = notif.duration * 0.8;
      if (notif.timer > fadeStartTime) {
        const fadeProgress = (notif.timer - fadeStartTime) / (notif.duration * 0.2);
        notif.alpha = Math.max(0, 1 - fadeProgress);
      }

      // 通知終了
      if (notif.timer >= notif.duration) {
        this.notifications.splice(i, 1);
      }
    }
  }

  // 通知を描画
  draw(ctx) {
    if (this.notifications.length === 0) return;

    const startY = 120;
    const padding = 8;
    const height = 36;
    const maxWidth = 350;

    for (let i = 0; i < this.notifications.length; i++) {
      const notif = this.notifications[i];
      const y = startY + i * (height + padding);
      const alpha = notif.alpha;

      ctx.save();
      ctx.globalAlpha = alpha;

      // 背景
      const bgColor = this.getNotificationColor(notif.type);
      ctx.fillStyle = bgColor;
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      
      const x = 20;
      const width = Math.min(maxWidth, ctx.measureText(notif.message).width + 40);
      
      this.roundRect(ctx, x, y, width, height, 8);
      ctx.fill();

      // 境界線
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // アイコン
      const icon = this.getNotificationIcon(notif.type);
      ctx.font = '16px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(icon, x + 10, y + height / 2);

      // メッセージ
      ctx.font = '13px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fillText(notif.message, x + 34, y + height / 2);

      ctx.restore();
    }
  }

  // 通知タイプに応じた色を取得
  getNotificationColor(type) {
    switch (type) {
      case ERROR_TYPES.ERROR:
        return 'rgba(220, 53, 69, 0.9)';
      case ERROR_TYPES.WARNING:
        return 'rgba(255, 193, 7, 0.9)';
      case ERROR_TYPES.INFO:
        return 'rgba(23, 162, 184, 0.9)';
      case ERROR_TYPES.SUCCESS:
        return 'rgba(40, 167, 69, 0.9)';
      default:
        return 'rgba(108, 117, 125, 0.9)';
    }
  }

  // 通知タイプに応じたアイコンを取得
  getNotificationIcon(type) {
    switch (type) {
      case ERROR_TYPES.ERROR:
        return '❌';
      case ERROR_TYPES.WARNING:
        return '⚠️';
      case ERROR_TYPES.INFO:
        return 'ℹ️';
      case ERROR_TYPES.SUCCESS:
        return '✅';
      default:
        return '•';
    }
  }

  // 丸角四角形を描画
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // クリア
  clear() {
    this.notifications = [];
  }

  // 現在の通知数を取得
  getCount() {
    return this.notifications.length;
  }
}

// エラーハンドリングユーティリティ
export class ErrorHandler {
  constructor(notifier) {
    this.notifier = notifier;
  }

  // 安全に関数を実行し、エラーを通知
  safeExecute(fn, context, errorMessage = '処理中にエラーが発生しました') {
    try {
      return fn.call(context);
    } catch (error) {
      this.notifier.notify(`${errorMessage}: ${error.message}`, ERROR_TYPES.ERROR);
      return null;
    }
  }

  // 値が有効かチェック
  validate(value, validator, errorMessage) {
    if (!validator(value)) {
      this.notifier.notify(errorMessage, ERROR_TYPES.WARNING);
      return false;
    }
    return true;
  }

  // 配列が空でないかチェック
  assertNotEmpty(array, errorMessage) {
    if (!Array.isArray(array) || array.length === 0) {
      this.notifier.notify(errorMessage, ERROR_TYPES.WARNING);
      return false;
    }
    return true;
  }

  // 数値が有効な範囲内かチェック
  assertInRange(value, min, max, errorMessage) {
    if (typeof value !== 'number' || value < min || value > max) {
      this.notifier.notify(errorMessage, ERROR_TYPES.WARNING);
      return false;
    }
    return true;
  }
}

// グローバルエラーハンドラ（シングルトン）
let globalNotifier = null;
let globalHandler = null;

export function initErrorSystem(game) {
  globalNotifier = new ErrorNotifier(game);
  globalHandler = new ErrorHandler(globalNotifier);
  return { notifier: globalNotifier, handler: globalHandler };
}

export function getNotifier() {
  if (!globalNotifier) {
    throw new Error('Error system not initialized. Call initErrorSystem first.');
  }
  return globalNotifier;
}

export function getHandler() {
  if (!globalHandler) {
    throw new Error('Error system not initialized. Call initErrorSystem first.');
  }
  return globalHandler;
}

// 簡易通知関数（後方互換性用）
export function notifyError(message) {
  if (globalNotifier) {
    globalNotifier.notify(message, ERROR_TYPES.ERROR);
  } else {
    console.error(`[TsumTsum] ${message}`);
  }
}

export function notifyWarning(message) {
  if (globalNotifier) {
    globalNotifier.notify(message, ERROR_TYPES.WARNING);
  } else {
    console.warn(`[TsumTsum] ${message}`);
  }
}

export function notifyInfo(message) {
  if (globalNotifier) {
    globalNotifier.notify(message, ERROR_TYPES.INFO);
  } else {
    console.log(`[TsumTsum] ${message}`);
  }
}

export function notifySuccess(message) {
  if (globalNotifier) {
    globalNotifier.notify(message, ERROR_TYPES.SUCCESS);
  } else {
    console.log(`[TsumTsum] ✓ ${message}`);
  }
}