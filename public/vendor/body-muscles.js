/**
 * body-muscles.js
 * ------------------------------------------------------------------
 * 需求方：肌肉图谱页（SVG 热区 + 元数据）
 * 死线：8/7（硬死线）
 *
 * 接口规格（表格原文）：
 *   `body-muscles` 组件：SVG 热区 + 元数据；附向下跳转标识。
 *
 * 说明：
 * - 表格中“具体格式要求”指向“下方详细说明”，但该详细说明未包含在
 *   需求清单文本里。本实现按组件名语义给出一个**可用的默认实现**：
 *     * 热区：扫描 SVG 中带 `data-muscle-id` 属性的 path/polygon，
 *       绑定 hover / click 事件与高亮样式；
 *     * 元数据：内置常用肌肉元数据表（名称、功能、训练动作、注意事项），
 *       可通过 options.muscleData 整体替换；
 *     * 向下跳转：点击热区时回调 + `scrollToMuscle()` 自动滚动到页面中
 *       标记 `data-muscle-id` 的详情区块。
 * - 若前端提供“详细说明”，只需替换 muscleData 数据源即可，组件骨架不变。
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.BodyMuscles = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** 内置肌肉元数据表（示例数据，可按 options.muscleData 替换） */
  const DEFAULT_MUSCLE_DATA = Object.freeze({
    chest: {
      id: "chest",
      name: "胸大肌",
      en: "Pectoralis Major",
      group: "chest",
      groupName: "胸部",
      function: "肩关节内收、内旋；水平屈曲",
      exercises: ["卧推", "俯卧撑", "夹胸"],
      caution: "肩部疼痛者避免大重量卧推",
      color: "#ff8a80",
    },
    shoulders: {
      id: "shoulders",
      name: "三角肌",
      en: "Deltoid",
      group: "shoulders",
      groupName: "肩部",
      function: "肩关节外展、前屈、后伸",
      exercises: ["推举", "侧平举", "面拉"],
      caution: "训练前充分活动肩关节",
      color: "#ffd180",
    },
    biceps: {
      id: "biceps",
      name: "肱二头肌",
      en: "Biceps Brachii",
      group: "arms",
      groupName: "手臂",
      function: "屈肘、前臂旋后",
      exercises: ["弯举", "锤式弯举"],
      caution: "",
      color: "#ffab40",
    },
    triceps: {
      id: "triceps",
      name: "肱三头肌",
      en: "Triceps Brachii",
      group: "arms",
      groupName: "手臂",
      function: "伸肘",
      exercises: ["臂屈伸", "窄距卧推", "双杠臂屈伸"],
      caution: "",
      color: "#ff6e40",
    },
    abs: {
      id: "abs",
      name: "腹直肌",
      en: "Rectus Abdominis",
      group: "core",
      groupName: "核心",
      function: "脊柱屈曲、稳定躯干",
      exercises: ["卷腹", "平板支撑", "悬垂举腿"],
      caution: "下背不适者减少卷腹幅度",
      color: "#ff4081",
    },
    obliques: {
      id: "obliques",
      name: "腹斜肌",
      en: "Obliques",
      group: "core",
      groupName: "核心",
      function: "躯干旋转、侧屈",
      exercises: ["俄罗斯转体", "侧平板", "伐木"],
      caution: "",
      color: "#f50057",
    },
    quadriceps: {
      id: "quadriceps",
      name: "股四头肌",
      en: "Quadriceps",
      group: "legs",
      groupName: "腿部",
      function: "伸膝",
      exercises: ["深蹲", "腿举", "箭步蹲"],
      caution: "膝盖有伤者控制下蹲幅度",
      color: "#00e5ff",
    },
    hamstrings: {
      id: "hamstrings",
      name: "腘绳肌",
      en: "Hamstrings",
      group: "legs",
      groupName: "腿部",
      function: "屈膝、伸髋",
      exercises: ["罗马尼亚硬拉", "腿弯举", "早安式"],
      caution: "",
      color: "#00b0ff",
    },
    glutes: {
      id: "glutes",
      name: "臀大肌",
      en: "Gluteus Maximus",
      group: "legs",
      groupName: "臀部",
      function: "伸髋、外旋",
      exercises: ["臀桥", "髋外展", "深蹲"],
      caution: "",
      color: "#64dd17",
    },
    calves: {
      id: "calves",
      name: "小腿三头肌",
      en: "Triceps Surae",
      group: "legs",
      groupName: "腿部",
      function: "跖屈（踮脚）",
      exercises: ["站姿提踵", "坐姿提踵"],
      caution: "",
      color: "#00c853",
    },
    lats: {
      id: "lats",
      name: "背阔肌",
      en: "Latissimus Dorsi",
      group: "back",
      groupName: "背部",
      function: "肩关节内收、后伸、内旋",
      exercises: ["引体向上", "高位下拉", "划船"],
      caution: "",
      color: "#69f0ae",
    },
    traps: {
      id: "traps",
      name: "斜方肌",
      en: "Trapezius",
      group: "back",
      groupName: "背部",
      function: "肩胛骨上提、后缩、下沉",
      exercises: ["耸肩", "面拉", "划船"],
      caution: "",
      color: "#b9f6ca",
    },
    lowerBack: {
      id: "lowerBack",
      name: "竖脊肌",
      en: "Erector Spinae",
      group: "back",
      groupName: "背部",
      function: "脊柱后伸、维持直立",
      exercises: ["硬拉", "山羊挺身", "鸟狗式"],
      caution: "腰伤者避免负重屈伸",
      color: "#a7ffeb",
    },
  });

  /** 向下跳转时使用的行为常量 */
  const SCROLL_BEHAVIOR = Object.freeze({
    SMOOTH: "smooth",
    INSTANT: "auto",
  });

  /**
   * @typedef {Object} MuscleMeta
   * @property {string} id 肌肉唯一标识（与 SVG 热区 data-muscle-id 对应）
   * @property {string} name 中文名称
   * @property {string} [en] 英文名称
   * @property {string} group 肌群分组
   * @property {string} groupName 分组中文名
   * @property {string} function 主要功能
   * @property {string[]} exercises 推荐训练动作
   * @property {string} [caution] 注意事项
   * @property {string} [color] 热区高亮颜色
   */

  /**
   * @typedef {Object} BodyMusclesOptions
   * @property {Object<string, MuscleMeta>} [muscleData] 肌肉元数据表
   * @property {string} [activeColor] 选中热区填充色
   * @property {string} [hoverColor] 悬停热区填充色
   * @property {string} [idPrefix="bm"] 自动生成的类名前缀
   * @property {function(string, MuscleMeta): void} [onSelect]
   *   点击热区回调（muscleId, metadata）
   * @property {function(string, MuscleMeta): void} [onHover]
   *   悬停热区回调
   */

  /**
   * 初始化 body-muscles 组件。
   *
   * @param {SVGElement} svg 包含热区的 SVG 元素
   *   （热区为带 data-muscle-id 的 path / polygon / circle）
   * @param {BodyMusclesOptions} [options]
   * @returns {{
   *   getHotspots: function(): Element[],
   *   getMetadata: function(string): (MuscleMeta|undefined),
   *   setActive: function(string|null): void,
   *   scrollTo: function(string): void,
   *   destroy: function(): void
   * }}
   *
   * @example
   * const muscles = createBodyMuscles(svgEl, {
   *   onSelect: (id, meta) => { showDetail(meta); },
   * });
   * muscles.setActive("chest");
   */
  function createBodyMuscles(svg, options) {
    if (!svg || typeof svg.querySelectorAll !== "function") {
      throw new Error("createBodyMuscles: 需要一个 SVG 元素");
    }

    const opts = options || {};
    const data = opts.muscleData || DEFAULT_MUSCLE_DATA;
    const activeColor = opts.activeColor || "rgba(255, 64, 129, 0.55)";
    const hoverColor = opts.hoverColor || "rgba(255, 171, 64, 0.45)";
    const prefix = opts.idPrefix || "bm";

    const hotspots = Array.from(
      svg.querySelectorAll("[data-muscle-id]")
    ).filter((el) => {
      const tag = el.tagName && el.tagName.toLowerCase();
      return ["path", "polygon", "circle", "ellipse", "rect"].includes(tag);
    });

    /** 重置所有热区样式 */
    function clearStyles() {
      hotspots.forEach((el) => {
        el.removeAttribute("data-bm-state");
        el.style.fill = "";
      });
    }

    /** 高亮指定热区 */
    function highlight(id, color) {
      hotspots.forEach((el) => {
        if (el.getAttribute("data-muscle-id") === id) {
          el.setAttribute("data-bm-state", "active");
          el.style.fill = color || activeColor;
        }
      });
    }

    /**
     * 设置当前选中肌肉。
     * @param {string|null} id 肌肉 id；传 null 清除选中
     */
    function setActive(id) {
      clearStyles();
      if (id) highlight(id, activeColor);
    }

    /** 获取指定肌肉元数据 */
    function getMetadata(id) {
      return data[id];
    }

    /**
     * 向下滚动到肌肉详情区块。
     * 页面中详情区块需带 `data-muscle-id="<id>"` 属性。
     * @param {string} id
     * @param {ScrollBehavior} [behavior]
     */
    function scrollTo(id, behavior) {
      const target = document.querySelector(`[data-muscle-id="${id}"]`);
      if (!target) return false;
      target.scrollIntoView({
        behavior: behavior || SCROLL_BEHAVIOR.SMOOTH,
        block: "start",
      });
      return true;
    }

    /** 绑定事件 */
    function bindEvents() {
      hotspots.forEach((el) => {
        el.style.cursor = "pointer";

        el.addEventListener("mouseenter", () => {
          const id = el.getAttribute("data-muscle-id");
          el.setAttribute("data-bm-state", "hover");
          if (el.getAttribute("data-bm-state") !== "active") {
            el.style.fill = hoverColor;
          }
          if (opts.onHover) opts.onHover(id, data[id]);
        });

        el.addEventListener("mouseleave", () => {
          clearStyles();
          const current = svg.getAttribute("data-bm-active");
          if (current) highlight(current, activeColor);
        });

        el.addEventListener("click", () => {
          const id = el.getAttribute("data-muscle-id");
          svg.setAttribute("data-bm-active", id);
          setActive(id);
          if (opts.onSelect) opts.onSelect(id, data[id]);
        });
      });
    }

    /** 解绑事件与样式，恢复 SVG 原状 */
    function destroy() {
      clearStyles();
      hotspots.forEach((el) => {
        el.style.cursor = "";
      });
      svg.removeAttribute("data-bm-active");
    }

    bindEvents();

    return {
      getHotspots: () => hotspots,
      getMetadata,
      setActive,
      scrollTo,
      destroy,
      meta: { prefix },
    };
  }

  /**
   * 便捷函数：返回内置肌肉元数据。
   * @param {string} id
   * @returns {MuscleMeta|undefined}
   */
  function getMuscleMetadata(id) {
    return DEFAULT_MUSCLE_DATA[id];
  }

  createBodyMuscles.getMuscleMetadata = getMuscleMetadata;
  createBodyMuscles.DEFAULT_MUSCLE_DATA = DEFAULT_MUSCLE_DATA;
  createBodyMuscles.SCROLL_BEHAVIOR = SCROLL_BEHAVIOR;

  return createBodyMuscles;
});
