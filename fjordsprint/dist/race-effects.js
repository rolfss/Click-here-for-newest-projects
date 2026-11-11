import * as T from './vendor/three.module.js';

const pipeOffsets = [-.67, .67];
const pipeHeight = .63;
const pipeRear = 2.45;
const particleLimit = 72;

function twinMesh(geometry, material, rotate = false) {
  const mesh = new T.InstancedMesh(geometry, material, pipeOffsets.length);
  const pose = new T.Object3D();
  pose.rotation.x = rotate ? Math.PI / 2 : 0;
  pipeOffsets.forEach((offset, index) => {
    pose.position.set(offset, pipeHeight, pipeRear);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
  });
  return mesh;
}

function flameMesh(core) {
  const profile = [[.18, 0], [.25, .08], [.4, .2], [.36, .43], [.26, .65], [.14, .86], [.01, 1]];
  const geometry = new T.LatheGeometry(profile.map(([radius, length]) => new T.Vector2(radius * (core ? .55 : 1), length)), 10);
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { power: { value: 0 }, length: { value: 0 }, phase: { value: 0 }, motion: { value: 0 } },
    defines: core ? { HOT_CORE: 1 } : {},
    vertexShader: `
      uniform float power, length, phase, motion;
      varying vec2 flameUV;
      varying float facing;
      void main() {
        flameUV = uv;
        float tip = position.y;
        float pulse = sin(tip * 13.0 - phase + uv.x * 6.283);
        vec3 flame = position;
        flame.xz *= (0.72 + 0.28 * power) * (1.0 + 0.16 * pulse * tip * motion);
        flame.x += sin(tip * 8.0 - phase * 0.73) * 0.13 * tip * tip * motion;
        flame.z += sin(tip * 6.0 - phase * 0.54) * 0.17 * tip * tip * motion;
        flame.y *= length;
        vec4 viewPosition = modelViewMatrix * instanceMatrix * vec4(flame, 1.0);
        vec3 viewNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        facing = abs(dot(viewNormal, normalize(-viewPosition.xyz)));
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: `
      uniform float power, phase, motion;
      varying vec2 flameUV;
      varying float facing;
      void main() {
        float tip = flameUV.y;
        float detail = 1.0 + motion * 0.12 * sin(tip * 37.0 - phase * 1.2 + flameUV.x * 19.0);
        #ifdef HOT_CORE
          vec3 flame = mix(vec3(0.62, 0.91, 1.0), vec3(1.0, 0.8, 0.26), smoothstep(0.06, 0.75, tip));
          float alpha = 0.97 * power * (1.0 - smoothstep(0.46, 1.0, tip));
        #else
          vec3 flame = mix(vec3(0.02, 0.43, 0.94), vec3(1.0, 0.34, 0.025), smoothstep(0.05, 0.29, tip));
          flame = mix(flame, vec3(0.91, 0.085, 0.008), smoothstep(0.39, 1.0, tip));
          float alpha = power * (0.25 + facing * 0.6) * (1.0 - smoothstep(0.58, 1.0, tip));
        #endif
        gl_FragColor = vec4(flame * detail, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = twinMesh(geometry, material, true);
  mesh.frustumCulled = false;
  mesh.renderOrder = core ? 3 : 2;
  return mesh;
}

function roadGlow() {
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
    uniforms: { power: { value: 0 } },
    vertexShader: `varying vec2 glowUV;
      void main() { glowUV = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float power; varying vec2 glowUV;
      void main() {
        vec2 fromCentre = (glowUV - vec2(0.5)) * 2.0;
        float spread = 1.0 - smoothstep(0.03, 1.0, length(fromCentre));
        gl_FragColor = vec4(1.0, 0.27, 0.04, 0.31 * power * spread * spread);
        #include <colorspace_fragment>
      }`,
  });
  const glow = new T.Mesh(new T.PlaneGeometry(4.2, 7.4), material);
  glow.renderOrder = 1;
  glow.visible = false;
  return glow;
}

function particleCloud() {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(particleLimit * 3), 3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('appearance', new T.BufferAttribute(new Float32Array(particleLimit * 3), 3).setUsage(T.DynamicDrawUsage));
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { screenScale: { value: 1 } },
    vertexShader: `attribute vec3 appearance; uniform float screenScale; varying vec2 life;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        life = appearance.yz;
        gl_PointSize = clamp(appearance.x * screenScale / max(1.0, -viewPosition.z), 1.0, 58.0);
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: `varying vec2 life;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float spark = life.y;
        float spread = 1.0 - smoothstep(0.0, 1.0, length(p * vec2(1.0, mix(1.0, 1.7, spark))));
        float smoke = spread * spread * (0.84 + 0.16 * sin(p.x * 7.0 + p.y * 9.0));
        vec3 colour = mix(vec3(0.72, 0.75, 0.74), mix(vec3(1.0, 0.2, 0.005), vec3(1.0, 0.8, 0.37), spread), spark);
        gl_FragColor = vec4(colour, life.x * mix(smoke, spread, spark));
        #include <colorspace_fragment>
      }`,
  });
  const cloud = new T.Points(geometry, material);
  cloud.frustumCulled = false;
  cloud.visible = false;
  return cloud;
}

export class RaceEffects {
  constructor(scene, car, canvas) {
    this.car = car;
    this.canvas = canvas;
    this.flames = new T.Group();
    this.flames.name = 'Boost exhaust';
    this.plume = flameMesh(false);
    this.core = flameMesh(true);
    this.glow = roadGlow();
    this.flames.add(this.plume, this.core);
    this.flames.visible = false;
    const nozzles = twinMesh(new T.TorusGeometry(.19, .052, 6, 12), new T.MeshStandardMaterial({ color: 0x53616a, metalness: .72, roughness: .3 }));
    nozzles.name = 'Exhaust outlets';
    car.add(nozzles, this.flames);
    this.cloud = particleCloud();
    scene.add(this.glow, this.cloud);
    this.glowPose = new T.Matrix4();
    this.glowForward = new T.Vector3();
    this.glowRight = new T.Vector3();
    this.roadNormal = new T.Vector3();
    this.particles = Array.from({ length: particleLimit }, () => ({ position: new T.Vector3(), velocity: new T.Vector3(), life: 0 }));
    this.cursor = 0;
    this.power = 0;
    this.phase = 0;
    this.sparkTime = 0;
    this.smokeTime = 0;
  }

  emit(side, spark, speed, drift = 0) {
    const particle = this.particles[this.cursor++ % particleLimit];
    particle.spark = spark;
    particle.lifespan = particle.life = spark ? .33 : .65 + drift * .22;
    const spread = Math.sin(this.cursor * 2.87);
    particle.position.set(side * (spark ? .67 : 1.45), spark ? pipeHeight : .15, spark ? pipeRear + 1.2 : 1.55);
    this.car.localToWorld(particle.position);
    particle.velocity.set(spread * (spark ? 1.8 : 1.2) + side * .35, spark ? .4 + spread * .35 : .8 + drift, spark ? -speed * .48 + 4 : -speed * .12);
    particle.velocity.applyQuaternion(this.car.quaternion);
  }

  update(state, dt, mode, motion, road) {
    const running = mode === 'race' && !state.sightseeing;
    const boost = running && state.boosting;
    const throttle = boost ? (state.turbo > 0 ? 1 : .9) : 0;
    this.power = running && motion ? T.MathUtils.lerp(this.power, throttle, 1 - Math.exp(-dt * (boost ? 24 : 16))) : throttle;
    this.flames.visible = this.power > .035;
    if (this.flames.visible) {
      const reach = 2.1 + this.power * 4.3 + (motion ? T.MathUtils.smoothstep(state.speed, 20, 90) * .9 : 0);
      if (motion) this.phase = (this.phase + dt * 32) % (Math.PI * 200);
      for (const flame of [this.plume, this.core]) {
        const uniforms = flame.material.uniforms;
        uniforms.power.value = this.power;
        uniforms.length.value = reach * (flame === this.core ? .67 : 1);
        uniforms.phase.value = this.phase;
        uniforms.motion.value = Number(motion);
      }
    }
    this.glow.visible = this.flames.visible && state.air < .12 && (state.rideHeight ?? state.air) < .22;
    if (this.glow.visible) {
      this.roadNormal.crossVectors(road.r, road.t).normalize();
      this.glowForward.copy(road.t).multiplyScalar(Math.cos(state.heading)).addScaledVector(road.r, Math.sin(state.heading));
      this.glowRight.crossVectors(this.glowForward, this.roadNormal);
      this.glowPose.makeBasis(this.glowRight, this.glowForward, this.roadNormal);
      this.glow.quaternion.setFromRotationMatrix(this.glowPose);
      this.glow.position.copy(road.p).addScaledVector(road.r, state.x).addScaledVector(this.glowForward, -5).addScaledVector(this.roadNormal, .065);
      this.glow.material.uniforms.power.value = this.power;
    }
    if (!running || !motion) {
      this.cloud.visible = false;
      this.sparkTime = this.smokeTime = 0;
      for (const particle of this.particles) particle.life = 0;
      return;
    }
    const drift = state.air < .12 && state.speed > 16 ? T.MathUtils.smoothstep(state.drift, .22, .9) : 0;
    this.sparkTime = boost ? this.sparkTime + dt : 0;
    this.smokeTime = drift > .08 ? this.smokeTime + dt : 0;
    if (this.sparkTime >= .036) {
      this.sparkTime %= .036;
      this.emit(this.cursor % 2 ? -1 : 1, true, state.speed);
    }
    if (this.smokeTime >= .055) {
      this.smokeTime %= .055;
      for (const side of pipeOffsets) this.emit(Math.sign(side), false, state.speed, drift);
    }
    const { position, appearance } = this.cloud.geometry.attributes;
    let count = 0;
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      if (particle.life <= 0) continue;
      particle.position.addScaledVector(particle.velocity, dt);
      const remaining = particle.life / particle.lifespan;
      const radius = particle.spark ? .19 : .55 + (1 - remaining) * 2.5;
      const alpha = particle.spark ? remaining * .85 : Math.sin(remaining * Math.PI) * .44;
      position.setXYZ(count, particle.position.x, particle.position.y, particle.position.z);
      appearance.setXYZ(count++, radius, alpha, Number(particle.spark));
    }
    this.cloud.visible = count > 0;
    if (count) {
      this.cloud.geometry.setDrawRange(0, count);
      position.needsUpdate = appearance.needsUpdate = true;
      this.cloud.material.uniforms.screenScale.value = this.canvas.height * .7;
    }
  }
}
