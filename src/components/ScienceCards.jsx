import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import galaxyData from '../data/healthGalaxy.json';
import ScrollFloat from './ScrollFloat/ScrollFloat';
import useResponsiveScrollFloat from '../hooks/useResponsiveScrollFloat';
import './ScienceCards.css';

const HEALTH_CATEGORIES = galaxyData.stars.map((star) => ({
  id: star.id,
  label: star.nameZh,
  en: star.nameEn,
  layer: star.layer,
  coords: star.coords,
  influence: star.influence,
  color: star.color,
  glowColor: star.glowColor || star.color,
  summary: star.summary,
  planets: star.planets || [],
}));
const HEALTH_TERMS = HEALTH_CATEGORIES.flatMap((category) => category.planets.map((planet, index) => ({
  ...planet,
  category: category.id,
  index,
  label: planet.nameZh,
  en: planet.nameEn,
  text: planet.explain,
})));
const HEALTH_LINKS = galaxyData.starLinks || [];
const HEALTH_STATS = { categoryCount: HEALTH_CATEGORIES.length, termCount: HEALTH_TERMS.length };
const categoryMap = Object.fromEntries(HEALTH_CATEGORIES.map((item) => [item.id, item]));

function polarPosition(r, theta, z) {
  const angle = THREE.MathUtils.degToRad(theta);
  return new THREE.Vector3(r * 8 * Math.sin(angle), z * 1.5 - 3.2, r * 8 * Math.cos(angle));
}

function makeGlow(color, radius, opacity) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 18), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

function Galaxy3D({ activeCategory, onSelectTerm, onSelectCategory }) {
  const mountRef = useRef(null);
  const graphRef = useRef(null);
  const activeRef = useRef(activeCategory);
  const termSelectRef = useRef(onSelectTerm);
  const categorySelectRef = useRef(onSelectCategory);
  activeRef.current = activeCategory;
  termSelectRef.current = onSelectTerm;
  categorySelectRef.current = onSelectCategory;

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.termMeshes.forEach(({ mesh, line }) => {
      const visible = activeCategory === 'all' || mesh.userData.term.category === activeCategory;
      mesh.visible = visible;
      line.visible = visible;
    });
    graph.categoryMeshes.forEach(({ id, core, halo }) => {
      const focused = activeCategory === 'all' || id === activeCategory;
      core.material.opacity = focused ? 1 : .25;
      halo.material.opacity = focused ? .12 : .025;
      const label = core.parent?.children.find((child) => child.isCSS2DObject)?.element;
      if (label) label.style.opacity = focused ? '1' : '.24';
    });
  }, [activeCategory]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050617, 0.012);
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 180);
    camera.position.set(0, 10, 31);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x050617, 0);
    mount.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.className = 'science-nebula__labels';
    mount.appendChild(labels.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .06;
    controls.minDistance = 16;
    controls.maxDistance = 52;
    controls.autoRotate = true;
    controls.autoRotateSpeed = .35;

    const starGeo = new THREE.BufferGeometry();
    const starCount = 3200;
    const armCount = 5;
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const cyan = new THREE.Color('#86d8ff');
    const rose = new THREE.Color('#ef9bb9');
    const white = new THREE.Color('#fff8e8');
    for (let i = 0; i < starCount; i += 1) {
      const radius = 1.5 + Math.pow(Math.random(), .62) * 34;
      const arm = (i % armCount) / armCount * Math.PI * 2;
      const twist = radius * .22;
      const theta = arm + twist + (Math.random() - .5) * (.2 + radius * .018);
      const thickness = .26 + radius * .045;
      const index = i * 3;
      starPos[index] = Math.cos(theta) * radius;
      starPos[index + 1] = (Math.random() - .5) * thickness;
      starPos[index + 2] = Math.sin(theta) * radius * .66;
      const color = new THREE.Color().lerpColors(cyan, rose, (Math.sin(arm) + 1) / 2);
      if (Math.random() > .9) color.lerp(white, .72);
      starColors[index] = color.r;
      starColors[index + 1] = color.g;
      starColors[index + 2] = color.b;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const spiralField = new THREE.Group();
    spiralField.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: .075, vertexColors: true, transparent: true, opacity: .72, depthWrite: false, blending: THREE.AdditiveBlending })));
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 900;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i += 1) {
      const radius = 2 + Math.pow(Math.random(), .48) * 29;
      const theta = Math.random() * Math.PI * 2 + radius * .2;
      dustPos[i * 3] = Math.cos(theta) * radius;
      dustPos[i * 3 + 1] = (Math.random() - .5) * (.15 + radius * .025);
      dustPos[i * 3 + 2] = Math.sin(theta) * radius * .66;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    spiralField.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffc2d4, size: .13, transparent: true, opacity: .18, depthWrite: false, blending: THREE.AdditiveBlending })));
    scene.add(spiralField);

    const center = new THREE.Group();
    center.add(makeGlow(0xfff6dc, 2.15, .06));
    center.add(new THREE.Mesh(new THREE.SphereGeometry(1.05, 28, 28), new THREE.MeshBasicMaterial({ color: 0xfff8e7 })));
    center.add(new THREE.Mesh(new THREE.SphereGeometry(1.55, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffc986, transparent: true, opacity: .13, depthWrite: false })));
    scene.add(center);

    const categoryMeshes = [];
    const categoryPositions = new Map();
    HEALTH_CATEGORIES.forEach((category) => {
      const position = polarPosition(category.coords.r, category.coords.theta, category.coords.z);
      categoryPositions.set(category.id, position);
      const group = new THREE.Group();
      group.position.copy(position);
      group.userData = { type: 'category', category };
      const radius = .6 + category.influence * .08;
      const halo = makeGlow(category.color, radius * 2.3, .12);
      const core = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 20), new THREE.MeshBasicMaterial({ color: category.color, transparent: true }));
      core.userData = group.userData;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.55, .018, 6, 48), new THREE.MeshBasicMaterial({ color: category.color, transparent: true, opacity: .5 }));
      ring.rotation.x = Math.PI / 2;
      group.add(halo, core, ring);
      const label = document.createElement('div');
      label.className = 'science-nebula__3d-label';
      label.textContent = category.label;
      label.style.setProperty('--label-color', category.color);
      group.add(new CSS2DObject(label));
      scene.add(group);
      categoryMeshes.push({ id: category.id, group, core, halo });
    });

    const categoryLineObjects = [];
    const addLine = (from, to, color, opacity, width = 1) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: width, depthWrite: false });
      const line = new THREE.Line(geometry, material);
      scene.add(line);
      categoryLineObjects.push(line);
      return line;
    };
    HEALTH_CATEGORIES.forEach((category) => addLine(new THREE.Vector3(), categoryPositions.get(category.id), category.color, .24));
    HEALTH_LINKS.forEach(({ source, target, strength }) => {
      const from = categoryPositions.get(source);
      const to = categoryPositions.get(target);
      if (from && to) addLine(from, to, strength === 'strong' ? 0x9bcaff : 0x5668b1, strength === 'strong' ? .58 : strength === 'medium' ? .32 : .16);
    });

    const termMeshes = [];
    HEALTH_TERMS.forEach((term) => {
      const parent = categoryMap[term.category];
      const parentPosition = categoryPositions.get(term.category);
      const angle = THREE.MathUtils.degToRad(term.orbitAngle ?? (term.index / Math.max(parent.planets.length, 1)) * 360);
      const orbit = galaxyData.meta?.visual?.orbitRadius || 3.5;
      const position = parentPosition.clone().add(new THREE.Vector3(Math.cos(angle) * orbit, Math.sin(angle * 1.7) * .9, Math.sin(angle) * orbit));
      const mesh = new THREE.Mesh(new THREE.SphereGeometry((term.size || galaxyData.meta?.visual?.defaultPlanetSize || .4) * .28, 8, 8), new THREE.MeshBasicMaterial({ color: parent.color, transparent: true, opacity: .9 }));
      mesh.position.copy(position);
      mesh.userData = { type: 'term', term, coords: { r: parent.coords.r, theta: term.orbitAngle, z: (parent.coords.z || 0) + (term.zOffset || 0) } };
      const line = addLine(parentPosition, position, parent.color, .18);
      scene.add(mesh);
      termMeshes.push({ mesh, line, id: term.id });
    });
    const termPositions = new Map(termMeshes.map(({ id, mesh }) => [id, mesh.position]));
    (galaxyData.planetLinks || []).forEach((link) => {
      const from = termPositions.get(link.source);
      const to = termPositions.get(link.target);
      if (from && to) addLine(from, to, 0x95b7ff, .28);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const objects = [...termMeshes.filter(({ mesh }) => mesh.visible).map(({ mesh }) => mesh), ...categoryMeshes.map(({ core }) => core)];
      const hit = raycaster.intersectObjects(objects, false)[0];
      if (!hit) return;
      if (hit.object.userData.type === 'term') termSelectRef.current(hit.object.userData.term);
      if (hit.object.userData.type === 'category') categorySelectRef.current(hit.object.userData.category.id);
    };
    renderer.domElement.addEventListener('click', pick);

    const resize = () => {
      const width = mount.clientWidth || 640;
      const height = mount.clientHeight || 560;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      labels.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = performance.now() * .001;
      center.scale.setScalar(1 + Math.sin(t * 1.4) * .035);
      spiralField.rotation.y += .00018;
      categoryMeshes.forEach(({ group, halo }, index) => { halo.scale.setScalar(1 + Math.sin(t * .7 + index) * .08); group.rotation.y += .0008; });
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    animate();
    graphRef.current = { termMeshes, categoryMeshes };
    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('click', pick); controls.dispose(); renderer.dispose(); mount.removeChild(renderer.domElement); mount.removeChild(labels.domElement); graphRef.current = null; categoryLineObjects.forEach((line) => { line.geometry.dispose(); line.material.dispose(); }); };
  }, []);

  return <div ref={mountRef} className="science-nebula__canvas" aria-label="可拖拽旋转的三维人体健康星系" />;
}

export default function ScienceCards() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selected, setSelected] = useState(HEALTH_TERMS[0]);
  const scrollCfg = useResponsiveScrollFloat();
  const active = categoryMap[selected.category];
  const filteredTerms = useMemo(() => HEALTH_TERMS.filter((term) => activeCategory === 'all' || term.category === activeCategory), [activeCategory]);
  const selectCategory = (id) => { setActiveCategory(id); if (id !== 'all') setSelected(HEALTH_TERMS.find((term) => term.category === id) || selected); };

  return (
    <section className="science-cards" id="science">
      <div className="section-container">
        <div className="science-cards__header">
          <div className="science-cards__header-copy">
            <span className="section-label">Knowledge Orbit</span>
            <ScrollFloat
              segments={[
                { text: '人体健康' },
                { text: '星系', gradient: true }
              ]}
              animationDuration={scrollCfg.animationDuration}
              ease={scrollCfg.ease}
              scrollStart={scrollCfg.scrollStart}
              scrollEnd={scrollCfg.scrollEnd}
              stagger={scrollCfg.stagger}
              containerClassName="section-title-scroll"
            />
            <p className="section-subtitle">以坐标、连接和影响力，阅读身体系统如何协同工作。</p>
          </div>
          <div className="science-cards__metrics" aria-label="星系规模">
            <span><b>{HEALTH_STATS.categoryCount}</b><small>知识恒星</small></span>
            <span><b>{HEALTH_STATS.termCount}</b><small>科普行星</small></span>
            <span><b>3D</b><small>可漫游空间</small></span>
          </div>
        </div>
        <div className="science-nebula">
          <aside className="science-nebula__rail" aria-label="科普大类">
            <button type="button" className={activeCategory === 'all' ? 'is-active' : ''} onClick={() => selectCategory('all')}><i className="science-nebula__rail-dot science-nebula__rail-dot--all" />全部星域 <b>{HEALTH_TERMS.length}</b></button>
            {HEALTH_CATEGORIES.map((category) => <button type="button" key={category.id} className={activeCategory === category.id ? 'is-active' : ''} onClick={() => selectCategory(category.id)}><i className="science-nebula__rail-dot" style={{ background: category.color, boxShadow: `0 0 10px ${category.color}` }} />{category.label}<b>{HEALTH_TERMS.filter((term) => term.category === category.id).length}</b></button>)}
          </aside>
          <div className="science-nebula__map"><div className="science-nebula__map-meta"><span>三维视图 · {activeCategory === 'all' ? '全域关系网络' : active.label}</span><span>影响力越高 · 光晕越亮</span></div><Galaxy3D activeCategory={activeCategory} onSelectTerm={setSelected} onSelectCategory={selectCategory} /><div className="science-nebula__hint"><span>拖拽旋转 · 滚轮缩放</span><span>点击星辰查看解释</span></div></div>
          <article className="science-nebula__detail" aria-live="polite">
            <div className="science-nebula__detail-top"><span style={{ color: active.color }}>{active.label} / 科普词条</span><b>{String(HEALTH_TERMS.indexOf(selected) + 1).padStart(2, '0')}</b></div>
            <div className="science-nebula__detail-orb" style={{ '--orb-color': active.color }}>{selected.label.slice(0, 1)}</div>
            <h3>{selected.label}</h3><p className="science-nebula__detail-en">{selected.en}</p><p className="science-nebula__detail-copy">{selected.text}</p>
            <div className="science-nebula__detail-meta"><span><small>所属星系</small>{active.label}</span><span><small>坐标</small>r {active.coords.r} · θ {Math.round(active.coords.theta)}° · z {active.coords.z}</span></div>
            <div className="science-nebula__related"><small>当前星系说明</small><p>{active.summary}</p></div>
            <button type="button" className="science-nebula__next" onClick={() => setSelected(filteredTerms[(filteredTerms.indexOf(selected) + 1) % filteredTerms.length] || HEALTH_TERMS[0])}>探索下一个概念 <span>→</span></button>
          </article>
        </div>
      </div>
    </section>
  );
}
