// ---------------------------------------------------------------------------
// MRBD 360 Video Player — prototype
//
// Renders an equirectangular video onto the inside of a sphere and drives
// the camera from the glasses' IMU (DeviceOrientationEvent), so turning your
// head pans the view. Play/pause and recenter are exposed as focusable
// buttons reachable via Neural Band / captouch (arrow keys + Enter).
// ---------------------------------------------------------------------------

const DPAD = {
  UP: 'ArrowUp', DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
  SELECT: 'Enter', BACK: 'Escape',
};

const statusEl = document.getElementById('status');
const reticleEl = document.getElementById('reticle');
const btnPlay = document.getElementById('btn-play');
const btnRecenter = document.getElementById('btn-recenter');
const video = document.getElementById('video360');

// ---------------------------------------------------------------------------
// Three.js scene: inverted sphere with the video as its inside texture
// ---------------------------------------------------------------------------

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(600, 600, false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
camera.rotation.order = 'YXZ';

let videoTexture = null;
let sphere = null;

function buildSphere() {
  videoTexture = new THREE.VideoTexture(video);
  videoTexture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.SphereGeometry(500, 60, 40);
  geometry.scale(-1, 1, 1); // flip so texture renders on the inside

  const material = new THREE.MeshBasicMaterial({ map: videoTexture });
  sphere = new THREE.Mesh(geometry, material);
  scene.add(sphere);
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Head tracking via IMU
//
// alpha = compass heading (yaw), beta = forward/back tilt (pitch),
// gamma = left/right tilt (roll). We use alpha/beta for look-around and
// ignore roll for a stable horizon, which is the right call for a video
// viewer (rather than a full 3DOF simulator).
// ---------------------------------------------------------------------------

let yawOffset = 0;     // set by "recenter" to zero out current heading
let latestAlpha = 0;
let latestBeta = 0;
let orientationActive = false;

function handleOrientation(e) {
  if (e.alpha === null) return; // sensor not ready / unsupported
  latestAlpha = e.alpha;
  latestBeta = e.beta || 0;

  const yaw = THREE.MathUtils.degToRad(-(latestAlpha - yawOffset));
  const pitch = THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(latestBeta - 90, -80, 80)
  );

  camera.rotation.set(pitch, yaw, 0, 'YXZ');

  if (!orientationActive) {
    orientationActive = true;
    reticleEl.style.display = 'none';
    setStatus(video.paused ? 'Paused — press play' : 'Playing');
  }
}

function handleMotion() {
  // Reserved for future use (e.g. detecting head nods for gesture
  // shortcuts). Not needed for basic look-around, kept as a stub so the
  // capability is easy to extend.
}

function startIMU() {
  window.addEventListener('deviceorientation', handleOrientation);
  window.addEventListener('devicemotion', handleMotion);
}

function requestSensorPermission() {
  // Must be called from a user gesture (Enter / button press) — the glasses
  // runtime and most Android browsers grant automatically, but this check
  // keeps the app portable to iOS Safari for browser-based testing too.
  if (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  ) {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === 'granted') startIMU();
        else setStatus('Motion permission denied');
      })
      .catch(() => setStatus('Motion permission error'));
  } else {
    startIMU();
  }
}

// ---------------------------------------------------------------------------
// Playback + recenter controls
// ---------------------------------------------------------------------------

function setStatus(text) {
  statusEl.textContent = text;
}

function togglePlay() {
  if (video.paused) {
    video.play().catch(() => setStatus('Tap play again to start'));
    btnPlay.textContent = '❚❚';
    setStatus('Playing');
  } else {
    video.pause();
    btnPlay.textContent = '▶';
    setStatus('Paused');
  }
}

function recenter() {
  yawOffset = latestAlpha;
  setStatus('Recentered');
}

btnPlay.addEventListener('click', () => {
  // First press also kicks off sensor permission + IMU, since both need
  // to originate from a user gesture.
  requestSensorPermission();
  togglePlay();
});

btnRecenter.addEventListener('click', recenter);

// ---------------------------------------------------------------------------
// D-pad focus management (Neural Band / captouch -> arrow keys + Enter)
// ---------------------------------------------------------------------------

function moveFocus(direction) {
  const focusables = Array.from(document.querySelectorAll('.focusable:not([disabled])'));
  if (!focusables.length) return;

  const idx = focusables.indexOf(document.activeElement);
  if (idx === -1) {
    focusables[0].focus();
    return;
  }

  const next = (direction === 'up' || direction === 'left')
    ? (idx > 0 ? idx - 1 : focusables.length - 1)
    : (idx < focusables.length - 1 ? idx + 1 : 0);

  focusables[next].focus();
}

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case DPAD.UP:
    case DPAD.LEFT:
      moveFocus('up');
      break;
    case DPAD.DOWN:
    case DPAD.RIGHT:
      moveFocus('down');
      break;
    case DPAD.SELECT:
      if (document.activeElement.classList?.contains('focusable')) {
        document.activeElement.click();
      }
      break;
    default:
      return;
  }
  e.preventDefault();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

video.addEventListener('loadeddata', () => {
  buildSphere();
  animate();
});

video.addEventListener('error', () => {
  setStatus('Add your video at assets/video360.mp4');
});

btnPlay.focus();
