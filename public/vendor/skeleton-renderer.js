/**
 * skeleton-renderer.js
 * ------------------------------------------------------------------
 * 需求方：评估页（视频上叠加 33 点骨架）
 * 死线：8/11
 *
 * 接口规格：
 *   `drawSkeleton(canvas, landmarks, videoFrame?)`
 *   - 入参接收 canvas 绘图上下文、人体关键点
 *   - videoFrame 为可选参数
 *   - 函数功能为绘制人体骨架
 * ------------------------------------------------------------------
 *
 * 说明：
 * - 坐标约定：landmarks 的 x/y 为 0~1 归一化坐标；
 *   绘制时按 canvas 实际尺寸换算成像素。
 * - 传入 videoFrame 时，先把视频帧铺满 canvas 再叠加骨架，
 *   否则只画骨架（透明背景）。
 * - canvas 既可以直接传 <canvas> 元素，也可以传其 2D context。
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.drawSkeleton = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** MediaPipe Pose 33 点骨骼连线（[起点下标, 终点下标]） */
  const SKELETON_CONNECTIONS = Object.freeze([
    // 面部
    [0, 1], [1, 2], [2, 3], [3, 7],
    [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10], [0, 9], [0, 10],
    // 躯干
    [11, 12], [11, 23], [12, 24], [23, 24],
    // 左臂
    [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
    // 右臂
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
    // 左腿
    [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
    // 右腿
    [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
  ]);

  /** 关键点可视度阈值：低于该值不画点 */
  const DEFAULT_VISIBILITY_THRESHOLD = 0.3;

  /**
   * @typedef {Object} Landmark
   * @property {number} x 归一化横坐标（0~1）
   * @property {number} y 归一化纵坐标（0~1）
   * @property {number} [z] 深度（绘制时不用，保留字段）
   * @property {number} [visibility] 可见度（0~1）
   */

  /**
   * @typedef {Object} DrawSkeletonOptions
   * @property {string} [boneColor="#00ff88"] 骨骼连线颜色
   * @property {string} [landmarkColor="#00d4ff"] 关键点颜色
   * @property {number} [boneWidth=2] 连线宽度（像素）
   * @property {number} [landmarkRadius=3] 关键点半径（像素）
   * @property {number} [visibilityThreshold=0.3] 可见度阈值
   * @property {boolean} [clear=true] 绘制前是否清空画布
   * @property {boolean} [showFace=true] 是否绘制面部连线
   * @property {"auto"|"normalized"|"pixel"|"world"} [coordinateMode="auto"]
   *   关键点坐标模式：
   *   - normalized：x/y 为 0~1 归一化（MediaPipe landmarks 的默认输出）
   *   - pixel：x/y 已是画布像素坐标
   *   - world：米制世界坐标（MediaPipe worldLandmarks），按人体外框
   *     min-max 归一化到画布（兜底，无法保证绝对贴合）
   *   - auto：自动检测（默认）
   */

  /**
   * 把关键点坐标换算到画布像素坐标（支持多种坐标模式）。
   *
   * @param {Landmark[]} points 33 点关键点
   * @param {number} width 画布宽（像素）
   * @param {number} height 画布高（像素）
   * @param {"auto"|"normalized"|"pixel"|"world"} [mode="auto"] 坐标模式
   * @returns {Array<{x: number, y: number}>} 像素坐标数组
   */
  function mapToCanvas(points, width, height, mode) {
    const m = mode || "auto";
    const xs = points.map((p) => Number(p.x)).filter(Number.isFinite);
    const ys = points.map((p) => Number(p.y)).filter(Number.isFinite);
    if (!xs.length || !ys.length || !width || !height) {
      return points.map(() => ({ x: 0, y: 0 }));
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // auto：按值域推断坐标模式
    let effective = m;
    if (effective === "auto") {
      const maxAbs = Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY));
      if (maxAbs <= 1.5) {
        // 0~1 或 -1~1 归一化
        effective = (minX < 0 || minY < 0) ? "normalized-signed" : "normalized";
      } else if (maxAbs <= 2 * Math.max(width, height)) {
        effective = "pixel"; // 已是像素坐标
      } else {
        effective = "world"; // 大数值（米制世界坐标等），按外框归一化
      }
    }

    return points.map((p) => {
      const x = Number(p.x);
      const y = Number(p.y);
      let px = 0;
      let py = 0;
      if (effective === "normalized") {
        px = x * width;
        py = y * height;
      } else if (effective === "normalized-signed") {
        px = ((x + 1) / 2) * width;
        py = ((y + 1) / 2) * height;
      } else if (effective === "pixel") {
        px = x;
        py = y;
      } else {
        // world：对 x/y 分别做 min-max 归一化
        px = maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * width;
        py = maxY === minY ? 0 : ((y - minY) / (maxY - minY)) * height;
      }
      return { x: px, y: py };
    });
  }

  /**
   * 把 canvas 入参归一化为 2D context。
   * @param {HTMLCanvasElement|CanvasRenderingContext2D} canvas
   * @returns {CanvasRenderingContext2D}
   */
  function getContext(canvas) {
    if (!canvas) {
      throw new Error("drawSkeleton: 缺少 canvas 参数（<canvas> 元素或 2D context）");
    }
    if (typeof canvas.getContext === "function") {
      return canvas.getContext("2d");
    }
    if (canvas && typeof canvas.canvas === "object" && canvas.canvas) {
      return canvas; // 已经是 context
    }
    throw new Error("drawSkeleton: 无法识别的 canvas 参数");
  }

  /**
   * 绘制人体骨架（主入口）。
   *
   * @param {HTMLCanvasElement|CanvasRenderingContext2D} canvas
   *   <canvas> 元素或它的 2D context。
   * @param {Landmark[]} landmarks 33 个人体关键点（归一化坐标）
   * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} [videoFrame]
   *   可选：作为背景绘制的视频/图片帧。
   * @param {DrawSkeletonOptions} [options] 样式选项
   * @returns {CanvasRenderingContext2D} 返回 2D context，便于链式调用
   *
   * @example
   * drawSkeleton(canvasEl, landmarks, videoEl, { boneColor: "#ffcc00" });
   * // 或只画骨架：
   * drawSkeleton(ctx, landmarks);
   */
  function drawSkeleton(canvas, landmarks, videoFrame, options) {
    const ctx = getContext(canvas);
    const opts = options || {};
    const boneColor = opts.boneColor || "#00ff88";
    const landmarkColor = opts.landmarkColor || "#00d4ff";
    const boneWidth = opts.boneWidth !== undefined ? opts.boneWidth : 2;
    const landmarkRadius = opts.landmarkRadius !== undefined ? opts.landmarkRadius : 3;
    const visThreshold = opts.visibilityThreshold !== undefined
      ? opts.visibilityThreshold
      : DEFAULT_VISIBILITY_THRESHOLD;
    const clear = opts.clear !== undefined ? opts.clear : true;
    const showFace = opts.showFace !== undefined ? opts.showFace : true;

    const points = Array.isArray(landmarks) ? landmarks : [];

    // 确定绘制尺寸
    let width = ctx.canvas ? ctx.canvas.width : 0;
    let height = ctx.canvas ? ctx.canvas.height : 0;

    if (clear) {
      ctx.clearRect(0, 0, width, height);
    }

    // 背景帧：有 videoFrame 时按帧尺寸铺满
    if (videoFrame) {
      const frameW = videoFrame.videoWidth || videoFrame.width || width;
      const frameH = videoFrame.videoHeight || videoFrame.height || height;
      if (frameW && frameH) {
        if (ctx.canvas && (ctx.canvas.width !== frameW || ctx.canvas.height !== frameH)) {
          ctx.canvas.width = frameW;
          ctx.canvas.height = frameH;
          width = frameW;
          height = frameH;
        }
        ctx.drawImage(videoFrame, 0, 0, width, height);
      }
    }

    if (!points.length || !width || !height) {
      return ctx;
    }

    // 坐标换算（支持归一化/像素/世界坐标自动检测）+ 可见度过滤
    const mapped = mapToCanvas(points, width, height, opts.coordinateMode);
    const px = points.map((p, i) => ({
      x: mapped[i].x,
      y: mapped[i].y,
      visible: p.visibility === undefined || p.visibility >= visThreshold,
    }));

    // 连线
    ctx.strokeStyle = boneColor;
    ctx.lineWidth = boneWidth;
    ctx.lineCap = "round";
    for (const [a, b] of SKELETON_CONNECTIONS) {
      if (!showFace && a <= 10 && b <= 10) continue;
      const pa = px[a];
      const pb = px[b];
      if (!pa || !pb || !pa.visible || !pb.visible) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    // 关键点
    ctx.fillStyle = landmarkColor;
    for (const p of px) {
      if (!p.visible) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, landmarkRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    return ctx;
  }

  drawSkeleton.SKELETON_CONNECTIONS = SKELETON_CONNECTIONS;
  drawSkeleton.DEFAULT_VISIBILITY_THRESHOLD = DEFAULT_VISIBILITY_THRESHOLD;
  drawSkeleton.mapToCanvas = mapToCanvas;

  return drawSkeleton;
});
