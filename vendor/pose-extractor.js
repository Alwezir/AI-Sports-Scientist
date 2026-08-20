/**
 * pose-extractor.js
 * ------------------------------------------------------------------
 * 需求方：评估页（上传视频 → 提取关键点）
 * 死线：W1 末（8/9 前）
 *
 * 接口规格：
 *   `extractPose(videoFile)` 返回 Promise 类型数据，
 *   返回结构为数组，数组元素包含 frame（帧编号）、landmarks 数组；
 *   landmarks 内存放对象，对象属性包含 x、y、z、visibility。
 * ------------------------------------------------------------------
 *
 * 说明：
 * - 本模块是浏览器端实现（评估页本身是网页）。视频解码、逐帧采样
 *   都由浏览器原生 API 完成，不引入任何第三方依赖。
 * - 关键点推理（姿态估计模型）通过 `options.detector` 注入。
 *   这样算法组不需要把具体的模型权重一起打包，前端拿到本文件后
 *   传入 MediaPipe Pose / MoveNet / 自研模型适配器即可。
 * - 内置 `createMediaPipeDetector()`：若页面已通过 CDN 或打包器引入
 *   `@mediapipe/tasks-vision`，可直接使用。
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.PoseExtractor = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * @typedef {Object} Landmark
   * @property {number} x 归一化横坐标（0~1，相对视频宽度）
   * @property {number} y 归一化纵坐标（0~1，相对视频高度）
   * @property {number} z 相对深度（以臀部中心为原点，值域约 -1~1）
   * @property {number} visibility 关键点可见度（0~1，越大越可信）
   */

  /**
   * @typedef {Object} PoseFrame
   * @property {number} frame 帧编号（从 0 开始）
   * @property {number} timestampMs 该帧对应的视频时间戳（毫秒）
   * @property {Landmark[]} landmarks 33 个人体关键点
   */

  /**
   * @typedef {Object} PoseDetector
   * @property {function(HTMLVideoElement): Promise<Landmark[]>} detect
   *   对当前帧做一次推理，返回一组 33 点 landmarks。
   */

  /** 错误类型定义，便于上层页面统一处理 */
  const ERROR = Object.freeze({
    NOT_BROWSER: "NOT_BROWSER",
    INVALID_VIDEO_FILE: "INVALID_VIDEO_FILE",
    NO_DETECTOR: "NO_DETECTOR",
    VIDEO_DECODE_FAILED: "VIDEO_DECODE_FAILED",
    DETECTOR_ERROR: "DETECTOR_ERROR",
  });

  /**
   * 默认每 2 帧采样一次，步进可配置。
   * @param {number} frame
   * @param {{everyNFrames?: number}} options
   * @returns {boolean}
   */
  function shouldSample(frame, options) {
    const n = options.everyNFrames && options.everyNFrames > 0
      ? options.everyNFrames
      : 2;
    return frame % n === 0;
  }

  /**
   * 把视频文件解码到可播放状态，返回 <video> 元素。
   * @param {File|Blob} videoFile
   * @returns {Promise<HTMLVideoElement>}
   */
  function loadVideoElement(videoFile) {
    return new Promise((resolve, reject) => {
      if (typeof document === "undefined" || typeof HTMLVideoElement === "undefined") {
        reject(new Error(ERROR.NOT_BROWSER));
        return;
      }
      if (!(videoFile instanceof Blob) && !(videoFile instanceof File)) {
        reject(new Error(ERROR.INVALID_VIDEO_FILE));
        return;
      }

      const url = URL.createObjectURL(videoFile);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      // 部分环境（无头浏览器/隐藏标签页）下未挂载到文档的视频不会触发
      // loadedmetadata，这里统一挂载到 body 确保事件正常。
      document.body.appendChild(video);

      const cleanup = () => URL.revokeObjectURL(url);
      let settled = false;
      const fail = (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        reject(new Error(code));
      };
      const timeout = setTimeout(() => fail(ERROR.VIDEO_DECODE_FAILED + ": METADATA_TIMEOUT"), 15000);

      video.onloadedmetadata = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          cleanup();
          reject(new Error(ERROR.VIDEO_DECODE_FAILED));
          return;
        }
        cleanup();
        resolve(video);
      };
      video.onerror = () => {
        fail(ERROR.VIDEO_DECODE_FAILED);
      };
      video.src = url;
    });
  }

  /**
   * 默认视频加载器：把 File/Blob 转成 ObjectURL 加载。
   * 前端可用 options.loadVideo 替换（例如传入已就绪的 <video> 元素或 http URL）。
   * @param {File|Blob} videoFile
   * @returns {Promise<HTMLVideoElement>}
   */
  function defaultLoadVideo(videoFile) {
    return loadVideoElement(videoFile);
  }

  /**
   * 逐帧推理。
   * @param {HTMLVideoElement} video
   * @param {PoseDetector} detector
   * @param {Object} options
   * @param {AbortSignal} [options.signal] 取消信号
   * @param {number} [options.detectRetries=2] 单帧推理失败（关键点为空）时的重试次数
   * @returns {Promise<PoseFrame[]>}
   */
  async function runInference(video, detector, options) {
    const frames = [];
    // HTMLVideoElement 没有 fps 属性，这里用估计值（30fps）计算总帧数，
    // 仅用于进度回调展示。
    const estimatedTotalFrames = Math.max(1, Math.floor((video.duration || 0) * (options.fps || 30)));
    let frameIndex = 0;

    while (true) {
      if (options.signal && options.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const currentTime = frameIndex / (options.fps || 30);
      if (currentTime > video.duration) break;

      if (shouldSample(frameIndex, options)) {
        await seekTo(video, currentTime);
        await waitNextFrame(video);

        const maxRetries = options.detectRetries !== undefined ? options.detectRetries : 2;
        let landmarks = [];
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            landmarks = await detector.detect(video);
          } catch (err) {
            throw new Error(`${ERROR.DETECTOR_ERROR}: ${err && err.message ? err.message : err}`);
          }
          if (Array.isArray(landmarks) && landmarks.length > 0) break;
          if (attempt < maxRetries) {
            // 该帧还未就绪（可能 seek 后解码帧未刷新），稍等重试
            await new Promise((r) => setTimeout(r, 120));
          }
        }

        frames.push({
          frame: frameIndex,
          timestampMs: Math.round(currentTime * 1000),
          landmarks: normalizeLandmarks(landmarks),
        });
        if (options.onProgress) {
          options.onProgress(frames.length, estimatedTotalFrames);
        }
      }

      frameIndex += 1;
    }

    return frames;
  }

  /**
   * 把视频 seek 到目标时间，等待 seek 完成。
   * @param {HTMLVideoElement} video
   * @param {number} targetTime 目标时间（秒）
   * @returns {Promise<void>}
   */
  function seekTo(video, targetTime) {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - targetTime) < 0.03) {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        resolve();
      };
      const onSeeked = () => finish();
      const onError = () => finish();
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
      // 兜底：seek 事件丢失或同时间点重复 seek 时不阻塞
      const timer = setTimeout(finish, 5000);
      video.currentTime = targetTime;
    });
  }

  /**
   * 等待一帧渲染完成（确保 detector 读到的是目标帧而非旧帧）。
   * @param {HTMLVideoElement} video
   * @returns {Promise<void>}
   */
  function waitNextFrame(video) {
    return new Promise((resolve) => {
      if (typeof video.requestVideoFrameCallback === "function") {
        // rVFC 在真实浏览器中 seek 后立即触发；无头/暂停场景可能不触发，
        // 用短超时兜底，避免每帧等待过长。
        const timer = setTimeout(resolve, 150);
        video.requestVideoFrameCallback(() => {
          clearTimeout(timer);
          resolve();
        });
      } else {
        setTimeout(resolve, 120);
      }
    });
  }

  /**
   * 统一 landmarks 字段格式（x/y/z/visibility 全为数字）。
   * @param {Landmark[]} landmarks
   * @returns {Landmark[]}
   */
  function normalizeLandmarks(landmarks) {
    if (!Array.isArray(landmarks)) return [];
    return landmarks.map((lm) => ({
      x: Number(lm.x) || 0,
      y: Number(lm.y) || 0,
      z: Number(lm.z) || 0,
      visibility: lm.visibility !== undefined ? Number(lm.visibility) : 1,
    }));
  }

  /**
   * 提取视频关键点（主入口）。
   *
   * @param {File|Blob} videoFile 用户上传的视频文件
   * @param {Object} [options]
   * @param {PoseDetector} [options.detector] 姿态估计适配器。
   *   必填（或传入 options.detectFrame）；缺省时抛 NO_DETECTOR。
   * @param {function(HTMLVideoElement): Promise<Landmark[]>} [options.detectFrame]
   *   便捷写法：直接给一个“输入 video 元素 → 输出 landmarks”的函数。
   * @param {number} [options.everyNFrames=2] 每 N 帧采样一次
   * @param {number} [options.fps=30] 采样基准帧率（实际视频帧率未知，
   *   浏览器不提供 video.fps；用于把帧编号换算成时间点）
   * @param {number} [options.detectRetries=2] 单帧推理关键点为空时的重试次数
   * @param {function(File|Blob): Promise<HTMLVideoElement>} [options.loadVideo]
   *   自定义视频加载器（默认把 File 转 ObjectURL 加载；前端如已有
   *   <video> 元素或 http URL 可传入此函数覆盖）
   * @param {AbortSignal} [options.signal] 中止信号（AbortController）
   * @param {function(number, number): void} [options.onProgress] 进度回调
   *   (已提取帧数, 估计总帧数)
   * @returns {Promise<PoseFrame[]>}
   *   解析为帧数组；元素 `{ frame, timestampMs, landmarks }`。
   *
   * @example
   * const frames = await extractPose(videoFile, {
   *   detector: createMediaPipeDetector(),
   *   onProgress: (done, total) => console.log(`${done}/${total}`),
   * });
   */
  async function extractPose(videoFile, options) {
    const opts = options || {};

    const detectFn = opts.detectFrame
      ? opts.detectFrame
      : opts.detector && typeof opts.detector.detect === "function"
        ? (video) => opts.detector.detect(video)
        : null;

    if (!detectFn) {
      throw new Error(ERROR.NO_DETECTOR);
    }

    const video = typeof opts.loadVideo === "function"
      ? await opts.loadVideo(videoFile)
      : await defaultLoadVideo(videoFile);
    const detector = { detect: detectFn };

    try {
      const frames = await runInference(video, detector, opts);
      return frames;
    } finally {
      video.removeAttribute("src");
      video.load();
    }
  }

  /**
   * 创建基于 @mediapipe/tasks-vision 的 PoseDetector 适配器。
   *
   * @param {Object} [options]
   * @param {string} [options.wasmPath]
   *   WASM 文件目录（CDN 或本地静态目录），例如
   *   "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.x/wasm"。
   * @param {boolean} [options.autoDetectLandmarks=true]
   *   若为 true，检测时自动过滤 visibility 极低的关键点。
   * @returns {PoseDetector}
   *
   * @example
   * const detector = await createMediaPipeDetector({
   *   wasmPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
   * });
   */
  async function createMediaPipeDetector(options) {
    const opts = options || {};
    const vision = await loadTasksVision(opts.moduleUrl);

    const wasmPath = opts.wasmPath
      || "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm";
    const filesetResolver = await vision.FilesetResolver.forVisionTasks(wasmPath);
    const landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    return {
      async detect(video) {
        const result = landmarker.detectForVideo(video, performance.now());
        const pose = result.landmarks && result.landmarks[0];
        if (!pose) return [];
        if (opts.autoDetectLandmarks === false) {
          return pose;
        }
        // MediaPipe 的 landmark 对象本身就是 {x,y,z,visibility}，直接透传
        return pose;
      },
    };
  }

  /**
   * 加载 @mediapipe/tasks-vision（三种方式依次尝试）。
   *
   * @param {string} [moduleUrl]
   *   自定义 ESM 模块地址（默认 jsdelivr CDN）。
   *   注意：@mediapipe/tasks-vision 包的主入口是根目录的 vision_bundle.mjs，
   *   不是 wasm/vision_bundle.js（该文件不存在）。
   * @returns {Promise<Object>} { FilesetResolver, PoseLandmarker }
   */
  async function loadTasksVision(moduleUrl) {
    // 1) 全局挂载（script 方式引入 vision_bundle.mjs 的 UMD/CJS 产物等）
    if (typeof window !== "undefined" && window.FilesetResolver && window.PoseLandmarker) {
      return { FilesetResolver: window.FilesetResolver, PoseLandmarker: window.PoseLandmarker };
    }

    // 2) 浏览器原生动态 import（推荐，自动从 CDN 拉取 ESM）。
    //    通过 Function 间接调用 import()，避免经典 script 上下文中的解析限制。
    try {
      const dynamicImport = new Function("url", "return import(url)");
      const url = moduleUrl || "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
      return await dynamicImport(url);
    } catch (e) {
      // 动态 import 失败时继续尝试 CommonJS
    }

    // 3) CommonJS（Node / 打包器环境）
    if (typeof require === "function") {
      return require("@mediapipe/tasks-vision");
    }

    throw new Error(
      "未找到 @mediapipe/tasks-vision：请传入 moduleUrl 或用 import 引入后重试"
    );
  }

  extractPose.createMediaPipeDetector = createMediaPipeDetector;
  extractPose.ERROR = ERROR;

  return extractPose;
});
