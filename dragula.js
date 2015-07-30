'use strict';

var emitter = require('contra/emitter');
var crossvent = require('crossvent');
var classes = require('./classes');

function dragula (initialContainers, options) {
  var len = arguments.length;
  if (len === 1 && Array.isArray(initialContainers) === false) {
    options = initialContainers;
    initialContainers = [];
  }
  var body = document.body;
  var documentElement = document.documentElement;
  var _mirror; // mirror image
  var _source; // source container
  var _item; // item being dragged
  var _offsetX; // reference x
  var _offsetY; // reference y
  var _clientX; // cache client x, init at grab, update at drag
  var _clientY; // cache client y, init at grab, update at drag
  var _initialSibling; // reference sibling when grabbed
  var _currentSibling; // reference sibling now
  var _copy; // item used for copying
  var _renderTimer; // timer for setTimeout renderMirrorImage
  var _lastDropTarget = null; // last container item was over

  var o = options || {};
  if (o.moves === void 0) { o.moves = always; }
  if (o.accepts === void 0) { o.accepts = always; }
  if (o.invalid === void 0) { o.invalid = invalidTarget; }
  if (o.containers === void 0) { o.containers = initialContainers || []; }
  if (o.isContainer === void 0) { o.isContainer = never; }
  if (o.copy === void 0) { o.copy = false; }
  if (o.revertOnSpill === void 0) { o.revertOnSpill = false; }
  if (o.removeOnSpill === void 0) { o.removeOnSpill = false; }
  if (o.direction === void 0) { o.direction = 'vertical'; }
  if (o.delay === void 0) { o.delay = false; }
  if (o.delay === true) { o.delay = 300; }

  var drake = emitter({
    containers: o.containers,
    addContainer: addContainer,
    removeContainer: removeContainer,
    start: start,
    end: end,
    cancel: cancel,
    remove: remove,
    destroy: destroy,
    dragging: false
  });

  events();

  return drake;

  function addContainer (all) {
    var changes = Array.isArray(all) ? all : [all];
    drake.containers = drake.containers.concat(changes);
    console.warn && console.warn('drake.addContainer is deprecated. please access drake.containers directly, instead');
  }
  function removeContainer (all) {
    var changes = Array.isArray(all) ? all : [all];
    drake.containers = drake.containers.filter(keepable);
    console.warn && console.warn('drake.removeContainer is deprecated. please access drake.containers directly, instead');
    function keepable (container) {
      return changes.indexOf(container) === -1;
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

  function destroy () {
    events(true);
    release({});
  }

  function grab (e) {
    var item = e.target;
    var ignore = (e.which !== 0 && e.which !== 1) || e.metaKey || e.ctrlKey;
    if (ignore) {
      return; // we only care about honest-to-god left clicks and touch events
    }
    if (start(item) !== true) {
      return;
    }

    var offset = getOffset(_item);
    _offsetX = getCoord('pageX', e) - offset.left;
    _offsetY = getCoord('pageY', e) - offset.top;
    _clientX = getCoord('clientX', e);
    _clientY = getCoord('clientY', e);

    if (typeof o.delay === 'number') {
      _renderTimer = setTimeout(renderMirrorAndDrag, o.delay);
    } else {
      renderMirrorAndDrag();
    }
    e.preventDefault();
  }

  function renderMirrorAndDrag () {
    classes.add(_copy || _item, 'gu-transit');
    renderMirrorImage();
    drag();
  }

  function start (item) {
    var handle = item;

    if (drake.dragging && _mirror) {
      return;
    }

    if (isContainer(item)) {
      return; // don't drag container itself
    }
    while (item.parentElement && isContainer(item.parentElement) === false) {
      if (o.invalid(item, handle)) {
        return;
      }
      item = item.parentElement; // drag target should be a top element
      if (!item) {
        return;
      }
    }
    var container = item.parentElement;
    if (!container) {
      return;
    }
    if (o.invalid(item, handle)) {
      return;
    }

    var movable = o.moves(item, container, handle);
    if (!movable) {
      return;
    }

    end();

    if (o.copy) {
      _copy = item.cloneNode(true);
      drake.emit('cloned', _copy, item, 'copy');
    }

    _source = container;
    _item = item;
    _initialSibling = _currentSibling = nextEl(item);

    drake.dragging = true;
    drake.emit('drag', _item, _source);

    return true;
  }

  function invalidTarget (el) {
    return el.tagName === 'A' || el.tagName === 'BUTTON';
  }

  function end () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    drop(item, item.parentElement);
  }

  function release (e) {
    if (!drake.dragging) {
      return;
    }

    var item = _copy || _item;
    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    if (dropTarget && (o.copy === false || dropTarget !== _source)) {
      drop(item, dropTarget);
    } else if (o.removeOnSpill) {
      remove();
    } else {
      cancel();
    }
  }

  function drop (item, target) {
    if (isInitialPlacement(target)) {
      drake.emit('cancel', item, _source);
    } else {
      drake.emit('drop', item, target, _source);
    }
    cleanup();
  }

  function remove () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var parent = item.parentElement;
    if (parent) {
      parent.removeChild(item);
    }
    drake.emit(o.copy ? 'cancel' : 'remove', item, parent);
    cleanup();
  }

  function cancel (revert) {
    if (!drake.dragging) {
      return;
    }
    var reverts = arguments.length > 0 ? revert : o.revertOnSpill;
    var item = _copy || _item;
    var parent = item.parentElement;
    if (parent === _source && o.copy) {
      parent.removeChild(_copy);
    }
    var initial = isInitialPlacement(parent);
    if (initial === false && o.copy === false && reverts) {
      _source.insertBefore(item, _initialSibling);
    }
    if (initial || reverts) {
      drake.emit('cancel', item, _source);
    } else {
      drake.emit('drop', item, parent, _source);
    }
    cleanup();
  }

  function cleanup () {
    var item = _copy || _item;
    removeMirrorImage();
    if (item) {
      classes.rm(item, 'gu-transit');
    }
    if (_renderTimer) {
      clearTimeout(_renderTimer);
    }
    drake.dragging = false;
    drake.emit('dragend', item);
    drake.emit('out', item, _lastDropTarget, _source);
    _source = _item = _copy = _initialSibling = _currentSibling = _renderTimer = _lastDropTarget = null;
  }

  function isInitialPlacement (target, s) {
    var sibling;
    if (s !== void 0) {
      sibling = s;
    } else if (_mirror) {
      sibling = _currentSibling;
    } else {
      sibling = nextEl(_item || _copy);
    }
    return target === _source && sibling === _initialSibling;
  }

  function findDropTarget (elementBehindCursor, clientX, clientY) {
    var target = elementBehindCursor;
    while (target && !accepted()) {
      target = target.parentElement;
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
    if (e) {
      _clientX = getCoord('clientX', e);
      _clientY = getCoord('clientY', e);
    }
    var x = _clientX - _offsetX;
    var y = _clientY - _offsetY;

    _mirror.style.left = x + 'px';
    _mirror.style.top  = y + 'px';

    var item = _copy || _item;
    var elementBehindCursor = getElementBehindPoint(_mirror, _clientX, _clientY);
    var dropTarget = findDropTarget(elementBehindCursor, _clientX, _clientY);
    var changed = dropTarget !== null && dropTarget !== _lastDropTarget;
    if (changed || dropTarget === null) {
      out();
      _lastDropTarget = dropTarget;
      over();
    }
    if (dropTarget === _source && o.copy) {
      if (item.parentElement) {
        item.parentElement.removeChild(item);
      }
      return;
    }
    var reference;
    var immediate = getImmediateChild(dropTarget, elementBehindCursor);
    if (immediate !== null) {
      reference = getReference(dropTarget, immediate, _clientX, _clientY);
    } else if (o.revertOnSpill === true && !o.copy) {
      reference = _initialSibling;
      dropTarget = _source;
    } else {
      if ((o.copy || o.removeOnSpill === true) && item.parentElement !== null) {
        item.parentElement.removeChild(item);
      }
      return;
    }
    if (
      reference === null ||
      reference !== item &&
      reference !== nextEl(item) &&
      reference !== _currentSibling
    ) {
      _currentSibling = reference;
      dropTarget.insertBefore(item, reference);
      drake.emit('shadow', item, dropTarget);
    }
    function moved (type) { drake.emit(type, item, _lastDropTarget, _source); }
    function over () { if (changed) { moved('over'); } }
    function out () { if (_lastDropTarget) { moved('out'); } }
  }

  function renderMirrorImage () {
    if (_mirror) {
      return;
    }
    var rect = _item.getBoundingClientRect();
    _mirror = _item.cloneNode(true);
    _mirror.style.width = getRectWidth(rect) + 'px';
    _mirror.style.height = getRectHeight(rect) + 'px';
    classes.rm(_mirror, 'gu-transit');
    classes.add(_mirror, 'gu-mirror');
    body.appendChild(_mirror);
    touchy(documentElement, 'add', 'mousemove', drag);
    classes.add(body, 'gu-unselectable');
    drake.emit('cloned', _mirror, _item, 'mirror');
  }

  function removeMirrorImage () {
    if (_mirror) {
      classes.rm(body, 'gu-unselectable');
      touchy(documentElement, 'remove', 'mousemove', drag);
      _mirror.parentElement.removeChild(_mirror);
      _mirror = null;
    }
  }

  function getImmediateChild (dropTarget, target) {
    var immediate = target;
    while (immediate !== dropTarget && immediate.parentElement !== dropTarget) {
      immediate = immediate.parentElement;
    }
    if (immediate === documentElement) {
      return null;
    }
    return immediate;
  }

  function getReference (dropTarget, target, x, y) {
    var horizontal = o.direction === 'horizontal';
    var reference = target !== dropTarget ? inside() : outside();
    return reference;

    function outside () { // slower, but able to figure out any position
      var len = dropTarget.children.length;
      var i;
      var el;
      var rect;
      for (i = 0; i < len; i++) {
        el = dropTarget.children[i];
        rect = el.getBoundingClientRect();
        if (horizontal && rect.left > x) { return el; }
        if (!horizontal && rect.top > y) { return el; }
      }
      return null;
    }

    function inside () { // faster, but only available if dropped inside a child element
      var rect = target.getBoundingClientRect();
      if (horizontal) {
        return resolve(x > rect.left + getRectWidth(rect) / 2);
      }
      return resolve(y > rect.top + getRectHeight(rect) / 2);
    }

    function resolve (after) {
      return after ? nextEl(target) : target;
    }
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
  var documentElement = document.documentElement;
  if (documentElement.clientHeight) {
    return documentElement[scrollProp];
  }
  var body = document.body;
  return body[scrollProp];
}

function getElementBehindPoint (point, x, y) {
  if (!x && !y) {
    return null;
  }
  var p = point || {};
  var state = p.className;
  var el;
  p.className += ' gu-hide';
  el = document.elementFromPoint(x, y);
  p.className = state;
  return el;
}

function never () { return false; }
function always () { return true; }

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

function getRectWidth (rect) {
  return rect.width || (rect.right - rect.left);
}

function getRectHeight (rect) {
  return rect.height || (rect.bottom - rect.top);
}

module.exports = dragula;
