/**
 * 统一入口：方便前端通过一个文件引入全部模块。
 *
 * 浏览器用法（script 标签按顺序引入后，或打包器 import）：
 *   import {
 *     extractPose,
 *     calculateAngles,
 *     countReps,
 *     drawSkeleton,
 *     createBodyMuscles,
 *     evaluationSchema,
 *   } from "./index.js";
 *
 * 也可单独引入某个模块文件。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.PoseTools = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const extractPose = require("./pose-extractor.js");
  const calculateAngles = require("./angle-calculator.js");
  const countReps = require("./rep-counter.js");
  const drawSkeleton = require("./skeleton-renderer.js");
  const createBodyMuscles = require("./body-muscles.js");
  const evaluationSchema = require("./evaluation-schema.js");

  return {
    extractPose,
    calculateAngles,
    countReps,
    drawSkeleton,
    createBodyMuscles,
    getMuscleMetadata: createBodyMuscles.getMuscleMetadata,
    evaluationSchema,
  };
});
