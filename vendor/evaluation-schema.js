/**
 * evaluation-schema.js
 * ------------------------------------------------------------------
 * 需求方：评估页（显示结果时对齐字段名）
 * 死线：8/9
 *
 * 接口规格：
 *   准备一份示例 JSON 对象，并且标注清楚每一个字段代表的含义。
 * ------------------------------------------------------------------
 *
 * 交付内容：
 * 1. `evaluation.example.json`（examples/ 目录）——可直接给前端看的示例数据；
 * 2. 本模块：
 *    - `SCHEMA`：JSON Schema 校验规则（前端可直接用于表单/结果校验）；
 *    - `FIELD_DOC`：逐字段中文说明；
 *    - `EXAMPLE`：与 examples/evaluation.example.json 同构的示例对象；
 *    - `validate()`：轻量校验函数（不依赖 ajv，纯手写关键字段检查）。
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.EvaluationSchema = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** 逐字段含义说明（展示层字段对齐依据） */
  const FIELD_DOC = Object.freeze({
    evaluationId: "评估记录唯一 ID",
    action_type: "动作类型（与《画像Schema设计文档》v1.1 第五节对齐）",
    date: "训练日期 YYYY-MM-DD（与画像训练记录.date 对齐）",
    sets: "组数（与画像训练记录.sets 对齐）",
    reps: "每组次数（与画像训练记录.reps 对齐）",
    score: "本次训练评分 0~100（与画像训练记录.score 对齐）",
    errors: "本次训练检测到的错误简称列表 string[]（与画像训练记录.errors 对齐）",
    duration: "训练时长（秒），与画像训练记录.duration_sec 对齐",
    exerciseType: "动作类型编码（squat / pushup / lunge ...）",
    exerciseName: "动作中文名称",
    video: "视频信息",
    "video.fileName": "视频文件名",
    "video.durationSec": "视频时长（秒）",
    "video.width": "视频像素宽",
    "video.height": "视频像素高",
    "video.fps": "视频帧率",
    createdAt: "评估创建时间（ISO 8601，含时区）",
    poseFrames: "逐帧关键点数组（来自 pose-extractor）",
    "poseFrames[].frame": "帧编号（从 0 开始）",
    "poseFrames[].timestampMs": "该帧相对视频起点的时间戳（毫秒）",
    "poseFrames[].landmarks": "该帧的 33 个人体关键点",
    "poseFrames[].landmarks[].x": "归一化横坐标（0~1）",
    "poseFrames[].landmarks[].y": "归一化纵坐标（0~1）",
    "poseFrames[].landmarks[].z": "相对深度（值域约 -1~1）",
    "poseFrames[].landmarks[].visibility": "关键点可见度（0~1）",
    angleSeries: "逐帧关节角度序列（来自 angle-calculator）",
    "angleSeries[].frame": "帧编号",
    "angleSeries[].timestampMs": "时间戳（毫秒）",
    "angleSeries[].leftKnee": "左膝角（度）",
    "angleSeries[].rightKnee": "右膝角（度）",
    "angleSeries[].leftHip": "左髋角（度）",
    "angleSeries[].rightHip": "右髋角（度）",
    "angleSeries[].leftShoulder": "左肩角（度）",
    "angleSeries[].rightShoulder": "右肩角（度）",
    "angleSeries[].leftElbow": "左肘角（度）",
    "angleSeries[].rightElbow": "右肘角（度）",
    repCount: "动作计数结果（来自 rep-counter）",
    "repCount.reps": "单条动作信息数组",
    "repCount.reps[].repNumber": "动作序号（从 1 开始）",
    "repCount.reps[].startFrame": "该动作起始帧",
    "repCount.reps[].endFrame": "该动作结束帧",
    "repCount.reps[].errors": "该动作的错误数组",
    "repCount.reps[].errors[].code": "错误代码（英文小写）",
    "repCount.reps[].errors[].message": "错误中文描述",
    "repCount.reps[].errors[].frame": "错误首次出现帧",
    "repCount.reps[].score": "该动作得分（0~100）",
    "repCount.totalReps": "总动作次数",
    "repCount.summary": "动作总结",
    "repCount.summary.totalReps": "总动作次数（与 totalReps 一致）",
    "repCount.summary.averageScore": "平均得分（0~100）",
    "repCount.summary.errorCounts": "各错误出现次数（code → 次数）",
    "repCount.summary.grade": "评级（优秀/良好/一般/较差）",
    angles: "角度统计（展示用）",
    "angles.min": "各关节最小角度",
    "angles.max": "各关节最大角度",
    "angles.avg": "各关节平均角度",
    result: "评估总结果（展示页直接使用）",
    "result.totalReps": "总动作次数",
    "result.score": "总分（0~100）",
    "result.grade": "总评级",
    "result.passed": "是否通过（布尔）",
    "result.messages": "给用户的提示信息数组",
  });

  /**
   * 动作类型映射：内部编码 → 画像文档枚举（《画像Schema》动作习惯/训练记录使用中文枚举）
   */
  const ACTION_TYPE_MAP = Object.freeze({
    squat: "深蹲",
    pushup: "俯卧撑",
    plank: "平板支撑",
  });

  /**
   * 错误代码 → 画像文档风格的中文错误简称
   * （与 rep-counter 的 errors[].code 对应；画像训练记录 errors 示例为
   *   ["膝内扣", "蹲太浅"] 这类短语）
   */
  const ERROR_CODE_TO_NAME = Object.freeze({
    insufficientDepth: "蹲太浅",
    kneeValgus: "膝内扣",
    forwardLean: "重心前移",
  });

  /** JSON Schema 校验规则（Draft-07 风格，前端可用 ajv 等校验） */
  const SCHEMA = Object.freeze({
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "PoseEvaluationResult",
    description: "评估页动作评估输出结构",
    type: "object",
    required: [
      "evaluationId",
      "action_type",
      "date",
      "sets",
      "reps",
      "score",
      "errors",
      "duration",
      "exerciseType",
      "createdAt",
      "repCount",
      "result",
    ],
    properties: {
      evaluationId: { type: "string" },
      action_type: { type: "string" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      sets: { type: "integer", minimum: 1 },
      reps: { type: "integer", minimum: 1 },
      score: { type: "integer", minimum: 0, maximum: 100 },
      errors: { type: "array", items: { type: "string" } },
      duration: { type: "integer", minimum: 0 },
      exerciseType: { type: "string" },
      exerciseName: { type: "string" },
      video: {
        type: "object",
        properties: {
          fileName: { type: "string" },
          durationSec: { type: "number" },
          width: { type: "integer" },
          height: { type: "integer" },
          fps: { type: "number" },
        },
      },
      createdAt: { type: "string", format: "date-time" },
      poseFrames: {
        type: "array",
        items: {
          type: "object",
          required: ["frame", "landmarks"],
          properties: {
            frame: { type: "integer" },
            timestampMs: { type: "integer" },
            landmarks: {
              type: "array",
              items: {
                type: "object",
                required: ["x", "y"],
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  z: { type: "number" },
                  visibility: { type: "number", minimum: 0, maximum: 1 },
                },
              },
            },
          },
        },
      },
      angleSeries: {
        type: "array",
        items: { type: "object" },
      },
      repCount: {
        type: "object",
        required: ["reps", "totalReps", "summary"],
        properties: {
          reps: {
            type: "array",
            items: {
              type: "object",
              required: ["repNumber", "errors", "score"],
              properties: {
                repNumber: { type: "integer" },
                startFrame: { type: ["integer", "null"] },
                endFrame: { type: ["integer", "null"] },
                errors: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["code", "message"],
                    properties: {
                      code: { type: "string" },
                      message: { type: "string" },
                      frame: { type: ["integer", "null"] },
                    },
                  },
                },
                score: { type: "number", minimum: 0, maximum: 100 },
              },
            },
          },
          totalReps: { type: "integer" },
          summary: {
            type: "object",
            properties: {
              totalReps: { type: "integer" },
              averageScore: { type: "number" },
              errorCounts: { type: "object" },
              grade: { type: "string" },
            },
          },
        },
      },
      angles: {
        type: "object",
        properties: {
          min: { type: "object" },
          max: { type: "object" },
          avg: { type: "object" },
        },
      },
      result: {
        type: "object",
        properties: {
          totalReps: { type: "integer" },
          score: { type: "number", minimum: 0, maximum: 100 },
          grade: { type: "string" },
          passed: { type: "boolean" },
          messages: { type: "array", items: { type: "string" } },
        },
      },
    },
  });

  /**
   * 示例对象（与 examples/evaluation.example.json 同构，供 JS 直接引用）。
   */
  const EXAMPLE = {
    evaluationId: "evt_20260806_001",
    action_type: "深蹲",
    date: "2026-08-06",
    sets: 1,
    reps: 1,
    score: 85,
    errors: ["深度不足"],
    duration: 12,
    exerciseType: "squat",
    exerciseName: "深蹲",
    video: {
      fileName: "squat_set1.mp4",
      durationSec: 12.4,
      width: 1280,
      height: 720,
      fps: 30,
    },
    createdAt: "2026-08-06T10:30:00+08:00",
    poseFrames: [],
    angleSeries: [],
    repCount: {
      reps: [],
      totalReps: 0,
      summary: {
        totalReps: 0,
        averageScore: 0,
        errorCounts: {},
        grade: "较差",
      },
    },
    angles: { min: {}, max: {}, avg: {} },
    result: {
      totalReps: 0,
      score: 0,
      grade: "较差",
      passed: false,
      messages: [],
    },
  };

  /**
   * 轻量校验：检查关键字段是否齐全、类型是否正确。
   * 返回 { valid, errors: string[] }。
   * @param {Object} obj 待校验的评估结果对象
   * @returns {{valid: boolean, errors: string[]}}
   */
  function validate(obj) {
    const errors = [];
    if (!obj || typeof obj !== "object") {
      return { valid: false, errors: ["输入不是对象"] };
    }
    if (!obj.evaluationId) errors.push("缺少 evaluationId");
    if (typeof obj.action_type !== "string" || !obj.action_type) errors.push("缺少 action_type");
    if (typeof obj.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) {
      errors.push("date 必须是 YYYY-MM-DD 格式");
    }
    if (typeof obj.sets !== "number" || obj.sets < 1) errors.push("sets 必须是 ≥1 的整数");
    if (typeof obj.reps !== "number" || obj.reps < 1) errors.push("reps 必须是 ≥1 的整数");
    if (typeof obj.score !== "number" || obj.score < 0 || obj.score > 100) {
      errors.push("score 必须是 0~100 的整数");
    }
    if (!Array.isArray(obj.errors) || !obj.errors.every((e) => typeof e === "string")) {
      errors.push("errors 必须是字符串数组");
    }
    if (typeof obj.duration !== "number" || obj.duration < 0) {
      errors.push("duration 必须是非负整数（秒）");
    }
    if (!obj.exerciseType) errors.push("缺少 exerciseType");
    if (!obj.createdAt) errors.push("缺少 createdAt");
    if (!obj.repCount || typeof obj.repCount !== "object") {
      errors.push("缺少 repCount");
    } else {
      if (!Array.isArray(obj.repCount.reps)) errors.push("repCount.reps 必须是数组");
      if (typeof obj.repCount.totalReps !== "number") errors.push("repCount.totalReps 必须是数字");
      if (!obj.repCount.summary || typeof obj.repCount.summary !== "object") {
        errors.push("缺少 repCount.summary");
      }
    }
    if (!obj.result || typeof obj.result !== "object") {
      errors.push("缺少 result");
    }
    if (Array.isArray(obj.poseFrames)) {
      obj.poseFrames.forEach((f, i) => {
        if (!Array.isArray(f.landmarks)) errors.push(`poseFrames[${i}].landmarks 必须是数组`);
      });
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * 获取字段说明。
   * @param {string} path 字段路径，如 "poseFrames[].landmarks[].x"
   * @returns {string|undefined}
   */
  function describeField(path) {
    return FIELD_DOC[path];
  }

  /**
   * 从 countReps 结果聚合本次训练的错误列表（string[]）。
   * 规则：遍历每个动作的 errors，按 code 映射为中文简称，去重并保持出现顺序。
   * 与画像文档第六节「读取本次评估的 errors[] 列表」对应。
   *
   * @param {Object} repCount countReps 的返回结果
   * @returns {string[]} 如 ["膝内扣", "蹲太浅"]
   */
  function aggregateErrors(repCount) {
    const names = [];
    if (!repCount || !Array.isArray(repCount.reps)) return names;
    for (const rep of repCount.reps) {
      if (!Array.isArray(rep.errors)) continue;
      for (const err of rep.errors) {
        const name = err && ERROR_CODE_TO_NAME[err.code]
          ? ERROR_CODE_TO_NAME[err.code]
          : (err && err.message);
        if (name && !names.includes(name)) names.push(name);
      }
    }
    return names;
  }

  /** 本地日期 YYYY-MM-DD */
  function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /**
   * 生成完整评估 JSON（含画像对齐 7 字段）。
   *
   * 由 countReps 结果 + 视频信息 + 元数据自动生成，保证：
   * - action_type 使用画像文档中文枚举（深蹲/俯卧撑/平板支撑）
   * - errors 由检测结果聚合去重（string[]，中文简称）
   * - score 与 result.score 一致（取 summary.averageScore 四舍五入）
   * - duration 取视频时长（秒）四舍五入
   *
   * @param {Object} params
   * @param {Object} params.repCount countReps 的返回结果（必填）
   * @param {Object} [params.videoInfo] { fileName, durationSec, width, height, fps }
   * @param {string} [params.actionCode="squat"] 内部动作编码（squat/pushup/plank）
   * @param {string} [params.actionType] 中文动作名（缺省按 actionCode 映射）
   * @param {string} [params.date] 训练日期 YYYY-MM-DD（缺省为今天）
   * @param {number} [params.sets=1] 组数
   * @param {number} [params.reps] 每组次数（缺省取 totalReps）
   * @param {string} [params.evaluationId] 评估记录 ID
   * @param {Object[]} [params.poseFrames] 逐帧关键点（可选）
   * @param {Object[]} [params.angleSeries] 逐帧角度（可选）
   * @returns {Object} 完整评估 JSON（通过 validate 校验）
   *
   * @example
   * const evaluation = buildEvaluationResult({
   *   repCount: countReps(angleSeries),
   *   videoInfo: { fileName: "squat.mp4", durationSec: 44.3, width: 1920, height: 1020 },
   *   actionCode: "squat",
   *   date: "2026-08-10",
   *   sets: 1,
   * });
   */
  function buildEvaluationResult(params) {
    const repCount = params && params.repCount ? params.repCount : {};
    const videoInfo = params && params.videoInfo ? params.videoInfo : {};
    const actionCode = (params && params.actionCode) || "squat";
    const actionType = (params && params.actionType) || ACTION_TYPE_MAP[actionCode] || actionCode;
    const totalReps = typeof repCount.totalReps === "number" ? repCount.totalReps : 0;
    const score = Math.round(
      repCount.summary && typeof repCount.summary.averageScore === "number"
        ? repCount.summary.averageScore
        : 0
    );
    const errors = aggregateErrors(repCount);
    const sets = params && typeof params.sets === "number" ? params.sets : 1;
    const reps = params && typeof params.reps === "number" ? params.reps : totalReps;
    const duration = Math.round(videoInfo.durationSec || 0);

    return {
      evaluationId: (params && params.evaluationId) || `evt_${Date.now()}`,
      action_type: actionType,
      date: (params && params.date) || todayISO(),
      sets,
      reps,
      score,
      errors,
      duration,
      exerciseType: actionCode,
      exerciseName: actionType,
      video: {
        fileName: videoInfo.fileName || "",
        durationSec: videoInfo.durationSec || 0,
        width: videoInfo.width || 0,
        height: videoInfo.height || 0,
        fps: videoInfo.fps || 0,
      },
      createdAt: (params && params.createdAt) || new Date().toISOString(),
      poseFrames: (params && params.poseFrames) || [],
      angleSeries: (params && params.angleSeries) || [],
      repCount,
      angles: (params && params.angles) || { min: {}, max: {}, avg: {} },
      result: {
        totalReps,
        score,
        grade: repCount.summary ? repCount.summary.grade : "较差",
        passed: score >= 60,
        messages: [],
      },
    };
  }

  return {
    SCHEMA,
    FIELD_DOC,
    EXAMPLE,
    validate,
    describeField,
    ACTION_TYPE_MAP,
    ERROR_CODE_TO_NAME,
    aggregateErrors,
    buildEvaluationResult,
  };
});
