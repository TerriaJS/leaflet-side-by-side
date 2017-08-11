var L = require('leaflet')
require('./layout.css')
//require('./range.css')

var mapWasDragEnabled
var mapWasTapEnabled

// Leaflet v0.7 backwards compatibility
function on (el, types, fn, context) {
  types.split(' ').forEach(function (type) {
    L.DomEvent.on(el, type, fn, context)
  })
}

// Leaflet v0.7 backwards compatibility
function off (el, types, fn, context) {
  types.split(' ').forEach(function (type) {
    L.DomEvent.off(el, type, fn, context)
  })
}

function getRangeEvent (rangeInput) {
  return 'oninput' in rangeInput ? 'input' : 'change'
}

function startDrag (e) {
  // In case we're already dragging...
  off(document, L.Browser.pointer ? 'touchmove' : 'mousemove', drag, this)
  off(document, L.Browser.pointer ? 'touchend' : 'mouseup', stopDrag, this)

  cancelMapDrag.call(this);

  // While dragging is in progress, subscribe to document-level movement and up events.
  on(document, L.Browser.pointer ? 'touchmove' : 'mousemove', drag, this)
  on(document, L.Browser.pointer ? 'touchend' : 'mouseup', stopDrag, this)

  e.preventDefault()
}

function stopDrag (e) {
  off(document, L.Browser.pointer ? 'touchmove' : 'mousemove', drag, this)
  off(document, L.Browser.pointer ? 'touchend' : 'mouseup', stopDrag, this)

  uncancelMapDrag.call(this, e)
}

function drag (e) {
  var mapContainer = this._map.getContainer()
  var mapRect = mapContainer.getBoundingClientRect()
  var left = mapRect.left + this.options.padding + (this.options.thumbSize * 0.5)
  var right = mapRect.right - this.options.padding - (this.options.thumbSize * 0.5)
  this._splitFraction = Math.min(1.0, Math.max(0.0, (e.clientX - left) / (right - left)))
  this._updateClip()
}

function cancelMapDrag () {
  mapWasDragEnabled = this._map.dragging.enabled()
  mapWasTapEnabled = this._map.tap && this._map.tap.enabled()
  this._map.dragging.disable()
  this._map.tap && this._map.tap.disable()
}

function uncancelMapDrag (e) {
  // Use a timeout to unwind the stack before re-enabling dragging.
  // This way a click event triggered by the same event that caused us to uncancel
  // (e.g. mouseup) won't cause any unwanted actions.
  var that = this
  setTimeout(function() {
    that._refocusOnMap(e)
    if (mapWasDragEnabled) {
      that._map.dragging.enable()
    }
    if (mapWasTapEnabled) {
      that._map.tap.enable()
    }
  }, 0);
}

function cancelClick (e) {
  e.stopPropagation()
}

// convert arg to an array - returns empty array if arg is undefined
function asArray (arg) {
  return (arg === undefined) ? [] : Array.isArray(arg) ? arg : [arg]
}

function noop () {
  return
}

function applyToMissingLayers (map, layers, layersToCheckAgainst, applyFunction) {
  // Loops through each layer in layers, and if the layer is on the map but NOT in layersToCheckAgainst,
  // calls applyFunction(layer).
  layers.forEach(function (layer) {
    if (layer && map.hasLayer(layer)) {
      if (layersToCheckAgainst.indexOf(layer) < 0) {
        applyFunction(layer)
      }
    }
  })
}

function setClip (layer, clip) {
  if (layer.getContainer()) {
    layer.getContainer().style.clip = clip
  }
}

L.Control.SideBySide = L.Control.extend({
  options: {
    thumbSize: 42,
    padding: 0
  },

  initialize: function (leftLayers, rightLayers, options) {
    this._leftLayers = asArray(leftLayers)
    this._rightLayers = asArray(rightLayers)
    L.setOptions(this, options)
  },

  getPosition: function () {
    var rangeValue = this._splitFraction
    var offset = (0.5 - rangeValue) * (2 * this.options.padding + this.options.thumbSize)
    return this._map.getSize().x * rangeValue + offset
  },

  setPosition: noop,

  includes: L.Mixin.Events,

  addTo: function (map) {
    this.remove()
    this._map = map

    var container = this._container = L.DomUtil.create('div', 'leaflet-sbs', map._controlContainer)

    this._divider = L.DomUtil.create('div', 'leaflet-sbs-divider', container)
    var range = this._range = L.DomUtil.create('div', 'leaflet-sbs-range', container)
    range.innerHTML = '&#x2980;'
    range.style.width = this.options.thumbSize + 'px';
    range.style.height = this.options.thumbSize + 'px';
    range.style.marginLeft = range.style.marginTop = range.style.marginTop = '-' + (this.options.thumbSize * 0.5) + 'px';
    range.style.lineHeight = (this.options.thumbSize - 2) + 'px';
    range.style.borderRadius = (this.options.thumbSize * 0.5) + 'px';
    range.style.fontSize = (this.options.thumbSize - 12) + 'px';
    this._addEvents()
    this.updateLayers()
    return this
  },

  remove: function () {
    // Remove the side-by-side control.
    if (!this._map) {
      return this
    }
    this.updateLayers([], [])
    this._removeEvents()
    L.DomUtil.remove(this._container)

    this._map = null

    return this
  },

  setLeftLayers: function (leftLayers) {
    this.updateLayers(asArray(leftLayers), null)
    return this
  },

  setRightLayers: function (rightLayers) {
    this.updateLayers(null, asArray(rightLayers))
    return this
  },

  _updateClip: function () {
    var map = this._map
    var nw = map.containerPointToLayerPoint([0, 0])
    var se = map.containerPointToLayerPoint(map.getSize())
    var clipX = nw.x + this.getPosition()
    var dividerX = this.getPosition()

    this._divider.style.left = dividerX + 'px'
    this.fire('dividermove', {x: dividerX})
    var clipLeft = 'rect(' + [nw.y, clipX, se.y, nw.x].join('px,') + 'px)'
    var clipRight = 'rect(' + [nw.y, se.x, se.y, clipX].join('px,') + 'px)'
    this._leftLayers.forEach(function (layer) {
      setClip(layer, clipLeft)
    })
    this._rightLayers.forEach(function (layer) {
      setClip(layer, clipRight)
    })
    this._range.style.left = dividerX + 'px'
    this._range.style.top = Math.abs(nw.y - se.y) * 0.5 + 'px'
  },

  _removeClip: function (layer) {
    setClip(layer, '')
  },

  updateLayers: function (newLeftLayers, newRightLayers) {
    // Only sets the layers if there is a map.
    // Only shows the layers if they are on the map.
    // If either parameter is not supplied, maintains the existing layers on that side.
    // This can still lead to a change in display if the layers have been added or removed from the map.
    var map = this._map
    if (!map) {
      return this
    }
    var prevLeftLayers = this._leftLayers
    var prevRightLayers = this._rightLayers

    if (!newLeftLayers) {
      newLeftLayers = prevLeftLayers
    }
    if (!newRightLayers) {
      newRightLayers = prevRightLayers
    }
    newLeftLayers = asArray(newLeftLayers)
    newRightLayers = asArray(newRightLayers)

    var that = this
    // Add new layers.
    applyToMissingLayers(map, newLeftLayers, prevLeftLayers, function (layer) { that.fire('leftlayeradd', {layer: layer}) })
    applyToMissingLayers(map, newRightLayers, prevRightLayers, function (layer) { that.fire('rightlayeradd', {layer: layer}) })
    // Remove layers which were present, but are no longer.
    applyToMissingLayers(map, prevLeftLayers, newLeftLayers, function (layer) { that.fire('leftlayerremove', {layer: layer}) })
    applyToMissingLayers(map, prevRightLayers, newRightLayers, function (layer) { that.fire('rightlayerremove', {layer: layer}) })

    // Any layers which have been removed from the control need their clip css removed, so they appear on both sides.
    applyToMissingLayers(map, prevLeftLayers.concat(prevRightLayers), newLeftLayers.concat(newRightLayers), that._removeClip)

    // Update our records.
    this._leftLayers = newLeftLayers
    this._rightLayers = newRightLayers

    // Update the clip css for the layers which are on the left or right.
    // Note this uses this._leftLayers and _rightLayers, so we updated them first.
    this._updateClip()
  },

  _updateLayersFromEvent: function () {
    // If a layer is added or removed from the map, we don't need to pass which layer it is.
    this.updateLayers()
  },

  _addEvents: function () {
    var range = this._range
    var map = this._map
    if (!map || !range) return
    map.on('move', this._updateClip, this)
    map.on('layeradd layerremove', this._updateLayersFromEvent, this)
    //on(range, getRangeEvent(range), this._updateClip, this)
    on(range, L.Browser.pointer ? 'touchstart' : 'mousedown', startDrag, this)
    //on(range, L.Browser.pointer ? 'touchend' : 'mouseup', uncancelMapDrag, this)
    on(range, 'click', cancelClick, this)
  },

  _removeEvents: function () {
    var range = this._range
    var map = this._map
    if (range) {
      //off(range, getRangeEvent(range), this._updateClip, this)
      off(range, L.Browser.pointer ? 'touchstart' : 'mousedown', startDrag, this)
      //off(range, L.Browser.pointer ? 'touchend' : 'mouseup', uncancelMapDrag, this)
      off(range, 'click', cancelClick, this)
    }
    if (map) {
      map.off('layeradd layerremove', this._updateLayersFromEvent, this)
      map.off('move', this._updateClip, this)
    }
  }
})

L.control.sideBySide = function (leftLayers, rightLayers, options) {
  return new L.Control.SideBySide(leftLayers, rightLayers, options)
}

module.exports = L.Control.SideBySide
