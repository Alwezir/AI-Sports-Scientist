import { useState, useRef, useEffect, useCallback } from 'react';
import PageLayout from '../components/PageLayout';
import { getOrCreateUserId, initUser, receiveAlgorithmJson } from '../utils/userProfile';
import './EvaluationPage.css';

// MediaPipe Pose Landmarker indices
const MP = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
  L_HEEL: 29,
  R_HEEL: 30,
};

// Skeleton connections [fromIndex, toIndex]
const CONNECTIONS = [
  [MP.NOSE, MP.L_SHOULDER],
  [MP.NOSE, MP.R_SHOULDER],
  [MP.L_SHOULDER, MP.R_SHOULDER],
  [MP.L_SHOULDER, MP.L_ELBOW],
  [MP.R_SHOULDER, MP.R_ELBOW],
  [MP.L_ELBOW, MP.L_WRIST],
  [MP.R_ELBOW, MP.R_WRIST],
  [MP.L_SHOULDER, MP.L_HIP],
  [MP.R_SHOULDER, MP.R_HIP],
  [MP.L_HIP, MP.R_HIP],
  [MP.L_HIP, MP.L_KNEE],
  [MP.R_HIP, MP.R_KNEE],
  [MP.L_KNEE, MP.L_ANKLE],
  [MP.R_KNEE, MP.R_ANKLE],
  [MP.L_ANKLE, MP.L_HEEL],
  [MP.R_ANKLE, MP.R_HEEL],
];

// Key points to draw dots on
const KEY_POINTS = [
  MP.NOSE, MP.L_SHOULDER, MP.R_SHOULDER,
  MP.L_ELBOW, MP.R_ELBOW,
  MP.L_WRIST, MP.R_WRIST,
  MP.L_HIP, MP.R_HIP,
  MP.L_KNEE, MP.R_KNEE,
  MP.L_ANKLE, MP.R_ANKLE,
];

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';
const MEDIAPIPE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/**
 * 计算三点夹角（度）
 * @param {{x:number,y:number}} a - 顶点
 * @param {{x:number,y:number}} b - 端点1
 * @param {{x:number,y:number}} c - 端点2
 */
function calcAngle(a, b, c) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ac = { x: c.x - a.x, y: c.y - a.y };
  const dot = ab.x * ac.x + ab.y * ac.y;
  const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const magAC = Math.sqrt(ac.x * ac.x + ac.y * ac.y);
  if (magAB === 0 || magAC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magAB * magAC)));
  return Math.acos(cos) * (180 / Math.PI);
}

/**
 * 基于关键点计算深蹲相关角度
 */
function calcSquatAngles(lm) {
  // 左膝角度 (顶点=膝, 端点=髋+踝)
  const leftKneeAngle = calcAngle(lm[MP.L_KNEE], lm[MP.L_HIP], lm[MP.L_ANKLE]);
  // 右膝角度
  const rightKneeAngle = calcAngle(lm[MP.R_KNEE], lm[MP.R_HIP], lm[MP.R_ANKLE]);
  // 左髋角度 (顶点=髋, 端点=肩+膝)
  const leftHipAngle = calcAngle(lm[MP.L_HIP], lm[MP.L_SHOULDER], lm[MP.L_KNEE]);
  // 右髋角度
  const rightHipAngle = calcAngle(lm[MP.R_HIP], lm[MP.R_SHOULDER], lm[MP.R_KNEE]);
  // 躯干倾斜 (shoulder-hip 连线与垂直线的夹角)
  const leftTrunk = calcAngle(
    { x: lm[MP.L_SHOULDER].x, y: lm[MP.L_SHOULDER].y },
    { x: lm[MP.L_SHOULDER].x, y: lm[MP.L_SHOULDER].y - 0.1 },
    { x: lm[MP.L_HIP].x, y: lm[MP.L_HIP].y }
  );
  const rightTrunk = calcAngle(
    { x: lm[MP.R_SHOULDER].x, y: lm[MP.R_SHOULDER].y },
    { x: lm[MP.R_SHOULDER].x, y: lm[MP.R_SHOULDER].y - 0.1 },
    { x: lm[MP.R_HIP].x, y: lm[MP.R_HIP].y }
  );

  return {
    leftKneeAngle: Math.round(leftKneeAngle),
    rightKneeAngle: Math.round(rightKneeAngle),
    leftHipAngle: Math.round(leftHipAngle),
    rightHipAngle: Math.round(rightHipAngle),
    leftTrunk: Math.round(leftTrunk),
    rightTrunk: Math.round(rightTrunk),
    avgKneeAngle: Math.round((leftKneeAngle + rightKneeAngle) / 2),
    avgHipAngle: Math.round((leftHipAngle + rightHipAngle) / 2),
    avgTrunk: Math.round((leftTrunk + rightTrunk) / 2),
  };
}

/**
 * 根据总分返回评级
 */
function getGrade(score) {
  if (score >= 90) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 60) return '一般';
  return '较差';
}

/**
 * 将视频帧序列分割为单个深蹲动作
 * 下蹲：膝角（左右平均）≤ 90°
 * 起身：膝角（左右平均）≥ 150°
 */
function segmentSquatReps(frames, fps, sampleEvery) {
  const reps = [];
  let inRep = false;
  let currentRep = [];

  // 单动作最短时长 0.8 秒，按采样率换算最小帧数
  const sampleInterval = sampleEvery / fps;
  const minFrames = Math.max(2, Math.ceil(0.8 / sampleInterval));

  for (const frame of frames) {
    const kneeAngle = frame.angles.avgKneeAngle;

    if (!inRep) {
      if (kneeAngle <= 90) {
        inRep = true;
        currentRep = [frame];
      }
    } else {
      currentRep.push(frame);
      if (kneeAngle >= 150) {
        if (currentRep.length >= minFrames) {
          reps.push(currentRep);
        }
        inRep = false;
        currentRep = [];
      }
    }
  }

  // 若视频结束时仍处于一个未完成的动作中，视情况丢弃（避免噪声）
  return reps;
}

/**
 * 基于评分标准对单个深蹲动作进行评分
 * @param {Array<{angles,landmarks}>} repFrames - 单个动作的所有帧
 * @returns {{score:number, errors:Array, angles:object}}
 */
function evaluateSquat(repFrames) {
  // 取动作最低点（膝角最小）进行评估
  const bottomFrame = repFrames.reduce((min, frame) =>
    frame.angles.avgKneeAngle < min.angles.avgKneeAngle ? frame : min
  , repFrames[0]);

  const angles = bottomFrame.angles;
  const lm = bottomFrame.landmarks;
  const errors = [];
  let score = 100;

  // 1. 蹲太浅（深度不足）：最低点髋角 > 膝角，即髋部未低于膝盖
  if (angles.avgHipAngle > angles.avgKneeAngle) {
    score -= 15;
    errors.push({
      name: '蹲太浅',
      code: 'insufficientDepth',
      severity: 'medium',
      desc: `下蹲深度不足，髋部未低于膝盖（髋角 ${angles.avgHipAngle}° > 膝角 ${angles.avgKneeAngle}°）`,
      fix: '下蹲至大腿至少与地面平行，髋部略低于膝盖',
    });
  }

  // 2. 膝内扣：膝盖与脚踝横向偏移 > 0.06（归一化坐标）
  const leftDeviation = Math.abs(lm[MP.L_KNEE].x - lm[MP.L_ANKLE].x);
  const rightDeviation = Math.abs(lm[MP.R_KNEE].x - lm[MP.R_ANKLE].x);
  const kneeValgusDeviation = Math.max(leftDeviation, rightDeviation);
  if (kneeValgusDeviation > 0.06) {
    score -= 20;
    errors.push({
      name: '膝内扣',
      code: 'kneeValgus',
      severity: 'high',
      desc: `膝盖与脚踝横向偏移 ${kneeValgusDeviation.toFixed(3)}，超过安全阈值 0.06`,
      fix: '下蹲时膝盖方向与脚尖一致，避免向内塌陷',
    });
  }

  // 3. 重心前移：躯干（肩髋连线）前倾角度 > 25°
  const forwardLeanDeg = 180 - angles.avgTrunk;
  if (forwardLeanDeg > 25) {
    score -= 10;
    errors.push({
      name: '重心前移',
      code: 'forwardLean',
      severity: 'low',
      desc: `躯干前倾约 ${Math.round(forwardLeanDeg)}°，超过 25° 阈值`,
      fix: '收紧核心，保持躯干更直立，重心落在脚掌中部',
    });
  }

  score = Math.max(0, Math.min(100, score));
  return { score, errors, angles };
}

export default function EvaluationPage() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scores, setScores] = useState(null);
  const [detectedErrors, setDetectedErrors] = useState([]);
  const [angles, setAngles] = useState(null);
  const [mpReady, setMpReady] = useState(false);
  const [mpError, setMpError] = useState(null);
  const [currentAngles, setCurrentAngles] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const landmarkerRef = useRef(null);
  const lastTimeRef = useRef(0);
  const wakeLockRef = useRef(null);
  const profileSavedRef = useRef(false);

  // Load MediaPipe PoseLandmarker
  useEffect(() => {
    let cancelled = false;
    async function loadMP() {
      try {
        const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3');
        if (cancelled) return;
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        const landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setMpReady(true);
      } catch (err) {
        if (!cancelled) {
          console.error('MediaPipe load failed:', err);
          setMpError('姿态检测模型加载失败，请检查网络连接后刷新页面');
        }
      }
    }
    loadMP();
    return () => { cancelled = true; };
  }, []);

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setAnalysisDone(false);
      setScores(null);
      setDetectedErrors([]);
      setAngles(null);
      setCurrentAngles(null);
    }
  };

  // Draw skeleton on canvas from detected landmarks
  const drawSkeleton = useCallback((landmarks, videoEl, canvasEl) => {
    const ctx = canvasEl.getContext('2d');

    // Size canvas to match the video's DISPLAY size
    const displayW = videoEl.clientWidth;
    const displayH = videoEl.clientHeight;
    if (displayW === 0 || displayH === 0) return;

    if (canvasEl.width !== displayW || canvasEl.height !== displayH) {
      canvasEl.width = displayW;
      canvasEl.height = displayH;
    }

    ctx.clearRect(0, 0, displayW, displayH);

    const toCanvas = (lm) => ({
      x: lm.x * displayW,
      y: lm.y * displayH,
    });

    const pts = landmarks.map(toCanvas);

    // === Draw body connections (cyan lines) ===
    CONNECTIONS.forEach(([fromIdx, toIdx]) => {
      const from = pts[fromIdx];
      const to = pts[toIdx];
      if (!from || !to) return;
      // Use nullish coalescing: undefined visibility → treat as visible (1)
      const visFrom = landmarks[fromIdx].visibility ?? 1;
      const visTo = landmarks[toIdx].visibility ?? 1;
      if (visFrom < 0.1 || visTo < 0.1) return;

      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    // === Draw face landmarks (pink dots) ===
    const FACE_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    FACE_INDICES.forEach((idx) => {
      const lm = landmarks[idx];
      if (!lm || lm.visibility < 0.1) return;
      const p = pts[idx];
      ctx.fillStyle = '#ff69b4';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // === Draw body joint dots (cyan) ===
    KEY_POINTS.forEach((idx) => {
      const lm = landmarks[idx];
      if (!lm || lm.visibility < 0.1) return;
      const p = pts[idx];

      ctx.fillStyle = '#00d4ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);

  // Real-time skeleton overlay during video playback
  useEffect(() => {
    if (!analysisDone || !canvasRef.current || !videoRef.current || !landmarkerRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    // Size canvas to match video display dimensions
    const resize = () => {
      canvas.width = video.clientWidth || 640;
      canvas.height = video.clientHeight || 480;
    };
    resize();

    const processFrame = () => {
      if (video.paused || video.ended) {
        animRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const now = performance.now();
      if (now - lastTimeRef.current < 100) {
        // Throttle to ~10fps for performance
        animRef.current = requestAnimationFrame(processFrame);
        return;
      }
      lastTimeRef.current = now;

      try {
        const result = landmarker.detectForVideo(video, now);
        if (result.landmarks && result.landmarks[0]) {
          const landmarks = result.landmarks[0];
          drawSkeleton(landmarks, video, canvas);

          // Calculate real-time angles
          const a = calcSquatAngles(landmarks);
          setCurrentAngles(a);
        }
      } catch (e) {
        // Silently skip frames that fail
      }

      animRef.current = requestAnimationFrame(processFrame);
    };

    animRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [analysisDone, drawSkeleton]);

  // 页面卸载时释放屏幕常亮
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!landmarkerRef.current || !videoRef.current) return;

    setAnalyzing(true);
    setProgress(0);
    setAnalysisDone(false);
    profileSavedRef.current = false;

    // 请求屏幕常亮，防止分析过程中熄屏或切换应用
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake lock request failed:', err);
      }
    }

    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const duration = video.duration;
    const fps = 30;
    const totalFrames = Math.floor(duration * fps);
    const sampleEvery = 5; // Sample every 5 frames (~6fps)

    const allFrames = [];

    try {
      for (let frame = 0; frame < totalFrames; frame += sampleEvery) {
        const time = frame / fps;
        if (time > duration) break;

        // Seek to frame
        await new Promise((resolve) => {
          video.currentTime = time;
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          setTimeout(resolve, 2000); // Timeout fallback
        });

        // Wait for frame to render
        await new Promise((r) => setTimeout(r, 150));

        try {
          const result = landmarker.detectForVideo(video, performance.now());
          if (result.landmarks && result.landmarks[0]) {
            const lm = result.landmarks[0];
            const a = calcSquatAngles(lm);
            allFrames.push({ angles: a, landmarks: lm });
          }
        } catch (e) {
          // Skip failed frames
        }

        const p = Math.min(100, ((frame + sampleEvery) / totalFrames) * 100);
        setProgress(p);
      }

      // Evaluate
      if (allFrames.length > 0) {
        // 1. 分割动作
        const repFrameGroups = segmentSquatReps(allFrames, fps, sampleEvery);

        if (repFrameGroups.length > 0) {
          // 2. 逐个动作评分
          const repResults = repFrameGroups.map((repFrames, idx) => {
            const { score, errors, angles } = evaluateSquat(repFrames);
            return {
              index: idx + 1,
              score,
              errors,
              angles,
            };
          });

          // 3. 计算总分与评级
          const averageScore = Math.round(
            repResults.reduce((sum, rep) => sum + rep.score, 0) / repResults.length
          );
          const grade = getGrade(averageScore);

          // 4. 汇总错误（按出现次数排序，供画像训练记录使用）
          const errorCounts = {};
          repResults.forEach((rep) => {
            rep.errors.forEach((err) => {
              errorCounts[err.name] = (errorCounts[err.name] || 0) + 1;
            });
          });
          const summaryErrors = Object.entries(errorCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({
              name,
              count,
              // 取该错误第一次出现的完整描述
              ...repResults.find((rep) =>
                rep.errors.some((e) => e.name === name)
              ).errors.find((e) => e.name === name),
            }));

          setScores({
            overall: averageScore,
            repCount: repResults.length,
            grade,
            reps: repResults,
          });
          setDetectedErrors(summaryErrors);
          setAngles(repResults[0].angles);
        } else {
          // 未检测到完整动作：尝试以最低点单帧评估作为兜底
          const bottomFrame = allFrames.reduce((min, frame) =>
            frame.angles.avgKneeAngle < min.angles.avgKneeAngle ? frame : min
          , allFrames[0]);
          const singleRep = [bottomFrame];
          const { score, errors, angles } = evaluateSquat(singleRep);

          setScores({
            overall: score,
            repCount: 0,
            grade: getGrade(score),
            reps: [{ index: 1, score, errors, angles }],
          });
          setDetectedErrors(errors);
          setAngles(angles);
        }
      } else {
        // Fallback if no frames detected
        setScores({ overall: 0, repCount: 0, grade: '较差', reps: [] });
        setDetectedErrors([{ name: '未检测到人体', severity: 'high', desc: '视频中未检测到清晰的人体姿态，请确保人物在画面中央且光线充足', fix: '重新录制视频，确保全身可见' }]);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setScores({ overall: 0, repCount: 0, grade: '较差', reps: [] });
      setDetectedErrors([{ name: '分析失败', severity: 'high', desc: err.message, fix: '请检查视频格式后重试' }]);
    }

    setProgress(100);
    setAnalyzing(false);
    setAnalysisDone(true);

    // 释放屏幕常亮
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  // Auto-analyze when video is uploaded and model is ready
  useEffect(() => {
    if (videoUrl && mpReady && !analyzing && !analysisDone) {
      const timer = setTimeout(() => {
        if (videoRef.current && landmarkerRef.current) {
          handleAnalyze();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [videoUrl, mpReady, analyzing, analysisDone, handleAnalyze]);

  // 分析完成后，将本次训练数据存入用户画像（对接 receive_algorithm_json）
  useEffect(() => {
    if (!analysisDone || !scores || !scores.reps || scores.reps.length === 0) return;
    // 防止重复触发导致同一份评估被多次写入训练记录
    if (profileSavedRef.current) return;
    profileSavedRef.current = true;

    // 逐动作明细：评分 & 错误名称数组（用于正确率 & 反复毛病精准统计）
    const perRepScores = scores.reps.map((r) => r.score);
    const perRepErrors = scores.reps.map((r) =>
      Array.isArray(r.errors) ? r.errors.map((e) => e.name) : []
    );
    // 正确率：评分 >= 90 视为标准动作
    const totalReps = perRepScores.length;
    const correctReps = perRepScores.filter((s) => s >= 90).length;
    const correctnessRate = totalReps > 0 ? Math.round((correctReps / totalReps) * 100) : 0;

    const userId = getOrCreateUserId();
    initUser(userId, '运动用户');
    receiveAlgorithmJson(userId, {
      action_type: '深蹲',
      date: new Date().toISOString().slice(0, 10),
      sets: 1,
      reps: scores.repCount,
      score: scores.overall,
      errors: detectedErrors.map((e) => e.name),
      duration_sec: videoRef.current?.duration ? Math.round(videoRef.current.duration) : 0,
      // 新增：正确率（做了多少，对了多少）
      total_reps: totalReps,
      correct_reps: correctReps,
      correctness_rate: correctnessRate,
      // 新增：逐动作明细（精准统计反复犯的动作毛病）
      per_rep_scores: perRepScores,
      per_rep_errors: perRepErrors,
    });
  }, [analysisDone, scores, detectedErrors]);

  const getScoreColor = (score) => {
    if (score >= 90) return '#00d4ff';
    if (score >= 75) return '#3cb44b';
    if (score >= 60) return '#ffa502';
    return '#ff4757';
  };

  const getGradeColor = (grade) => {
    if (grade === '优秀') return '#00d4ff';
    if (grade === '良好') return '#3cb44b';
    if (grade === '一般') return '#ffa502';
    return '#ff4757';
  };

  const getSeverityColor = (sev) => {
    if (sev === 'high') return '#ff4757';
    if (sev === 'medium') return '#ffa502';
    return '#00d4ff';
  };

  return (
    <PageLayout
      title="动作评估"
      subtitle="上传运动视频，MediaPipe 33 关键点逐帧检测，真实骨架叠加 + 角度评分"
    >
      <div className="eval-page">
        {/* Upload Section */}
        <div className="eval-page__upload-section">
          {!videoUrl ? (
            <label className="eval-page__dropzone">
              <input
                type="file"
                accept="video/*"
                onChange={handleUpload}
                className="eval-page__file-input"
              />
              <div className="eval-page__dropzone-content">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="4" y="4" width="40" height="40" rx="10" stroke="var(--border-color)" strokeWidth="2" strokeDasharray="6 4" />
                  <path d="M24 16v12M18 22l6 6 6-6" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="eval-page__dropzone-title">点击或拖拽上传视频</p>
                <p className="eval-page__dropzone-desc">支持 MP4 / MOV / WebM，最大 100MB</p>
              </div>
            </label>
          ) : (
            <div className="eval-page__video-container">
              <div className="eval-page__video-wrapper">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="eval-page__video"
                  onLoadedMetadata={() => {
                    if (canvasRef.current) {
                      canvasRef.current.width = videoRef.current.videoWidth;
                      canvasRef.current.height = videoRef.current.videoHeight;
                    }
                  }}
                />
                {analysisDone && (
                  <canvas ref={canvasRef} className="eval-page__skeleton-overlay" />
                )}
              </div>

              {/* Real-time pose status */}
              {analysisDone && currentAngles && (
                <div className="eval-page__live-angles">
                  <span className="eval-page__pose-status">
                    {currentAngles.avgKneeAngle > 150 ? '🧍 站立' :
                     currentAngles.avgKneeAngle > 110 ? '⬇️ 下蹲中' :
                     currentAngles.avgKneeAngle > 60 ? '🏋️ 蹲底' : '⚠️ 过深'}
                  </span>
                </div>
              )}

              <div className="eval-page__video-controls">
                <label className="eval-page__btn eval-page__btn--secondary">
                  更换视频
                  <input type="file" accept="video/*" onChange={handleUpload} className="eval-page__file-input" />
                </label>
                {!mpReady && !mpError && (
                  <button className="eval-page__btn eval-page__btn--primary" disabled>
                    加载模型中...
                  </button>
                )}
                {mpError && (
                  <span className="eval-page__error-msg">{mpError}</span>
                )}
                {mpReady && !analyzing && !analysisDone && (
                  <span className="eval-page__auto-hint">上传后自动分析</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        {analyzing && (
          <div className="eval-page__progress">
            <div className="eval-page__progress-bar">
              <div className="eval-page__progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="eval-page__progress-text">
              正在逐帧检测姿态... {Math.floor(progress)}%
            </p>
            <p className="eval-page__progress-hint">
              正在进行分析，请保持屏幕点亮，不要切换软件
            </p>
            <div className="eval-page__progress-steps">
              {['姿态提取', '骨架重建', '错误检测', '综合评分'].map((step, i) => (
                <span
                  key={step}
                  className={`eval-page__step ${progress > (i + 1) * 25 ? 'eval-page__step--done' : ''}`}
                >
                  {step}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {analysisDone && scores && (
          <div className="eval-page__results">
            {/* Angle Details - real-time during playback */}
            {(currentAngles || angles) && (
              <div className="eval-page__angles">
                <h3 className="eval-page__section-title">
                  关节角度
                  {currentAngles && <span className="eval-page__live-tag">实时</span>}
                </h3>
                <div className="eval-page__angle-grid">
                  {(() => {
                    const a = currentAngles || angles;
                    return (<>
                      <div className="eval-page__angle-card">
                        <span className="eval-page__angle-label">左膝角度</span>
                        <span className="eval-page__angle-value">{a.leftKneeAngle}°</span>
                      </div>
                      <div className="eval-page__angle-card">
                        <span className="eval-page__angle-label">右膝角度</span>
                        <span className="eval-page__angle-value">{a.rightKneeAngle}°</span>
                      </div>
                      <div className="eval-page__angle-card">
                        <span className="eval-page__angle-label">左髋角度</span>
                        <span className="eval-page__angle-value">{a.leftHipAngle}°</span>
                      </div>
                      <div className="eval-page__angle-card">
                        <span className="eval-page__angle-label">右髋角度</span>
                        <span className="eval-page__angle-value">{a.rightHipAngle}°</span>
                      </div>
                      <div className="eval-page__angle-card">
                        <span className="eval-page__angle-label">躯干前倾</span>
                        <span className="eval-page__angle-value">{a.avgTrunk}°</span>
                      </div>
                    </>);
                  })()}
                </div>
              </div>
            )}

            {/* Score Overview */}
            <div className="eval-page__scores">
              <div className="eval-page__overall-score">
                <div className="eval-page__score-circle">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="60" fill="none" stroke="var(--border-color)" strokeWidth="8" />
                    <circle
                      cx="70" cy="70" r="60"
                      fill="none"
                      stroke={getScoreColor(scores.overall)}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(scores.overall / 100) * 377} 377`}
                      transform="rotate(-90 70 70)"
                      className="eval-page__score-ring"
                    />
                    <text x="70" y="62" textAnchor="middle" fill={getScoreColor(scores.overall)} fontSize="36" fontWeight="800">
                      {scores.overall}
                    </text>
                    <text x="70" y="82" textAnchor="middle" fill="var(--text-muted)" fontSize="12">
                      综合评分
                    </text>
                  </svg>
                </div>
                <div
                  className="eval-page__grade-badge"
                  style={{ background: getGradeColor(scores.grade), color: '#06060e' }}
                >
                  {scores.grade}
                </div>
                <p className="eval-page__rep-count">
                  共检测到 <strong>{scores.repCount}</strong> 个有效动作
                </p>
              </div>

              <div className="eval-page__score-details">
                <h4 className="eval-page__rep-list-title">各动作得分</h4>
                <div className="eval-page__rep-list">
                  {scores.reps.map((rep) => (
                    <div key={rep.index} className="eval-page__rep-item">
                      <div className="eval-page__rep-item-header">
                        <span className="eval-page__rep-index">动作 {rep.index}</span>
                        <span className="eval-page__rep-score" style={{ color: getScoreColor(rep.score) }}>
                          {rep.score}
                        </span>
                      </div>
                      {rep.errors.length > 0 ? (
                        <div className="eval-page__rep-errors">
                          {rep.errors.map((err) => (
                            <span key={err.code} className="eval-page__rep-error-tag" style={{ color: getSeverityColor(err.severity) }}>
                              {err.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="eval-page__rep-no-error">动作标准</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Detected Errors */}
            <div className="eval-page__errors">
              <h3 className="eval-page__section-title">检测到的问题</h3>
              {detectedErrors.length === 0 ? (
                <div className="eval-page__no-errors">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="16" stroke="#00d4ff" strokeWidth="2" />
                    <path d="M13 20l5 5 9-9" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p>动作标准，未检测到明显问题！</p>
                </div>
              ) : (
                <div className="eval-page__error-list">
                  {detectedErrors.map((err) => (
                    <div key={err.name} className="eval-page__error-card">
                      <div className="eval-page__error-header">
                        <span
                          className="eval-page__error-severity"
                          style={{ background: getSeverityColor(err.severity) }}
                        />
                        <h4 className="eval-page__error-name">
                        {err.name}
                        {err.count > 1 && <span className="eval-page__error-count">×{err.count}</span>}
                      </h4>
                      <span className="eval-page__error-level">
                        {err.severity === 'high' ? '严重' : err.severity === 'medium' ? '中等' : '轻微'}
                      </span>
                      </div>
                      <p className="eval-page__error-desc">{err.desc}</p>
                      <div className="eval-page__error-fix">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M7 1v12M1 7h12" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <span>{err.fix}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scoring explanation */}
            <div className="eval-page__scoring-note">
              <p>评分标准：单动作满分 100 分，按命中错误逐项扣分，整段视频总分为所有动作的平均分</p>
              <p>蹲太浅（髋角 &gt; 膝角）：扣 15 分 | 膝内扣（膝踝横向偏移 &gt; 0.06）：扣 20 分 | 重心前移（躯干前倾 &gt; 25°）：扣 10 分</p>
              <p>评级：90~100 优秀 | 75~89 良好 | 60~74 一般 | 0~59 较差</p>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
