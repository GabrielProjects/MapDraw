// --- Color Palette Persistence ---
const COLOR_STORAGE_KEY = "mapdraw_custom_palette";
const GEOJSON_STORAGE_KEY = "mapdraw_drawings";

// Save the current color palette to localStorage
function saveColorPalette() {
  const palette = colorPalette.map(c => c.getAttribute('data-color'));
  localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(palette));
}

// Load color palette from localStorage, return array or null
function loadColorPalette() {
  const saved = localStorage.getItem(COLOR_STORAGE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { return null; }
  }
  return null;
}

// Restore color palette visuals from saved colors
function applyLoadedPalette(loaded) {
  if (loaded && Array.isArray(loaded) && loaded.length === colorPalette.length) {
    colorPalette.forEach((c, idx) => {
      c.setAttribute('data-color', loaded[idx]);
      c.style.background = loaded[idx];
      const inner = c.querySelector('.color-circle-inner');
      if (inner) inner.style.background = loaded[idx];
    });
    // Set drawColor to the selected one, or default to first
    const selectedIdx = colorPalette.findIndex(c => c.classList.contains('selected'));
    drawColor = loaded[selectedIdx >= 0 ? selectedIdx : 0];
    if (typeof updatePreviewDot === 'function') updatePreviewDot();
  }
}

// --- Drawings (GeoJSON) Persistence, including styles and labels ---
function saveDrawingsToStorage() {
  let features = [];
  drawnItems.eachLayer(function(layer) {
    let geo = layer.toGeoJSON();
    if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      geo.properties = geo.properties || {};
      geo.properties.color = layer.options.color;
      geo.properties.weight = layer.options.weight;
    }
    if (layer instanceof L.Marker) {
      geo.properties = geo.properties || {};
      geo.properties.label = layer._customLabel || "";
    }
    features.push(geo);
  });
  let geojson = {type: "FeatureCollection", features: features};
  localStorage.setItem(GEOJSON_STORAGE_KEY, JSON.stringify(geojson));
  // Also call backend autosave if available
  if (window.bridge && typeof window.bridge.autosave === 'function') {
    window.bridge.autosave(JSON.stringify(geojson));
  }
}

// --- Initialize Map ---
var map = L.map('map', {
  center: [38.1157, 13.3615], // Palermo
  zoom: 13,
  minZoom: 2,
  maxZoom: 19,
  dragging: false,
  doubleClickZoom: false,
  boxZoom: false,
  keyboard: false,
  scrollWheelZoom: true
});

// --- Custom emoji marker icon (identical to toolbar) ---
const customPinIcon = L.divIcon({
  className: 'custom-pin-icon',
  html: '📍',
  iconSize: [36, 36],
  iconAnchor: [18, 36],     // base of pin is at latlng
  popupAnchor: [0, -30]
});

// Map styles
var normalTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  minZoom: 2, maxZoom: 19, noWrap: true
}).addTo(map);
var satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  minZoom: 2, maxZoom: 19, noWrap: true
});
var darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  minZoom: 2, maxZoom: 19, noWrap: true,
  attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
});

// Map style switcher
document.getElementById('style-normal').onclick = function() {
  map.removeLayer(satelliteTiles); map.removeLayer(darkTiles);
  if (!map.hasLayer(normalTiles)) normalTiles.addTo(map);
  setActiveStyleBtn('style-normal');
};
document.getElementById('style-satellite').onclick = function() {
  map.removeLayer(normalTiles); map.removeLayer(darkTiles);
  if (!map.hasLayer(satelliteTiles)) satelliteTiles.addTo(map);
  setActiveStyleBtn('style-satellite');
};
document.getElementById('style-dark').onclick = function() {
  map.removeLayer(normalTiles); map.removeLayer(satelliteTiles);
  if (!map.hasLayer(darkTiles)) darkTiles.addTo(map);
  setActiveStyleBtn('style-dark');
};
function setActiveStyleBtn(id) {
  document.querySelectorAll('.style-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// --- Drawing Tools ---
var drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Color palette (query after DOMContentLoaded if needed)
var colorPalette = Array.from(document.querySelectorAll('.color-circle'));
var drawColor = colorPalette[0]?.getAttribute('data-color') || "#ff3232"; // default
colorPalette.forEach(function(circle) {
  let clickTimeout = null;
  let clickCount = 0;
  
  circle.onclick = function(e) {
    clickCount++;
    const isSelected = circle.classList.contains('selected');
    
    // Clear previous timeout
    if (clickTimeout) clearTimeout(clickTimeout);
    
    // Wait to distinguish single vs double click
    clickTimeout = setTimeout(() => {
      if (clickCount === 1) {
        // Single click
        if (isSelected) {
          // If already selected, open color picker
          showColorPicker(circle.getAttribute('data-color'), circle);
        } else {
          // Select this color
          colorPalette.forEach(cc => cc.classList.remove('selected'));
          circle.classList.add('selected');
          drawColor = circle.getAttribute('data-color');
          updatePreviewDot();
          setToolActive('freehand');
          erasing = false;
          document.getElementById('eraser-circle').style.display = 'none';
        }
      } else if (clickCount >= 2) {
        // Double click - always open color picker
        showColorPicker(circle.getAttribute('data-color'), circle);
      }
      clickCount = 0;
    }, 250);
  };
  
  // Right-click/long press for color picker
  circle.addEventListener('contextmenu', function(ev) {
    ev.preventDefault();
    showColorPicker(circle.getAttribute('data-color'), circle);
  });
});
function updatePreviewDot() {
  var widthPreview = document.getElementById('width-preview');
  widthPreview.style.width = (drawWeight * 1.6 + 5) + "px";
  widthPreview.style.height = (drawWeight * 1.6 + 5) + "px";
  widthPreview.style.background = drawColor;
}

// Width adjuster
var drawWeight = parseInt(document.getElementById('width-slider').value);
document.getElementById('width-slider').oninput = function() {
  drawWeight = parseInt(this.value);
  eraserRadius = 10 + drawWeight * 1.8;
  document.getElementById('eraser-circle').style.width = (eraserRadius*2)+'px';
  document.getElementById('eraser-circle').style.height = (eraserRadius*2)+'px';
  updatePreviewDot();
};
updatePreviewDot();

// Tool activation
var drawType = 'freehand';
var erasing = false;
var eraserRadius = 24;
var mouseDownEraser = false;
var lastActiveTool = 'freehand';
var pinLabels = [];

function setToolActive(tool) {
  document.querySelectorAll('.tool-btn').forEach(btn=>btn.classList.remove('active'));
  document.getElementById(tool + "-btn").classList.add('active');
  drawType = tool;
  lastActiveTool = tool;
}

document.getElementById('freehand-btn').onclick = function() {
  setToolActive('freehand');
  erasing = false; document.getElementById('eraser-circle').style.display = 'none';
};
document.getElementById('marker-btn').onclick = function() {
  setToolActive('marker');
  erasing = false; document.getElementById('eraser-circle').style.display = 'none';
};
document.getElementById('eraser-btn').onclick = function() {
  erasing = !erasing;
  if (erasing) lastActiveTool = 'eraser';
  setToolActive('eraser');
  document.getElementById('eraser-circle').style.display = erasing ? 'block' : 'none';
};

// --- Freehand Drawing ---
var isFreehand = false;
var freehandPolyline = null;
var freehandPoints = [];
var mouseDown = false;
map.on('mousedown', function(e) {
  if (drawType === 'freehand' && !erasing && e.originalEvent.button === 0) {
    isFreehand = true;
    mouseDown = true;
    freehandPoints = [e.latlng];
    freehandPolyline = L.polyline(freehandPoints, {
      color: drawColor,
      weight: drawWeight,
      smoothFactor: 1
    }).addTo(drawnItems);
  }
  if (erasing && e.originalEvent.button === 0) {
    mouseDownEraser = true;
    doEraser(e);
  }
});
map.on('mousemove', function(e) {
  if (drawType === 'freehand' && mouseDown && freehandPolyline) {
    freehandPoints.push(e.latlng);
    freehandPolyline.setLatLngs(freehandPoints);
  }
  if (erasing) {
    var p = map.latLngToContainerPoint(e.latlng);
    var eraserCircle = document.getElementById('eraser-circle');
    eraserCircle.style.display = 'block';
    eraserCircle.style.left = (p.x - eraserRadius) + "px";
    eraserCircle.style.top = (p.y - eraserRadius) + "px";
    eraserCircle.style.width = (eraserRadius*2) + "px";
    eraserCircle.style.height = (eraserRadius*2) + "px";
    if (mouseDownEraser) doEraser(e);
  } else {
    document.getElementById('eraser-circle').style.display = 'none';
  }
});
map.on('mouseup', function(e) {
  if (drawType === 'freehand' && mouseDown) {
    mouseDown = false;
    if (freehandPolyline) {
      freehandPolyline = null;
      freehandPoints = [];
    }
    saveHistory();
  }
  if (erasing) {
    mouseDownEraser = false;
    saveHistory();
  }
});

function doEraser(e) {
  var changed = false;
  drawnItems.eachLayer(function(layer) {
    if (layer instanceof L.Marker) {
      var dist = map.latLngToContainerPoint(layer.getLatLng()).distanceTo(map.latLngToContainerPoint(e.latlng));
      if (dist < eraserRadius) { drawnItems.removeLayer(layer); changed = true; }
    } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      if (eraseSegmentFromPolyline(layer, e.latlng, eraserRadius)) changed = true;
    }
  });
  if (changed) updatePinpointSidebar();
}

// --- SMOOTH ERASER (only cuts the part inside the circle) ---
function eraseSegmentFromPolyline(layer, clickLatLng, radiusPx) {
  var latlngs = layer.getLatLngs();
  if (!Array.isArray(latlngs[0])) latlngs = [latlngs];
  var changed = false, newLatlngsArr = [];
  var center = map.latLngToContainerPoint(clickLatLng);

  latlngs.forEach(function(line) {
    var seg = [];
    for (var i=0; i<line.length-1; i++) {
      var p1lat = line[i];
      var p2lat = line[i+1];
      var p1 = map.latLngToContainerPoint(p1lat);
      var p2 = map.latLngToContainerPoint(p2lat);

      var d1 = p1.distanceTo(center);
      var d2 = p2.distanceTo(center);

      // If both ends are outside the eraser, add normally
      if (d1 >= radiusPx && d2 >= radiusPx) {
        if (seg.length == 0) seg.push(p1lat);
        seg.push(p2lat);
      } else if (d1 < radiusPx && d2 < radiusPx) {
        // both points are inside the eraser, drop this segment (erase it)
        if (seg.length) { newLatlngsArr.push(seg.slice()); seg = []; }
        changed = true;
      } else {
        // One point inside, one outside: split at intersection
        var intersection = circleSegmentIntersection(center, radiusPx, p1, p2);
        if (intersection) {
          var lat = map.containerPointToLatLng(intersection);
          if (d1 < radiusPx && d2 >= radiusPx) {
            // leaving the eraser, start new segment at intersection
            if (seg.length) { newLatlngsArr.push(seg.slice()); seg = []; }
            seg.push(lat);
            seg.push(p2lat);
          } else if (d1 >= radiusPx && d2 < radiusPx) {
            // entering eraser, add up to intersection and end segment
            if (seg.length == 0) seg.push(p1lat);
            seg.push(lat);
            newLatlngsArr.push(seg.slice());
            seg = [];
          }
          changed = true;
        }
      }
    }
    if (seg.length > 1) newLatlngsArr.push(seg);
  });

  if (changed) {
    drawnItems.removeLayer(layer);
    newLatlngsArr.forEach(function(seg) {
      if (seg.length > 1) {
        var color = (layer.options && layer.options.color) || drawColor;
        var weight = (layer.options && layer.options.weight) || drawWeight;
        var poly = L.polyline(seg, {color: color, weight: weight, smoothFactor: 1});
        drawnItems.addLayer(poly);
      }
    });
  }
  return changed;
}

// Find intersection of line segment and circle (eraser)
function circleSegmentIntersection(center, radius, p1, p2) {
  var dx = p2.x - p1.x, dy = p2.y - p1.y;
  var fx = p1.x - center.x, fy = p1.y - center.y;
  var a = dx*dx + dy*dy;
  var b = 2 * (fx*dx + fy*dy);
  var c = fx*fx + fy*fy - radius*radius;
  var discriminant = b*b - 4*a*c;
  if (discriminant < 0) return null;
  discriminant = Math.sqrt(discriminant);

  var t1 = (-b - discriminant) / (2*a);
  var t2 = (-b + discriminant) / (2*a);

  var points = [];
  if (t1 >= 0 && t1 <= 1) points.push({x: p1.x + t1*dx, y: p1.y + t1*dy});
  if (t2 >= 0 && t2 <= 1) points.push({x: p1.x + t2*dx, y: p1.y + t2*dy});
  if (points.length == 0) return null;
  return points[0];
}

// --- Marker tool, supports renaming ---
map.on('click', function(e) {
  if (drawType === 'marker') {
    var defaultLabel = "Pinpoint";
    var m = L.marker(e.latlng, {icon: customPinIcon, riseOnHover: true}).addTo(drawnItems);
    m._customLabel = defaultLabel + " " + (pinLabels.length + 1);
    if (m.bindPopup) m.bindPopup(m._customLabel);
    pinLabels.push({marker: m, label: m._customLabel});
    updatePinpointSidebar();
    saveHistory();
  }
});

// --- Pinpoint Sidebar with renaming and jump-to-pin ---
function updatePinpointSidebar() {
  var pinListDiv = document.getElementById('pinpoint-list');
  var markers = [];
  var newLabels = [];
  drawnItems.eachLayer(function(layer) {
    if (layer instanceof L.Marker) {
      var latlng = layer.getLatLng();
      var lblObj = pinLabels.find(x => x.marker === layer);
      var label = lblObj ? lblObj.label : (layer._customLabel || "Pinpoint");
      markers.push({lat: latlng.lat, lng: latlng.lng, layer: layer, label: label});
      newLabels.push({marker: layer, label: label});
    }
  });
  pinLabels = newLabels;
  pinListDiv.innerHTML = '';
  markers.forEach(function(m, idx) {
    var div = document.createElement('div');
    div.className = 'pinpoint-item';
    div.innerHTML =
      '<span class="jump-to-pin" style="cursor:pointer;" data-jump="'+idx+'">📍</span> ' +
      '<input type="text" class="pin-label" value="'+m.label.replace(/"/g,'&quot;')+'" /> ' +
      '<span class="pin-coord">' + m.lat.toFixed(5) + ', ' + m.lng.toFixed(5) + '</span>' +
      '<button class="delete-pin-btn" title="Delete" data-idx="'+idx+'">&times;</button>';
    pinListDiv.appendChild(div);
    // Label renaming handler
    var labelInput = div.querySelector('.pin-label');
    labelInput.onchange = function() {
      m.label = labelInput.value;
      m.layer._customLabel = m.label;
      var lblObj = pinLabels.find(x => x.marker === m.layer);
      if (lblObj) lblObj.label = m.label;
      if (m.layer.bindPopup) {
        m.layer.unbindPopup();
        m.layer.bindPopup(m.label);
      }
      saveHistory();
    };
    // Delete
    div.querySelector('.delete-pin-btn').onclick = function() {
      drawnItems.removeLayer(m.layer);
      updatePinpointSidebar();
      saveHistory();
    };
    // Jump to pin handler
    div.querySelector('.jump-to-pin').onclick = function() {
    // Center marker at the exact center of the map
    const mapSize = map.getSize();
    const centerPoint = map.containerPointToLatLng([mapSize.x / 2, mapSize.y / 2]);
    const markerLatLng = L.latLng(m.lat, m.lng);
    // Calculate the difference in lat/lng
    const latDiff = markerLatLng.lat - centerPoint.lat;
    const lngDiff = markerLatLng.lng - centerPoint.lng;
    // Pan the map so the marker is at the center
    const newCenter = L.latLng(map.getCenter().lat + latDiff, map.getCenter().lng + lngDiff);
    map.setView(newCenter, 17, {animate: true});
    if (m.layer.openPopup) m.layer.openPopup();
    };
  });
  document.getElementById('pinpoint-sidebar').style.display = (markers.length > 0) ? 'block' : 'none';
}

// --- Middle Mouse Panning (robust) ---
let isMiddleDragging = false;
let dragStart = null;
let dragStartCenter = null;
map.getContainer().addEventListener('mousedown', function(e) {
  if (e.button === 1) { // Middle mouse
    isMiddleDragging = true;
    map.getContainer().style.cursor = 'grab';
    dragStart = [e.clientX, e.clientY];
    dragStartCenter = map.getCenter();
    e.preventDefault();
  }
});
map.getContainer().addEventListener('mousemove', function(e) {
  if (isMiddleDragging && dragStart && dragStartCenter) {
    var dx = e.clientX - dragStart[0];
    var dy = e.clientY - dragStart[1];
    var size = map.getSize();
    var bounds = map.getBounds();
    var nw = map.containerPointToLatLng([0,0]);
    var se = map.containerPointToLatLng([size.x,size.y]);
    var latPerPx = (se.lat - nw.lat) / size.y;
    var lngPerPx = (se.lng - nw.lng) / size.x;
    var newLat = dragStartCenter.lat - (dy * latPerPx);
    var newLng = dragStartCenter.lng - (dx * lngPerPx);
    map.setView([newLat, newLng], map.getZoom(), {animate: false});
  }
});
map.getContainer().addEventListener('mouseup', function(e) {
  if (e.button === 1) {
    isMiddleDragging = false;
    dragStart = null;
    dragStartCenter = null;
    map.getContainer().style.cursor = '';
    e.preventDefault();
  }
});
map.getContainer().addEventListener('mouseleave', function(e) {
  isMiddleDragging = false;
  dragStart = null;
  dragStartCenter = null;
  map.getContainer().style.cursor = '';
});
map.getContainer().addEventListener('auxclick', function(e) {
  if (e.button === 1) e.preventDefault();
});

// --- Undo & History (preserves color/weight/labels) ---
var drawHistory = [];
function saveHistory() {
  let features = [];
  drawnItems.eachLayer(function(layer) {
    let geo = layer.toGeoJSON();
    if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      geo.properties = geo.properties || {};
      geo.properties.color = layer.options.color;
      geo.properties.weight = layer.options.weight;
    }
    if (layer instanceof L.Marker) {
      geo.properties = geo.properties || {};
      geo.properties.label = layer._customLabel || "";
    }
    features.push(geo);
  });
  let geojson = {type: "FeatureCollection", features: features};
  drawHistory.push(JSON.stringify(geojson));
  if (drawHistory.length > 50) drawHistory.shift();
  saveDrawingsToStorage();
}
document.getElementById('undo-btn').onclick = function() {
  if (drawHistory.length < 2) return;
  drawHistory.pop();
  var last = JSON.parse(drawHistory[drawHistory.length-1]);
  drawnItems.clearLayers();
  pinLabels = [];
  L.geoJSON(last, {
    pointToLayer: function(feature, latlng) {
      let m = L.marker(latlng, {icon: customPinIcon, riseOnHover: true});
      if (feature.properties && feature.properties.label) {
        m._customLabel = feature.properties.label;
        if (m.bindPopup) m.bindPopup(m._customLabel);
        pinLabels.push({marker: m, label: m._customLabel});
      }
      return m;
    },
    style: function(feature) {
      let s = {};
      if (feature.properties && feature.geometry.type === "LineString") {
        if (feature.properties.color) s.color = feature.properties.color;
        if (feature.properties.weight) s.weight = feature.properties.weight;
      }
      return s;
    }
  }).eachLayer(function(layer) { drawnItems.addLayer(layer); });
  updatePinpointSidebar();
  saveDrawingsToStorage();
};
document.getElementById('clear-btn').onclick = function() {
  drawnItems.clearLayers();
  updatePinpointSidebar();
  drawHistory = [];
  localStorage.removeItem(GEOJSON_STORAGE_KEY);
  if (window.bridge && typeof window.bridge.autosave === 'function') {
    window.bridge.autosave('{}');
  }
};

// Keep tool active after zoom/pan
map.on('zoomend moveend', function() {
  setToolActive(lastActiveTool);
  drawType = lastActiveTool;
});

// --- STATUS BAR UPDATES ---
function updateStatusBar() {
  const toolNames = {
    'freehand': 'Draw Mode',
    'marker': 'Marker Mode',
    'eraser': 'Eraser Mode'
  };
  document.getElementById('status-tool').textContent = erasing ? 'Eraser Mode' : (toolNames[drawType] || 'Draw Mode');
  document.getElementById('status-color').style.background = drawColor;
  document.getElementById('status-width').textContent = `Width: ${drawWeight}px`;
  
  let pinCount = 0;
  drawnItems.eachLayer(function(layer) {
    if (layer instanceof L.Marker) pinCount++;
  });
  document.getElementById('status-pins').textContent = `Pins: ${pinCount}`;
}

// Update coordinates on mouse move
map.on('mousemove', function(e) {
  const lat = e.latlng.lat.toFixed(5);
  const lng = e.latlng.lng.toFixed(5);
  document.getElementById('status-coords').textContent = `${lat}, ${lng}`;
});

// Update status bar when tools change
const originalSetToolActive = setToolActive;
setToolActive = function(tool) {
  originalSetToolActive(tool);
  updateStatusBar();
};

// Update status when color/width changes
document.getElementById('width-slider').addEventListener('input', updateStatusBar);
colorPalette.forEach(circle => {
  const originalClick = circle.onclick;
  circle.onclick = function(e) {
    if (originalClick) originalClick.call(this, e);
    updateStatusBar();
  };
});

// --- EXPORT/IMPORT FUNCTIONALITY ---
// Export as GeoJSON
document.getElementById('export-geojson-btn').onclick = function() {
  let features = [];
  drawnItems.eachLayer(function(layer) {
    let geo = layer.toGeoJSON();
    if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      geo.properties = geo.properties || {};
      geo.properties.color = layer.options.color;
      geo.properties.weight = layer.options.weight;
    }
    if (layer instanceof L.Marker) {
      geo.properties = geo.properties || {};
      geo.properties.label = layer._customLabel || "";
    }
    features.push(geo);
  });
  let geojson = {type: "FeatureCollection", features: features};
  const blob = new Blob([JSON.stringify(geojson, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mapdraw_${new Date().toISOString().slice(0,10)}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
};

// Import GeoJSON
document.getElementById('import-btn').onclick = function() {
  document.getElementById('import-file-input').click();
};

document.getElementById('import-file-input').onchange = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const geojson = JSON.parse(evt.target.result);
      drawnItems.clearLayers();
      pinLabels = [];
      L.geoJSON(geojson, {
        pointToLayer: function(feature, latlng) {
          let m = L.marker(latlng, {icon: customPinIcon, riseOnHover: true});
          if (feature.properties && feature.properties.label) {
            m._customLabel = feature.properties.label;
            if (m.bindPopup) m.bindPopup(m._customLabel);
            pinLabels.push({marker: m, label: m._customLabel});
          }
          return m;
        },
        style: function(feature) {
          let s = {};
          if (feature.properties && feature.geometry.type === "LineString") {
            if (feature.properties.color) s.color = feature.properties.color;
            if (feature.properties.weight) s.weight = feature.properties.weight;
          }
          return s;
        }
      }).eachLayer(function(layer) { drawnItems.addLayer(layer); });
      saveHistory();
      updatePinpointSidebar();
      updateStatusBar();
      alert('GeoJSON imported successfully!');
    } catch (err) {
      alert('Error importing GeoJSON: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // Reset input
};

// Export as Image (PNG)
document.getElementById('export-image-btn').onclick = function() {
  // Use leaflet-image or html2canvas if available, or use a simple approach
  alert('Image export: Use your browser\'s screenshot tool or install a map export plugin.\n\nTip: Press Ctrl+Shift+S in most browsers for screenshot mode.');
};

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', function(e) {
  // Ignore if typing in input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  const key = e.key.toLowerCase();
  
  // Tool shortcuts
  if (key === 'm') {
    document.getElementById('marker-btn').click();
    e.preventDefault();
  } else if (key === 'd') {
    document.getElementById('freehand-btn').click();
    e.preventDefault();
  } else if (key === 'e') {
    document.getElementById('eraser-btn').click();
    e.preventDefault();
  }
  
  // Color shortcuts (1-3)
  if (key >= '1' && key <= '3') {
    const idx = parseInt(key) - 1;
    if (colorPalette[idx]) {
      colorPalette[idx].click();
      e.preventDefault();
    }
  }
  
  // Undo (Ctrl+Z)
  if (e.ctrlKey && key === 'z') {
    document.getElementById('undo-btn').click();
    e.preventDefault();
  }
  
  // Clear (Ctrl+Delete)
  if (e.ctrlKey && key === 'delete') {
    if (confirm('Clear all drawings?')) {
      document.getElementById('clear-btn').click();
    }
    e.preventDefault();
  }
  
  // Export GeoJSON (Ctrl+S)
  if (e.ctrlKey && key === 's') {
    document.getElementById('export-geojson-btn').click();
    e.preventDefault();
  }
  
  // Import (Ctrl+O)
  if (e.ctrlKey && key === 'o') {
    document.getElementById('import-btn').click();
    e.preventDefault();
  }
  
  // Export Image (Ctrl+P)
  if (e.ctrlKey && key === 'p') {
    document.getElementById('export-image-btn').click();
    e.preventDefault();
  }
  
  // Help (?)
  if (key === '?' || (e.shiftKey && key === '/')) {
    document.getElementById('help-btn').click();
    e.preventDefault();
  }
  
  // Map navigation with WASD and Arrow keys
  const panDistance = 100; // pixels to pan
  if (key === 'w' || key === 'arrowup') {
    map.panBy([0, -panDistance]);
    e.preventDefault();
  }
  if (key === 's' || key === 'arrowdown') {
    map.panBy([0, panDistance]);
    e.preventDefault();
  }
  if (key === 'a' || key === 'arrowleft') {
    map.panBy([-panDistance, 0]);
    e.preventDefault();
  }
  if (key === 'd' || key === 'arrowright') {
    map.panBy([panDistance, 0]);
    e.preventDefault();
  }
  
  // Zoom in with + or =
  if (key === '+' || key === '=') {
    map.zoomIn();
    e.preventDefault();
  }
  
  // Zoom out with -
  if (key === '-') {
    map.zoomOut();
    e.preventDefault();
  }
});

// --- HELP MODAL ---
document.getElementById('help-btn').onclick = function() {
  document.getElementById('help-modal').style.display = 'flex';
};

document.getElementById('help-close').onclick = function() {
  document.getElementById('help-modal').style.display = 'none';
};

document.getElementById('help-modal').onclick = function(e) {
  if (e.target === this) {
    this.style.display = 'none';
  }
};

// Update status bar on pinpoint changes
const originalUpdatePinpointSidebar = updatePinpointSidebar;
updatePinpointSidebar = function() {
  originalUpdatePinpointSidebar();
  updateStatusBar();
};

// Initialize status bar
updateStatusBar();

// --- Restore persistent drawing and palette on load ---
document.addEventListener("DOMContentLoaded", function() {
  // Restore color palette
  const loaded = loadColorPalette();
  if (loaded) applyLoadedPalette(loaded);

  // Try backend first (PyQt)
  if (window.bridge && typeof window.bridge.autoload === 'function') {
    const loadedData = window.bridge.autoload();
    if (loadedData && loadedData.length > 0) {
      try {
        var geojson = JSON.parse(loadedData);
        drawnItems.clearLayers();
        pinLabels = [];
        L.geoJSON(geojson, {
          pointToLayer: function(feature, latlng) {
            let m = L.marker(latlng, {icon: customPinIcon, riseOnHover: true});
            if (feature.properties && feature.properties.label) {
              m._customLabel = feature.properties.label;
              if (m.bindPopup) m.bindPopup(m._customLabel);
              pinLabels.push({marker: m, label: m._customLabel});
            }
            return m;
          },
          style: function(feature) {
            let s = {};
            if (feature.properties && feature.geometry.type === "LineString") {
              if (feature.properties.color) s.color = feature.properties.color;
              if (feature.properties.weight) s.weight = feature.properties.weight;
            }
            return s;
          }
        }).eachLayer(function(layer) { drawnItems.addLayer(layer); });
        saveHistory();
        updatePinpointSidebar();
        return;
      } catch (e) { /* ignore */ }
    }
  }

  // Fallback: try localStorage
  const browserSaved = localStorage.getItem(GEOJSON_STORAGE_KEY);
  if (browserSaved) {
    try {
      var geojson = JSON.parse(browserSaved);
      drawnItems.clearLayers();
      pinLabels = [];
      L.geoJSON(geojson, {
        pointToLayer: function(feature, latlng) {
          let m = L.marker(latlng, {icon: customPinIcon, riseOnHover: true});
          if (feature.properties && feature.properties.label) {
            m._customLabel = feature.properties.label;
            if (m.bindPopup) m.bindPopup(m._customLabel);
            pinLabels.push({marker: m, label: m._customLabel});
          }
          return m;
        },
        style: function(feature) {
          let s = {};
          if (feature.properties && feature.geometry.type === "LineString") {
            if (feature.properties.color) s.color = feature.properties.color;
            if (feature.properties.weight) s.weight = feature.properties.weight;
          }
          return s;
        }
      }).eachLayer(function(layer) { drawnItems.addLayer(layer); });
      saveHistory();
      updatePinpointSidebar();
    } catch (e) { /* ignore */ }
  }
});

// ---- Modern Map Search Bar: Autocomplete + Fly to ----
const searchInput = document.getElementById('map-search-input');
const searchResults = document.getElementById('map-search-results');
let searchDebounce = null;

// Function to format display name in a more user-friendly way
function formatDisplayName(result) {
  const address = result.address;
  if (!address) return result.display_name;
  
  // Terms to exclude from address display
  const excludeTerms = [
    'circoscrizione', 'quartiere', 'frazione', 'municipio', 'borough', 
    'district', 'county', 'region', 'province', 'postal_code', 'postcode'
  ];
  
  // Build a shorter, more readable address
  const parts = [];
  
  // Add road/street with house number if available
  if (address.road) {
    const road = address.house_number ? `${address.road} ${address.house_number}` : address.road;
    parts.push(road);
  } else if (address.pedestrian) {
    parts.push(address.pedestrian);
  } else if (address.footway) {
    parts.push(address.footway);
  } else if (address.amenity) {
    parts.push(address.amenity);
  }
  
  // Add suburb, neighbourhood, or district (but filter out administrative subdivisions)
  if (address.suburb && !isExcludedTerm(address.suburb, excludeTerms)) {
    parts.push(address.suburb);
  } else if (address.neighbourhood && !isExcludedTerm(address.neighbourhood, excludeTerms)) {
    parts.push(address.neighbourhood);
  } else if (address.quarter && !isExcludedTerm(address.quarter, excludeTerms)) {
    parts.push(address.quarter);
  }
  
  // Add city or town
  if (address.city) {
    parts.push(address.city);
  } else if (address.town) {
    parts.push(address.town);
  } else if (address.village) {
    parts.push(address.village);
  } else if (address.municipality) {
    parts.push(address.municipality);
  }
  
  // Add state/region only if it's a well-known region and different from city
  if (address.state && address.state !== address.city && isWellKnownRegion(address.state)) {
    parts.push(address.state);
  }
  
  // Add country for international searches (only if we have at least one other part)
  if (address.country && parts.length > 0 && parts.length < 4) {
    parts.push(address.country);
  }
  
  // Remove duplicates while preserving order
  const uniqueParts = [...new Set(parts)];
  
  // If we built a custom address, use it; otherwise fallback to display_name
  return uniqueParts.length > 0 ? uniqueParts.join(', ') : result.display_name;
}

// Helper function to check if a term should be excluded
function isExcludedTerm(term, excludeTerms) {
  const termLower = term.toLowerCase();
  return excludeTerms.some(exclude => termLower.includes(exclude));
}

// Helper function to determine if a region/state is well-known
function isWellKnownRegion(region) {
  const wellKnownRegions = [
    'sicilia', 'lombardia', 'lazio', 'campania', 'veneto', 'piemonte', 'emilia-romagna',
    'toscana', 'puglia', 'calabria', 'sardegna', 'liguria', 'marche', 'abruzzo',
    'california', 'texas', 'new york', 'florida', 'illinois', 'pennsylvania',
    'bavaria', 'ile-de-france', 'catalonia', 'andalusia'
  ];
  return wellKnownRegions.some(known => region.toLowerCase().includes(known));
}

// Function to get relevance score for sorting
function getRelevanceScore(result, query) {
  const displayName = result.display_name.toLowerCase();
  const queryLower = query.toLowerCase();
  let score = 0;
  
  // Exact match gets highest score
  if (displayName === queryLower) score += 1000;
  
  // Starts with query gets high score
  if (displayName.startsWith(queryLower)) score += 500;
  
  // Contains query as whole word
  if (new RegExp('\\b' + queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(displayName)) {
    score += 100;
  }
  
  // Prefer more specific results (fewer commas = more specific)
  const commaCount = (displayName.match(/,/g) || []).length;
  score -= commaCount * 5;
  
  // Prefer results with house numbers for address searches
  if (result.address && result.address.house_number) score += 50;
  
  // Prefer higher importance
  if (result.importance) score += result.importance * 20;
  
  return score;
}

searchInput.addEventListener('input', function() {
  const query = this.value.trim();
  if (searchDebounce) clearTimeout(searchDebounce);
  if (!query) {
    searchResults.style.display = 'none';
    searchResults.innerHTML = '';
    return;
  }
  searchDebounce = setTimeout(() => {
    // Use higher limit to get more options, then filter/sort them
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=20`)
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) {
          searchResults.innerHTML = '<li style="color:#888;pointer-events:none;">No results found</li>';
          searchResults.style.display = 'block';
          return;
        }
        
        // Sort by relevance
        const sortedResults = data
          .map(r => ({ result: r, score: getRelevanceScore(r, query) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 8) // Take top 8
          .map(item => item.result);
        
        searchResults.innerHTML = '';
        sortedResults.forEach((result, idx) => {
          const li = document.createElement('li');
          const formattedName = formatDisplayName(result);
          
          // Create a nicer display with icon based on type
          const icon = result.icon ? 
            (result.type === 'city' || result.type === 'town' ? '🏙️' :
             result.type === 'village' ? '🏘️' :
             result.class === 'highway' || result.class === 'place' ? '📍' :
             result.class === 'building' ? '🏢' : '📌') : '📍';
          
          li.innerHTML = `<span style="margin-right:8px;">${icon}</span><span>${formattedName}</span>`;
          
          li.onclick = () => {
            // Adjust zoom level based on result type
            let zoomLevel = 18;
            if (result.type === 'city' || result.type === 'administrative') {
              zoomLevel = 12;
            } else if (result.type === 'suburb' || result.type === 'neighbourhood') {
              zoomLevel = 15;
            } else if (result.type === 'road' || result.class === 'highway') {
              zoomLevel = 16;
            }
            
            map.setView([parseFloat(result.lat), parseFloat(result.lon)], zoomLevel, { animate: true });
            
            // Add a temporary marker
            const tempMarker = L.marker([result.lat, result.lon], {
              icon: customPinIcon,
              interactive: false,
              keyboard: false,
              opacity: 0.85
            }).addTo(map);
            setTimeout(() => map.removeLayer(tempMarker), 3500);
            
            searchResults.style.display = 'none';
            searchInput.value = formattedName;
            searchInput.blur();
          };
          searchResults.appendChild(li);
        });
        searchResults.style.display = 'block';
      })
      .catch(err => {
        console.error('Search error:', err);
        searchResults.innerHTML = '<li style="color:#888;pointer-events:none;">Search error. Try again.</li>';
        searchResults.style.display = 'block';
      });
  }, 300);
});

// Hide results on click outside
document.addEventListener('click', function(e) {
  if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
    searchResults.style.display = 'none';
  }
});

searchInput.addEventListener('focus', function() {
  if (searchResults.innerHTML) searchResults.style.display = 'block';
});

// Allow Enter key to select first result
searchInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    const firstResult = searchResults.querySelector('li');
    if (firstResult && firstResult.onclick) {
      firstResult.onclick();
    }
    e.preventDefault();
  } else if (e.key === 'Escape') {
    searchResults.style.display = 'none';
    searchInput.blur();
  }
});
