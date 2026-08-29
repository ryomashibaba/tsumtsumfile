// quadtree.js - 空間分割による衝突判定の最適化

export const QUADTREE_CAPACITY = 8; // 各ノードの最大容量

export class QuadTree {
  constructor(x, y, width, height, depth = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.maxDepth = 6; // 最大の深さ
    this.objects = [];
    this.divided = false;
    this.northeast = null;
    this.northwest = null;
    this.southeast = null;
    this.southwest = null;
  }

  // 点がこのクワッドツリーの範囲内か
  contains(x, y) {
    return (
      x >= this.x - this.width / 2 &&
      x <= this.x + this.width / 2 &&
      y >= this.y - this.height / 2 &&
      y <= this.y + this.height / 2
    );
  }

  // 円がこのクワッドツリーと交差するか
  intersects(circle) {
    const dx = Math.max(
      this.x - this.width / 2 - circle.x,
      0,
      circle.x - (this.x + this.width / 2)
    );
    const dy = Math.max(
      this.y - this.height / 2 - circle.y,
      0,
      circle.y - (this.y + this.height / 2)
    );
    return dx * dx + dy * dy <= circle.radius * circle.radius;
  }

  // 子ノードに分割
  subdivide() {
    const halfW = this.width / 4;
    const halfH = this.height / 4;

    this.northeast = new QuadTree(
      this.x + halfW,
      this.y - halfH,
      this.width / 2,
      this.height / 2,
      this.depth + 1
    );
    this.northwest = new QuadTree(
      this.x - halfW,
      this.y - halfH,
      this.width / 2,
      this.height / 2,
      this.depth + 1
    );
    this.southeast = new QuadTree(
      this.x + halfW,
      this.y + halfH,
      this.width / 2,
      this.height / 2,
      this.depth + 1
    );
    this.southwest = new QuadTree(
      this.x - halfW,
      this.y + halfH,
      this.width / 2,
      this.height / 2,
      this.depth + 1
    );

    this.divided = true;
  }

  // オブジェクトを挿入
  insert(obj) {
    if (!this.contains(obj.x, obj.y)) {
      return false;
    }

    if (this.objects.length < QUADTREE_CAPACITY && !this.divided) {
      this.objects.push(obj);
      return true;
    }

    if (!this.divided) {
      this.subdivide();
      // 既存のオブジェクトを子ノードに移動
      for (const existing of this.objects) {
        this.insertIntoChildren(existing);
      }
      this.objects = [];
    }

    return this.insertIntoChildren(obj);
  }

  insertIntoChildren(obj) {
    if (
      this.northeast.insert(obj) ||
      this.northwest.insert(obj) ||
      this.southeast.insert(obj) ||
      this.southwest.insert(obj)
    ) {
      return true;
    }
    // どの子ノードにも入らない場合（境界上など）
    this.objects.push(obj);
    return true;
  }

  // 指定された円と交差するオブジェクトをすべて取得
  query(circle, found = []) {
    if (!this.intersects(circle)) {
      return found;
    }

    for (const obj of this.objects) {
      const dx = obj.x - circle.x;
      const dy = obj.y - circle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= circle.radius + (obj.radius || 0)) {
        found.push(obj);
      }
    }

    if (this.divided) {
      this.northeast.query(circle, found);
      this.northwest.query(circle, found);
      this.southeast.query(circle, found);
      this.southwest.query(circle, found);
    }

    return found;
  }

  // 指定された範囲内のオブジェクトをすべて取得
  queryRange(boundary, found = []) {
    if (
      !this.contains(
        boundary.x,
        boundary.y
      ) &&
      !this.intersects({
        x: boundary.x,
        y: boundary.y,
        radius: Math.max(boundary.width || 0, boundary.height || 0)
      })
    ) {
      return found;
    }

    for (const obj of this.objects) {
      if (
        obj.x >= boundary.x - (boundary.width || 0) / 2 &&
        obj.x <= boundary.x + (boundary.width || 0) / 2 &&
        obj.y >= boundary.y - (boundary.height || 0) / 2 &&
        obj.y <= boundary.y + (boundary.height || 0) / 2
      ) {
        found.push(obj);
      }
    }

    if (this.divided) {
      this.northeast.queryRange(boundary, found);
      this.northwest.queryRange(boundary, found);
      this.southeast.queryRange(boundary, found);
      this.southwest.queryRange(boundary, found);
    }

    return found;
  }

  // クワッドツリーをクリア
  clear() {
    this.objects = [];
    if (this.divided) {
      this.northeast.clear();
      this.northwest.clear();
      this.southeast.clear();
      this.southwest.clear();
      this.divided = false;
      this.northeast = null;
      this.northwest = null;
      this.southeast = null;
      this.southwest = null;
    }
  }

  // デバッグ用：可視化
  draw(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      this.x - this.width / 2,
      this.y - this.height / 2,
      this.width,
      this.height
    );

    if (this.divided) {
      this.northeast.draw(ctx);
      this.northwest.draw(ctx);
      this.southeast.draw(ctx);
      this.southwest.draw(ctx);
    }
  }
}

// 衝突ペアを効率的に取得するためのヘルパークラス
export class CollisionDetector {
  constructor() {
    this.qt = null;
    this.bounds = null;
  }

  // クワッドツリーを初期化
  init(bounds) {
    this.bounds = bounds;
    this.qt = new QuadTree(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );
  }

  // 全オブジェクトをクワッドツリーに追加
  buildTree(objects) {
    if (!this.qt) return;
    this.qt.clear();
    for (const obj of objects) {
      this.qt.insert(obj);
    }
  }

  // 衝突しているペアをすべて取得
  getCollisionPairs(objects) {
    if (!this.qt) return [];

    this.buildTree(objects);
    const pairs = [];
    const checked = new Set();

    for (const obj of objects) {
      const searchRadius = (obj.radius || 28) * 2; // 最大直径
      const nearby = this.qt.query({
        x: obj.x,
        y: obj.y,
        radius: searchRadius
      });

      for (const other of nearby) {
        if (other === obj) continue;

        // 重複チェック
        const pairKey = obj.id < other.id
          ? `${obj.id}_${other.id}`
          : `${other.id}_${obj.id}`;
        if (checked.has(pairKey)) continue;
        checked.add(pairKey);

        // 実際の衝突判定
        const dx = other.x - obj.x;
        const dy = other.y - obj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (obj.radius || 28) + (other.radius || 28);

        if (dist < minDist) {
          pairs.push({ a: obj, b: other, dist, dx, dy });
        }
      }
    }

    return pairs;
  }
}