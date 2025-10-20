// --- Custom Radial Color Picker Logic (NO EXTERNAL JS!) ---
const presetColors = [
  "#ff3232", "#3698ff", "#25ce55", "#ffce26", "#000000", "#8763e5", "#e762a8", "#ff6d00", "#888888", "#ffffff"
];
let colorCircleToEdit = null;
let currentPickerColor = presetColors[0];
let currentPickerHSV = { h: 0, s: 1, v: 1 };

// Show the modal and set initial color
function showColorPicker(initialColor, targetCircle) {
  colorCircleToEdit = targetCircle;
  currentPickerColor = initialColor;
  const modal = document.getElementById('color-picker-modal');
  const presetWrap = document.getElementById('color-presets');
  presetWrap.innerHTML = '';
  presetColors.forEach(col => {
    const d = document.createElement('div');
    d.className = 'color-picker-preset-circle';
    if (col.toLowerCase() === initialColor.toLowerCase()) d.classList.add('selected');
    d.style.background = col;
    d.innerHTML = `<div class="color-picker-preset-inner"></div>`;
    d.onclick = () => {
      selectColorPicker(col);
      updateColorWheelFromHex(col);
      if (typeof saveColorPalette === 'function') saveColorPalette();
    };
    presetWrap.appendChild(d);
  });
  updateColorWheelFromHex(initialColor);
  selectColorPicker(initialColor);
  modal.style.display = 'block';
}
function hideColorPicker() {
  document.getElementById('color-picker-modal').style.display = 'none';
  colorCircleToEdit = null;
}

function selectColorPicker(col) {
  currentPickerColor = col;
  document.getElementById('color-picker-current').style.background = col;
  Array.from(document.getElementsByClassName('color-picker-preset-circle')).forEach(el=>{
    el.classList.toggle('selected', el.style.background.toLowerCase() === col.toLowerCase());
  });
}

document.getElementById('color-picker-cancel').onclick = hideColorPicker;
document.getElementById('color-picker-modal').onclick = function(e) {
  if (e.target === this || e.target.classList.contains('color-picker-backdrop')) hideColorPicker();
};
document.getElementById('color-picker-ok').onclick = function() {
  if (!colorCircleToEdit) return;
  let col = currentPickerColor;
  colorCircleToEdit.setAttribute('data-color', col);
  colorCircleToEdit.style.background = col;
  // Update the inner visual circle
  const inner = colorCircleToEdit.querySelector('.color-circle-inner');
  if (inner) inner.style.background = col;
  // Activate and update selected state
  if (typeof colorPalette !== 'undefined') {
    colorPalette.forEach(cc => cc.classList.remove('selected'));
    colorCircleToEdit.classList.add('selected');
    drawColor = col;
    if (typeof updatePreviewDot === 'function') updatePreviewDot();
    if (typeof saveColorPalette === 'function') saveColorPalette();
  }
  hideColorPicker();
};

// --- Color wheel drawing and interaction ---
function updateColorWheelFromHex(hex) {
  let hsv = hexToHSV(hex);
  currentPickerHSV = hsv;
  drawColorWheel(hsv.h, hsv.s, hsv.v);
  document.getElementById('color-brightness-slider').value = Math.round(hsv.v*100);
  setBrightnessSliderGradient(hsv.h);
}
function drawColorWheel(hue, sat, val) {
  const canvas = document.getElementById('color-wheel-canvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, r = w/2-5;
  ctx.clearRect(0, 0, w, h);

  // Draw wheel
  for(let angle=0; angle<360; angle+=1) {
    let rad = angle*Math.PI/180;
    let grad = ctx.createLinearGradient(
      w/2+Math.cos(rad)*r, h/2+Math.sin(rad)*r,
      w/2, h/2
    );
    grad.addColorStop(0, `hsl(${angle}, 100%, 50%)`);
    grad.addColorStop(1, "#fff");
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(w/2, h/2, r, rad, rad+Math.PI/180, false);
    ctx.lineWidth = 18;
    ctx.stroke();
  }
  // Draw cursor
  let rad = hue*Math.PI/180;
  ctx.save();
  ctx.translate(w/2, h/2);
  ctx.rotate(rad);
  ctx.beginPath();
  ctx.arc(r, 0, 8, 0, 2*Math.PI, false);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#334ed2";
  ctx.fillStyle = hsvToHex(hue, 1, val);
  ctx.shadowColor = "#fff9";
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Update preview and value
  currentPickerColor = hsvToHex(hue, sat, val);
  document.getElementById('color-picker-current').style.background = currentPickerColor;
  setBrightnessSliderGradient(hue);
}

// --- Gradient Brightness Slider ---
function setBrightnessSliderGradient(hue) {
  // Left: black, Center: color, Right: white
  const color = hsvToHex(hue, 1, 1);
  const slider = document.getElementById('color-brightness-slider');
  const grad = `linear-gradient(90deg, #000 0%, ${color} 50%, #fff 100%)`;
  slider.style.setProperty('--brightness-gradient', grad);
  slider.style.background = grad;
}

// --- Live drag support ---
function updateColorFromEvent(e) {
  const canvas = document.getElementById('color-wheel-canvas');
  const rect = canvas.getBoundingClientRect();
  // Mouse and touch support:
  const evt = e.touches ? e.touches[0] : e;
  const x = evt.clientX - rect.left - canvas.width/2;
  const y = evt.clientY - rect.top - canvas.height/2;
  const angle = Math.atan2(y, x);
  let deg = angle*180/Math.PI;
  if (deg < 0) deg += 360;
  currentPickerHSV.h = deg;
  currentPickerHSV.s = 1;
  drawColorWheel(currentPickerHSV.h, 1, currentPickerHSV.v);
  selectColorPicker(hsvToHex(currentPickerHSV.h, 1, currentPickerHSV.v));
}
let isPickingColor = false;
const colorWheelCanvas = document.getElementById('color-wheel-canvas');
colorWheelCanvas.addEventListener('mousedown', function(e) {
  isPickingColor = true;
  updateColorFromEvent(e);
});
document.addEventListener('mousemove', function(e) {
  if (isPickingColor) updateColorFromEvent(e);
});
document.addEventListener('mouseup', function(e) {
  isPickingColor = false;
});
// Optional: support touch devices
colorWheelCanvas.addEventListener('touchstart', function(e) {
  isPickingColor = true;
  updateColorFromEvent(e);
});
document.addEventListener('touchmove', function(e) {
  if (isPickingColor) updateColorFromEvent(e);
}, {passive: false});
document.addEventListener('touchend', function(e) {
  isPickingColor = false;
});

// --- HEX/HSV helpers ---
function hexToHSV(hex) {
  hex = hex.replace(/^#/, "");
  let bigint = parseInt(hex, 16);
  let r = ((bigint >> 16) & 255) / 255;
  let g = ((bigint >> 8) & 255) / 255;
  let b = (bigint & 255) / 255;
  let mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx-mn, h, s, v = mx;
  if (d === 0) h = 0;
  else if (mx === r) h = ((g-b)/d)%6;
  else if (mx === g) h = (b-r)/d + 2;
  else h = (r-g)/d + 4;
  h = Math.round(h*60); if (h<0) h+=360;
  s = mx === 0 ? 0 : d/mx;
  return {h:h, s:s, v:v};
}
function hsvToHex(h,s,v) {
  let c = v*s, x = c*(1-Math.abs((h/60)%2-1)), m = v-c, r=0,g=0,b=0;
  if (0<=h && h<60) [r,g,b] = [c,x,0];
  else if (60<=h && h<120) [r,g,b] = [x,c,0];
  else if (120<=h && h<180) [r,g,b] = [0,c,x];
  else if (180<=h && h<240) [r,g,b] = [0,x,c];
  else if (240<=h && h<300) [r,g,b] = [x,0,c];
  else if (300<=h && h<360) [r,g,b] = [c,0,x];
  let toHex = t => ("0"+Math.round((t+m)*255).toString(16)).slice(-2);
  return "#"+toHex(r)+toHex(g)+toHex(b);
}

// --- Brightness slider ---
document.getElementById('color-brightness-slider').oninput = function(e) {
  currentPickerHSV.v = this.value/100;
  drawColorWheel(currentPickerHSV.h, 1, currentPickerHSV.v);
  selectColorPicker(hsvToHex(currentPickerHSV.h, 1, currentPickerHSV.v));
  setBrightnessSliderGradient(currentPickerHSV.h);
};
