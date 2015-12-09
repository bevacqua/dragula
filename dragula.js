'use strict';

var emitter = require('contra/emitter');
var crossvent = require('crossvent');
var classes = require('./classes');
var doc = document;
var documentElement = doc.documentElement;
var body = doc.body;

function dragula (initialContainers, options) {
  var len = arguments.length;
  if (len === 1 && Array.isArray(initialContainers) === false) {
    options = initialContainers;
    initialContainers = [];
  }
  var _mirror; // mirror image
  var _source; // source container
  var _item; // item being dragged
  var _offsetX; // reference x
  var _offsetY; // reference y
  var _moveX; // reference move x
  var _moveY; // reference move y
  var _initialSibling; // reference sibling when grabbed
  var _currentSibling; // reference sibling now
  var _copy; // item used for copying
  var _renderTimer; // timer for setTimeout renderMirrorImage
  var _lastDropTarget = null; // last container item was over
  var _grabbed; // holds mousedown context until first mousemove
  var _currentAxis;
  var _offset = {};
  var _position = { // x, y coords
    lastX: null,
    lastY: null,
    currentX: null,
    currentY: null
  };

  var o = options || {};
  if (o.moves === void 0) { o.moves = always; }
  if (o.accepts === void 0) { o.accepts = always; }
  if (o.invalid === void 0) { o.invalid = invalidTarget; }
  if (o.containers === void 0) { o.containers = initialContainers || []; }
  if (o.isContainer === void 0) { o.isContainer = never; }
  if (o.copy === void 0) { o.copy = false; }
  if (o.copySortSource === void 0) { o.copySortSource = false; }
  if (o.revertOnSpill === void 0) { o.revertOnSpill = false; }
  if (o.removeOnSpill === void 0) { o.removeOnSpill = false; }
  if (o.direction === void 0) { o.direction = 'vertical'; }
  if (o.ignoreInputTextSelection === void 0) { o.ignoreInputTextSelection = true; }
  if (o.mirrorContainer === void 0) { o.mirrorContainer = body; }
  if (o.copyFunc === void 0) { o.copyFunc = createCopy; }
  if (o.mirrorFunc === void 0) { o.mirrorFunc = createMirror; }
  if (o.centerMirror === void 0) { o.centerMirror = false; }
  if (o.nestedContainers === void 0) { o.nestedContainers = false; }
  if (o.transitStyle === void 0) { o.transitStyle = true; }
  if (o.pointerReference === void 0) { o.pointerReference = false; }
  if (o.stickOnSpill === void 0) { o.stickOnSpill = false; }
  if (o.copySortRemove === void 0) { o.copySortRemove = o.copySortSource; }
  if (o.scrollContainer === void 0) { o.scrollContainer = null; }
  if (o.scrollSpeed === void 0) { o.scrollSpeed = 20; }
  if (o.scrollTriggerSize === void 0) { o.scrollTriggerSize = 70; }

  var drake = emitter({
    containers: o.containers,
    start: manualStart,
    end: end,
    cancel: cancel,
    remove: remove,
    destroy: destroy,
    setOption: setOption,
    setOptions: setOptions,
    dragging: false
  });

  if (o.removeOnSpill === true) {
    drake.on('over', spillOver).on('out', spillOut);
  }

  events();

  return drake;

  function setOption (prop, val) {
    if (val) {
      o[prop] = val;
    }
    return o[prop];
  }

  function setOptions (options) {
    for (var key in options) {
      if (options[key]) {
        setOption(key, options[key]);
      }
    }
  }

  function isContainer (el) {
    return drake.containers.indexOf(el) !== -1 || o.isContainer(el);
  }

  function events (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'mousedown', grab);
    touchy(documentElement, op, 'mouseup', release);
  }

  function eventualMovements (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'mousemove', startBecauseMouseMoved);
  }

  function movements (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'selectstart', preventGrabbed); // IE8
    touchy(documentElement, op, 'click', preventGrabbed);
  }

  function destroy () {
    events(true);
    release({});
  }

  function preventGrabbed (e) {
    if (_grabbed) {
      e.preventDefault();
    }
  }

  function grab (e) {
    _moveX = e.clientX;
    _moveY = e.clientY;

    var ignore = whichMouseButton(e) !== 1 || e.metaKey || e.ctrlKey;
    if (ignore) {
      return; // we only care about honest-to-god left clicks and touch events
    }
    var item = e.target;
    var context = canStart(item);
    if (!context) {
      return;
    }
    _grabbed = context;
    eventualMovements();
    if (e.type === 'mousedown') {
      if (isInput(item)) { // see also: https://github.com/bevacqua/dragula/issues/208
        item.focus(); // fixes https://github.com/bevacqua/dragula/issues/176
      } else {
        e.preventDefault(); // fixes https://github.com/bevacqua/dragula/issues/155
      }
    }
  }

  function startBecauseMouseMoved (e) {
    if (!_grabbed) {
      return;
    }
    if (whichMouseButton(e) === 0) {
      release({});
      return; // when text is selected on an input and then dragged, mouseup doesn't fire. this is our only hope
    }
    // truthy check fixes #239, equality fixes #207
    if (e.clientX !== void 0 && e.clientX === _moveX && e.clientY !== void 0 && e.clientY === _moveY) {
      return;
    }
    if (o.ignoreInputTextSelection) {
      var clientX = getCoord('clientX', e);
      var clientY = getCoord('clientY', e);
      var elementBehindCursor = doc.elementFromPoint(clientX, clientY);
      if (isInput(elementBehindCursor)) {
        return;
      }
    }

    var grabbed = _grabbed; // call to end() unsets _grabbed
    eventualMovements(true);
    movements();
    end();
    start(grabbed);

    var offset = getOffset(_item);
    _offsetX = getCoord('pageX', e) - offset.left;
    _offsetY = getCoord('pageY', e) - offset.top;

    if (o.transitStyle) {
      classes.add(_copy || _item, 'gu-transit');
    }
    renderMirrorImage();
    drag(e);
  }

  function getNestedParent (item) {
    var handle = item;
    while (getParent(item)) {
      item = getParent(item);
      if (isContainer(item) === false) {
        if (o.invalid(item, handle)) {
          item = getParent(item);
        } else {
          return item;
        }
      }
    }
  }

  function canStart (item) {
    if (drake.dragging && _mirror) {
      return;
    }
    if (isContainer(item)) {
      if (o.nestedContainers) {
        item = getNestedParent(item);
        if (!item) {
          return;
        }
      } else {
        return; // don't drag container itself
      }
    }
    var handle = item;
    while (getParent(item) && isContainer(getParent(item)) === false) {
      if (o.invalid(item, handle)) {
        return;
      }
      item = getParent(item); // drag target should be a top element
      if (!item) {
        return;
      }
    }
    var source = getParent(item);
    if (!source) {
      return;
    }
    if (o.invalid(item, handle)) {
      return;
    }

    var movable = o.moves(item, source, handle, nextEl(item));
    if (!movable) {
      return;
    }

    return {
      item: item,
      source: source
    };
  }

  function manualStart (item) {
    var context = canStart(item);
    if (context) {
      start(context);
    }
  }

  function start (context) {
    if (isCopy(context.item, context.source)) {
      _copy = o.copyFunc(context.item, context.source);
      getParent(context.item).insertBefore(_copy, context.item);
      drake.emit('cloned', _copy, context.item, 'copy');
    }

    _source = context.source;
    _item = context.item;
    _initialSibling = _currentSibling = nextEl(context.item);

    drake.dragging = true;
    drake.emit('drag', _item, _source);
  }

  function invalidTarget () {
    return false;
  }

  function end () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    drop(item, getParent(item));
  }

  function ungrab () {
    _grabbed = false;
    eventualMovements(true);
    movements(true);
  }

  function release (e) {
    ungrab();

    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    if (dropTarget && ((_copy && o.copySortSource) || (!_copy || dropTarget !== _source))) {
      drop(item, dropTarget, e);
    } else if (o.removeOnSpill) {
      remove();
    } else {
      cancel();
    }
  }

  function drop (item, target, e) {
    var parent = getParent(item);
    if (_copy && o.copySortSource && target === _source) {
      if (o.copySortRemove) {
        parent.removeChild(_item);
      }
    }
    if (isInitialPlacement(target)) {
      if (!o.copySortRemove) {
        parent.removeChild(_copy);
      }
      drake.emit('cancel', item, _source, _source);
      cleanup('cancel');
    } else {
      drake.emit('drop', item, target, _source, _currentSibling, offset(e));
      cleanup('drop');
    }
  }

  function remove () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var parent = getParent(item);
    var action = _copy ? 'cancel' : 'remove';
    if (parent) {
      parent.removeChild(item);
    }
    drake.emit(action, item, parent, _source);
    cleanup(action);
  }

  function cancel (revert) {
    if (!drake.dragging) {
      return;
    }
    var reverts = arguments.length > 0 ? revert : o.revertOnSpill;
    var item = _copy || _item;
    var parent = getParent(item);
    var initial = isInitialPlacement(parent);
    if (initial === false && !_copy && reverts) {
      _source.insertBefore(item, _initialSibling);
    }
    if (initial || reverts) {
      if (parent === _source && _copy) {
        parent.removeChild(_copy);
      }
      drake.emit('cancel', item, _source, _source);
      cleanup('cancel');
    } else {
      drake.emit('drop', item, parent, _source, _currentSibling, offset());
      cleanup('drop');
    }
  }

  function cleanup (action) {
    var item = _copy || _item;
    ungrab();
    removeMirrorImage();
    if (o.transitStyle && item) {
      classes.rm(item, 'gu-transit');
    }
    if (_renderTimer) {
      clearTimeout(_renderTimer);
    }
    drake.dragging = false;
    if (_lastDropTarget) {
      drake.emit('out', item, _lastDropTarget, _source);
    }
    drake.emit('dragend', _item, action);
    _source = _item = _copy = _initialSibling = _currentSibling = _renderTimer = _lastDropTarget = null;
  }

  function isInitialPlacement (target, s) {
    var sibling;
    if (s !== void 0) {
      sibling = s;
    } else if (_mirror) {
      sibling = _currentSibling;
    } else {
      sibling = nextEl(_copy || _item);
    }
    return target === _source && sibling === _initialSibling;
  }

  function findDropTarget (elementBehindCursor, clientX, clientY) {
    var target = elementBehindCursor;
    while (target && !accepted()) {
      target = getParent(target);
    }
    return target;

    function accepted () {
      var droppable = isContainer(target);
      if (droppable === false) {
        return false;
      }

      var immediate = getImmediateChild(target, elementBehindCursor);
      var reference = getReference(target, immediate, clientX, clientY);
      var initial = isInitialPlacement(target, reference);
      if (initial) {
        return true; // should always be able to drop it right back where it was
      }
      return o.accepts(_item, target, _source, reference);
    }
  }

  function drag (e) {
    if (!_mirror) {
      return;
    }
    e.preventDefault();

    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var x = clientX;
    var y = clientY;

    if (o.centerMirror) {
      var rect = _mirror.getBoundingClientRect();
      x -= getRectWidth(rect) / 2;
      y -= getRectHeight(rect) / 2;
    } else {
      x -= _offsetX;
      y -= _offsetY;
    }

    if (o.scrollContainer) {
      doScrolling(clientX, clientY);
    }

    ensurePreviousCoords(clientX, clientY);
    updateAxis(clientX, clientY);

    _mirror.style.left = x + 'px';
    _mirror.style.top = y + 'px';

    var item = _copy || _item;
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    var changed = dropTarget !== null && dropTarget !== _lastDropTarget;
    if (changed || dropTarget === null) {
      out();
      _lastDropTarget = dropTarget;
      over();
    }
    var parent = getParent(item);
    if (dropTarget === _source && _copy && !o.copySortSource) {
      if (parent) {
        parent.removeChild(item);
      }
      return;
    }
    var reference;
    var immediate = getImmediateChild(dropTarget, elementBehindCursor);
    if (immediate !== null) {
      reference = getReference(dropTarget, immediate, clientX, clientY);
    } else if (o.revertOnSpill === true && !_copy) {
      reference = _initialSibling;
      dropTarget = _source;
    } else if (o.stickOnSpill === false) {
      if (_copy && parent) {
        parent.removeChild(item);
      }
      return;
    }

    updatePreviousCoords(clientX, clientY);

    if (
      reference === null ||
      reference !== item &&
      reference !== nextEl(item) &&
      reference !== _currentSibling
    ) {
      if (!dropTarget) { return; }
      _currentSibling = reference;
      dropTarget.insertBefore(item, reference);
      drake.emit('shadow', item, dropTarget, _source, offset(e));
    }
    function moved (type) { drake.emit(type, item, _lastDropTarget, _source); }
    function over () { if (changed) { moved('over'); } }
    function out () { if (_lastDropTarget) { moved('out'); } }
  }

  function spillOver (el) {
    classes.rm(el, 'gu-hide');
  }

  function spillOut (el) {
    if (drake.dragging) { classes.add(el, 'gu-hide'); }
  }

  function renderMirrorImage () {
    if (_mirror) {
      return;
    }
    _mirror = o.mirrorFunc(_item);
    if (o.transitStyle) {
      classes.rm(_mirror, 'gu-transit');
    }
    classes.add(_mirror, 'gu-mirror');
    o.mirrorContainer.appendChild(_mirror);
    touchy(documentElement, 'add', 'mousemove', drag);
    classes.add(o.mirrorContainer, 'gu-unselectable');
    drake.emit('cloned', _mirror, _item, 'mirror');
  }

  function removeMirrorImage () {
    if (_mirror) {
      classes.rm(o.mirrorContainer, 'gu-unselectable');
      touchy(documentElement, 'remove', 'mousemove', drag);
      getParent(_mirror).removeChild(_mirror);
      _mirror = null;
    }
  }

  function getImmediateChild (dropTarget, target) {
    var immediate = target;
    while (immediate !== dropTarget && getParent(immediate) !== dropTarget) {
      immediate = getParent(immediate);
    }
    if (immediate === documentElement) {
      return null;
    }
    return immediate;
  }

  function getReference (dropTarget, target, x, y) {
    var horizontal = getDirection(dropTarget) === 'horizontal';
    var reference = target !== dropTarget ? inside() : outside();
    return reference;

    function outside () { // slower, but able to figure out any position
      var len = dropTarget.children.length;
      var i;
      var el;
      var rect;
      if (len > 1) {
        for (i = 0; i < len; i++) {
          el = dropTarget.children[i];
          rect = el.getBoundingClientRect();
          if (horizontal && rect.left > x) { return el; }
          if (!horizontal && rect.top + parseStyle(el, 'height', ':before') > y) { return el; }
        }
      }
      return null;
    }

    function inside () { // faster, but only available if dropped inside a child element
      var rect = target.getBoundingClientRect();
      if (horizontal) {
        if (o.pointerReference) {
          var hd = getHorizontalDirection();
          if (hd === 'left') {
            return resolve(x > rect.left + getRectWidth(rect));
          }
          if (hd === 'right') {
            return resolve(x < rect.left + getRectWidth(rect));
          }
        } else {
          return resolve(x > rect.left + getRectWidth(rect) / 2);
        }
      }
      if (o.pointerReference) {
        var vd = getVerticalDirection();
        if (vd === 'up') {
          return resolve(y > rect.top + getRectHeight(rect));
        }
        if (vd === 'down') {
          return resolve(y < rect.top + getRectHeight(rect));
        }
      } else {
        return resolve(y > rect.top + getRectHeight(rect) / 2);
      }
    }

    function resolve (after) {
      return after ? nextEl(target) : target;
    }
  }

  function isCopy (item, container) {
    return typeof o.copy === 'boolean' ? o.copy : o.copy(item, container);
  }

  function offset (e) {
    if (e && _mirror && o.centerMirror) {
      var rect = _mirror.getBoundingClientRect();
      _offset.clientX = getCoord('clientX', e) - getRectWidth(rect) / 2;
      _offset.clientY = getCoord('clientY', e) - getRectHeight(rect) / 2;
    } else if (e) {
      _offset.clientX = getCoord('clientX', e) - _offsetX;
      _offset.clientY = getCoord('clientY', e) - _offsetY;
    }
    return _offset;
  }

  function getDirection (target) {
    return typeof o.direction === 'string' ? o.direction : o.direction(target, _currentAxis);
  }

  function createCopy (el) {
    return el.cloneNode(true);
  }

  function createMirror (el) {
    var copy = createCopy(el);
    var rect = el.getBoundingClientRect();
    copy.style.width = getRectWidth(rect) + 'px';
    copy.style.height = getRectHeight(rect) + 'px';
    return copy;
  }

  function ensurePreviousCoords (x, y) {
    if (_position.lastX === null) { _position.lastX = x; }
    if (_position.lastY === null) { _position.lastY = y; }
    if (_position.currentX === null) { _position.currentX = x; }
    if (_position.currentY === null) { _position.currentY = y; }
  }

  function minimumMoved (x, y) {
    var hd = Math.abs(x - _position.currentX);
    var vd = Math.abs(y - _position.currentY);
    return (hd >= 6) || (vd >= 6);
  }

  function updatePreviousCoords (x, y) {
    if (minimumMoved(x, y)) {
      _position.lastX = _position.currentX;
      _position.lastY = _position.currentY;
      _position.currentX = x;
      _position.currentY = y;
    }
  }

  function updateAxis (x, y) {
    var hd = Math.abs(x - _position.currentX);
    var vd = Math.abs(y - _position.currentY);
    if (vd > hd) { _currentAxis = 'vertical'; }
    if (hd > vd) { _currentAxis = 'horizontal'; }
  }

  function getVerticalDirection () {
    var delta = _position.currentY - _position.lastY;
    return delta !== 0 ? (delta > 0 ? 'down' : 'up') : null;
  }

  function getHorizontalDirection () {
    var delta = _position.currentX - _position.lastX;
    return delta !== 0 ? (delta > 0 ? 'right' : 'left') : null;
  }

  function doScrolling (x, y) {
    var sc = document.querySelector(o.scrollContainer);

    if (sc === body || sc.tagName === 'HTML') { return; }

    var op = sc.offsetParent;
    var opTop = op.getBoundingClientRect().top; // offset parent offset top

    var tt = { start: 0, end: opTop + parseStyle(op, 'paddingTop') + o.scrollTriggerSize };
    var bt = { start: window.innerHeight - o.scrollTriggerSize, end: window.innerHeight };

    if (canScroll(tt)) {
      op.scrollTop -= o.scrollSpeed;
    } else if (canScroll(bt)) {
      op.scrollTop += o.scrollSpeed;
    }

    function canScroll (trigger) { return y >= trigger.start && y <= trigger.end; }
  }
}

function touchy (el, op, type, fn) {
  var touch = {
    mouseup: 'touchend',
    mousedown: 'touchstart',
    mousemove: 'touchmove'
  };
  var microsoft = {
    mouseup: 'MSPointerUp',
    mousedown: 'MSPointerDown',
    mousemove: 'MSPointerMove'
  };
  if (global.navigator.msPointerEnabled) {
    crossvent[op](el, microsoft[type], fn);
  }
  crossvent[op](el, touch[type], fn);
  crossvent[op](el, type, fn);
}

function whichMouseButton (e) {
  if (e.touches !== void 0) { return e.touches.length; }
  if (e.buttons !== void 0) { return e.buttons; }
  if (e.which !== void 0) { return e.which; }
  var button = e.button;
  if (button !== void 0) { // see https://github.com/jquery/jquery/blob/99e8ff1baa7ae341e94bb89c3e84570c7c3ad9ea/src/event.js#L573-L575
    return button & 1 ? 1 : button & 2 ? 3 : (button & 4 ? 2 : 0);
  }
}

function getOffset (el) {
  var rect = el.getBoundingClientRect();
  return {
    left: rect.left + getScroll('scrollLeft', 'pageXOffset'),
    top: rect.top + getScroll('scrollTop', 'pageYOffset')
  };
}

function getScroll (scrollProp, offsetProp) {
  if (typeof global[offsetProp] !== 'undefined') {
    return global[offsetProp];
  }
  if (documentElement.clientHeight) {
    return documentElement[scrollProp];
  }
  return body[scrollProp];
}

function getElementBehindPoint (point, x, y) {
  var p = point || {};
  var state = p.className;
  var el;
  p.className += ' gu-hide';
  el = doc.elementFromPoint(x, y);
  p.className = state;
  return el;
}

function never () { return false; }
function always () { return true; }
function getRectWidth (rect) { return rect.width || (rect.right - rect.left); }
function getRectHeight (rect) { return rect.height || (rect.bottom - rect.top); }
function getParent (el) { return el.parentNode === doc ? null : el.parentNode; }
function isInput (el) { return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'; }

function parseStyle (el, prop, pseudo) {
  return parseInt(getComputedStyle(el, pseudo)[prop], 10);
}

function nextEl (el) {
  return el.nextElementSibling || manually();
  function manually () {
    var sibling = el;
    do {
      sibling = sibling.nextSibling;
    } while (sibling && sibling.nodeType !== 1);
    return sibling;
  }
}

function getEventHost (e) {
  // on touchend event, we have to use `e.changedTouches`
  // see http://stackoverflow.com/questions/7192563/touchend-event-properties
  // see https://github.com/bevacqua/dragula/issues/34
  if (e.targetTouches && e.targetTouches.length) {
    return e.targetTouches[0];
  }
  if (e.changedTouches && e.changedTouches.length) {
    return e.changedTouches[0];
  }
  return e;
}

function getCoord (coord, e) {
  var host = getEventHost(e);
  var missMap = {
    pageX: 'clientX', // IE8
    pageY: 'clientY' // IE8
  };
  if (coord in missMap && !(coord in host) && missMap[coord] in host) {
    coord = missMap[coord];
  }
  return host[coord];
}

module.exports = dragula;
