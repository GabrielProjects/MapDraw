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
    if (layer instanceof L.Circle) {
      const center = layer.getLatLng();
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [center.lng, center.lat] },
        properties: {
          shape: "circle",
          radius: layer.getRadius(),
          color: layer.options.color,
          weight: layer.options.weight
        }
      });
    } else {
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
    }
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
// Temp state for new tools
var circleCenter = null;
var tempCircle = null;
var lineStart = null;
var tempLine = null;
// Circle default radius settings
var useDefaultCircleRadius = false;
var defaultCircleRadiusMeters = 1000;
var defaultRadiusUnit = 'm';

function clearTempShapes() {
  if (tempCircle) { map.removeLayer(tempCircle); tempCircle = null; }
  circleCenter = null;
  if (tempLine) { map.removeLayer(tempLine); tempLine = null; }
  lineStart = null;
}

function setToolActive(tool) {
  document.querySelectorAll('.tool-btn').forEach(btn=>btn.classList.remove('active'));
  document.getElementById(tool + "-btn").classList.add('active');
  clearTempShapes();
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

// New: Line and Circle buttons
document.getElementById('line-btn').onclick = function() {
  setToolActive('line');
  erasing = false; document.getElementById('eraser-circle').style.display = 'none';
};

function openCircleOptionsModal() {
  var modal = document.getElementById('circle-options-modal');
  if (modal) {
    modal.style.display = 'flex';
    var valInput = document.getElementById('default-radius-value');
    if (valInput) {
      if (defaultCircleRadiusMeters >= 1000 && defaultCircleRadiusMeters % 1000 === 0) {
        valInput.value = (defaultCircleRadiusMeters / 1000);
        defaultRadiusUnit = 'km';
      } else {
        valInput.value = defaultCircleRadiusMeters;
        defaultRadiusUnit = 'm';
      }
    }
    // update unit buttons
    var btns = document.querySelectorAll('.circle-unit-btn');
    btns.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-unit') === defaultRadiusUnit); });
    var status = document.getElementById('default-radius-status');
    if (status) status.textContent = useDefaultCircleRadius ? 'Enabled' : 'Disabled';
  }
}

document.getElementById('circle-btn').onclick = function() {
  if (drawType === 'circle') {
    openCircleOptionsModal();
    return;
  }
  setToolActive('circle');
  erasing = false; document.getElementById('eraser-circle').style.display = 'none';
};
// Toolbar toggle button
var circleDefaultToggleBtn = document.getElementById('circle-default-toggle-btn');
if (circleDefaultToggleBtn) {
  circleDefaultToggleBtn.onclick = function() {
    useDefaultCircleRadius = !useDefaultCircleRadius;
    this.classList.toggle('active', useDefaultCircleRadius);
    var status = document.getElementById('default-radius-status');
    if (status) status.textContent = useDefaultCircleRadius ? 'Enabled' : 'Disabled';
  };
}
// Modal controls
var circleOptionsClose = document.getElementById('circle-options-close');
if (circleOptionsClose) {
  circleOptionsClose.onclick = function() {
    document.getElementById('circle-options-modal').style.display = 'none';
  };
}
var defaultRadiusApply = document.getElementById('default-radius-apply');
if (defaultRadiusApply) {
  defaultRadiusApply.onclick = function() {
    var val = parseFloat(document.getElementById('default-radius-value').value);
    if (!isNaN(val) && val >= 0) {
      defaultCircleRadiusMeters = defaultRadiusUnit === 'km' ? (val * 1000) : val;
    }
    document.getElementById('circle-options-modal').style.display = 'none';
  };
}
var defaultRadiusToggle = document.getElementById('default-radius-toggle');
if (defaultRadiusToggle) {
  defaultRadiusToggle.onclick = function() {
    useDefaultCircleRadius = !useDefaultCircleRadius;
    var btn = document.getElementById('circle-default-toggle-btn');
    if (btn) btn.classList.toggle('active', useDefaultCircleRadius);
    var status = document.getElementById('default-radius-status');
    if (status) status.textContent = useDefaultCircleRadius ? 'Enabled' : 'Disabled';
  };
}

// Unit buttons
var unitButtons = document.querySelectorAll('.circle-unit-btn');
unitButtons.forEach(function(btn){
  btn.onclick = function() {
    var unit = this.getAttribute('data-unit');
    defaultRadiusUnit = unit === 'km' ? 'km' : 'm';
    unitButtons.forEach(function(b){ b.classList.toggle('active', b === btn); });
  };
});

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
  // Preview for line tool
  if (drawType === 'line' && lineStart) {
    const pts = [lineStart, e.latlng];
    if (!tempLine) {
      tempLine = L.polyline(pts, {color: drawColor, weight: drawWeight, dashArray: '4,4', smoothFactor: 1}).addTo(map);
    } else {
      tempLine.setLatLngs(pts);
      tempLine.setStyle({color: drawColor, weight: drawWeight});
    }
  }
  // Preview for circle tool
  if (drawType === 'circle' && circleCenter) {
    // If default radius is enabled, no need to update with mouse move — keep the preview at default radius
    let r = useDefaultCircleRadius ? defaultCircleRadiusMeters : map.distance(circleCenter, e.latlng);
    if (r < 0) r = 0;
    if (!tempCircle) {
      tempCircle = L.circle(circleCenter, {radius: r, color: drawColor, weight: drawWeight, opacity: 0.7});
      tempCircle.addTo(map);
    } else {
      tempCircle.setRadius(r);
      tempCircle.setStyle({color: drawColor, weight: drawWeight});
    }
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
    } else if (layer instanceof L.Circle) {
      // Convert eraser pixel radius to meters at the current mouse position
      var pCenter = map.latLngToContainerPoint(e.latlng);
      var pEdge = L.point(pCenter.x + eraserRadius, pCenter.y);
      var latlngEdge = map.containerPointToLatLng(pEdge);
      var eraserRadiusMeters = map.distance(e.latlng, latlngEdge);
      // Distance between circle center and eraser center (meters)
      var circleCenter = layer.getLatLng();
      var distCenters = map.distance(circleCenter, e.latlng);
      // If eraser overlaps circle stroke/area, convert circle to a polyline approximation and erase only the hit arc(s)
      if (distCenters <= layer.getRadius() + eraserRadiusMeters) {
        var cPx = map.latLngToContainerPoint(circleCenter);
        // meters per pixel around the circle center
        var mpp = map.distance(circleCenter, map.containerPointToLatLng(L.point(cPx.x + 1, cPx.y)));
        var radiusPx = layer.getRadius() / (mpp || 1);
        var steps = 96; // smooth circle approximation
        var pts = [];
        for (var k=0; k<=steps; k++) {
          var theta = (k/steps) * Math.PI * 2;
          var px = L.point(cPx.x + radiusPx * Math.cos(theta), cPx.y + radiusPx * Math.sin(theta));
          pts.push(map.containerPointToLatLng(px));
        }
        // Replace circle with an approximated stroke polyline
        var color = (layer.options && layer.options.color) || drawColor;
        var weight = (layer.options && layer.options.weight) || drawWeight;
        drawnItems.removeLayer(layer);
        var strokePoly = L.polyline(pts, {color: color, weight: weight, smoothFactor: 1});
        drawnItems.addLayer(strokePoly);
        // Apply eraser to the new stroke polyline
        if (eraseSegmentFromPolyline(strokePoly, e.latlng, eraserRadius)) changed = true; else changed = true;
      }
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

      // Check for intersections regardless of endpoint positions
      var intersections = circleSegmentIntersections(center, radiusPx, p1, p2);
      // Sort intersections by parameter t along the segment
      if (intersections && intersections.length > 1) {
        intersections.sort(function(a,b){ return a.t - b.t; });
      }

      if (d1 >= radiusPx && d2 >= radiusPx) {
        // Both endpoints outside; if segment crosses the eraser, split and remove middle
        if (intersections && intersections.length === 2) {
          var lat1 = map.containerPointToLatLng(intersections[0].point);
          var lat2 = map.containerPointToLatLng(intersections[1].point);
          if (seg.length == 0) seg.push(p1lat);
          seg.push(lat1);
          newLatlngsArr.push(seg.slice()); seg = [];
          seg.push(lat2);
          seg.push(p2lat);
          changed = true;
        } else {
          // No crossing: keep as is
          if (seg.length == 0) seg.push(p1lat);
          seg.push(p2lat);
        }
      } else if (d1 < radiusPx && d2 < radiusPx) {
        // both points are inside the eraser, drop this segment (erase it)
        if (seg.length) { newLatlngsArr.push(seg.slice()); seg = []; }
        changed = true;
      } else {
        // One point inside, one outside: split at intersection(s)
        if (intersections && intersections.length > 0) {
          // Ensure ordered by t
          intersections.sort(function(a,b){ return a.t - b.t; });
          var latI = map.containerPointToLatLng(intersections[0].point);
          if (d1 < radiusPx && d2 >= radiusPx) {
            // leaving the eraser: start new segment at intersection and continue to p2
            if (seg.length) { newLatlngsArr.push(seg.slice()); seg = []; }
            seg.push(latI);
            seg.push(p2lat);
          } else if (d1 >= radiusPx && d2 < radiusPx) {
            // entering eraser: add up to intersection and end segment
            if (seg.length == 0) seg.push(p1lat);
            seg.push(latI);
            newLatlngsArr.push(seg.slice());
            seg = [];
          }
          changed = true;
        } else {
          // Fallback: if numerical issues, drop segment when one endpoint is inside
          if (d1 < radiusPx || d2 < radiusPx) {
            if (seg.length) { newLatlngsArr.push(seg.slice()); seg = []; }
            changed = true;
          } else {
            if (seg.length == 0) seg.push(p1lat);
            seg.push(p2lat);
          }
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
function circleSegmentIntersections(center, radius, p1, p2) {
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
  var out = [];
  if (t1 >= 0 && t1 <= 1) out.push({ point: {x: p1.x + t1*dx, y: p1.y + t1*dy}, t: t1 });
  if (t2 >= 0 && t2 <= 1) out.push({ point: {x: p1.x + t2*dx, y: p1.y + t2*dy}, t: t2 });
  return out.length ? out : null;
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
  // Line tool: first click sets start, second click finalizes
  else if (drawType === 'line') {
    if (!lineStart) {
      lineStart = e.latlng;
    } else {
      const finalLine = L.polyline([lineStart, e.latlng], {color: drawColor, weight: drawWeight, smoothFactor: 1});
      drawnItems.addLayer(finalLine);
      if (tempLine) { map.removeLayer(tempLine); tempLine = null; }
      lineStart = null;
      saveHistory();
    }
  }
  // Circle tool: first click sets center, second click sets radius (or single click if default radius enabled)
  else if (drawType === 'circle') {
    if (!circleCenter) {
      if (useDefaultCircleRadius) {
        const radius = Math.max(0, defaultCircleRadiusMeters);
        const finalCircle = L.circle(e.latlng, {radius: radius, color: drawColor, weight: drawWeight});
        drawnItems.addLayer(finalCircle);
        if (tempCircle) { map.removeLayer(tempCircle); tempCircle = null; }
        circleCenter = null;
        saveHistory();
      } else {
        circleCenter = e.latlng;
      }
    } else {
      const radius = Math.max(0, useDefaultCircleRadius ? defaultCircleRadiusMeters : map.distance(circleCenter, e.latlng));
      const finalCircle = L.circle(circleCenter, {radius: radius, color: drawColor, weight: drawWeight});
      drawnItems.addLayer(finalCircle);
      if (tempCircle) { map.removeLayer(tempCircle); tempCircle = null; }
      circleCenter = null;
      saveHistory();
    }
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
    if (layer instanceof L.Circle) {
      const center = layer.getLatLng();
      const feat = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [center.lng, center.lat] },
        properties: {
          shape: "circle",
          radius: layer.getRadius(),
          color: layer.options.color,
          weight: layer.options.weight
        }
      };
      features.push(feat);
    } else {
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
    }
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
      if (feature.properties && feature.properties.shape === 'circle' && feature.properties.radius != null) {
        return L.circle(latlng, {
          radius: feature.properties.radius,
          color: feature.properties.color || drawColor,
          weight: feature.properties.weight || drawWeight
        });
      } else {
        let m = L.marker(latlng, {icon: customPinIcon, riseOnHover: true});
        if (feature.properties && feature.properties.label) {
          m._customLabel = feature.properties.label;
          if (m.bindPopup) m.bindPopup(m._customLabel);
          pinLabels.push({marker: m, label: m._customLabel});
        }
        return m;
      }
    },
    style: function(feature) {
      let s = {};
      if (feature.properties && (feature.geometry.type === "LineString" || feature.geometry.type === "Polygon")) {
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
    'eraser': 'Eraser Mode',
    'line': 'Line Mode',
    'circle': 'Circle Mode'
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
    if (layer instanceof L.Circle) {
      const center = layer.getLatLng();
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [center.lng, center.lat] },
        properties: {
          shape: "circle",
          radius: layer.getRadius(),
          color: layer.options.color,
          weight: layer.options.weight
        }
      });
    } else {
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
    }
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
          if (feature.properties && feature.properties.shape === 'circle' && feature.properties.radius != null) {
            return L.circle(latlng, {
              radius: feature.properties.radius,
              color: feature.properties.color || drawColor,
              weight: feature.properties.weight || drawWeight
            });
          } else {
            let m = L.marker(latlng, {icon: customPinIcon, riseOnHover: true});
            if (feature.properties && feature.properties.label) {
              m._customLabel = feature.properties.label;
              if (m.bindPopup) m.bindPopup(m._customLabel);
              pinLabels.push({marker: m, label: m._customLabel});
            }
            return m;
          }
        },
        style: function(feature) {
          let s = {};
          if (feature.properties && (feature.geometry.type === "LineString" || feature.geometry.type === "Polygon")) {
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
  } else if (key === 'l') {
    document.getElementById('line-btn').click();
    e.preventDefault();
  } else if (key === 'c') {
    document.getElementById('circle-btn').click();
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
            if (feature.properties && feature.properties.shape === 'circle' && feature.properties.radius != null) {
              return L.circle(latlng, {
                radius: feature.properties.radius,
                color: feature.properties.color || drawColor,
                weight: feature.properties.weight || drawWeight
              });
            } else {
              let m = L.marker(latlng, {icon: customPinIcon, riseOnHover: true});
              if (feature.properties && feature.properties.label) {
                m._customLabel = feature.properties.label;
                if (m.bindPopup) m.bindPopup(m._customLabel);
                pinLabels.push({marker: m, label: m._customLabel});
              }
              return m;
            }
          },
          style: function(feature) {
            let s = {};
            if (feature.properties && (feature.geometry.type === "LineString" || feature.geometry.type === "Polygon")) {
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
          if (feature.properties && feature.properties.shape === 'circle' && feature.properties.radius != null) {
            return L.circle(latlng, {
              radius: feature.properties.radius,
              color: feature.properties.color || drawColor,
              weight: feature.properties.weight || drawWeight
            });
          } else {
            let m = L.marker(latlng, {icon: customPinIcon, riseOnHover: true});
            if (feature.properties && feature.properties.label) {
              m._customLabel = feature.properties.label;
              if (m.bindPopup) m.bindPopup(m._customLabel);
              pinLabels.push({marker: m, label: m._customLabel});
            }
            return m;
          }
        },
        style: function(feature) {
          let s = {};
          if (feature.properties && (feature.geometry.type === "LineString" || feature.geometry.type === "Polygon")) {
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
