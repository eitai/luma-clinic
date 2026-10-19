import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * The LUMA signature scene: one pearl serum drop above a silky surface.
 * Scroll progress p (0..1) is the only input — every pose is a pure function
 * of p, so scrolling backwards plays the scene in reverse exactly.
 *
 *  0.00–0.15  drop hovers            0.40–0.65  ripples spread
 *  0.15–0.40  drop falls, stretches  0.64–0.90  ripples settle into 4 rings, camera rises
 */

const BG = new THREE.Color('#f6f1ec')

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

// Heightfield shared by position + normal (finite differences) in the vertex shader.
const HEIGHT_GLSL = /* glsl */ `
uniform float uT;    // ripple front radius
uniform float uAmp;  // ripple amplitude
uniform float uIdle; // wall-clock seconds, for the faint idle shimmer
uniform float uCrater; // impact cavity depth
uniform float uT2;     // second (smaller) wave train, from the jet droplet falling back
uniform float uAmp2;
float wave(float front, float r) {
  float x = front - r;                    // distance behind the wave front
  return x > 0.0 ? sin(x * 5.5) * exp(-x * 0.55) * smoothstep(0.0, 0.25, x) / (1.0 + r * 0.55) : 0.0;
}
float H(vec2 p) {
  float r = length(p);
  float h = uAmp * wave(uT, r) + uAmp2 * wave(uT2, r);
  h += uCrater * (0.38 * exp(-pow((r - 0.52) / 0.16, 2.0)) - exp(-r * r / 0.13)); // cavity + raised rim
  h += 0.006 * sin(p.x * 1.3 + uIdle * 0.6) * sin(p.y * 1.1 - uIdle * 0.45);
  return h;
}
`

export interface DropScene {
  setProgress(p: number): void
  dispose(): void
}

export function createDropScene(
  canvas: HTMLCanvasElement,
  labels: HTMLElement[],
  opts: { reducedMotion: boolean },
): DropScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(BG)

  const scene = new THREE.Scene()
  scene.background = BG
  scene.fog = new THREE.Fog(BG, 6, 17)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  scene.add(new THREE.HemisphereLight('#fff6ef', '#d9bfb1', 0.6))
  const sun = new THREE.DirectionalLight('#ffe9dc', 2.2)
  sun.position.set(-4, 5, -3) // raking back light → ripples catch highlights
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60)

  // --- surface ---------------------------------------------------------------
  const uniforms = {
    uT: { value: 0 }, uAmp: { value: 0 }, uIdle: { value: 0 },
    uCrater: { value: 0 }, uT2: { value: 0 }, uAmp2: { value: 0 },
  }
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: '#f1e2d8',
    roughness: 0.22,
    envMapIntensity: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    sheen: 0.4,
    sheenColor: new THREE.Color('#f3d9cf'),
  })
  waterMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = HEIGHT_GLSL + shader.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `float e = 0.03;
         vec3 objectNormal = normalize(vec3(
           H(position.xy - vec2(e, 0.)) - H(position.xy + vec2(e, 0.)),
           H(position.xy - vec2(0., e)) - H(position.xy + vec2(0., e)),
           2.0 * e));
         #ifdef USE_TANGENT
           vec3 objectTangent = vec3(tangent.xyz);
         #endif`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.xy, H(position.xy));')
  }
  // Cubic warp packs vertices around the impact point (~0.02 apart) and spreads them toward the fogged edge.
  const waterGeo = new THREE.PlaneGeometry(2, 2, 400, 400)
  const wp = waterGeo.attributes.position as THREE.BufferAttribute
  const warp = (u: number) => 24 * (0.15 * u + 0.85 * u * u * u)
  for (let i = 0; i < wp.count; i++) wp.setXY(i, warp(wp.getX(i)), warp(wp.getY(i)))
  const water = new THREE.Mesh(waterGeo, waterMat)
  water.rotation.x = -Math.PI / 2
  scene.add(water)

  // --- drop + rebound droplet ---------------------------------------------------
  const dropMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    transmission: 1,
    thickness: 0.45,
    roughness: 0,
    ior: 1.38,
    attenuationColor: new THREE.Color('#f0c9bb'),
    attenuationDistance: 2.6,
    clearcoat: 1,
    envMapIntensity: 1.4,
    iridescence: 0.35,
    iridescenceIOR: 1.3,
  })
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.34, 96, 64), dropMat)
  scene.add(drop)
  // Splash is made of the pool's own milky liquid, not the clear drop.
  const milk = new THREE.MeshPhysicalMaterial({ color: '#f3e4da', roughness: 0.12, clearcoat: 1, envMapIntensity: 0.9 })
  const droplet = new THREE.Mesh(new THREE.SphereGeometry(0.085, 48, 32), milk)
  scene.add(droplet)
  // Worthington jet: flared base that melts into the surface, thin neck, bulbous tip (unit height).
  const jetProfile = [[0.3, 0], [0.14, 0.07], [0.075, 0.28], [0.055, 0.72], [0.07, 0.86], [0.062, 0.95], [0.0, 1.0]]
  const jet = new THREE.Mesh(new THREE.LatheGeometry(jetProfile.map(([x, y]) => new THREE.Vector2(x, y)), 48), milk)
  scene.add(jet)
  const CROWN = 22
  const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(0.032, 16, 12), milk, CROWN)
  // Fixed per-droplet variation (deterministic so reverse scroll replays identically).
  const seeds = Array.from({ length: CROWN }, (_, i) => ({
    a: (i / CROWN) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.03,
    v: 0.75 + 0.25 * Math.abs(Math.sin(i * 78.233)),
    s: 0.7 + 0.6 * Math.abs(Math.sin(i * 4.1414)),
  }))
  const m4 = new THREE.Matrix4()
  scene.add(crown)
  // Thin crown wall the rim beads form on before they detach.
  const wallMat = milk.clone()
  wallMat.side = THREE.DoubleSide
  wallMat.transparent = true
  // Flared like a tulip, with a cusp under every bead (cos^2 bumps at the bead angles).
  const wallGeo = new THREE.CylinderGeometry(1.45, 1, 1, CROWN * 16, 10, true)
  const wv = wallGeo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < wv.count; i++) {
    const t = wv.getY(i) + 0.5
    const cusp = Math.max(0, Math.cos(CROWN * Math.atan2(wv.getZ(i), wv.getX(i)))) ** 2
    wv.setY(i, -0.5 + t * (1 + 0.45 * cusp * t))
  }
  wallGeo.computeVertexNormals()
  const wall = new THREE.Mesh(wallGeo, wallMat)
  scene.add(wall)

  // Soft contact shadow under the hovering drop (radial gradient decal).
  const sc = document.createElement('canvas')
  sc.width = sc.height = 128
  const g = sc.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(90,55,45,0.45)')
  grad.addColorStop(1, 'rgba(90,55,45,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  // Warm "window light" glow far behind the drop: gives the glass something to refract.
  const gc = document.createElement('canvas')
  gc.width = gc.height = 256
  const gg = gc.getContext('2d')!
  const glowGrad = gg.createRadialGradient(128, 128, 0, 128, 128, 128)
  glowGrad.addColorStop(0, 'rgba(240,190,165,0.95)')
  glowGrad.addColorStop(0.45, 'rgba(244,208,190,0.45)')
  glowGrad.addColorStop(1, 'rgba(246,241,236,0)')
  gg.fillStyle = glowGrad
  gg.fillRect(0, 0, 256, 256)
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, fog: false }),
  )
  glow.position.set(1.2, 4, -12)
  scene.add(glow)
  shadow.position.y = 0.012
  scene.add(shadow)

  // --- the four treatment rings ---------------------------------------------------
  const RADII = [1.0, 1.8, 2.6, 3.4]
  const ringMat = RADII.map(
    () => new THREE.MeshStandardMaterial({ color: '#c08f7c', metalness: 1, roughness: 0.28, transparent: true }),
  )
  const rings = RADII.map((r, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 12, 256), ringMat[i])
    m.rotation.x = -Math.PI / 2
    scene.add(m)
    return m
  })

  // --- layout (portrait phones get a closer, wider framing) -------------------------
  let mobile = false
  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    mobile = w / h < 0.8
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = mobile ? 44 : 35
    camera.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(() => {
    resize()
    render()
  })
  ro.observe(canvas)

  // --- pose: everything is a function of p --------------------------------------------
  let target = opts.reducedMotion ? 0.92 : 0
  let current = target
  const v = new THREE.Vector3()
  const look = new THREE.Vector3()

  function pose(p: number, t: number) {
    const ringScale = mobile ? 0.85 : 1

    // Drop: hover → gravity fall (s² ease) that continues below the opaque surface.
    const s = clamp((p - 0.15) / 0.25, 0, 1.2)
    const hover = 1 - smooth(0.12, 0.2, p)
    const y = 2 - 2 * s * s + hover * 0.06 * Math.sin(t * 1.4)
    // Falling drops stay round (a "teardrop" is a cartoon); slight air-drag flattening only.
    const flat = 0.05 * Math.min(s, 1)
    drop.position.set(0, y, 0)
    drop.scale.set(1 + flat * 0.5, 1 - flat, 1 + flat * 0.5)
    drop.rotation.y = t * 0.25
    drop.visible = y > -0.15

    // Impact: cavity opens and refills → crown of droplets → Worthington jet whose tip pinches off.
    const c = (p - 0.4) / 0.065
    uniforms.uCrater.value = c > 0 && c < 1 ? 0.3 * Math.sin(Math.PI * c) : 0

    const k = (p - 0.4) / 0.11
    const kk = k / 0.6 // crown wall: rises, opens outward, collapses
    wall.visible = kk > 0 && kk < 1
    const wallR = 0.42 + 0.45 * clamp(kk)
    const wallH = 0.2 * Math.sin(Math.PI * clamp(kk))
    wall.scale.set(wallR, wallH, wallR)
    wall.position.y = wallH / 2 - 0.01
    wallMat.opacity = 1 - smooth(0.6, 1, kk)

    crown.visible = k > 0 && k < 1
    if (crown.visible) {
      seeds.forEach((d, i) => {
        // Beads ride the wall's rim until k=0.24, then fly ballistic and fall back in.
        const u = Math.max(0, (k - 0.24) / 0.76)
        const r0 = (0.42 + 0.45 * Math.min(kk, 0.4)) * 1.45
        const r = u > 0 ? r0 + 0.8 * u * d.v : wallR * 1.45
        const cy = u > 0 ? 0.3 + 0.9 * d.v * u - 1.6 * u * u : wallH * 1.45 + 0.02
        const sz = cy > -0.03 ? d.s * (u > 0 ? 1 - 0.5 * u : clamp(kk * 3)) : 0
        m4.makeScale(sz, sz * 1.25, sz).setPosition(Math.cos(d.a) * r, cy, Math.sin(d.a) * r)
        crown.setMatrixAt(i, m4)
      })
      crown.instanceMatrix.needsUpdate = true
    }

    const j = (p - 0.455) / 0.09
    jet.visible = j > 0 && j < 1
    const jh = 0.78 * Math.sin(Math.PI * Math.min(Math.max(j, 0), 1))
    jet.scale.set(1 - 0.35 * j, jh, 1 - 0.35 * j)
    jet.position.y = jh * 0.5 - 0.08

    const tip = (p - 0.5) / 0.12 // the pinched-off tip: ballistic up, then back into the pool
    droplet.visible = tip > 0 && tip < 1
    droplet.position.set(0, 0.8 + 1.0 * tip - 1.8 * tip * tip, 0)
    uniforms.uT2.value = Math.max(0, (p - 0.62) / 0.2) * 3
    uniforms.uAmp2.value = p > 0.62 ? 0.05 * (1 - smooth(0.7, 0.86, p)) : 0

    shadow.visible = y > 0
    ;(shadow.material as THREE.MeshBasicMaterial).opacity = clamp(1 - y / 2.4) * 0.9
    shadow.scale.setScalar(0.6 + y * 0.35)

    // Ripples: front starts at impact, fades as the rings take over.
    uniforms.uT.value = Math.max(0, (p - 0.4) / 0.25) * 6 * ringScale
    uniforms.uAmp.value = p > 0.4 ? 0.12 * (1 - smooth(0.62, 0.86, p)) * smooth(0.4, 0.43, p) : 0
    uniforms.uIdle.value = t

    rings.forEach((m, i) => {
      const o = smooth(0.64 + i * 0.03, 0.74 + i * 0.03, p)
      ringMat[i].opacity = o
      m.visible = o > 0.001
      m.scale.setScalar((0.86 + 0.14 * o) * ringScale)
      m.position.y = 0.02 + 0.04 * o
    })

    // Camera: low eye-level on the drop → follows the fall → rises to a 3/4 view of the rings.
    const fall = smooth(0.15, 0.42, p)
    const rise = smooth(0.55, 0.92, p)
    const dist = mobile ? 1.12 : 1
    v.set(0, mix(1.25, 0.95, fall), 6.2).lerp(new THREE.Vector3(0, 15, 7.5), rise).multiplyScalar(dist)
    look.set(0, mix(1.75, 0.35, fall), 0).lerp(new THREE.Vector3(0, 0, -1.1), rise)
    const fog = scene.fog as THREE.Fog
    fog.near = mix(6, 16, rise)
    fog.far = mix(17, 34, rise)
    camera.position.copy(v)
    camera.lookAt(look)

    // HTML labels pinned to a point on each ring.
    const theta = mobile ? 0 : 0.8
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    labels.forEach((el, i) => {
      const r = RADII[i] * ringScale * (0.86 + 0.14 * ringMat[i].opacity)
      v.set(-Math.sin(theta) * r, 0.06, Math.cos(theta) * r).project(camera)
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`
      el.style.opacity = String(ringMat[i].opacity)
    })
  }

  function render() {
    pose(current, performance.now() / 1000)
    renderer.render(scene, camera)
  }

  // --- loop: runs only while the canvas is on screen ------------------------------------
  let raf = 0
  let visible = true
  const loop = () => {
    current += (target - current) * 0.1 // extra glide on top of the scroll position
    if (Math.abs(target - current) < 1e-4) current = target
    render()
    raf = visible ? requestAnimationFrame(loop) : 0
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible && !raf && !opts.reducedMotion) raf = requestAnimationFrame(loop)
  })
  io.observe(canvas)
  if (opts.reducedMotion) render()

  return {
    setProgress(p) {
      if (!opts.reducedMotion) target = clamp(p)
    },
    dispose() {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      pmrem.dispose()
      renderer.dispose()
    },
  }
}
