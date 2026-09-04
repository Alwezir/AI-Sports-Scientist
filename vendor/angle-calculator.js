/**
 * angle-calculator.js
 * ------------------------------------------------------------------
 * 需求方：评估页（计算关节角度）
 * 死线：W1 末
 *
 * 接口规格：
 *   `calculateAngles(landmarks)` 返回包含 leftKnee、rightKnee 等
 *   关节角度的对象。
 * ------------------------------------------------------------------
 *
 * 说明：
 * - 采用 MediaPipe Pose 33 点约定（下标 0~32），名称见 LANDMARK_NAMES。
 * - 角度定义：中间点为关节顶点，三点夹角（0°~180°）。
 * - 返回对象除 leftKnee/rightKnee 外，还包含肩、肘、髋、踝、腕等
 *   关节角度，字段命名统一为 `leftXxx` / `rightXxx`。
 * - 单个关键点缺失（visibility 过低）时，该角度为 null。
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AngleCalculator = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** MediaPipe Pose 33 点标准下标与名称 */
  const LANDMARK_NAMES = Object.freeze([
    "nose",               // 0
    "leftEyeInner",       // 1
    "leftEye",            // 2
    "leftEyeOuter",       // 3
    "rightEyeInner",      // 4
    "rightEye",           // 5
    "rightEyeOuter",      // 6
    "leftEar",            // 7
    "rightEar",           // 8
    "mouthLeft",          // 9
    "mouthRight",         // 10
    "leftShoulder",       // 11
    "rightShoulder",      // 12
    "leftElbow",          // 13
    "rightElbow",         // 14
    "leftWrist",          // 15
    "rightWrist",         // 16
    "leftPinky",          // 17
    "rightPinky",         // 18
    "leftIndex",          // 19
    "rightIndex",         // 20
    "leftThumb",          // 21
    "rightThumb",         // 22
    "leftHip",            // 23
    "rightHip",           // 24
    "leftKnee",           // 25
    "rightKnee",          // 26
    "leftAnkle",          // 27
    "rightAnkle",         // 28
    "leftHeel",           // 29
    "rightHeel",          // 30
    "leftFootIndex",      // 31
    "rightFootIndex",     // 32
  ]);

  /** 需要计算的角度表：[角度名, 顶点下标, 端点A下标, 端点B下标] */
  const ANGLE_DEFINITIONS = [
    ["leftShoulder", 11, 13, 23],
    ["rightShoulder", 12, 24, 14],
    ["leftElbow", 13, 11, 15],
    ["rightElbow", 14, 12, 16],
    ["leftHip", 23, 11, 25],
    ["rightHip", 24, 12, 26],
    ["leftKnee", 25, 23, 27],
    ["rightKnee", 26, 24, 28],
    ["leftAnkle", 27, 25, 29],
    ["rightAnkle", 28, 26, 30],
    ["leftWrist", 15, 13, 17],
    ["rightWrist", 16, 14, 18],
  ];

  /**
   * @typedef {Object} Landmark
   * @property {number} x 归一化横坐标
   * @property {number} y 归一化纵坐标
   * @property {number} [z] 深度（可选）
   * @property {number} [visibility] 可见度（可选）
   */

  /**
   * @typedef {Object} JointAngles
   * @property {number|null} leftShoulder 左肩角（肩-肘-髋）
   * @property {number|null} rightShoulder 右肩角
   * @property {number|null} leftElbow 左肘角（肩-肘-腕）
   * @property {number|null} rightElbow 右肘角
   * @property {number|null} leftHip 左髋角（肩--膝）
   * @property {number|null} rightHip 右髋角
   * @property {number|null} leftKnee 左膝角（髋-膝-踝）
   * @property {number|null} rightKnee 右膝角
   * @property {number|null} leftAnkle 左踝角（膝-踝-足跟）
   * @property {number|null} rightAnkle 右踝角
   * @property {number|null} leftWrist 左腕角（肘-腕-小指）
   * @property {number|null} rightWrist 右腕角
   * @property {number|null} leftKneeX 左膝归一化 x 坐标（用于膝内扣检测）
   * @property {number|null} rightKneeX 右膝归一化 x 坐标
   * @property {number|null} leftAnkleX 左踝归一化 x 坐标（用于膝内扣检测）
   * @property {number|null} rightAnkleX 右踝归一化 x 坐标
   */

  /**
   * 计算三维空间中三点的夹角（顶点 angleVertex）。
   * @param {Landmark} a
   * @param {Landmark} b
   * @param {Landmark} c
   * @returns {number|null} 角度（度），数据非法时返回 null
   */
  function angleBetween(a, b, c) {
    if (!a || !b || !c) return null;
    const ax = a.x - b.x;
    const ay = a.y - b.y;
    const az = (a.z || 0) - (b.z || 0);
    const cx = c.x - b.x;
    const cy = c.y - b.y;
    const cz = (c.z || 0) - (b.z || 0);

    const dot = ax * cx + ay * cy + az * cz;
    const magA = Math.sqrt(ax * ax + ay * ay + az * az);
    const magC = Math.sqrt(cx * cx + cy * cy + cz * cz);

    if (magA === 0 || magC === 0) return null;
    let cos = dot / (magA * magC);
    cos = Math.max(-1, Math.min(1, cos)); // 防止浮点误差越界
    return (Math.acos(cos) * 180) / Math.PI;
  }

  /**
   * 把传入的 landmarks 统一为「下标 → Landmark」的查找表。
   * 支持三种输入：
   *   1) 数组（MediaPipe 33 点顺序）
   *   2) 对象（{ leftKnee: {x,y,z,visibility}, ... }）
   *   3) 对象 + options.indices 自定义下标
   *
   * @param {Landmark[]|Object} landmarks
   * @param {{indices?: Object<string, number>}} [options]
   * @returns {{get: function(number): (Landmark|undefined)}}
   */
  function normalizeLandmarks(landmarks, options) {
    const indices = (options && options.indices) || null;

    if (Array.isArray(landmarks)) {
      return {
        get: (i) => landmarks[i],
      };
    }

    if (landmarks && typeof landmarks === "object") {
      const byName = landmarks;
      return {
        get: (i) => {
          if (indices) {
            // 用户自定义下标 → 名称
            for (const name of Object.keys(indices)) {
              if (indices[name] === i) return byName[name];
            }
            return undefined;
          }
          // 默认约定：下标 i 对应 LANDMARK_NAMES[i]
          const name = LANDMARK_NAMES[i];
          return name ? byName[name] : undefined;
        },
      };
    }

    return { get: () => undefined };
  }

  /**
   * 计算关节角度（主入口）。
   *
   * @param {Landmark[]|Object<string, Landmark>} landmarks
   *   33 点关键点数组，或按名称索引的对象（leftKnee、rightKnee...）。
   * @param {Object} [options]
   * @param {Object<string, number>} [options.indices]
   *   自定义“名称 → 下标”映射，用于非 MediaPipe 模型。
   * @param {number} [options.minVisibility=0.3]
   *   低于该可见度的关键点视为缺失（不参与计算，结果为 null）。
   * @returns {JointAngles} 各关节角度对象
   *
   * @example
   * const angles = calculateAngles(landmarks);
   * // => { leftKnee: 95.2, rightKnee: 98.7, leftElbow: 165.1, ... }
   */
  function calculateAngles(landmarks, options) {
    const opts = options || {};
    const minVis = opts.minVisibility !== undefined ? opts.minVisibility : 0.3;
    const table = normalizeLandmarks(landmarks, opts);
    const result = {};

    for (const [name, vertex, a, b] of ANGLE_DEFINITIONS) {
      const pVertex = table.get(vertex);
      const pA = table.get(a);
      const pB = table.get(b);

      const lowVis =
        (pVertex && pVertex.visibility !== undefined && pVertex.visibility < minVis) ||
        (pA && pA.visibility !== undefined && pA.visibility < minVis) ||
        (pB && pB.visibility !== undefined && pB.visibility < minVis);

      result[name] = lowVis ? null : angleBetween(pA, pVertex, pB);
    }

    // 补充膝/踝 X 坐标（用于膝内扣检测）
    const leftKneeLm = table.get(25);
    const rightKneeLm = table.get(26);
    const leftAnkleLm = table.get(27);
    const rightAnkleLm = table.get(28);
    result.leftKneeX = (leftKneeLm && leftKneeLm.visibility >= minVis) ? leftKneeLm.x : null;
    result.rightKneeX = (rightKneeLm && rightKneeLm.visibility >= minVis) ? rightKneeLm.x : null;
    result.leftAnkleX = (leftAnkleLm && leftAnkleLm.visibility >= minVis) ? leftAnkleLm.x : null;
    result.rightAnkleX = (rightAnkleLm && rightAnkleLm.visibility >= minVis) ? rightAnkleLm.x : null;

    return result;
  }

  calculateAngles.angleBetween = angleBetween;
  calculateAngles.LANDMARK_NAMES = LANDMARK_NAMES;
  calculateAngles.ANGLE_DEFINITIONS = ANGLE_DEFINITIONS;

  return calculateAngles;
});
