import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { getOrCreateUserId, initUser, receiveAlgorithmJson } from '../utils/userProfile';
import { addTrainRecord } from '../utils/profileApi';
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

// 甲交付的 UMD 模块由 index.html 在 React 启动前加载，统一作为评估页唯一算法来源。
const ALGORITHM_RUNTIME = typeof globalThis === 'undefined' ? {} : globalThis;
const calculateAngles = ALGORITHM_RUNTIME.AngleCalculator;
const countReps = ALGORITHM_RUNTIME.RepCounter;
const drawAlgorithmSkeleton = ALGORITHM_RUNTIME.drawSkeleton;
const evaluationSchema = ALGORITHM_RUNTIME.EvaluationSchema;

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';
const MEDIAPIPE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

function averageAngle(...values) {
  const valid = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

// 甲的角度模块不负责躯干前倾这个可选输入，这里只把关键点几何量适配给 RepCounter。
function calculateTorsoLean(landmarks) {
  const sides = [[MP.L_SHOULDER, MP.L_HIP], [MP.R_SHOULDER, MP.R_HIP]];
  const leanValues = sides.map(([shoulderIndex, hipIndex]) => {
    const shoulder = landmarks[shoulderIndex];
    const hip = landmarks[hipIndex];
    if (!shoulder || !hip || (shoulder.visibility ?? 1) < 0.3 || (hip.visibility ?? 1) < 0.3) return null;
    return Math.abs(Math.atan2(hip.x - shoulder.x, hip.y - shoulder.y) * (180 / Math.PI));
  });
  return averageAngle(...leanValues);
}

function toDisplayAngles(rawAngles, landmarks) {
  const torsoLean = calculateTorsoLean(landmarks);
  const avgKneeAngle = averageAngle(rawAngles.leftKnee, rawAngles.rightKnee);
  const avgHipAngle = averageAngle(rawAngles.leftHip, rawAngles.rightHip);
  const avgTrunk = torsoLean === null ? null : 180 - torsoLean;
  return {
    ...rawAngles,
    leftKneeAngle: rawAngles.leftKnee === null ? null : Math.round(rawAngles.leftKnee),
    rightKneeAngle: rawAngles.rightKnee === null ? null : Math.round(rawAngles.rightKnee),
    leftHipAngle: rawAngles.leftHip === null ? null : Math.round(rawAngles.leftHip),
    rightHipAngle: rawAngles.rightHip === null ? null : Math.round(rawAngles.rightHip),
    avgKneeAngle: avgKneeAngle === null ? null : Math.round(avgKneeAngle),
    avgHipAngle: avgHipAngle === null ? null : Math.round(avgHipAngle),
    avgTrunk: avgTrunk === null ? null : Math.round(avgTrunk),
    torsoLean,
  };
}

function visibleMidpointY(landmarks, firstIndex, secondIndex) {
  const first = landmarks[firstIndex];
  const second = landmarks[secondIndex];
  if (!first || !second || (first.visibility ?? 1) < 0.3 || (second.visibility ?? 1) < 0.3) return null;
  return (first.y + second.y) / 2;
}

/**
 * 正面录制时，膝关节屈伸主要发生在镜头深度方向，2D/弱深度关键点有时不会
 * 形成足够的膝角变化，导致甲的完整下—上循环无法被识别。
 *
 * 这个适配器只在标准膝角未检测到动作时启用：以“髋部相对肩/踝的下沉幅度”
 * 映射成同一套膝角输入，再交给甲的 RepCounter 继续完成计数、评分和错误检测。
 */
function createFrontViewAngleSeries(samples) {
  const movementSamples = samples.map((sample) => {
    const shoulderY = visibleMidpointY(sample.landmarks, MP.L_SHOULDER, MP.R_SHOULDER);
    const hipY = visibleMidpointY(sample.landmarks, MP.L_HIP, MP.R_HIP);
    const kneeY = visibleMidpointY(sample.landmarks, MP.L_KNEE, MP.R_KNEE);
    const ankleY = visibleMidpointY(sample.landmarks, MP.L_ANKLE, MP.R_ANKLE);
    const bodyHeight = shoulderY === null
      ? 0
      : (ankleY !== null ? ankleY - shoulderY : (hipY !== null ? (hipY - shoulderY) * 2.5 : 0));
    const kneeWidth = Math.abs((sample.landmarks[MP.L_KNEE]?.x ?? NaN) - (sample.landmarks[MP.R_KNEE]?.x ?? NaN));
    const ankleWidth = Math.abs((sample.landmarks[MP.L_ANKLE]?.x ?? NaN) - (sample.landmarks[MP.R_ANKLE]?.x ?? NaN));

    if (bodyHeight <= 0.08 || hipY === null || kneeY === null) {
      return {
        sample,
        hipDrop: null,
        kneeDrop: null,
        kneeSpread: null,
        angleDepth: typeof sample.angles.avgHipAngle === 'number' ? sample.angles.avgHipAngle : sample.angles.avgKneeAngle,
      };
    }
    return {
      sample,
      // 正面深蹲的蹲底特征：髋、膝在画面中更低，双膝相对脚踝更外展。
      hipDrop: (hipY - shoulderY) / bodyHeight,
      kneeDrop: (kneeY - shoulderY) / bodyHeight,
      kneeSpread: Number.isFinite(kneeWidth) && ankleWidth > 0.001 ? kneeWidth / ankleWidth : null,
      angleDepth: typeof sample.angles.avgHipAngle === 'number' ? sample.angles.avgHipAngle : sample.angles.avgKneeAngle,
    };
  }).filter((item) => typeof item.angleDepth === 'number' && Number.isFinite(item.angleDepth));

  if (movementSamples.length < 4) return null;
  const normalize = (key) => {
    const values = movementSamples
      .map((item) => item[key])
      .filter((value) => typeof value === 'number' && Number.isFinite(value));
    if (!values.length) return { min: 0, range: 0 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { min, range: max - min };
  };
  const hip = normalize('hipDrop');
  const knee = normalize('kneeDrop');
  const spread = normalize('kneeSpread');
  const depthValues = movementSamples.map((item) => item.angleDepth);
  const depthMin = Math.min(...depthValues);
  const depthRange = Math.max(...depthValues) - depthMin;
  const hasMeaningfulMovement = hip.range >= 0.025 || knee.range >= 0.025 || spread.range >= 0.04 || depthRange >= 10;
  if (!hasMeaningfulMovement) return null;

  return samples.map((sample) => {
    const matched = movementSamples.find((item) => item.sample === sample);
    if (!matched) return { ...sample.angles };
    const components = [];
    if (hip.range >= 0.025 && typeof matched.hipDrop === 'number') components.push((matched.hipDrop - hip.min) / hip.range);
    if (knee.range >= 0.025 && typeof matched.kneeDrop === 'number') components.push((matched.kneeDrop - knee.min) / knee.range);
    if (spread.range >= 0.04 && typeof matched.kneeSpread === 'number') components.push((matched.kneeSpread - spread.min) / spread.range);
    if (depthRange >= 10) components.push((matched.angleDepth - depthMin) / depthRange);
    const squatPhase = components.reduce((sum, value) => sum + value, 0) / components.length;
    // 站立（phase=0）→ 168°；蹲底（phase=1）→ 78°，再交由甲 RepCounter 计数。
    const calibratedKnee = 168 - squatPhase * 90;
    return {
      ...sample.angles,
      leftKnee: calibratedKnee,
      rightKnee: calibratedKnee,
    };
  });
}

function addStandingBoundaries(series) {
  if (!Array.isArray(series) || series.length < 2) return series;
  const kneeValues = series
    .flatMap((sample) => [sample.leftKnee, sample.rightKnee])
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!kneeValues.length || Math.min(...kneeValues) > 100) return series;

  const first = series[0];
  const last = series[series.length - 1];
  const interval = series.length > 1
    ? Math.max(1, (series[series.length - 1].timestampMs || 0) - (series[series.length - 2].timestampMs || 0))
    : 167;
  const makeStanding = (sample, frame, timestampMs) => ({
    ...sample,
    frame,
    timestampMs,
    leftKnee: 170,
    rightKnee: 170,
  });

  const bounded = [...series];
  if ((first.leftKnee ?? 170) < 150 || (first.rightKnee ?? 170) < 150) {
    bounded.unshift(makeStanding(first, (first.frame ?? 0) - 1, (first.timestampMs ?? 0) - interval));
  }
  const tail = bounded[bounded.length - 1];
  if ((tail.leftKnee ?? 170) < 150 || (tail.rightKnee ?? 170) < 150) {
    bounded.push(makeStanding(tail, (tail.frame ?? 0) + 1, (tail.timestampMs ?? 0) + interval));
  }
  return bounded;
}

const ERROR_PRESENTATION = {
  insufficientDepth: { name: '蹲太浅', severity: 'medium', fix: '下蹲至大腿至少与地面平行，髋部略低于膝盖' },
  kneeValgus: { name: '膝内扣', severity: 'high', fix: '下蹲时膝盖方向与脚尖一致，避免向内塌陷' },
  forwardLean: { name: '重心前移', severity: 'low', fix: '收紧核心，保持躯干更直立，重心落在脚掌中部' },
};

function formatAlgorithmError(error) {
  const meta = ERROR_PRESENTATION[error.code] || {};
  return {
    ...error,
    name: meta.name || evaluationSchema?.ERROR_CODE_TO_NAME?.[error.code] || error.code,
    severity: meta.severity || 'medium',
    desc: error.message || '检测到动作问题',
    fix: meta.fix || '请根据动作提示调整姿势',
  };
}

export default function EvaluationPage() {
  const navigate = useNavigate();
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
  const [showDetails, setShowDetails] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [profileSyncStatus, setProfileSyncStatus] = useState(null);
  const videoRef = useRef(null);
  const uploadInputRef = useRef(null);
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
    if (!file) return;
    if (file.type !== 'video/mp4' && !file.name.toLowerCase().endsWith('.mp4')) {
      setUploadError('请上传 MP4 格式的视频文件。');
      e.target.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('视频文件不能超过 50MB，请压缩后重新上传。');
      e.target.value = '';
      return;
    }
    setUploadError(null);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
      setAnalysisDone(false);
      setScores(null);
      setDetectedErrors([]);
      setAngles(null);
      setCurrentAngles(null);
      setShowDetails(false);
  };

  // Draw skeleton on canvas from detected landmarks
  const drawSkeleton = useCallback((landmarks, videoEl, canvasEl) => {
    // Size canvas to match the video's DISPLAY size
    const displayW = videoEl.clientWidth;
    const displayH = videoEl.clientHeight;
    if (displayW === 0 || displayH === 0) return;

    if (canvasEl.width !== displayW || canvasEl.height !== displayH) {
      canvasEl.width = displayW;
      canvasEl.height = displayH;
    }
    if (typeof drawAlgorithmSkeleton !== 'function') return;
    drawAlgorithmSkeleton(canvasEl, landmarks, undefined, {
      boneColor: '#00d4ff',
      landmarkColor: '#00d4ff',
      boneWidth: 2.5,
      landmarkRadius: 4,
      visibilityThreshold: 0.1,
      showFace: true,
      coordinateMode: 'normalized',
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
          const rawAngles = calculateAngles(landmarks);
          const a = toDisplayAngles(rawAngles, landmarks);
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
            if (typeof calculateAngles !== 'function') {
              throw new Error('甲算法模块未加载，请刷新页面后重试');
            }
            const rawAngles = calculateAngles(lm);
            const displayAngles = toDisplayAngles(rawAngles, lm);
            allFrames.push({
              frame,
              timestampMs: Math.round(time * 1000),
              angles: displayAngles,
              landmarks: lm,
            });
          }
        } catch (e) {
          // Skip failed frames
        }

        const p = Math.min(100, ((frame + sampleEvery) / totalFrames) * 100);
        setProgress(p);
      }

      if (allFrames.length > 0) {
        if (typeof countReps !== 'function') {
          throw new Error('甲动作计数模块未加载，请刷新页面后重试');
        }

        // 甲的 countReps 接收逐帧角度序列；把页面专用的躯干倾角作为可选字段传入。
        const angleSeries = allFrames.map(({ frame, timestampMs, angles: frameAngles }) => ({
          frame,
          timestampMs,
          ...frameAngles,
        }));
        let algorithmResult = countReps(angleSeries);
        let analysisView = 'standard';

        // 仅当标准膝角没有识别到完整动作时，尝试正面视角适配。
        if (algorithmResult.totalReps === 0) {
          const frontViewAngles = createFrontViewAngleSeries(allFrames);
          if (frontViewAngles) {
            const frontViewSeries = frontViewAngles.map((frameAngles, index) => ({
              frame: allFrames[index].frame,
              timestampMs: allFrames[index].timestampMs,
              ...frameAngles,
            }));
            const frontViewResult = countReps(frontViewSeries);
            if (frontViewResult.totalReps > 0) {
              algorithmResult = frontViewResult;
              analysisView = 'front-adapted';
            } else {
              const boundedFrontResult = countReps(addStandingBoundaries(frontViewSeries));
              if (boundedFrontResult.totalReps > 0) {
                algorithmResult = boundedFrontResult;
                analysisView = 'front-boundary-adapted';
              }
            }
          }
        }
        // 侧面视频也可能从蹲底开始或在蹲底结束，补入虚拟站立边界后重试。
        if (algorithmResult.totalReps === 0) {
          const boundedResult = countReps(addStandingBoundaries(angleSeries));
          if (boundedResult.totalReps > 0) {
            algorithmResult = boundedResult;
            analysisView = 'boundary-adapted';
          }
        }
        if (algorithmResult.totalReps === 0) {
          setScores({
            overall: 0,
            repCount: 0,
            grade: '较差',
            reps: [],
            algorithmResult,
            analysisView,
          });
          setDetectedErrors([{
            name: '未完成动作',
            severity: 'medium',
            desc: '已检测到人体姿态，但视频中没有形成完整的下蹲—起身循环',
            fix: '请确保视频包含完整站立、下蹲和起身过程，并让全身关键点保持可见',
          }]);
          setAngles(allFrames[allFrames.length - 1].angles);
        } else {
          const repResults = algorithmResult.reps.map((rep) => {
          const repFrames = allFrames.filter((sample) =>
            sample.frame >= rep.startFrame && sample.frame <= rep.endFrame
          );
          const bottomFrame = repFrames.reduce((bottom, sample) => {
            if (!bottom || (sample.angles.avgKneeAngle ?? Infinity) < (bottom.angles.avgKneeAngle ?? Infinity)) return sample;
            return bottom;
          }, null);
          return {
            index: rep.repNumber,
            score: rep.score,
            errors: rep.errors.map(formatAlgorithmError),
            angles: bottomFrame?.angles || repFrames[0]?.angles || null,
            startFrame: rep.startFrame,
            endFrame: rep.endFrame,
          };
          });

          const summaryErrors = [];
          repResults.forEach((rep) => rep.errors.forEach((error) => {
            const existing = summaryErrors.find((item) => item.name === error.name);
            if (existing) existing.count += 1;
            else summaryErrors.push({ ...error, count: 1 });
          }));
          summaryErrors.sort((a, b) => b.count - a.count);

          setScores({
            overall: algorithmResult.summary.averageScore,
            repCount: algorithmResult.totalReps,
            grade: algorithmResult.summary.grade,
            reps: repResults,
            algorithmResult,
            analysisView,
          });
          setDetectedErrors(summaryErrors);
          setAngles(repResults[0]?.angles || allFrames[0].angles);
        }
      } else {
        // 姿态存在但没有形成完整动作时，显示明确的未完成状态。
        setScores({ overall: 0, repCount: 0, grade: '较差', reps: [] });
        setDetectedErrors([{ name: '未完成动作', severity: 'medium', desc: '已检测到人体姿态，但视频中没有形成完整的下蹲—起身循环', fix: '请录制包含完整站立、下蹲和起身过程的视频' }]);
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

    const algorithmResult = scores.algorithmResult || {
      totalReps,
      reps: scores.reps.map((rep) => ({
        repNumber: rep.index,
        score: rep.score,
        errors: rep.errors,
      })),
      summary: {
        totalReps,
        averageScore: scores.overall,
        grade: scores.grade,
      },
    };
    const evaluation = evaluationSchema?.buildEvaluationResult
      ? evaluationSchema.buildEvaluationResult({
        repCount: algorithmResult,
        videoInfo: {
          fileName: videoFile?.name || '',
          durationSec: videoRef.current?.duration || 0,
          width: videoRef.current?.videoWidth || 0,
          height: videoRef.current?.videoHeight || 0,
          fps: 30,
        },
        actionCode: 'squat',
        sets: 1,
      })
      : null;

    const userId = getOrCreateUserId();
    initUser(userId, '运动用户');
    receiveAlgorithmJson(userId, {
      action_type: evaluation?.action_type || '深蹲',
      date: evaluation?.date || new Date().toISOString().slice(0, 10),
      sets: evaluation?.sets ?? 1,
      reps: evaluation?.reps ?? scores.repCount,
      score: evaluation?.score ?? scores.overall,
      errors: evaluation?.errors || detectedErrors.map((e) => e.name),
      duration_sec: evaluation?.duration ?? (videoRef.current?.duration ? Math.round(videoRef.current.duration) : 0),
      // 新增：正确率（做了多少，对了多少）
      total_reps: totalReps,
      correct_reps: correctReps,
      correctness_rate: correctnessRate,
      // 新增：逐动作明细（精准统计反复犯的动作毛病）
      per_rep_scores: perRepScores,
      per_rep_errors: perRepErrors,
    });
    addTrainRecord(userId, {
      action_type: evaluation?.action_type || '深蹲',
      date: evaluation?.date || new Date().toISOString().slice(0, 10),
      sets: evaluation?.sets ?? 1,
      reps: evaluation?.reps ?? scores.repCount,
      score: evaluation?.score ?? scores.overall,
      errors: evaluation?.errors || detectedErrors.map((e) => e.name),
      duration_sec: evaluation?.duration ?? (videoRef.current?.duration ? Math.round(videoRef.current.duration) : 0),
      total_reps: totalReps,
      correct_reps: correctReps,
      correctness_rate: correctnessRate,
      per_rep_scores: perRepScores,
      per_rep_errors: perRepErrors,
    }).then(() => setProfileSyncStatus('本次训练记录已同步到运动画像'))
      .catch(() => setProfileSyncStatus('本地记录已保存，画像服务暂时未连接'));
  }, [analysisDone, scores, detectedErrors, videoFile]);

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
        {profileSyncStatus && (
          <div className="eval-page__profile-sync" role="status" aria-live="polite">
            {profileSyncStatus}
          </div>
        )}
        {/* Upload Section */}
        <div className="eval-page__upload-section">
          {!videoUrl ? (
            <label className="eval-page__dropzone">
              <input
                ref={uploadInputRef}
                type="file"
                accept="video/mp4,.mp4"
                onChange={handleUpload}
                className="eval-page__file-input"
              />
              <div className="eval-page__dropzone-content">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="4" y="4" width="40" height="40" rx="10" stroke="var(--border-color)" strokeWidth="2" strokeDasharray="6 4" />
                  <path d="M24 16v12M18 22l6 6 6-6" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h2 className="eval-page__upload-title">上传动作视频</h2>
                <p className="eval-page__dropzone-desc">支持正面 / 45° 角拍摄，建议全身入镜，视频时长 5-30 秒</p>
                <span className="eval-page__upload-cta">选择视频文件</span>
                <p className="eval-page__upload-format">支持 MP4 格式，文件大小不超过 50MB</p>
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
                  onLoadedMetadata={(event) => {
                    const duration = event.currentTarget.duration;
                    if (duration < 5 || duration > 30) {
                      setUploadError('建议上传 5-30 秒的视频，以获得更稳定的评估结果。');
                    }
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
                <button className="eval-page__btn eval-page__btn--secondary" onClick={() => uploadInputRef.current?.click()}>
                  重新上传
                </button>
                <input ref={uploadInputRef} type="file" accept="video/mp4,.mp4" onChange={handleUpload} className="eval-page__file-input" />
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
          {uploadError && <p className="eval-page__upload-error" role="alert">{uploadError}</p>}
        </div>

        <aside className="eval-page__recording-notes" aria-labelledby="recording-notes-title">
          <div className="eval-page__recording-notes-heading">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 8v4l2.5 1.5M10.3 3.6l-5.8 10A5 5 0 0 0 8.8 21h6.4a5 5 0 0 0 4.3-7.4l-5.8-10a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 id="recording-notes-title">拍摄注意事项</h2>
          </div>
          <ul className="eval-page__recording-notes-list">
            <li><strong>完整做完每一次</strong><span>每次下蹲后请站直、停稳，再开始下一次动作。</span></li>
            <li><strong>侧前方拍摄更准确</strong><span>机位建议放在身体侧前方 45°~90°，便于识别髋、膝、踝的活动轨迹。</span></li>
            <li><strong>全身始终入镜</strong><span>从头部到双脚都要清晰可见，避免脚踝、膝盖被画面边缘遮挡。</span></li>
            <li><strong>单人出镜拍摄</strong><span>画面里只能有被评估者一人；多人同框、背景过乱都会造成骨架识别错误，干扰评分准确性。</span></li>
            <li><strong>固定机位与光线</strong><span>手机保持稳定，光线均匀；避免逆光、快速移动镜头和多人同时入镜。</span></li>
          </ul>
        </aside>

        {/* Progress */}
        {analyzing && (
          <div className="eval-page__progress">
            <h2 className="eval-page__progress-title">正在分析你的动作</h2>
            <div className="eval-page__progress-bar">
              <div className="eval-page__progress-fill" style={{ transform: `scaleX(${progress / 100})` }} />
            </div>
            <p className="eval-page__progress-text">
              正在提取关键点・计算关节角度・生成评估结果 {Math.floor(progress)}%
            </p>
            <p className="eval-page__progress-hint">
              分析过程约需 10-20 秒，请耐心等待
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
            <div className="eval-page__result-header">
              <div>
                <h2>评估完成</h2>
                <p>已完成本段深蹲动作的识别与评分。</p>
              </div>
              <button
                className="eval-page__btn eval-page__btn--secondary"
                onClick={() => setShowDetails((visible) => !visible)}
                aria-expanded={showDetails}
              >
                {showDetails ? '收起详细分析' : '查看详细分析'}
              </button>
            </div>

            {/* Angle Details - real-time during playback */}
            {showDetails && (currentAngles || angles) && (
              <div className="eval-page__angles">
                <h3 className="eval-page__section-title">
                  关键角度数据
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
                      综合得分
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
                <h3 className="eval-page__rep-list-title">综合得分</h3>
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
                      <h4 className="eval-page__error-subtitle">问题解读</h4>
                      <p className="eval-page__error-desc">{err.desc}</p>
                      <div className="eval-page__error-fix">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M7 1v12M1 7h12" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <div><strong>改进建议</strong><span>{err.fix}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="eval-page__result-actions">
              <button className="eval-page__btn eval-page__btn--secondary" onClick={() => uploadInputRef.current?.click()}>
                重新上传
              </button>
              <button className="eval-page__btn eval-page__btn--primary" onClick={() => navigate('/chat')}>
                咨询 AI 教练
              </button>
              <button className="eval-page__btn eval-page__btn--secondary" onClick={() => navigate('/profile')}>
                保存本次记录
              </button>
            </div>

            {/* Scoring explanation */}
            <div className="eval-page__scoring-note">
              <p>评分标准：单动作满分 100 分，按命中错误逐项扣分，整段视频总分为所有动作的平均分</p>
              <p>蹲太浅（最低点髋角 &gt; 膝角）：扣 15 分 | 膝内扣（膝踝横向偏移 &gt; 0.06）：扣 20 分 | 重心前移（躯干前倾 &gt; 25°）：扣 10 分</p>
              <p>评级：90~100 优秀 | 75~89 良好 | 60~74 一般 | 0~59 较差</p>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
