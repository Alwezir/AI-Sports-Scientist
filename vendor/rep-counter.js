/**
 * rep-counter.js
 * ------------------------------------------------------------------
 * 需求方：评估页（计数 + 错误 + 评分）
 * 死线：W1 末
 *
 * 接口规格：
 *   `countReps(angleSeries)`；
 *   返回对象属性：reps 数组（单条动作信息：repNumber 动作序号、
 *   errors 错误数组、score 得分）、totalReps 总动作次数、
 *   summary 动作总结。
 * ------------------------------------------------------------------
 *
 * 说明：
 * - angleSeries 为逐帧关节角度序列（即 calculateAngles 的输出的时间序列）：
 *     [
 *       { frame: 0, timestampMs: 0, leftKnee: 172.3, rightKnee: 170.1, leftHip: 178.2, ... },
 *       { frame: 2, timestampMs: 66, ... },
 *       ...
 *     ]
 * - 默认按深蹲（squat）判定：膝角下降到阈值以下为“下”，回升过阈值
 *   为“上”，一次完整下-上即一个 rep。
 * - 错误检测与评分规则集中在 CONFIG 中，前端可以按动作类型替换。
 * - 膝内扣（需要 leftAnkleX/rightAnkleX）与重心前移（需要 torsoLean）
 *   是可选输入：angleSeries 中不提供这些字段时，对应检查自动跳过。
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.RepCounter = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** 默认深蹲判定配置 */
  const CONFIG = {
    // 主角度通道：用左右膝角均值作为计数信号
    primaryAngle: "knee",
    // 下蹲判定：膝角 ≤ 90° 视为“下”
    downThreshold: 90,
    // 起身判定：膝角 ≥ 150° 视为“上”（带回差，防抖动）
    upThreshold: 150,
    // 一个 rep 至少需要这么多秒（防止噪声触发）。
    // 采样率不同时自动换算成帧数，避免低采样率漏计。
    minSecondsPerRep: 0.8,
    // 错误检测阈值
    errors: {
      // 深度不足：髋角 > 膝角（髋没低于膝）
      depth: { name: "insufficientDepth", thresholdRatio: 1.0, penalty: 15 },
      // 膝盖内扣：膝点与踝点 x 偏差过大
      kneeValgus: { name: "kneeValgus", maxXDeviation: 0.06, penalty: 20 },
      // 重心前移：上身前倾（肩髋连线与竖直方向夹角过大）
      forwardLean: { name: "forwardLean", maxLeanDeg: 25, penalty: 10 },
    },
  };

  /**
   * @typedef {Object} AngleSample
   * @property {number} [frame] 帧编号
   * @property {number} [timestampMs] 时间戳（毫秒）
   * @property {number} [leftKnee] 左膝角（度）
   * @property {number} [rightKnee] 右膝角（度）
   * @property {number} [leftHip] 左髋角（度）
   * @property {number} [rightHip] 右髋角（度）
   * @property {number} [leftAnkleX] 左踝归一化 x（可选，用于膝内扣检查）
   * @property {number} [rightAnkleX] 右踝归一化 x（可选）
   * @property {number} [torsoLean] 躯干前倾角（度，可选，用于重心前移检查）
   */

  /**
   * @typedef {Object} RepError
   * @property {string} code 错误代码（英文小写，前端可做 i18n）
   * @property {string} message 错误描述
   * @property {number} [frame] 首次出现该错误的帧号
   */

  /**
   * @typedef {Object} RepRecord
   * @property {number} repNumber 动作序号（从 1 开始）
   * @property {number} startFrame 起始帧
   * @property {number} endFrame 结束帧
   * @property {RepError[]} errors 错误数组
   * @property {number} score 得分（0~100）
   */

  /**
   * @typedef {Object} RepSummary
   * @property {number} totalReps 总动作次数
   * @property {number} averageScore 平均得分（0~100）
   * @property {Object<string, number>} errorCounts 各错误出现次数
   * @property {string} grade 评级（优秀/良好/一般/较差）
   */

  /**
   * @typedef {Object} CountRepsResult
   * @property {RepRecord[]} reps 单条动作信息数组
   * @property {number} totalReps 总动作次数
   * @property {RepSummary} summary 动作总结
   */

  /**
   * 取一组样本的主角度均值（左右膝角或其它通道）。
   * @param {AngleSample[]} samples
   * @param {string} primaryAngle "knee" | "hip" | "elbow" | ...
   * @returns {number|null}
   */
  function primaryAngleValue(samples, primaryAngle) {
    if (primaryAngle === "knee") {
      const vals = samples
        .map((s) => [s.leftKnee, s.rightKnee])
        .flat()
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      if (!vals.length) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    if (primaryAngle === "hip") {
      const vals = samples
        .map((s) => [s.leftHip, s.rightHip])
        .flat()
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      if (!vals.length) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    // 自定义通道：直接读该字段
    const vals = samples
      .map((s) => s[primaryAngle])
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  /**
   * 对一段已抓取的 rep 做错误检测与评分。
   * @param {AngleSample[]} segment
   * @param {Object} config
   * @returns {{errors: RepError[], score: number}}
   */
  function evaluateSegment(segment, config) {
    const errors = [];
    let score = 100;
    const errCfg = config.errors;

    // 1. 深度检查：取该 rep 中膝角最小的样本（最低点），
    //    比较该时刻髋角与膝角（深蹲最低点应髋低于膝）。
    const kneeVals = segment
      .map((s) => [s.leftKnee, s.rightKnee])
      .flat()
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    const hipVals = segment
      .map((s) => [s.leftHip, s.rightHip])
      .flat()
      .filter((v) => typeof v === "number" && Number.isFinite(v));

    if (kneeVals.length && hipVals.length) {
      let bottom = null;
      let bottomKnee = Infinity;
      for (const sample of segment) {
        const knees = [sample.leftKnee, sample.rightKnee]
          .filter((v) => typeof v === "number" && Number.isFinite(v));
        if (!knees.length) continue;
        const kneeAverage = knees.reduce((a, b) => a + b, 0) / knees.length;
        if (kneeAverage < bottomKnee) {
          bottomKnee = kneeAverage;
          bottom = sample;
        }
      }

      const hipsAtBottom = bottom
        ? [bottom.leftHip, bottom.rightHip]
          .filter((v) => typeof v === "number" && Number.isFinite(v))
        : [];
      const hipAverage = hipsAtBottom.length
        ? hipsAtBottom.reduce((a, b) => a + b, 0) / hipsAtBottom.length
        : null;

      if (hipAverage !== null && hipAverage > bottomKnee * errCfg.depth.thresholdRatio) {
        errors.push({
          code: errCfg.depth.name,
          message: "下蹲深度不足：髋部未低于膝盖",
          frame: bottom && bottom.frame,
        });
        score -= errCfg.depth.penalty;
      }
    }

    // 2. 膝盖内扣检查：用膝/踝 X 坐标偏差（归一化坐标，同量纲）
    const kneeX = [];
    const ankleX = [];
    for (const s of segment) {
      if (typeof s.leftKneeX === "number" && typeof s.leftAnkleX === "number") {
        kneeX.push(s.leftKneeX);
        ankleX.push(s.leftAnkleX);
      }
    }
    if (kneeX.length && ankleX.length) {
      const avgKneeX = kneeX.reduce((a, b) => a + b, 0) / kneeX.length;
      const avgAnkleX = ankleX.reduce((a, b) => a + b, 0) / ankleX.length;
      if (Math.abs(avgKneeX - avgAnkleX) > errCfg.kneeValgus.maxXDeviation) {
        errors.push({
          code: errCfg.kneeValgus.name,
          message: "膝盖内扣：膝盖与脚踝横向偏移过大",
          frame: segment[0] && segment[0].frame,
        });
        score -= errCfg.kneeValgus.penalty;
      }
    }

    // 3. 重心前移检查（简化：肩髋连线角度）
    const leanAngles = segment
      .map((s) => s.torsoLean)
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (leanAngles.length) {
      const maxLean = Math.max(...leanAngles);
      if (maxLean > errCfg.forwardLean.maxLeanDeg) {
        errors.push({
          code: errCfg.forwardLean.name,
          message: "重心前移：躯干前倾角度过大",
          frame: segment[0] && segment[0].frame,
        });
        score -= errCfg.forwardLean.penalty;
      }
    }

    return { errors, score: Math.max(0, score) };
  }

  /**
   * 动作计数主入口。
   *
   * @param {AngleSample[]} angleSeries 逐帧关节角度序列（由 calculateAngles 输出组成）
   * @param {Object} [options]
   * @param {Object} [options.config] 覆盖 CONFIG 判定阈值
   * @param {string} [options.config.primaryAngle="knee"] 主角度通道
   * @param {number} [options.config.downThreshold=90] 下蹲阈值
   * @param {number} [options.config.upThreshold=150] 起身阈值
   * @param {number} [options.config.minSecondsPerRep=0.8]
   *   一个 rep 最短持续时间（秒），按序列采样间隔自动换算帧数
   * @param {number} [options.config.minFramesPerRep]
   *   显式指定一个 rep 最少帧数（覆盖 minSecondsPerRep）
   * @returns {CountRepsResult}
   *
   * @example
   * const result = countReps(angleSeries);
   * // => {
   * //   reps: [{ repNumber: 1, startFrame: 12, endFrame: 48, errors: [...], score: 85 }],
   * //   totalReps: 5,
   * //   summary: { totalReps: 5, averageScore: 82, errorCounts: {...}, grade: "良好" }
   * // }
   */
  function countReps(angleSeries, options) {
    const opts = options || {};
    const config = Object.assign({}, CONFIG, opts.config || {});
    const series = Array.isArray(angleSeries) ? angleSeries : [];

    const reps = [];
    let inDownPhase = false;
    let segment = [];

    // 计算“一个 rep 至少多少帧”：优先按时间换算，避免低采样率漏计
    let minSegmentSize;
    if (config.minFramesPerRep !== undefined) {
      minSegmentSize = Math.max(2, config.minFramesPerRep);
    } else {
      const intervals = [];
      for (let i = 1; i < series.length; i++) {
        const cur = series[i].timestampMs;
        const prev = series[i - 1].timestampMs;
        if (typeof cur === "number" && typeof prev === "number" && cur > prev) {
          intervals.push(cur - prev);
        }
      }
      if (intervals.length) {
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        minSegmentSize = Math.max(2, Math.ceil((config.minSecondsPerRep * 1000) / avgInterval));
      } else {
        minSegmentSize = 4; // 无时间戳信息时的保守默认
      }
    }

    for (let i = 0; i < series.length; i++) {
      const sample = series[i];
      const angle = primaryAngleValue([sample], config.primaryAngle);

      if (angle === null) continue; // 该帧关键点不可信，跳过

      if (!inDownPhase) {
        if (angle <= config.downThreshold) {
          inDownPhase = true;
          segment = [sample];
          continue;
        }
      } else {
        segment.push(sample);
        if (angle >= config.upThreshold) {
          // 完成一次下-上循环
          if (segment.length >= minSegmentSize) {
            const { errors, score } = evaluateSegment(segment, config);
            reps.push({
              repNumber: reps.length + 1,
              startFrame: segment[0].frame !== undefined ? segment[0].frame : null,
              endFrame: segment[segment.length - 1].frame !== undefined
                ? segment[segment.length - 1].frame
                : null,
              errors,
              score,
            });
          }
          inDownPhase = false;
          segment = [];
        }
      }
    }

    // 汇总
    const errorCounts = {};
    for (const rep of reps) {
      for (const err of rep.errors) {
        errorCounts[err.code] = (errorCounts[err.code] || 0) + 1;
      }
    }

    const averageScore = reps.length
      ? Math.round(reps.reduce((a, r) => a + r.score, 0) / reps.length)
      : 0;

    let grade = "较差";
    if (averageScore >= 90) grade = "优秀";
    else if (averageScore >= 75) grade = "良好";
    else if (averageScore >= 60) grade = "一般";

    return {
      reps,
      totalReps: reps.length,
      summary: {
        totalReps: reps.length,
        averageScore,
        errorCounts,
        grade,
      },
    };
  }

  countReps.CONFIG = CONFIG;
  countReps.evaluateSegment = evaluateSegment;

  return countReps;
});
