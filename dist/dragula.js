!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.dragula=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
'use strict';

var emitter = require('contra/emitter');
var crossvent = require('crossvent');

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
    addClass(_copy || _item, 'gu-transit');
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
      drake.emit('cloned', _copy, item);
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
      rmClass(item, 'gu-transit');
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
    if (reference === null || reference !== item && reference !== nextEl(item)) {
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
    rmClass(_mirror, 'gu-transit');
    addClass(_mirror, ' gu-mirror');
    body.appendChild(_mirror);
    touchy(documentElement, 'add', 'mousemove', drag);
    addClass(body, 'gu-unselectable');
    drake.emit('cloned', _mirror, _item);
  }

  function removeMirrorImage () {
    if (_mirror) {
      rmClass(body, 'gu-unselectable');
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

function never () {
  return false;
}

function always () {
  return true;
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

function addClass (el, className) {
  if (el.className.indexOf(' ' + className) === -1) {
    el.className += ' ' + className;
  }
}

function rmClass (el, className) {
  el.className = el.className.replace(new RegExp(' ' + className, 'g'), '');
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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImRyYWd1bGEuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEvZW1pdHRlcicpO1xudmFyIGNyb3NzdmVudCA9IHJlcXVpcmUoJ2Nyb3NzdmVudCcpO1xuXG5mdW5jdGlvbiBkcmFndWxhIChpbml0aWFsQ29udGFpbmVycywgb3B0aW9ucykge1xuICB2YXIgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgaWYgKGxlbiA9PT0gMSAmJiBBcnJheS5pc0FycmF5KGluaXRpYWxDb250YWluZXJzKSA9PT0gZmFsc2UpIHtcbiAgICBvcHRpb25zID0gaW5pdGlhbENvbnRhaW5lcnM7XG4gICAgaW5pdGlhbENvbnRhaW5lcnMgPSBbXTtcbiAgfVxuICB2YXIgYm9keSA9IGRvY3VtZW50LmJvZHk7XG4gIHZhciBkb2N1bWVudEVsZW1lbnQgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIHZhciBfbWlycm9yOyAvLyBtaXJyb3IgaW1hZ2VcbiAgdmFyIF9zb3VyY2U7IC8vIHNvdXJjZSBjb250YWluZXJcbiAgdmFyIF9pdGVtOyAvLyBpdGVtIGJlaW5nIGRyYWdnZWRcbiAgdmFyIF9vZmZzZXRYOyAvLyByZWZlcmVuY2UgeFxuICB2YXIgX29mZnNldFk7IC8vIHJlZmVyZW5jZSB5XG4gIHZhciBfY2xpZW50WDsgLy8gY2FjaGUgY2xpZW50IHgsIGluaXQgYXQgZ3JhYiwgdXBkYXRlIGF0IGRyYWdcbiAgdmFyIF9jbGllbnRZOyAvLyBjYWNoZSBjbGllbnQgeSwgaW5pdCBhdCBncmFiLCB1cGRhdGUgYXQgZHJhZ1xuICB2YXIgX2luaXRpYWxTaWJsaW5nOyAvLyByZWZlcmVuY2Ugc2libGluZyB3aGVuIGdyYWJiZWRcbiAgdmFyIF9jdXJyZW50U2libGluZzsgLy8gcmVmZXJlbmNlIHNpYmxpbmcgbm93XG4gIHZhciBfY29weTsgLy8gaXRlbSB1c2VkIGZvciBjb3B5aW5nXG4gIHZhciBfcmVuZGVyVGltZXI7IC8vIHRpbWVyIGZvciBzZXRUaW1lb3V0IHJlbmRlck1pcnJvckltYWdlXG4gIHZhciBfbGFzdERyb3BUYXJnZXQgPSBudWxsOyAvLyBsYXN0IGNvbnRhaW5lciBpdGVtIHdhcyBvdmVyXG5cbiAgdmFyIG8gPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoby5tb3ZlcyA9PT0gdm9pZCAwKSB7IG8ubW92ZXMgPSBhbHdheXM7IH1cbiAgaWYgKG8uYWNjZXB0cyA9PT0gdm9pZCAwKSB7IG8uYWNjZXB0cyA9IGFsd2F5czsgfVxuICBpZiAoby5pbnZhbGlkID09PSB2b2lkIDApIHsgby5pbnZhbGlkID0gaW52YWxpZFRhcmdldDsgfVxuICBpZiAoby5jb250YWluZXJzID09PSB2b2lkIDApIHsgby5jb250YWluZXJzID0gaW5pdGlhbENvbnRhaW5lcnMgfHwgW107IH1cbiAgaWYgKG8uaXNDb250YWluZXIgPT09IHZvaWQgMCkgeyBvLmlzQ29udGFpbmVyID0gbmV2ZXI7IH1cbiAgaWYgKG8uY29weSA9PT0gdm9pZCAwKSB7IG8uY29weSA9IGZhbHNlOyB9XG4gIGlmIChvLnJldmVydE9uU3BpbGwgPT09IHZvaWQgMCkgeyBvLnJldmVydE9uU3BpbGwgPSBmYWxzZTsgfVxuICBpZiAoby5yZW1vdmVPblNwaWxsID09PSB2b2lkIDApIHsgby5yZW1vdmVPblNwaWxsID0gZmFsc2U7IH1cbiAgaWYgKG8uZGlyZWN0aW9uID09PSB2b2lkIDApIHsgby5kaXJlY3Rpb24gPSAndmVydGljYWwnOyB9XG4gIGlmIChvLmRlbGF5ID09PSB2b2lkIDApIHsgby5kZWxheSA9IGZhbHNlOyB9XG4gIGlmIChvLmRlbGF5ID09PSB0cnVlKSB7IG8uZGVsYXkgPSAzMDA7IH1cblxuICB2YXIgZHJha2UgPSBlbWl0dGVyKHtcbiAgICBjb250YWluZXJzOiBvLmNvbnRhaW5lcnMsXG4gICAgYWRkQ29udGFpbmVyOiBhZGRDb250YWluZXIsXG4gICAgcmVtb3ZlQ29udGFpbmVyOiByZW1vdmVDb250YWluZXIsXG4gICAgc3RhcnQ6IHN0YXJ0LFxuICAgIGVuZDogZW5kLFxuICAgIGNhbmNlbDogY2FuY2VsLFxuICAgIHJlbW92ZTogcmVtb3ZlLFxuICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXG4gICAgZHJhZ2dpbmc6IGZhbHNlXG4gIH0pO1xuXG4gIGV2ZW50cygpO1xuXG4gIHJldHVybiBkcmFrZTtcblxuICBmdW5jdGlvbiBhZGRDb250YWluZXIgKGFsbCkge1xuICAgIHZhciBjaGFuZ2VzID0gQXJyYXkuaXNBcnJheShhbGwpID8gYWxsIDogW2FsbF07XG4gICAgZHJha2UuY29udGFpbmVycyA9IGRyYWtlLmNvbnRhaW5lcnMuY29uY2F0KGNoYW5nZXMpO1xuICAgIGNvbnNvbGUud2FybiAmJiBjb25zb2xlLndhcm4oJ2RyYWtlLmFkZENvbnRhaW5lciBpcyBkZXByZWNhdGVkLiBwbGVhc2UgYWNjZXNzIGRyYWtlLmNvbnRhaW5lcnMgZGlyZWN0bHksIGluc3RlYWQnKTtcbiAgfVxuICBmdW5jdGlvbiByZW1vdmVDb250YWluZXIgKGFsbCkge1xuICAgIHZhciBjaGFuZ2VzID0gQXJyYXkuaXNBcnJheShhbGwpID8gYWxsIDogW2FsbF07XG4gICAgZHJha2UuY29udGFpbmVycyA9IGRyYWtlLmNvbnRhaW5lcnMuZmlsdGVyKGtlZXBhYmxlKTtcbiAgICBjb25zb2xlLndhcm4gJiYgY29uc29sZS53YXJuKCdkcmFrZS5yZW1vdmVDb250YWluZXIgaXMgZGVwcmVjYXRlZC4gcGxlYXNlIGFjY2VzcyBkcmFrZS5jb250YWluZXJzIGRpcmVjdGx5LCBpbnN0ZWFkJyk7XG4gICAgZnVuY3Rpb24ga2VlcGFibGUgKGNvbnRhaW5lcikge1xuICAgICAgcmV0dXJuIGNoYW5nZXMuaW5kZXhPZihjb250YWluZXIpID09PSAtMTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpc0NvbnRhaW5lciAoZWwpIHtcbiAgICByZXR1cm4gZHJha2UuY29udGFpbmVycy5pbmRleE9mKGVsKSAhPT0gLTEgfHwgby5pc0NvbnRhaW5lcihlbCk7XG4gIH1cblxuICBmdW5jdGlvbiBldmVudHMgKHJlbW92ZSkge1xuICAgIHZhciBvcCA9IHJlbW92ZSA/ICdyZW1vdmUnIDogJ2FkZCc7XG4gICAgdG91Y2h5KGRvY3VtZW50RWxlbWVudCwgb3AsICdtb3VzZWRvd24nLCBncmFiKTtcbiAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCBvcCwgJ21vdXNldXAnLCByZWxlYXNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgIGV2ZW50cyh0cnVlKTtcbiAgICByZWxlYXNlKHt9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdyYWIgKGUpIHtcbiAgICB2YXIgaXRlbSA9IGUudGFyZ2V0O1xuICAgIHZhciBpZ25vcmUgPSAoZS53aGljaCAhPT0gMCAmJiBlLndoaWNoICE9PSAxKSB8fCBlLm1ldGFLZXkgfHwgZS5jdHJsS2V5O1xuICAgIGlmIChpZ25vcmUpIHtcbiAgICAgIHJldHVybjsgLy8gd2Ugb25seSBjYXJlIGFib3V0IGhvbmVzdC10by1nb2QgbGVmdCBjbGlja3MgYW5kIHRvdWNoIGV2ZW50c1xuICAgIH1cbiAgICBpZiAoc3RhcnQoaXRlbSkgIT09IHRydWUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgb2Zmc2V0ID0gZ2V0T2Zmc2V0KF9pdGVtKTtcbiAgICBfb2Zmc2V0WCA9IGdldENvb3JkKCdwYWdlWCcsIGUpIC0gb2Zmc2V0LmxlZnQ7XG4gICAgX29mZnNldFkgPSBnZXRDb29yZCgncGFnZVknLCBlKSAtIG9mZnNldC50b3A7XG4gICAgX2NsaWVudFggPSBnZXRDb29yZCgnY2xpZW50WCcsIGUpO1xuICAgIF9jbGllbnRZID0gZ2V0Q29vcmQoJ2NsaWVudFknLCBlKTtcblxuICAgIGlmICh0eXBlb2Ygby5kZWxheSA9PT0gJ251bWJlcicpIHtcbiAgICAgIF9yZW5kZXJUaW1lciA9IHNldFRpbWVvdXQocmVuZGVyTWlycm9yQW5kRHJhZywgby5kZWxheSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlbmRlck1pcnJvckFuZERyYWcoKTtcbiAgICB9XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyTWlycm9yQW5kRHJhZyAoKSB7XG4gICAgYWRkQ2xhc3MoX2NvcHkgfHwgX2l0ZW0sICdndS10cmFuc2l0Jyk7XG4gICAgcmVuZGVyTWlycm9ySW1hZ2UoKTtcbiAgICBkcmFnKCk7XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydCAoaXRlbSkge1xuICAgIHZhciBoYW5kbGUgPSBpdGVtO1xuXG4gICAgaWYgKGRyYWtlLmRyYWdnaW5nICYmIF9taXJyb3IpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoaXNDb250YWluZXIoaXRlbSkpIHtcbiAgICAgIHJldHVybjsgLy8gZG9uJ3QgZHJhZyBjb250YWluZXIgaXRzZWxmXG4gICAgfVxuICAgIHdoaWxlIChpdGVtLnBhcmVudEVsZW1lbnQgJiYgaXNDb250YWluZXIoaXRlbS5wYXJlbnRFbGVtZW50KSA9PT0gZmFsc2UpIHtcbiAgICAgIGlmIChvLmludmFsaWQoaXRlbSwgaGFuZGxlKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpdGVtID0gaXRlbS5wYXJlbnRFbGVtZW50OyAvLyBkcmFnIHRhcmdldCBzaG91bGQgYmUgYSB0b3AgZWxlbWVudFxuICAgICAgaWYgKCFpdGVtKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIGNvbnRhaW5lciA9IGl0ZW0ucGFyZW50RWxlbWVudDtcbiAgICBpZiAoIWNvbnRhaW5lcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoby5pbnZhbGlkKGl0ZW0sIGhhbmRsZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgbW92YWJsZSA9IG8ubW92ZXMoaXRlbSwgY29udGFpbmVyLCBoYW5kbGUpO1xuICAgIGlmICghbW92YWJsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGVuZCgpO1xuXG4gICAgaWYgKG8uY29weSkge1xuICAgICAgX2NvcHkgPSBpdGVtLmNsb25lTm9kZSh0cnVlKTtcbiAgICAgIGRyYWtlLmVtaXQoJ2Nsb25lZCcsIF9jb3B5LCBpdGVtKTtcbiAgICB9XG5cbiAgICBfc291cmNlID0gY29udGFpbmVyO1xuICAgIF9pdGVtID0gaXRlbTtcbiAgICBfaW5pdGlhbFNpYmxpbmcgPSBfY3VycmVudFNpYmxpbmcgPSBuZXh0RWwoaXRlbSk7XG5cbiAgICBkcmFrZS5kcmFnZ2luZyA9IHRydWU7XG4gICAgZHJha2UuZW1pdCgnZHJhZycsIF9pdGVtLCBfc291cmNlKTtcblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgZnVuY3Rpb24gaW52YWxpZFRhcmdldCAoZWwpIHtcbiAgICByZXR1cm4gZWwudGFnTmFtZSA9PT0gJ0EnIHx8IGVsLnRhZ05hbWUgPT09ICdCVVRUT04nO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kICgpIHtcbiAgICBpZiAoIWRyYWtlLmRyYWdnaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgZHJvcChpdGVtLCBpdGVtLnBhcmVudEVsZW1lbnQpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVsZWFzZSAoZSkge1xuICAgIGlmICghZHJha2UuZHJhZ2dpbmcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xuICAgIHZhciBjbGllbnRYID0gZ2V0Q29vcmQoJ2NsaWVudFgnLCBlKTtcbiAgICB2YXIgY2xpZW50WSA9IGdldENvb3JkKCdjbGllbnRZJywgZSk7XG4gICAgdmFyIGVsZW1lbnRCZWhpbmRDdXJzb3IgPSBnZXRFbGVtZW50QmVoaW5kUG9pbnQoX21pcnJvciwgY2xpZW50WCwgY2xpZW50WSk7XG4gICAgdmFyIGRyb3BUYXJnZXQgPSBmaW5kRHJvcFRhcmdldChlbGVtZW50QmVoaW5kQ3Vyc29yLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICBpZiAoZHJvcFRhcmdldCAmJiAoby5jb3B5ID09PSBmYWxzZSB8fCBkcm9wVGFyZ2V0ICE9PSBfc291cmNlKSkge1xuICAgICAgZHJvcChpdGVtLCBkcm9wVGFyZ2V0KTtcbiAgICB9IGVsc2UgaWYgKG8ucmVtb3ZlT25TcGlsbCkge1xuICAgICAgcmVtb3ZlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbmNlbCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRyb3AgKGl0ZW0sIHRhcmdldCkge1xuICAgIGlmIChpc0luaXRpYWxQbGFjZW1lbnQodGFyZ2V0KSkge1xuICAgICAgZHJha2UuZW1pdCgnY2FuY2VsJywgaXRlbSwgX3NvdXJjZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRyYWtlLmVtaXQoJ2Ryb3AnLCBpdGVtLCB0YXJnZXQsIF9zb3VyY2UpO1xuICAgIH1cbiAgICBjbGVhbnVwKCk7XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmUgKCkge1xuICAgIGlmICghZHJha2UuZHJhZ2dpbmcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcbiAgICB2YXIgcGFyZW50ID0gaXRlbS5wYXJlbnRFbGVtZW50O1xuICAgIGlmIChwYXJlbnQpIHtcbiAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChpdGVtKTtcbiAgICB9XG4gICAgZHJha2UuZW1pdChvLmNvcHkgPyAnY2FuY2VsJyA6ICdyZW1vdmUnLCBpdGVtLCBwYXJlbnQpO1xuICAgIGNsZWFudXAoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNhbmNlbCAocmV2ZXJ0KSB7XG4gICAgaWYgKCFkcmFrZS5kcmFnZ2luZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgcmV2ZXJ0cyA9IGFyZ3VtZW50cy5sZW5ndGggPiAwID8gcmV2ZXJ0IDogby5yZXZlcnRPblNwaWxsO1xuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgdmFyIHBhcmVudCA9IGl0ZW0ucGFyZW50RWxlbWVudDtcbiAgICBpZiAocGFyZW50ID09PSBfc291cmNlICYmIG8uY29weSkge1xuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKF9jb3B5KTtcbiAgICB9XG4gICAgdmFyIGluaXRpYWwgPSBpc0luaXRpYWxQbGFjZW1lbnQocGFyZW50KTtcbiAgICBpZiAoaW5pdGlhbCA9PT0gZmFsc2UgJiYgby5jb3B5ID09PSBmYWxzZSAmJiByZXZlcnRzKSB7XG4gICAgICBfc291cmNlLmluc2VydEJlZm9yZShpdGVtLCBfaW5pdGlhbFNpYmxpbmcpO1xuICAgIH1cbiAgICBpZiAoaW5pdGlhbCB8fCByZXZlcnRzKSB7XG4gICAgICBkcmFrZS5lbWl0KCdjYW5jZWwnLCBpdGVtLCBfc291cmNlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZHJha2UuZW1pdCgnZHJvcCcsIGl0ZW0sIHBhcmVudCwgX3NvdXJjZSk7XG4gICAgfVxuICAgIGNsZWFudXAoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFudXAgKCkge1xuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgcmVtb3ZlTWlycm9ySW1hZ2UoKTtcbiAgICBpZiAoaXRlbSkge1xuICAgICAgcm1DbGFzcyhpdGVtLCAnZ3UtdHJhbnNpdCcpO1xuICAgIH1cbiAgICBpZiAoX3JlbmRlclRpbWVyKSB7XG4gICAgICBjbGVhclRpbWVvdXQoX3JlbmRlclRpbWVyKTtcbiAgICB9XG4gICAgZHJha2UuZHJhZ2dpbmcgPSBmYWxzZTtcbiAgICBkcmFrZS5lbWl0KCdkcmFnZW5kJywgaXRlbSk7XG4gICAgZHJha2UuZW1pdCgnb3V0JywgaXRlbSwgX2xhc3REcm9wVGFyZ2V0LCBfc291cmNlKTtcbiAgICBfc291cmNlID0gX2l0ZW0gPSBfY29weSA9IF9pbml0aWFsU2libGluZyA9IF9jdXJyZW50U2libGluZyA9IF9yZW5kZXJUaW1lciA9IF9sYXN0RHJvcFRhcmdldCA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBpc0luaXRpYWxQbGFjZW1lbnQgKHRhcmdldCwgcykge1xuICAgIHZhciBzaWJsaW5nO1xuICAgIGlmIChzICE9PSB2b2lkIDApIHtcbiAgICAgIHNpYmxpbmcgPSBzO1xuICAgIH0gZWxzZSBpZiAoX21pcnJvcikge1xuICAgICAgc2libGluZyA9IF9jdXJyZW50U2libGluZztcbiAgICB9IGVsc2Uge1xuICAgICAgc2libGluZyA9IG5leHRFbChfaXRlbSB8fCBfY29weSk7XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQgPT09IF9zb3VyY2UgJiYgc2libGluZyA9PT0gX2luaXRpYWxTaWJsaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gZmluZERyb3BUYXJnZXQgKGVsZW1lbnRCZWhpbmRDdXJzb3IsIGNsaWVudFgsIGNsaWVudFkpIHtcbiAgICB2YXIgdGFyZ2V0ID0gZWxlbWVudEJlaGluZEN1cnNvcjtcbiAgICB3aGlsZSAodGFyZ2V0ICYmICFhY2NlcHRlZCgpKSB7XG4gICAgICB0YXJnZXQgPSB0YXJnZXQucGFyZW50RWxlbWVudDtcbiAgICB9XG4gICAgcmV0dXJuIHRhcmdldDtcblxuICAgIGZ1bmN0aW9uIGFjY2VwdGVkICgpIHtcbiAgICAgIHZhciBkcm9wcGFibGUgPSBpc0NvbnRhaW5lcih0YXJnZXQpO1xuICAgICAgaWYgKGRyb3BwYWJsZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICB2YXIgaW1tZWRpYXRlID0gZ2V0SW1tZWRpYXRlQ2hpbGQodGFyZ2V0LCBlbGVtZW50QmVoaW5kQ3Vyc29yKTtcbiAgICAgIHZhciByZWZlcmVuY2UgPSBnZXRSZWZlcmVuY2UodGFyZ2V0LCBpbW1lZGlhdGUsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgICAgdmFyIGluaXRpYWwgPSBpc0luaXRpYWxQbGFjZW1lbnQodGFyZ2V0LCByZWZlcmVuY2UpO1xuICAgICAgaWYgKGluaXRpYWwpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7IC8vIHNob3VsZCBhbHdheXMgYmUgYWJsZSB0byBkcm9wIGl0IHJpZ2h0IGJhY2sgd2hlcmUgaXQgd2FzXG4gICAgICB9XG4gICAgICByZXR1cm4gby5hY2NlcHRzKF9pdGVtLCB0YXJnZXQsIF9zb3VyY2UsIHJlZmVyZW5jZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZHJhZyAoZSkge1xuICAgIGlmICghX21pcnJvcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZSkge1xuICAgICAgX2NsaWVudFggPSBnZXRDb29yZCgnY2xpZW50WCcsIGUpO1xuICAgICAgX2NsaWVudFkgPSBnZXRDb29yZCgnY2xpZW50WScsIGUpO1xuICAgIH1cbiAgICB2YXIgeCA9IF9jbGllbnRYIC0gX29mZnNldFg7XG4gICAgdmFyIHkgPSBfY2xpZW50WSAtIF9vZmZzZXRZO1xuXG4gICAgX21pcnJvci5zdHlsZS5sZWZ0ID0geCArICdweCc7XG4gICAgX21pcnJvci5zdHlsZS50b3AgID0geSArICdweCc7XG5cbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xuICAgIHZhciBlbGVtZW50QmVoaW5kQ3Vyc29yID0gZ2V0RWxlbWVudEJlaGluZFBvaW50KF9taXJyb3IsIF9jbGllbnRYLCBfY2xpZW50WSk7XG4gICAgdmFyIGRyb3BUYXJnZXQgPSBmaW5kRHJvcFRhcmdldChlbGVtZW50QmVoaW5kQ3Vyc29yLCBfY2xpZW50WCwgX2NsaWVudFkpO1xuICAgIHZhciBjaGFuZ2VkID0gZHJvcFRhcmdldCAhPT0gbnVsbCAmJiBkcm9wVGFyZ2V0ICE9PSBfbGFzdERyb3BUYXJnZXQ7XG4gICAgaWYgKGNoYW5nZWQgfHwgZHJvcFRhcmdldCA9PT0gbnVsbCkge1xuICAgICAgb3V0KCk7XG4gICAgICBfbGFzdERyb3BUYXJnZXQgPSBkcm9wVGFyZ2V0O1xuICAgICAgb3ZlcigpO1xuICAgIH1cbiAgICBpZiAoZHJvcFRhcmdldCA9PT0gX3NvdXJjZSAmJiBvLmNvcHkpIHtcbiAgICAgIGlmIChpdGVtLnBhcmVudEVsZW1lbnQpIHtcbiAgICAgICAgaXRlbS5wYXJlbnRFbGVtZW50LnJlbW92ZUNoaWxkKGl0ZW0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgcmVmZXJlbmNlO1xuICAgIHZhciBpbW1lZGlhdGUgPSBnZXRJbW1lZGlhdGVDaGlsZChkcm9wVGFyZ2V0LCBlbGVtZW50QmVoaW5kQ3Vyc29yKTtcbiAgICBpZiAoaW1tZWRpYXRlICE9PSBudWxsKSB7XG4gICAgICByZWZlcmVuY2UgPSBnZXRSZWZlcmVuY2UoZHJvcFRhcmdldCwgaW1tZWRpYXRlLCBfY2xpZW50WCwgX2NsaWVudFkpO1xuICAgIH0gZWxzZSBpZiAoby5yZXZlcnRPblNwaWxsID09PSB0cnVlICYmICFvLmNvcHkpIHtcbiAgICAgIHJlZmVyZW5jZSA9IF9pbml0aWFsU2libGluZztcbiAgICAgIGRyb3BUYXJnZXQgPSBfc291cmNlO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoKG8uY29weSB8fCBvLnJlbW92ZU9uU3BpbGwgPT09IHRydWUpICYmIGl0ZW0ucGFyZW50RWxlbWVudCAhPT0gbnVsbCkge1xuICAgICAgICBpdGVtLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQoaXRlbSk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChyZWZlcmVuY2UgPT09IG51bGwgfHwgcmVmZXJlbmNlICE9PSBpdGVtICYmIHJlZmVyZW5jZSAhPT0gbmV4dEVsKGl0ZW0pKSB7XG4gICAgICBfY3VycmVudFNpYmxpbmcgPSByZWZlcmVuY2U7XG4gICAgICBkcm9wVGFyZ2V0Lmluc2VydEJlZm9yZShpdGVtLCByZWZlcmVuY2UpO1xuICAgICAgZHJha2UuZW1pdCgnc2hhZG93JywgaXRlbSwgZHJvcFRhcmdldCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIG1vdmVkICh0eXBlKSB7IGRyYWtlLmVtaXQodHlwZSwgaXRlbSwgX2xhc3REcm9wVGFyZ2V0LCBfc291cmNlKTsgfVxuICAgIGZ1bmN0aW9uIG92ZXIgKCkgeyBpZiAoY2hhbmdlZCkgeyBtb3ZlZCgnb3ZlcicpOyB9IH1cbiAgICBmdW5jdGlvbiBvdXQgKCkgeyBpZiAoX2xhc3REcm9wVGFyZ2V0KSB7IG1vdmVkKCdvdXQnKTsgfSB9XG4gIH1cblxuICBmdW5jdGlvbiByZW5kZXJNaXJyb3JJbWFnZSAoKSB7XG4gICAgaWYgKF9taXJyb3IpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHJlY3QgPSBfaXRlbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBfbWlycm9yID0gX2l0ZW0uY2xvbmVOb2RlKHRydWUpO1xuICAgIF9taXJyb3Iuc3R5bGUud2lkdGggPSBnZXRSZWN0V2lkdGgocmVjdCkgKyAncHgnO1xuICAgIF9taXJyb3Iuc3R5bGUuaGVpZ2h0ID0gZ2V0UmVjdEhlaWdodChyZWN0KSArICdweCc7XG4gICAgcm1DbGFzcyhfbWlycm9yLCAnZ3UtdHJhbnNpdCcpO1xuICAgIGFkZENsYXNzKF9taXJyb3IsICcgZ3UtbWlycm9yJyk7XG4gICAgYm9keS5hcHBlbmRDaGlsZChfbWlycm9yKTtcbiAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCAnYWRkJywgJ21vdXNlbW92ZScsIGRyYWcpO1xuICAgIGFkZENsYXNzKGJvZHksICdndS11bnNlbGVjdGFibGUnKTtcbiAgICBkcmFrZS5lbWl0KCdjbG9uZWQnLCBfbWlycm9yLCBfaXRlbSk7XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmVNaXJyb3JJbWFnZSAoKSB7XG4gICAgaWYgKF9taXJyb3IpIHtcbiAgICAgIHJtQ2xhc3MoYm9keSwgJ2d1LXVuc2VsZWN0YWJsZScpO1xuICAgICAgdG91Y2h5KGRvY3VtZW50RWxlbWVudCwgJ3JlbW92ZScsICdtb3VzZW1vdmUnLCBkcmFnKTtcbiAgICAgIF9taXJyb3IucGFyZW50RWxlbWVudC5yZW1vdmVDaGlsZChfbWlycm9yKTtcbiAgICAgIF9taXJyb3IgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldEltbWVkaWF0ZUNoaWxkIChkcm9wVGFyZ2V0LCB0YXJnZXQpIHtcbiAgICB2YXIgaW1tZWRpYXRlID0gdGFyZ2V0O1xuICAgIHdoaWxlIChpbW1lZGlhdGUgIT09IGRyb3BUYXJnZXQgJiYgaW1tZWRpYXRlLnBhcmVudEVsZW1lbnQgIT09IGRyb3BUYXJnZXQpIHtcbiAgICAgIGltbWVkaWF0ZSA9IGltbWVkaWF0ZS5wYXJlbnRFbGVtZW50O1xuICAgIH1cbiAgICBpZiAoaW1tZWRpYXRlID09PSBkb2N1bWVudEVsZW1lbnQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gaW1tZWRpYXRlO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0UmVmZXJlbmNlIChkcm9wVGFyZ2V0LCB0YXJnZXQsIHgsIHkpIHtcbiAgICB2YXIgaG9yaXpvbnRhbCA9IG8uZGlyZWN0aW9uID09PSAnaG9yaXpvbnRhbCc7XG4gICAgdmFyIHJlZmVyZW5jZSA9IHRhcmdldCAhPT0gZHJvcFRhcmdldCA/IGluc2lkZSgpIDogb3V0c2lkZSgpO1xuICAgIHJldHVybiByZWZlcmVuY2U7XG5cbiAgICBmdW5jdGlvbiBvdXRzaWRlICgpIHsgLy8gc2xvd2VyLCBidXQgYWJsZSB0byBmaWd1cmUgb3V0IGFueSBwb3NpdGlvblxuICAgICAgdmFyIGxlbiA9IGRyb3BUYXJnZXQuY2hpbGRyZW4ubGVuZ3RoO1xuICAgICAgdmFyIGk7XG4gICAgICB2YXIgZWw7XG4gICAgICB2YXIgcmVjdDtcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBlbCA9IGRyb3BUYXJnZXQuY2hpbGRyZW5baV07XG4gICAgICAgIHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgaWYgKGhvcml6b250YWwgJiYgcmVjdC5sZWZ0ID4geCkgeyByZXR1cm4gZWw7IH1cbiAgICAgICAgaWYgKCFob3Jpem9udGFsICYmIHJlY3QudG9wID4geSkgeyByZXR1cm4gZWw7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluc2lkZSAoKSB7IC8vIGZhc3RlciwgYnV0IG9ubHkgYXZhaWxhYmxlIGlmIGRyb3BwZWQgaW5zaWRlIGEgY2hpbGQgZWxlbWVudFxuICAgICAgdmFyIHJlY3QgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBpZiAoaG9yaXpvbnRhbCkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSh4ID4gcmVjdC5sZWZ0ICsgZ2V0UmVjdFdpZHRoKHJlY3QpIC8gMik7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZSh5ID4gcmVjdC50b3AgKyBnZXRSZWN0SGVpZ2h0KHJlY3QpIC8gMik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzb2x2ZSAoYWZ0ZXIpIHtcbiAgICAgIHJldHVybiBhZnRlciA/IG5leHRFbCh0YXJnZXQpIDogdGFyZ2V0O1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB0b3VjaHkgKGVsLCBvcCwgdHlwZSwgZm4pIHtcbiAgdmFyIHRvdWNoID0ge1xuICAgIG1vdXNldXA6ICd0b3VjaGVuZCcsXG4gICAgbW91c2Vkb3duOiAndG91Y2hzdGFydCcsXG4gICAgbW91c2Vtb3ZlOiAndG91Y2htb3ZlJ1xuICB9O1xuICB2YXIgbWljcm9zb2Z0ID0ge1xuICAgIG1vdXNldXA6ICdNU1BvaW50ZXJVcCcsXG4gICAgbW91c2Vkb3duOiAnTVNQb2ludGVyRG93bicsXG4gICAgbW91c2Vtb3ZlOiAnTVNQb2ludGVyTW92ZSdcbiAgfTtcbiAgaWYgKGdsb2JhbC5uYXZpZ2F0b3IubXNQb2ludGVyRW5hYmxlZCkge1xuICAgIGNyb3NzdmVudFtvcF0oZWwsIG1pY3Jvc29mdFt0eXBlXSwgZm4pO1xuICB9XG4gIGNyb3NzdmVudFtvcF0oZWwsIHRvdWNoW3R5cGVdLCBmbik7XG4gIGNyb3NzdmVudFtvcF0oZWwsIHR5cGUsIGZuKTtcbn1cblxuZnVuY3Rpb24gZ2V0T2Zmc2V0IChlbCkge1xuICB2YXIgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICByZXR1cm4ge1xuICAgIGxlZnQ6IHJlY3QubGVmdCArIGdldFNjcm9sbCgnc2Nyb2xsTGVmdCcsICdwYWdlWE9mZnNldCcpLFxuICAgIHRvcDogcmVjdC50b3AgKyBnZXRTY3JvbGwoJ3Njcm9sbFRvcCcsICdwYWdlWU9mZnNldCcpXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldFNjcm9sbCAoc2Nyb2xsUHJvcCwgb2Zmc2V0UHJvcCkge1xuICBpZiAodHlwZW9mIGdsb2JhbFtvZmZzZXRQcm9wXSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gZ2xvYmFsW29mZnNldFByb3BdO1xuICB9XG4gIHZhciBkb2N1bWVudEVsZW1lbnQgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIGlmIChkb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0KSB7XG4gICAgcmV0dXJuIGRvY3VtZW50RWxlbWVudFtzY3JvbGxQcm9wXTtcbiAgfVxuICB2YXIgYm9keSA9IGRvY3VtZW50LmJvZHk7XG4gIHJldHVybiBib2R5W3Njcm9sbFByb3BdO1xufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50QmVoaW5kUG9pbnQgKHBvaW50LCB4LCB5KSB7XG4gIGlmICgheCAmJiAheSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHZhciBwID0gcG9pbnQgfHwge307XG4gIHZhciBzdGF0ZSA9IHAuY2xhc3NOYW1lO1xuICB2YXIgZWw7XG4gIHAuY2xhc3NOYW1lICs9ICcgZ3UtaGlkZSc7XG4gIGVsID0gZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludCh4LCB5KTtcbiAgcC5jbGFzc05hbWUgPSBzdGF0ZTtcbiAgcmV0dXJuIGVsO1xufVxuXG5mdW5jdGlvbiBuZXZlciAoKSB7XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gYWx3YXlzICgpIHtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG5leHRFbCAoZWwpIHtcbiAgcmV0dXJuIGVsLm5leHRFbGVtZW50U2libGluZyB8fCBtYW51YWxseSgpO1xuICBmdW5jdGlvbiBtYW51YWxseSAoKSB7XG4gICAgdmFyIHNpYmxpbmcgPSBlbDtcbiAgICBkbyB7XG4gICAgICBzaWJsaW5nID0gc2libGluZy5uZXh0U2libGluZztcbiAgICB9IHdoaWxlIChzaWJsaW5nICYmIHNpYmxpbmcubm9kZVR5cGUgIT09IDEpO1xuICAgIHJldHVybiBzaWJsaW5nO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFkZENsYXNzIChlbCwgY2xhc3NOYW1lKSB7XG4gIGlmIChlbC5jbGFzc05hbWUuaW5kZXhPZignICcgKyBjbGFzc05hbWUpID09PSAtMSkge1xuICAgIGVsLmNsYXNzTmFtZSArPSAnICcgKyBjbGFzc05hbWU7XG4gIH1cbn1cblxuZnVuY3Rpb24gcm1DbGFzcyAoZWwsIGNsYXNzTmFtZSkge1xuICBlbC5jbGFzc05hbWUgPSBlbC5jbGFzc05hbWUucmVwbGFjZShuZXcgUmVnRXhwKCcgJyArIGNsYXNzTmFtZSwgJ2cnKSwgJycpO1xufVxuXG5mdW5jdGlvbiBnZXRFdmVudEhvc3QgKGUpIHtcbiAgLy8gb24gdG91Y2hlbmQgZXZlbnQsIHdlIGhhdmUgdG8gdXNlIGBlLmNoYW5nZWRUb3VjaGVzYFxuICAvLyBzZWUgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy83MTkyNTYzL3RvdWNoZW5kLWV2ZW50LXByb3BlcnRpZXNcbiAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kcmFndWxhL2lzc3Vlcy8zNFxuICBpZiAoZS50YXJnZXRUb3VjaGVzICYmIGUudGFyZ2V0VG91Y2hlcy5sZW5ndGgpIHtcbiAgICByZXR1cm4gZS50YXJnZXRUb3VjaGVzWzBdO1xuICB9XG4gIGlmIChlLmNoYW5nZWRUb3VjaGVzICYmIGUuY2hhbmdlZFRvdWNoZXMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGUuY2hhbmdlZFRvdWNoZXNbMF07XG4gIH1cbiAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGdldENvb3JkIChjb29yZCwgZSkge1xuICB2YXIgaG9zdCA9IGdldEV2ZW50SG9zdChlKTtcbiAgdmFyIG1pc3NNYXAgPSB7XG4gICAgcGFnZVg6ICdjbGllbnRYJywgLy8gSUU4XG4gICAgcGFnZVk6ICdjbGllbnRZJyAvLyBJRThcbiAgfTtcbiAgaWYgKGNvb3JkIGluIG1pc3NNYXAgJiYgIShjb29yZCBpbiBob3N0KSAmJiBtaXNzTWFwW2Nvb3JkXSBpbiBob3N0KSB7XG4gICAgY29vcmQgPSBtaXNzTWFwW2Nvb3JkXTtcbiAgfVxuICByZXR1cm4gaG9zdFtjb29yZF07XG59XG5cbmZ1bmN0aW9uIGdldFJlY3RXaWR0aCAocmVjdCkge1xuICByZXR1cm4gcmVjdC53aWR0aCB8fCAocmVjdC5yaWdodCAtIHJlY3QubGVmdCk7XG59XG5cbmZ1bmN0aW9uIGdldFJlY3RIZWlnaHQgKHJlY3QpIHtcbiAgcmV0dXJuIHJlY3QuaGVpZ2h0IHx8IChyZWN0LmJvdHRvbSAtIHJlY3QudG9wKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkcmFndWxhO1xuIl19
},{"contra/emitter":3,"crossvent":7}],2:[function(require,module,exports){
'use strict';

var ticky = require('ticky');

module.exports = function debounce (fn, args, ctx) {
  if (!fn) { return; }
  ticky(function run () {
    fn.apply(ctx || null, args || []);
  });
};

},{"ticky":5}],3:[function(require,module,exports){
'use strict';

var atoa = require('atoa');
var debounce = require('./debounce');

module.exports = function emitter (thing, options) {
  var opts = options || {};
  var evt = {};
  if (thing === undefined) { thing = {}; }
  thing.on = function (type, fn) {
    if (!evt[type]) {
      evt[type] = [fn];
    } else {
      evt[type].push(fn);
    }
    return thing;
  };
  thing.once = function (type, fn) {
    fn._once = true; // thing.off(fn) still works!
    thing.on(type, fn);
    return thing;
  };
  thing.off = function (type, fn) {
    var c = arguments.length;
    if (c === 1) {
      delete evt[type];
    } else if (c === 0) {
      evt = {};
    } else {
      var et = evt[type];
      if (!et) { return thing; }
      et.splice(et.indexOf(fn), 1);
    }
    return thing;
  };
  thing.emit = function () {
    var args = atoa(arguments);
    return thing.emitterSnapshot(args.shift()).apply(this, args);
  };
  thing.emitterSnapshot = function (type) {
    var et = (evt[type] || []).slice(0);
    return function () {
      var args = atoa(arguments);
      var ctx = this || thing;
      if (type === 'error' && opts.throws !== false && !et.length) { throw args.length === 1 ? args[0] : args; }
      et.forEach(function emitter (listen) {
        if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
        if (listen._once) { thing.off(type, listen); }
      });
      return thing;
    };
  };
  return thing;
};

},{"./debounce":2,"atoa":4}],4:[function(require,module,exports){
module.exports = function atoa (a, n) { return Array.prototype.slice.call(a, n); }

},{}],5:[function(require,module,exports){
var si = typeof setImmediate === 'function', tick;
if (si) {
  tick = function (fn) { setImmediate(fn); };
} else {
  tick = function (fn) { setTimeout(fn, 0); };
}

module.exports = tick;
},{}],6:[function(require,module,exports){
(function (global){

var NativeCustomEvent = global.CustomEvent;

function useNative () {
  try {
    var p = new NativeCustomEvent('cat', { detail: { foo: 'bar' } });
    return  'cat' === p.type && 'bar' === p.detail.foo;
  } catch (e) {
  }
  return false;
}

/**
 * Cross-browser `CustomEvent` constructor.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent.CustomEvent
 *
 * @public
 */

module.exports = useNative() ? NativeCustomEvent :

// IE >= 9
'function' === typeof document.createEvent ? function CustomEvent (type, params) {
  var e = document.createEvent('CustomEvent');
  if (params) {
    e.initCustomEvent(type, params.bubbles, params.cancelable, params.detail);
  } else {
    e.initCustomEvent(type, false, false, void 0);
  }
  return e;
} :

// IE <= 8
function CustomEvent (type, params) {
  var e = document.createEventObject();
  e.type = type;
  if (params) {
    e.bubbles = Boolean(params.bubbles);
    e.cancelable = Boolean(params.cancelable);
    e.detail = params.detail;
  } else {
    e.bubbles = false;
    e.cancelable = false;
    e.detail = void 0;
  }
  return e;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9jcm9zc3ZlbnQvbm9kZV9tb2R1bGVzL2N1c3RvbS1ldmVudC9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIlxudmFyIE5hdGl2ZUN1c3RvbUV2ZW50ID0gZ2xvYmFsLkN1c3RvbUV2ZW50O1xuXG5mdW5jdGlvbiB1c2VOYXRpdmUgKCkge1xuICB0cnkge1xuICAgIHZhciBwID0gbmV3IE5hdGl2ZUN1c3RvbUV2ZW50KCdjYXQnLCB7IGRldGFpbDogeyBmb286ICdiYXInIH0gfSk7XG4gICAgcmV0dXJuICAnY2F0JyA9PT0gcC50eXBlICYmICdiYXInID09PSBwLmRldGFpbC5mb287XG4gIH0gY2F0Y2ggKGUpIHtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICogQ3Jvc3MtYnJvd3NlciBgQ3VzdG9tRXZlbnRgIGNvbnN0cnVjdG9yLlxuICpcbiAqIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9DdXN0b21FdmVudC5DdXN0b21FdmVudFxuICpcbiAqIEBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHVzZU5hdGl2ZSgpID8gTmF0aXZlQ3VzdG9tRXZlbnQgOlxuXG4vLyBJRSA+PSA5XG4nZnVuY3Rpb24nID09PSB0eXBlb2YgZG9jdW1lbnQuY3JlYXRlRXZlbnQgPyBmdW5jdGlvbiBDdXN0b21FdmVudCAodHlwZSwgcGFyYW1zKSB7XG4gIHZhciBlID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0N1c3RvbUV2ZW50Jyk7XG4gIGlmIChwYXJhbXMpIHtcbiAgICBlLmluaXRDdXN0b21FdmVudCh0eXBlLCBwYXJhbXMuYnViYmxlcywgcGFyYW1zLmNhbmNlbGFibGUsIHBhcmFtcy5kZXRhaWwpO1xuICB9IGVsc2Uge1xuICAgIGUuaW5pdEN1c3RvbUV2ZW50KHR5cGUsIGZhbHNlLCBmYWxzZSwgdm9pZCAwKTtcbiAgfVxuICByZXR1cm4gZTtcbn0gOlxuXG4vLyBJRSA8PSA4XG5mdW5jdGlvbiBDdXN0b21FdmVudCAodHlwZSwgcGFyYW1zKSB7XG4gIHZhciBlID0gZG9jdW1lbnQuY3JlYXRlRXZlbnRPYmplY3QoKTtcbiAgZS50eXBlID0gdHlwZTtcbiAgaWYgKHBhcmFtcykge1xuICAgIGUuYnViYmxlcyA9IEJvb2xlYW4ocGFyYW1zLmJ1YmJsZXMpO1xuICAgIGUuY2FuY2VsYWJsZSA9IEJvb2xlYW4ocGFyYW1zLmNhbmNlbGFibGUpO1xuICAgIGUuZGV0YWlsID0gcGFyYW1zLmRldGFpbDtcbiAgfSBlbHNlIHtcbiAgICBlLmJ1YmJsZXMgPSBmYWxzZTtcbiAgICBlLmNhbmNlbGFibGUgPSBmYWxzZTtcbiAgICBlLmRldGFpbCA9IHZvaWQgMDtcbiAgfVxuICByZXR1cm4gZTtcbn1cbiJdfQ==
},{}],7:[function(require,module,exports){
(function (global){
'use strict';

var customEvent = require('custom-event');
var eventmap = require('./eventmap');
var doc = document;
var addEvent = addEventEasy;
var removeEvent = removeEventEasy;
var hardCache = [];

if (!global.addEventListener) {
  addEvent = addEventHard;
  removeEvent = removeEventHard;
}

function addEventEasy (el, type, fn, capturing) {
  return el.addEventListener(type, fn, capturing);
}

function addEventHard (el, type, fn) {
  return el.attachEvent('on' + type, wrap(el, type, fn));
}

function removeEventEasy (el, type, fn, capturing) {
  return el.removeEventListener(type, fn, capturing);
}

function removeEventHard (el, type, fn) {
  return el.detachEvent('on' + type, unwrap(el, type, fn));
}

function fabricateEvent (el, type, model) {
  var e = eventmap.indexOf(type) === -1 ? makeCustomEvent() : makeClassicEvent();
  if (el.dispatchEvent) {
    el.dispatchEvent(e);
  } else {
    el.fireEvent('on' + type, e);
  }
  function makeClassicEvent () {
    var e;
    if (doc.createEvent) {
      e = doc.createEvent('Event');
      e.initEvent(type, true, true);
    } else if (doc.createEventObject) {
      e = doc.createEventObject();
    }
    return e;
  }
  function makeCustomEvent () {
    return new customEvent(type, { detail: model });
  }
}

function wrapperFactory (el, type, fn) {
  return function wrapper (originalEvent) {
    var e = originalEvent || global.event;
    e.target = e.target || e.srcElement;
    e.preventDefault = e.preventDefault || function preventDefault () { e.returnValue = false; };
    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
    e.which = e.which || e.keyCode;
    fn.call(el, e);
  };
}

function wrap (el, type, fn) {
  var wrapper = unwrap(el, type, fn) || wrapperFactory(el, type, fn);
  hardCache.push({
    wrapper: wrapper,
    element: el,
    type: type,
    fn: fn
  });
  return wrapper;
}

function unwrap (el, type, fn) {
  var i = find(el, type, fn);
  if (i) {
    var wrapper = hardCache[i].wrapper;
    hardCache.splice(i, 1); // free up a tad of memory
    return wrapper;
  }
}

function find (el, type, fn) {
  var i, item;
  for (i = 0; i < hardCache.length; i++) {
    item = hardCache[i];
    if (item.element === el && item.type === type && item.fn === fn) {
      return i;
    }
  }
}

module.exports = {
  add: addEvent,
  remove: removeEvent,
  fabricate: fabricateEvent
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9jcm9zc3ZlbnQvc3JjL2Nyb3NzdmVudC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbnZhciBjdXN0b21FdmVudCA9IHJlcXVpcmUoJ2N1c3RvbS1ldmVudCcpO1xudmFyIGV2ZW50bWFwID0gcmVxdWlyZSgnLi9ldmVudG1hcCcpO1xudmFyIGRvYyA9IGRvY3VtZW50O1xudmFyIGFkZEV2ZW50ID0gYWRkRXZlbnRFYXN5O1xudmFyIHJlbW92ZUV2ZW50ID0gcmVtb3ZlRXZlbnRFYXN5O1xudmFyIGhhcmRDYWNoZSA9IFtdO1xuXG5pZiAoIWdsb2JhbC5hZGRFdmVudExpc3RlbmVyKSB7XG4gIGFkZEV2ZW50ID0gYWRkRXZlbnRIYXJkO1xuICByZW1vdmVFdmVudCA9IHJlbW92ZUV2ZW50SGFyZDtcbn1cblxuZnVuY3Rpb24gYWRkRXZlbnRFYXN5IChlbCwgdHlwZSwgZm4sIGNhcHR1cmluZykge1xuICByZXR1cm4gZWwuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBmbiwgY2FwdHVyaW5nKTtcbn1cblxuZnVuY3Rpb24gYWRkRXZlbnRIYXJkIChlbCwgdHlwZSwgZm4pIHtcbiAgcmV0dXJuIGVsLmF0dGFjaEV2ZW50KCdvbicgKyB0eXBlLCB3cmFwKGVsLCB0eXBlLCBmbikpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEVhc3kgKGVsLCB0eXBlLCBmbiwgY2FwdHVyaW5nKSB7XG4gIHJldHVybiBlbC5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGZuLCBjYXB0dXJpbmcpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEhhcmQgKGVsLCB0eXBlLCBmbikge1xuICByZXR1cm4gZWwuZGV0YWNoRXZlbnQoJ29uJyArIHR5cGUsIHVud3JhcChlbCwgdHlwZSwgZm4pKTtcbn1cblxuZnVuY3Rpb24gZmFicmljYXRlRXZlbnQgKGVsLCB0eXBlLCBtb2RlbCkge1xuICB2YXIgZSA9IGV2ZW50bWFwLmluZGV4T2YodHlwZSkgPT09IC0xID8gbWFrZUN1c3RvbUV2ZW50KCkgOiBtYWtlQ2xhc3NpY0V2ZW50KCk7XG4gIGlmIChlbC5kaXNwYXRjaEV2ZW50KSB7XG4gICAgZWwuZGlzcGF0Y2hFdmVudChlKTtcbiAgfSBlbHNlIHtcbiAgICBlbC5maXJlRXZlbnQoJ29uJyArIHR5cGUsIGUpO1xuICB9XG4gIGZ1bmN0aW9uIG1ha2VDbGFzc2ljRXZlbnQgKCkge1xuICAgIHZhciBlO1xuICAgIGlmIChkb2MuY3JlYXRlRXZlbnQpIHtcbiAgICAgIGUgPSBkb2MuY3JlYXRlRXZlbnQoJ0V2ZW50Jyk7XG4gICAgICBlLmluaXRFdmVudCh0eXBlLCB0cnVlLCB0cnVlKTtcbiAgICB9IGVsc2UgaWYgKGRvYy5jcmVhdGVFdmVudE9iamVjdCkge1xuICAgICAgZSA9IGRvYy5jcmVhdGVFdmVudE9iamVjdCgpO1xuICAgIH1cbiAgICByZXR1cm4gZTtcbiAgfVxuICBmdW5jdGlvbiBtYWtlQ3VzdG9tRXZlbnQgKCkge1xuICAgIHJldHVybiBuZXcgY3VzdG9tRXZlbnQodHlwZSwgeyBkZXRhaWw6IG1vZGVsIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBwZXJGYWN0b3J5IChlbCwgdHlwZSwgZm4pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHdyYXBwZXIgKG9yaWdpbmFsRXZlbnQpIHtcbiAgICB2YXIgZSA9IG9yaWdpbmFsRXZlbnQgfHwgZ2xvYmFsLmV2ZW50O1xuICAgIGUudGFyZ2V0ID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIGUucHJldmVudERlZmF1bHQgPSBlLnByZXZlbnREZWZhdWx0IHx8IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0ICgpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9O1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uID0gZS5zdG9wUHJvcGFnYXRpb24gfHwgZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uICgpIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9O1xuICAgIGUud2hpY2ggPSBlLndoaWNoIHx8IGUua2V5Q29kZTtcbiAgICBmbi5jYWxsKGVsLCBlKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gd3JhcCAoZWwsIHR5cGUsIGZuKSB7XG4gIHZhciB3cmFwcGVyID0gdW53cmFwKGVsLCB0eXBlLCBmbikgfHwgd3JhcHBlckZhY3RvcnkoZWwsIHR5cGUsIGZuKTtcbiAgaGFyZENhY2hlLnB1c2goe1xuICAgIHdyYXBwZXI6IHdyYXBwZXIsXG4gICAgZWxlbWVudDogZWwsXG4gICAgdHlwZTogdHlwZSxcbiAgICBmbjogZm5cbiAgfSk7XG4gIHJldHVybiB3cmFwcGVyO1xufVxuXG5mdW5jdGlvbiB1bndyYXAgKGVsLCB0eXBlLCBmbikge1xuICB2YXIgaSA9IGZpbmQoZWwsIHR5cGUsIGZuKTtcbiAgaWYgKGkpIHtcbiAgICB2YXIgd3JhcHBlciA9IGhhcmRDYWNoZVtpXS53cmFwcGVyO1xuICAgIGhhcmRDYWNoZS5zcGxpY2UoaSwgMSk7IC8vIGZyZWUgdXAgYSB0YWQgb2YgbWVtb3J5XG4gICAgcmV0dXJuIHdyYXBwZXI7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmluZCAoZWwsIHR5cGUsIGZuKSB7XG4gIHZhciBpLCBpdGVtO1xuICBmb3IgKGkgPSAwOyBpIDwgaGFyZENhY2hlLmxlbmd0aDsgaSsrKSB7XG4gICAgaXRlbSA9IGhhcmRDYWNoZVtpXTtcbiAgICBpZiAoaXRlbS5lbGVtZW50ID09PSBlbCAmJiBpdGVtLnR5cGUgPT09IHR5cGUgJiYgaXRlbS5mbiA9PT0gZm4pIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGRFdmVudCxcbiAgcmVtb3ZlOiByZW1vdmVFdmVudCxcbiAgZmFicmljYXRlOiBmYWJyaWNhdGVFdmVudFxufTtcbiJdfQ==
},{"./eventmap":8,"custom-event":6}],8:[function(require,module,exports){
(function (global){
'use strict';

var eventmap = [];
var eventname = '';
var ron = /^on/;

for (eventname in global) {
  if (ron.test(eventname)) {
    eventmap.push(eventname.slice(2));
  }
}

module.exports = eventmap;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9jcm9zc3ZlbnQvc3JjL2V2ZW50bWFwLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbnZhciBldmVudG1hcCA9IFtdO1xudmFyIGV2ZW50bmFtZSA9ICcnO1xudmFyIHJvbiA9IC9eb24vO1xuXG5mb3IgKGV2ZW50bmFtZSBpbiBnbG9iYWwpIHtcbiAgaWYgKHJvbi50ZXN0KGV2ZW50bmFtZSkpIHtcbiAgICBldmVudG1hcC5wdXNoKGV2ZW50bmFtZS5zbGljZSgyKSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBldmVudG1hcDtcbiJdfQ==
},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkcmFndWxhLmpzIiwibm9kZV9tb2R1bGVzL2NvbnRyYS9kZWJvdW5jZS5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvZW1pdHRlci5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvbm9kZV9tb2R1bGVzL2F0b2EvYXRvYS5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvbm9kZV9tb2R1bGVzL3RpY2t5L3RpY2t5LWJyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvY3Jvc3N2ZW50L25vZGVfbW9kdWxlcy9jdXN0b20tZXZlbnQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvY3Jvc3N2ZW50L3NyYy9jcm9zc3ZlbnQuanMiLCJub2RlX21vZHVsZXMvY3Jvc3N2ZW50L3NyYy9ldmVudG1hcC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOWdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnY29udHJhL2VtaXR0ZXInKTtcbnZhciBjcm9zc3ZlbnQgPSByZXF1aXJlKCdjcm9zc3ZlbnQnKTtcblxuZnVuY3Rpb24gZHJhZ3VsYSAoaW5pdGlhbENvbnRhaW5lcnMsIG9wdGlvbnMpIHtcbiAgdmFyIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gIGlmIChsZW4gPT09IDEgJiYgQXJyYXkuaXNBcnJheShpbml0aWFsQ29udGFpbmVycykgPT09IGZhbHNlKSB7XG4gICAgb3B0aW9ucyA9IGluaXRpYWxDb250YWluZXJzO1xuICAgIGluaXRpYWxDb250YWluZXJzID0gW107XG4gIH1cbiAgdmFyIGJvZHkgPSBkb2N1bWVudC5ib2R5O1xuICB2YXIgZG9jdW1lbnRFbGVtZW50ID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICB2YXIgX21pcnJvcjsgLy8gbWlycm9yIGltYWdlXG4gIHZhciBfc291cmNlOyAvLyBzb3VyY2UgY29udGFpbmVyXG4gIHZhciBfaXRlbTsgLy8gaXRlbSBiZWluZyBkcmFnZ2VkXG4gIHZhciBfb2Zmc2V0WDsgLy8gcmVmZXJlbmNlIHhcbiAgdmFyIF9vZmZzZXRZOyAvLyByZWZlcmVuY2UgeVxuICB2YXIgX2NsaWVudFg7IC8vIGNhY2hlIGNsaWVudCB4LCBpbml0IGF0IGdyYWIsIHVwZGF0ZSBhdCBkcmFnXG4gIHZhciBfY2xpZW50WTsgLy8gY2FjaGUgY2xpZW50IHksIGluaXQgYXQgZ3JhYiwgdXBkYXRlIGF0IGRyYWdcbiAgdmFyIF9pbml0aWFsU2libGluZzsgLy8gcmVmZXJlbmNlIHNpYmxpbmcgd2hlbiBncmFiYmVkXG4gIHZhciBfY3VycmVudFNpYmxpbmc7IC8vIHJlZmVyZW5jZSBzaWJsaW5nIG5vd1xuICB2YXIgX2NvcHk7IC8vIGl0ZW0gdXNlZCBmb3IgY29weWluZ1xuICB2YXIgX3JlbmRlclRpbWVyOyAvLyB0aW1lciBmb3Igc2V0VGltZW91dCByZW5kZXJNaXJyb3JJbWFnZVxuICB2YXIgX2xhc3REcm9wVGFyZ2V0ID0gbnVsbDsgLy8gbGFzdCBjb250YWluZXIgaXRlbSB3YXMgb3ZlclxuXG4gIHZhciBvID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKG8ubW92ZXMgPT09IHZvaWQgMCkgeyBvLm1vdmVzID0gYWx3YXlzOyB9XG4gIGlmIChvLmFjY2VwdHMgPT09IHZvaWQgMCkgeyBvLmFjY2VwdHMgPSBhbHdheXM7IH1cbiAgaWYgKG8uaW52YWxpZCA9PT0gdm9pZCAwKSB7IG8uaW52YWxpZCA9IGludmFsaWRUYXJnZXQ7IH1cbiAgaWYgKG8uY29udGFpbmVycyA9PT0gdm9pZCAwKSB7IG8uY29udGFpbmVycyA9IGluaXRpYWxDb250YWluZXJzIHx8IFtdOyB9XG4gIGlmIChvLmlzQ29udGFpbmVyID09PSB2b2lkIDApIHsgby5pc0NvbnRhaW5lciA9IG5ldmVyOyB9XG4gIGlmIChvLmNvcHkgPT09IHZvaWQgMCkgeyBvLmNvcHkgPSBmYWxzZTsgfVxuICBpZiAoby5yZXZlcnRPblNwaWxsID09PSB2b2lkIDApIHsgby5yZXZlcnRPblNwaWxsID0gZmFsc2U7IH1cbiAgaWYgKG8ucmVtb3ZlT25TcGlsbCA9PT0gdm9pZCAwKSB7IG8ucmVtb3ZlT25TcGlsbCA9IGZhbHNlOyB9XG4gIGlmIChvLmRpcmVjdGlvbiA9PT0gdm9pZCAwKSB7IG8uZGlyZWN0aW9uID0gJ3ZlcnRpY2FsJzsgfVxuICBpZiAoby5kZWxheSA9PT0gdm9pZCAwKSB7IG8uZGVsYXkgPSBmYWxzZTsgfVxuICBpZiAoby5kZWxheSA9PT0gdHJ1ZSkgeyBvLmRlbGF5ID0gMzAwOyB9XG5cbiAgdmFyIGRyYWtlID0gZW1pdHRlcih7XG4gICAgY29udGFpbmVyczogby5jb250YWluZXJzLFxuICAgIGFkZENvbnRhaW5lcjogYWRkQ29udGFpbmVyLFxuICAgIHJlbW92ZUNvbnRhaW5lcjogcmVtb3ZlQ29udGFpbmVyLFxuICAgIHN0YXJ0OiBzdGFydCxcbiAgICBlbmQ6IGVuZCxcbiAgICBjYW5jZWw6IGNhbmNlbCxcbiAgICByZW1vdmU6IHJlbW92ZSxcbiAgICBkZXN0cm95OiBkZXN0cm95LFxuICAgIGRyYWdnaW5nOiBmYWxzZVxuICB9KTtcblxuICBldmVudHMoKTtcblxuICByZXR1cm4gZHJha2U7XG5cbiAgZnVuY3Rpb24gYWRkQ29udGFpbmVyIChhbGwpIHtcbiAgICB2YXIgY2hhbmdlcyA9IEFycmF5LmlzQXJyYXkoYWxsKSA/IGFsbCA6IFthbGxdO1xuICAgIGRyYWtlLmNvbnRhaW5lcnMgPSBkcmFrZS5jb250YWluZXJzLmNvbmNhdChjaGFuZ2VzKTtcbiAgICBjb25zb2xlLndhcm4gJiYgY29uc29sZS53YXJuKCdkcmFrZS5hZGRDb250YWluZXIgaXMgZGVwcmVjYXRlZC4gcGxlYXNlIGFjY2VzcyBkcmFrZS5jb250YWluZXJzIGRpcmVjdGx5LCBpbnN0ZWFkJyk7XG4gIH1cbiAgZnVuY3Rpb24gcmVtb3ZlQ29udGFpbmVyIChhbGwpIHtcbiAgICB2YXIgY2hhbmdlcyA9IEFycmF5LmlzQXJyYXkoYWxsKSA/IGFsbCA6IFthbGxdO1xuICAgIGRyYWtlLmNvbnRhaW5lcnMgPSBkcmFrZS5jb250YWluZXJzLmZpbHRlcihrZWVwYWJsZSk7XG4gICAgY29uc29sZS53YXJuICYmIGNvbnNvbGUud2FybignZHJha2UucmVtb3ZlQ29udGFpbmVyIGlzIGRlcHJlY2F0ZWQuIHBsZWFzZSBhY2Nlc3MgZHJha2UuY29udGFpbmVycyBkaXJlY3RseSwgaW5zdGVhZCcpO1xuICAgIGZ1bmN0aW9uIGtlZXBhYmxlIChjb250YWluZXIpIHtcbiAgICAgIHJldHVybiBjaGFuZ2VzLmluZGV4T2YoY29udGFpbmVyKSA9PT0gLTE7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaXNDb250YWluZXIgKGVsKSB7XG4gICAgcmV0dXJuIGRyYWtlLmNvbnRhaW5lcnMuaW5kZXhPZihlbCkgIT09IC0xIHx8IG8uaXNDb250YWluZXIoZWwpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXZlbnRzIChyZW1vdmUpIHtcbiAgICB2YXIgb3AgPSByZW1vdmUgPyAncmVtb3ZlJyA6ICdhZGQnO1xuICAgIHRvdWNoeShkb2N1bWVudEVsZW1lbnQsIG9wLCAnbW91c2Vkb3duJywgZ3JhYik7XG4gICAgdG91Y2h5KGRvY3VtZW50RWxlbWVudCwgb3AsICdtb3VzZXVwJywgcmVsZWFzZSk7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICBldmVudHModHJ1ZSk7XG4gICAgcmVsZWFzZSh7fSk7XG4gIH1cblxuICBmdW5jdGlvbiBncmFiIChlKSB7XG4gICAgdmFyIGl0ZW0gPSBlLnRhcmdldDtcbiAgICB2YXIgaWdub3JlID0gKGUud2hpY2ggIT09IDAgJiYgZS53aGljaCAhPT0gMSkgfHwgZS5tZXRhS2V5IHx8IGUuY3RybEtleTtcbiAgICBpZiAoaWdub3JlKSB7XG4gICAgICByZXR1cm47IC8vIHdlIG9ubHkgY2FyZSBhYm91dCBob25lc3QtdG8tZ29kIGxlZnQgY2xpY2tzIGFuZCB0b3VjaCBldmVudHNcbiAgICB9XG4gICAgaWYgKHN0YXJ0KGl0ZW0pICE9PSB0cnVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIG9mZnNldCA9IGdldE9mZnNldChfaXRlbSk7XG4gICAgX29mZnNldFggPSBnZXRDb29yZCgncGFnZVgnLCBlKSAtIG9mZnNldC5sZWZ0O1xuICAgIF9vZmZzZXRZID0gZ2V0Q29vcmQoJ3BhZ2VZJywgZSkgLSBvZmZzZXQudG9wO1xuICAgIF9jbGllbnRYID0gZ2V0Q29vcmQoJ2NsaWVudFgnLCBlKTtcbiAgICBfY2xpZW50WSA9IGdldENvb3JkKCdjbGllbnRZJywgZSk7XG5cbiAgICBpZiAodHlwZW9mIG8uZGVsYXkgPT09ICdudW1iZXInKSB7XG4gICAgICBfcmVuZGVyVGltZXIgPSBzZXRUaW1lb3V0KHJlbmRlck1pcnJvckFuZERyYWcsIG8uZGVsYXkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZW5kZXJNaXJyb3JBbmREcmFnKCk7XG4gICAgfVxuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlck1pcnJvckFuZERyYWcgKCkge1xuICAgIGFkZENsYXNzKF9jb3B5IHx8IF9pdGVtLCAnZ3UtdHJhbnNpdCcpO1xuICAgIHJlbmRlck1pcnJvckltYWdlKCk7XG4gICAgZHJhZygpO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnQgKGl0ZW0pIHtcbiAgICB2YXIgaGFuZGxlID0gaXRlbTtcblxuICAgIGlmIChkcmFrZS5kcmFnZ2luZyAmJiBfbWlycm9yKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGlzQ29udGFpbmVyKGl0ZW0pKSB7XG4gICAgICByZXR1cm47IC8vIGRvbid0IGRyYWcgY29udGFpbmVyIGl0c2VsZlxuICAgIH1cbiAgICB3aGlsZSAoaXRlbS5wYXJlbnRFbGVtZW50ICYmIGlzQ29udGFpbmVyKGl0ZW0ucGFyZW50RWxlbWVudCkgPT09IGZhbHNlKSB7XG4gICAgICBpZiAoby5pbnZhbGlkKGl0ZW0sIGhhbmRsZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaXRlbSA9IGl0ZW0ucGFyZW50RWxlbWVudDsgLy8gZHJhZyB0YXJnZXQgc2hvdWxkIGJlIGEgdG9wIGVsZW1lbnRcbiAgICAgIGlmICghaXRlbSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICAgIHZhciBjb250YWluZXIgPSBpdGVtLnBhcmVudEVsZW1lbnQ7XG4gICAgaWYgKCFjb250YWluZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKG8uaW52YWxpZChpdGVtLCBoYW5kbGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIG1vdmFibGUgPSBvLm1vdmVzKGl0ZW0sIGNvbnRhaW5lciwgaGFuZGxlKTtcbiAgICBpZiAoIW1vdmFibGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBlbmQoKTtcblxuICAgIGlmIChvLmNvcHkpIHtcbiAgICAgIF9jb3B5ID0gaXRlbS5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgICBkcmFrZS5lbWl0KCdjbG9uZWQnLCBfY29weSwgaXRlbSk7XG4gICAgfVxuXG4gICAgX3NvdXJjZSA9IGNvbnRhaW5lcjtcbiAgICBfaXRlbSA9IGl0ZW07XG4gICAgX2luaXRpYWxTaWJsaW5nID0gX2N1cnJlbnRTaWJsaW5nID0gbmV4dEVsKGl0ZW0pO1xuXG4gICAgZHJha2UuZHJhZ2dpbmcgPSB0cnVlO1xuICAgIGRyYWtlLmVtaXQoJ2RyYWcnLCBfaXRlbSwgX3NvdXJjZSk7XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGludmFsaWRUYXJnZXQgKGVsKSB7XG4gICAgcmV0dXJuIGVsLnRhZ05hbWUgPT09ICdBJyB8fCBlbC50YWdOYW1lID09PSAnQlVUVE9OJztcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZCAoKSB7XG4gICAgaWYgKCFkcmFrZS5kcmFnZ2luZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xuICAgIGRyb3AoaXRlbSwgaXRlbS5wYXJlbnRFbGVtZW50KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbGVhc2UgKGUpIHtcbiAgICBpZiAoIWRyYWtlLmRyYWdnaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcbiAgICB2YXIgY2xpZW50WCA9IGdldENvb3JkKCdjbGllbnRYJywgZSk7XG4gICAgdmFyIGNsaWVudFkgPSBnZXRDb29yZCgnY2xpZW50WScsIGUpO1xuICAgIHZhciBlbGVtZW50QmVoaW5kQ3Vyc29yID0gZ2V0RWxlbWVudEJlaGluZFBvaW50KF9taXJyb3IsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgIHZhciBkcm9wVGFyZ2V0ID0gZmluZERyb3BUYXJnZXQoZWxlbWVudEJlaGluZEN1cnNvciwgY2xpZW50WCwgY2xpZW50WSk7XG4gICAgaWYgKGRyb3BUYXJnZXQgJiYgKG8uY29weSA9PT0gZmFsc2UgfHwgZHJvcFRhcmdldCAhPT0gX3NvdXJjZSkpIHtcbiAgICAgIGRyb3AoaXRlbSwgZHJvcFRhcmdldCk7XG4gICAgfSBlbHNlIGlmIChvLnJlbW92ZU9uU3BpbGwpIHtcbiAgICAgIHJlbW92ZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYW5jZWwoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkcm9wIChpdGVtLCB0YXJnZXQpIHtcbiAgICBpZiAoaXNJbml0aWFsUGxhY2VtZW50KHRhcmdldCkpIHtcbiAgICAgIGRyYWtlLmVtaXQoJ2NhbmNlbCcsIGl0ZW0sIF9zb3VyY2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkcmFrZS5lbWl0KCdkcm9wJywgaXRlbSwgdGFyZ2V0LCBfc291cmNlKTtcbiAgICB9XG4gICAgY2xlYW51cCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlICgpIHtcbiAgICBpZiAoIWRyYWtlLmRyYWdnaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgdmFyIHBhcmVudCA9IGl0ZW0ucGFyZW50RWxlbWVudDtcbiAgICBpZiAocGFyZW50KSB7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQoaXRlbSk7XG4gICAgfVxuICAgIGRyYWtlLmVtaXQoby5jb3B5ID8gJ2NhbmNlbCcgOiAncmVtb3ZlJywgaXRlbSwgcGFyZW50KTtcbiAgICBjbGVhbnVwKCk7XG4gIH1cblxuICBmdW5jdGlvbiBjYW5jZWwgKHJldmVydCkge1xuICAgIGlmICghZHJha2UuZHJhZ2dpbmcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHJldmVydHMgPSBhcmd1bWVudHMubGVuZ3RoID4gMCA/IHJldmVydCA6IG8ucmV2ZXJ0T25TcGlsbDtcbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xuICAgIHZhciBwYXJlbnQgPSBpdGVtLnBhcmVudEVsZW1lbnQ7XG4gICAgaWYgKHBhcmVudCA9PT0gX3NvdXJjZSAmJiBvLmNvcHkpIHtcbiAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChfY29weSk7XG4gICAgfVxuICAgIHZhciBpbml0aWFsID0gaXNJbml0aWFsUGxhY2VtZW50KHBhcmVudCk7XG4gICAgaWYgKGluaXRpYWwgPT09IGZhbHNlICYmIG8uY29weSA9PT0gZmFsc2UgJiYgcmV2ZXJ0cykge1xuICAgICAgX3NvdXJjZS5pbnNlcnRCZWZvcmUoaXRlbSwgX2luaXRpYWxTaWJsaW5nKTtcbiAgICB9XG4gICAgaWYgKGluaXRpYWwgfHwgcmV2ZXJ0cykge1xuICAgICAgZHJha2UuZW1pdCgnY2FuY2VsJywgaXRlbSwgX3NvdXJjZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRyYWtlLmVtaXQoJ2Ryb3AnLCBpdGVtLCBwYXJlbnQsIF9zb3VyY2UpO1xuICAgIH1cbiAgICBjbGVhbnVwKCk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhbnVwICgpIHtcbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xuICAgIHJlbW92ZU1pcnJvckltYWdlKCk7XG4gICAgaWYgKGl0ZW0pIHtcbiAgICAgIHJtQ2xhc3MoaXRlbSwgJ2d1LXRyYW5zaXQnKTtcbiAgICB9XG4gICAgaWYgKF9yZW5kZXJUaW1lcikge1xuICAgICAgY2xlYXJUaW1lb3V0KF9yZW5kZXJUaW1lcik7XG4gICAgfVxuICAgIGRyYWtlLmRyYWdnaW5nID0gZmFsc2U7XG4gICAgZHJha2UuZW1pdCgnZHJhZ2VuZCcsIGl0ZW0pO1xuICAgIGRyYWtlLmVtaXQoJ291dCcsIGl0ZW0sIF9sYXN0RHJvcFRhcmdldCwgX3NvdXJjZSk7XG4gICAgX3NvdXJjZSA9IF9pdGVtID0gX2NvcHkgPSBfaW5pdGlhbFNpYmxpbmcgPSBfY3VycmVudFNpYmxpbmcgPSBfcmVuZGVyVGltZXIgPSBfbGFzdERyb3BUYXJnZXQgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNJbml0aWFsUGxhY2VtZW50ICh0YXJnZXQsIHMpIHtcbiAgICB2YXIgc2libGluZztcbiAgICBpZiAocyAhPT0gdm9pZCAwKSB7XG4gICAgICBzaWJsaW5nID0gcztcbiAgICB9IGVsc2UgaWYgKF9taXJyb3IpIHtcbiAgICAgIHNpYmxpbmcgPSBfY3VycmVudFNpYmxpbmc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNpYmxpbmcgPSBuZXh0RWwoX2l0ZW0gfHwgX2NvcHkpO1xuICAgIH1cbiAgICByZXR1cm4gdGFyZ2V0ID09PSBfc291cmNlICYmIHNpYmxpbmcgPT09IF9pbml0aWFsU2libGluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmREcm9wVGFyZ2V0IChlbGVtZW50QmVoaW5kQ3Vyc29yLCBjbGllbnRYLCBjbGllbnRZKSB7XG4gICAgdmFyIHRhcmdldCA9IGVsZW1lbnRCZWhpbmRDdXJzb3I7XG4gICAgd2hpbGUgKHRhcmdldCAmJiAhYWNjZXB0ZWQoKSkge1xuICAgICAgdGFyZ2V0ID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQ7XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQ7XG5cbiAgICBmdW5jdGlvbiBhY2NlcHRlZCAoKSB7XG4gICAgICB2YXIgZHJvcHBhYmxlID0gaXNDb250YWluZXIodGFyZ2V0KTtcbiAgICAgIGlmIChkcm9wcGFibGUgPT09IGZhbHNlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgdmFyIGltbWVkaWF0ZSA9IGdldEltbWVkaWF0ZUNoaWxkKHRhcmdldCwgZWxlbWVudEJlaGluZEN1cnNvcik7XG4gICAgICB2YXIgcmVmZXJlbmNlID0gZ2V0UmVmZXJlbmNlKHRhcmdldCwgaW1tZWRpYXRlLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICAgIHZhciBpbml0aWFsID0gaXNJbml0aWFsUGxhY2VtZW50KHRhcmdldCwgcmVmZXJlbmNlKTtcbiAgICAgIGlmIChpbml0aWFsKSB7XG4gICAgICAgIHJldHVybiB0cnVlOyAvLyBzaG91bGQgYWx3YXlzIGJlIGFibGUgdG8gZHJvcCBpdCByaWdodCBiYWNrIHdoZXJlIGl0IHdhc1xuICAgICAgfVxuICAgICAgcmV0dXJuIG8uYWNjZXB0cyhfaXRlbSwgdGFyZ2V0LCBfc291cmNlLCByZWZlcmVuY2UpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYWcgKGUpIHtcbiAgICBpZiAoIV9taXJyb3IpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGUpIHtcbiAgICAgIF9jbGllbnRYID0gZ2V0Q29vcmQoJ2NsaWVudFgnLCBlKTtcbiAgICAgIF9jbGllbnRZID0gZ2V0Q29vcmQoJ2NsaWVudFknLCBlKTtcbiAgICB9XG4gICAgdmFyIHggPSBfY2xpZW50WCAtIF9vZmZzZXRYO1xuICAgIHZhciB5ID0gX2NsaWVudFkgLSBfb2Zmc2V0WTtcblxuICAgIF9taXJyb3Iuc3R5bGUubGVmdCA9IHggKyAncHgnO1xuICAgIF9taXJyb3Iuc3R5bGUudG9wICA9IHkgKyAncHgnO1xuXG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcbiAgICB2YXIgZWxlbWVudEJlaGluZEN1cnNvciA9IGdldEVsZW1lbnRCZWhpbmRQb2ludChfbWlycm9yLCBfY2xpZW50WCwgX2NsaWVudFkpO1xuICAgIHZhciBkcm9wVGFyZ2V0ID0gZmluZERyb3BUYXJnZXQoZWxlbWVudEJlaGluZEN1cnNvciwgX2NsaWVudFgsIF9jbGllbnRZKTtcbiAgICB2YXIgY2hhbmdlZCA9IGRyb3BUYXJnZXQgIT09IG51bGwgJiYgZHJvcFRhcmdldCAhPT0gX2xhc3REcm9wVGFyZ2V0O1xuICAgIGlmIChjaGFuZ2VkIHx8IGRyb3BUYXJnZXQgPT09IG51bGwpIHtcbiAgICAgIG91dCgpO1xuICAgICAgX2xhc3REcm9wVGFyZ2V0ID0gZHJvcFRhcmdldDtcbiAgICAgIG92ZXIoKTtcbiAgICB9XG4gICAgaWYgKGRyb3BUYXJnZXQgPT09IF9zb3VyY2UgJiYgby5jb3B5KSB7XG4gICAgICBpZiAoaXRlbS5wYXJlbnRFbGVtZW50KSB7XG4gICAgICAgIGl0ZW0ucGFyZW50RWxlbWVudC5yZW1vdmVDaGlsZChpdGVtKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHJlZmVyZW5jZTtcbiAgICB2YXIgaW1tZWRpYXRlID0gZ2V0SW1tZWRpYXRlQ2hpbGQoZHJvcFRhcmdldCwgZWxlbWVudEJlaGluZEN1cnNvcik7XG4gICAgaWYgKGltbWVkaWF0ZSAhPT0gbnVsbCkge1xuICAgICAgcmVmZXJlbmNlID0gZ2V0UmVmZXJlbmNlKGRyb3BUYXJnZXQsIGltbWVkaWF0ZSwgX2NsaWVudFgsIF9jbGllbnRZKTtcbiAgICB9IGVsc2UgaWYgKG8ucmV2ZXJ0T25TcGlsbCA9PT0gdHJ1ZSAmJiAhby5jb3B5KSB7XG4gICAgICByZWZlcmVuY2UgPSBfaW5pdGlhbFNpYmxpbmc7XG4gICAgICBkcm9wVGFyZ2V0ID0gX3NvdXJjZTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKChvLmNvcHkgfHwgby5yZW1vdmVPblNwaWxsID09PSB0cnVlKSAmJiBpdGVtLnBhcmVudEVsZW1lbnQgIT09IG51bGwpIHtcbiAgICAgICAgaXRlbS5wYXJlbnRFbGVtZW50LnJlbW92ZUNoaWxkKGl0ZW0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAocmVmZXJlbmNlID09PSBudWxsIHx8IHJlZmVyZW5jZSAhPT0gaXRlbSAmJiByZWZlcmVuY2UgIT09IG5leHRFbChpdGVtKSkge1xuICAgICAgX2N1cnJlbnRTaWJsaW5nID0gcmVmZXJlbmNlO1xuICAgICAgZHJvcFRhcmdldC5pbnNlcnRCZWZvcmUoaXRlbSwgcmVmZXJlbmNlKTtcbiAgICAgIGRyYWtlLmVtaXQoJ3NoYWRvdycsIGl0ZW0sIGRyb3BUYXJnZXQpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBtb3ZlZCAodHlwZSkgeyBkcmFrZS5lbWl0KHR5cGUsIGl0ZW0sIF9sYXN0RHJvcFRhcmdldCwgX3NvdXJjZSk7IH1cbiAgICBmdW5jdGlvbiBvdmVyICgpIHsgaWYgKGNoYW5nZWQpIHsgbW92ZWQoJ292ZXInKTsgfSB9XG4gICAgZnVuY3Rpb24gb3V0ICgpIHsgaWYgKF9sYXN0RHJvcFRhcmdldCkgeyBtb3ZlZCgnb3V0Jyk7IH0gfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyTWlycm9ySW1hZ2UgKCkge1xuICAgIGlmIChfbWlycm9yKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciByZWN0ID0gX2l0ZW0uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgX21pcnJvciA9IF9pdGVtLmNsb25lTm9kZSh0cnVlKTtcbiAgICBfbWlycm9yLnN0eWxlLndpZHRoID0gZ2V0UmVjdFdpZHRoKHJlY3QpICsgJ3B4JztcbiAgICBfbWlycm9yLnN0eWxlLmhlaWdodCA9IGdldFJlY3RIZWlnaHQocmVjdCkgKyAncHgnO1xuICAgIHJtQ2xhc3MoX21pcnJvciwgJ2d1LXRyYW5zaXQnKTtcbiAgICBhZGRDbGFzcyhfbWlycm9yLCAnIGd1LW1pcnJvcicpO1xuICAgIGJvZHkuYXBwZW5kQ2hpbGQoX21pcnJvcik7XG4gICAgdG91Y2h5KGRvY3VtZW50RWxlbWVudCwgJ2FkZCcsICdtb3VzZW1vdmUnLCBkcmFnKTtcbiAgICBhZGRDbGFzcyhib2R5LCAnZ3UtdW5zZWxlY3RhYmxlJyk7XG4gICAgZHJha2UuZW1pdCgnY2xvbmVkJywgX21pcnJvciwgX2l0ZW0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlTWlycm9ySW1hZ2UgKCkge1xuICAgIGlmIChfbWlycm9yKSB7XG4gICAgICBybUNsYXNzKGJvZHksICdndS11bnNlbGVjdGFibGUnKTtcbiAgICAgIHRvdWNoeShkb2N1bWVudEVsZW1lbnQsICdyZW1vdmUnLCAnbW91c2Vtb3ZlJywgZHJhZyk7XG4gICAgICBfbWlycm9yLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQoX21pcnJvcik7XG4gICAgICBfbWlycm9yID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBnZXRJbW1lZGlhdGVDaGlsZCAoZHJvcFRhcmdldCwgdGFyZ2V0KSB7XG4gICAgdmFyIGltbWVkaWF0ZSA9IHRhcmdldDtcbiAgICB3aGlsZSAoaW1tZWRpYXRlICE9PSBkcm9wVGFyZ2V0ICYmIGltbWVkaWF0ZS5wYXJlbnRFbGVtZW50ICE9PSBkcm9wVGFyZ2V0KSB7XG4gICAgICBpbW1lZGlhdGUgPSBpbW1lZGlhdGUucGFyZW50RWxlbWVudDtcbiAgICB9XG4gICAgaWYgKGltbWVkaWF0ZSA9PT0gZG9jdW1lbnRFbGVtZW50KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIGltbWVkaWF0ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFJlZmVyZW5jZSAoZHJvcFRhcmdldCwgdGFyZ2V0LCB4LCB5KSB7XG4gICAgdmFyIGhvcml6b250YWwgPSBvLmRpcmVjdGlvbiA9PT0gJ2hvcml6b250YWwnO1xuICAgIHZhciByZWZlcmVuY2UgPSB0YXJnZXQgIT09IGRyb3BUYXJnZXQgPyBpbnNpZGUoKSA6IG91dHNpZGUoKTtcbiAgICByZXR1cm4gcmVmZXJlbmNlO1xuXG4gICAgZnVuY3Rpb24gb3V0c2lkZSAoKSB7IC8vIHNsb3dlciwgYnV0IGFibGUgdG8gZmlndXJlIG91dCBhbnkgcG9zaXRpb25cbiAgICAgIHZhciBsZW4gPSBkcm9wVGFyZ2V0LmNoaWxkcmVuLmxlbmd0aDtcbiAgICAgIHZhciBpO1xuICAgICAgdmFyIGVsO1xuICAgICAgdmFyIHJlY3Q7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgZWwgPSBkcm9wVGFyZ2V0LmNoaWxkcmVuW2ldO1xuICAgICAgICByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIGlmIChob3Jpem9udGFsICYmIHJlY3QubGVmdCA+IHgpIHsgcmV0dXJuIGVsOyB9XG4gICAgICAgIGlmICghaG9yaXpvbnRhbCAmJiByZWN0LnRvcCA+IHkpIHsgcmV0dXJuIGVsOyB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbnNpZGUgKCkgeyAvLyBmYXN0ZXIsIGJ1dCBvbmx5IGF2YWlsYWJsZSBpZiBkcm9wcGVkIGluc2lkZSBhIGNoaWxkIGVsZW1lbnRcbiAgICAgIHZhciByZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgaWYgKGhvcml6b250YWwpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoeCA+IHJlY3QubGVmdCArIGdldFJlY3RXaWR0aChyZWN0KSAvIDIpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUoeSA+IHJlY3QudG9wICsgZ2V0UmVjdEhlaWdodChyZWN0KSAvIDIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc29sdmUgKGFmdGVyKSB7XG4gICAgICByZXR1cm4gYWZ0ZXIgPyBuZXh0RWwodGFyZ2V0KSA6IHRhcmdldDtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdG91Y2h5IChlbCwgb3AsIHR5cGUsIGZuKSB7XG4gIHZhciB0b3VjaCA9IHtcbiAgICBtb3VzZXVwOiAndG91Y2hlbmQnLFxuICAgIG1vdXNlZG93bjogJ3RvdWNoc3RhcnQnLFxuICAgIG1vdXNlbW92ZTogJ3RvdWNobW92ZSdcbiAgfTtcbiAgdmFyIG1pY3Jvc29mdCA9IHtcbiAgICBtb3VzZXVwOiAnTVNQb2ludGVyVXAnLFxuICAgIG1vdXNlZG93bjogJ01TUG9pbnRlckRvd24nLFxuICAgIG1vdXNlbW92ZTogJ01TUG9pbnRlck1vdmUnXG4gIH07XG4gIGlmIChnbG9iYWwubmF2aWdhdG9yLm1zUG9pbnRlckVuYWJsZWQpIHtcbiAgICBjcm9zc3ZlbnRbb3BdKGVsLCBtaWNyb3NvZnRbdHlwZV0sIGZuKTtcbiAgfVxuICBjcm9zc3ZlbnRbb3BdKGVsLCB0b3VjaFt0eXBlXSwgZm4pO1xuICBjcm9zc3ZlbnRbb3BdKGVsLCB0eXBlLCBmbik7XG59XG5cbmZ1bmN0aW9uIGdldE9mZnNldCAoZWwpIHtcbiAgdmFyIHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgcmV0dXJuIHtcbiAgICBsZWZ0OiByZWN0LmxlZnQgKyBnZXRTY3JvbGwoJ3Njcm9sbExlZnQnLCAncGFnZVhPZmZzZXQnKSxcbiAgICB0b3A6IHJlY3QudG9wICsgZ2V0U2Nyb2xsKCdzY3JvbGxUb3AnLCAncGFnZVlPZmZzZXQnKVxuICB9O1xufVxuXG5mdW5jdGlvbiBnZXRTY3JvbGwgKHNjcm9sbFByb3AsIG9mZnNldFByb3ApIHtcbiAgaWYgKHR5cGVvZiBnbG9iYWxbb2Zmc2V0UHJvcF0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGdsb2JhbFtvZmZzZXRQcm9wXTtcbiAgfVxuICB2YXIgZG9jdW1lbnRFbGVtZW50ID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICBpZiAoZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkge1xuICAgIHJldHVybiBkb2N1bWVudEVsZW1lbnRbc2Nyb2xsUHJvcF07XG4gIH1cbiAgdmFyIGJvZHkgPSBkb2N1bWVudC5ib2R5O1xuICByZXR1cm4gYm9keVtzY3JvbGxQcm9wXTtcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudEJlaGluZFBvaW50IChwb2ludCwgeCwgeSkge1xuICBpZiAoIXggJiYgIXkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICB2YXIgcCA9IHBvaW50IHx8IHt9O1xuICB2YXIgc3RhdGUgPSBwLmNsYXNzTmFtZTtcbiAgdmFyIGVsO1xuICBwLmNsYXNzTmFtZSArPSAnIGd1LWhpZGUnO1xuICBlbCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoeCwgeSk7XG4gIHAuY2xhc3NOYW1lID0gc3RhdGU7XG4gIHJldHVybiBlbDtcbn1cblxuZnVuY3Rpb24gbmV2ZXIgKCkge1xuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGFsd2F5cyAoKSB7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBuZXh0RWwgKGVsKSB7XG4gIHJldHVybiBlbC5uZXh0RWxlbWVudFNpYmxpbmcgfHwgbWFudWFsbHkoKTtcbiAgZnVuY3Rpb24gbWFudWFsbHkgKCkge1xuICAgIHZhciBzaWJsaW5nID0gZWw7XG4gICAgZG8ge1xuICAgICAgc2libGluZyA9IHNpYmxpbmcubmV4dFNpYmxpbmc7XG4gICAgfSB3aGlsZSAoc2libGluZyAmJiBzaWJsaW5nLm5vZGVUeXBlICE9PSAxKTtcbiAgICByZXR1cm4gc2libGluZztcbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRDbGFzcyAoZWwsIGNsYXNzTmFtZSkge1xuICBpZiAoZWwuY2xhc3NOYW1lLmluZGV4T2YoJyAnICsgY2xhc3NOYW1lKSA9PT0gLTEpIHtcbiAgICBlbC5jbGFzc05hbWUgKz0gJyAnICsgY2xhc3NOYW1lO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJtQ2xhc3MgKGVsLCBjbGFzc05hbWUpIHtcbiAgZWwuY2xhc3NOYW1lID0gZWwuY2xhc3NOYW1lLnJlcGxhY2UobmV3IFJlZ0V4cCgnICcgKyBjbGFzc05hbWUsICdnJyksICcnKTtcbn1cblxuZnVuY3Rpb24gZ2V0RXZlbnRIb3N0IChlKSB7XG4gIC8vIG9uIHRvdWNoZW5kIGV2ZW50LCB3ZSBoYXZlIHRvIHVzZSBgZS5jaGFuZ2VkVG91Y2hlc2BcbiAgLy8gc2VlIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvNzE5MjU2My90b3VjaGVuZC1ldmVudC1wcm9wZXJ0aWVzXG4gIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvZHJhZ3VsYS9pc3N1ZXMvMzRcbiAgaWYgKGUudGFyZ2V0VG91Y2hlcyAmJiBlLnRhcmdldFRvdWNoZXMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGUudGFyZ2V0VG91Y2hlc1swXTtcbiAgfVxuICBpZiAoZS5jaGFuZ2VkVG91Y2hlcyAmJiBlLmNoYW5nZWRUb3VjaGVzLmxlbmd0aCkge1xuICAgIHJldHVybiBlLmNoYW5nZWRUb3VjaGVzWzBdO1xuICB9XG4gIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBnZXRDb29yZCAoY29vcmQsIGUpIHtcbiAgdmFyIGhvc3QgPSBnZXRFdmVudEhvc3QoZSk7XG4gIHZhciBtaXNzTWFwID0ge1xuICAgIHBhZ2VYOiAnY2xpZW50WCcsIC8vIElFOFxuICAgIHBhZ2VZOiAnY2xpZW50WScgLy8gSUU4XG4gIH07XG4gIGlmIChjb29yZCBpbiBtaXNzTWFwICYmICEoY29vcmQgaW4gaG9zdCkgJiYgbWlzc01hcFtjb29yZF0gaW4gaG9zdCkge1xuICAgIGNvb3JkID0gbWlzc01hcFtjb29yZF07XG4gIH1cbiAgcmV0dXJuIGhvc3RbY29vcmRdO1xufVxuXG5mdW5jdGlvbiBnZXRSZWN0V2lkdGggKHJlY3QpIHtcbiAgcmV0dXJuIHJlY3Qud2lkdGggfHwgKHJlY3QucmlnaHQgLSByZWN0LmxlZnQpO1xufVxuXG5mdW5jdGlvbiBnZXRSZWN0SGVpZ2h0IChyZWN0KSB7XG4gIHJldHVybiByZWN0LmhlaWdodCB8fCAocmVjdC5ib3R0b20gLSByZWN0LnRvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZHJhZ3VsYTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pXG4vLyMgc291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uL2pzb247Y2hhcnNldDp1dGYtODtiYXNlNjQsZXlKMlpYSnphVzl1SWpvekxDSnpiM1Z5WTJWeklqcGJJbVJ5WVdkMWJHRXVhbk1pWFN3aWJtRnRaWE1pT2x0ZExDSnRZWEJ3YVc1bmN5STZJanRCUVVGQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEVpTENKbWFXeGxJam9pWjJWdVpYSmhkR1ZrTG1weklpd2ljMjkxY21ObFVtOXZkQ0k2SWlJc0luTnZkWEpqWlhORGIyNTBaVzUwSWpwYklpZDFjMlVnYzNSeWFXTjBKenRjYmx4dWRtRnlJR1Z0YVhSMFpYSWdQU0J5WlhGMWFYSmxLQ2RqYjI1MGNtRXZaVzFwZEhSbGNpY3BPMXh1ZG1GeUlHTnliM056ZG1WdWRDQTlJSEpsY1hWcGNtVW9KMk55YjNOemRtVnVkQ2NwTzF4dVhHNW1kVzVqZEdsdmJpQmtjbUZuZFd4aElDaHBibWwwYVdGc1EyOXVkR0ZwYm1WeWN5d2diM0IwYVc5dWN5a2dlMXh1SUNCMllYSWdiR1Z1SUQwZ1lYSm5kVzFsYm5SekxteGxibWQwYUR0Y2JpQWdhV1lnS0d4bGJpQTlQVDBnTVNBbUppQkJjbkpoZVM1cGMwRnljbUY1S0dsdWFYUnBZV3hEYjI1MFlXbHVaWEp6S1NBOVBUMGdabUZzYzJVcElIdGNiaUFnSUNCdmNIUnBiMjV6SUQwZ2FXNXBkR2xoYkVOdmJuUmhhVzVsY25NN1hHNGdJQ0FnYVc1cGRHbGhiRU52Ym5SaGFXNWxjbk1nUFNCYlhUdGNiaUFnZlZ4dUlDQjJZWElnWW05a2VTQTlJR1J2WTNWdFpXNTBMbUp2WkhrN1hHNGdJSFpoY2lCa2IyTjFiV1Z1ZEVWc1pXMWxiblFnUFNCa2IyTjFiV1Z1ZEM1a2IyTjFiV1Z1ZEVWc1pXMWxiblE3WEc0Z0lIWmhjaUJmYldseWNtOXlPeUF2THlCdGFYSnliM0lnYVcxaFoyVmNiaUFnZG1GeUlGOXpiM1Z5WTJVN0lDOHZJSE52ZFhKalpTQmpiMjUwWVdsdVpYSmNiaUFnZG1GeUlGOXBkR1Z0T3lBdkx5QnBkR1Z0SUdKbGFXNW5JR1J5WVdkblpXUmNiaUFnZG1GeUlGOXZabVp6WlhSWU95QXZMeUJ5WldabGNtVnVZMlVnZUZ4dUlDQjJZWElnWDI5bVpuTmxkRms3SUM4dklISmxabVZ5Wlc1alpTQjVYRzRnSUhaaGNpQmZZMnhwWlc1MFdEc2dMeThnWTJGamFHVWdZMnhwWlc1MElIZ3NJR2x1YVhRZ1lYUWdaM0poWWl3Z2RYQmtZWFJsSUdGMElHUnlZV2RjYmlBZ2RtRnlJRjlqYkdsbGJuUlpPeUF2THlCallXTm9aU0JqYkdsbGJuUWdlU3dnYVc1cGRDQmhkQ0JuY21GaUxDQjFjR1JoZEdVZ1lYUWdaSEpoWjF4dUlDQjJZWElnWDJsdWFYUnBZV3hUYVdKc2FXNW5PeUF2THlCeVpXWmxjbVZ1WTJVZ2MybGliR2x1WnlCM2FHVnVJR2R5WVdKaVpXUmNiaUFnZG1GeUlGOWpkWEp5Wlc1MFUybGliR2x1WnpzZ0x5OGdjbVZtWlhKbGJtTmxJSE5wWW14cGJtY2dibTkzWEc0Z0lIWmhjaUJmWTI5d2VUc2dMeThnYVhSbGJTQjFjMlZrSUdadmNpQmpiM0I1YVc1blhHNGdJSFpoY2lCZmNtVnVaR1Z5VkdsdFpYSTdJQzh2SUhScGJXVnlJR1p2Y2lCelpYUlVhVzFsYjNWMElISmxibVJsY2sxcGNuSnZja2x0WVdkbFhHNGdJSFpoY2lCZmJHRnpkRVJ5YjNCVVlYSm5aWFFnUFNCdWRXeHNPeUF2THlCc1lYTjBJR052Ym5SaGFXNWxjaUJwZEdWdElIZGhjeUJ2ZG1WeVhHNWNiaUFnZG1GeUlHOGdQU0J2Y0hScGIyNXpJSHg4SUh0OU8xeHVJQ0JwWmlBb2J5NXRiM1psY3lBOVBUMGdkbTlwWkNBd0tTQjdJRzh1Ylc5MlpYTWdQU0JoYkhkaGVYTTdJSDFjYmlBZ2FXWWdLRzh1WVdOalpYQjBjeUE5UFQwZ2RtOXBaQ0F3S1NCN0lHOHVZV05qWlhCMGN5QTlJR0ZzZDJGNWN6c2dmVnh1SUNCcFppQW9ieTVwYm5aaGJHbGtJRDA5UFNCMmIybGtJREFwSUhzZ2J5NXBiblpoYkdsa0lEMGdhVzUyWVd4cFpGUmhjbWRsZERzZ2ZWeHVJQ0JwWmlBb2J5NWpiMjUwWVdsdVpYSnpJRDA5UFNCMmIybGtJREFwSUhzZ2J5NWpiMjUwWVdsdVpYSnpJRDBnYVc1cGRHbGhiRU52Ym5SaGFXNWxjbk1nZkh3Z1cxMDdJSDFjYmlBZ2FXWWdLRzh1YVhORGIyNTBZV2x1WlhJZ1BUMDlJSFp2YVdRZ01Da2dleUJ2TG1selEyOXVkR0ZwYm1WeUlEMGdibVYyWlhJN0lIMWNiaUFnYVdZZ0tHOHVZMjl3ZVNBOVBUMGdkbTlwWkNBd0tTQjdJRzh1WTI5d2VTQTlJR1poYkhObE95QjlYRzRnSUdsbUlDaHZMbkpsZG1WeWRFOXVVM0JwYkd3Z1BUMDlJSFp2YVdRZ01Da2dleUJ2TG5KbGRtVnlkRTl1VTNCcGJHd2dQU0JtWVd4elpUc2dmVnh1SUNCcFppQW9ieTV5WlcxdmRtVlBibE53YVd4c0lEMDlQU0IyYjJsa0lEQXBJSHNnYnk1eVpXMXZkbVZQYmxOd2FXeHNJRDBnWm1Gc2MyVTdJSDFjYmlBZ2FXWWdLRzh1WkdseVpXTjBhVzl1SUQwOVBTQjJiMmxrSURBcElIc2dieTVrYVhKbFkzUnBiMjRnUFNBbmRtVnlkR2xqWVd3bk95QjlYRzRnSUdsbUlDaHZMbVJsYkdGNUlEMDlQU0IyYjJsa0lEQXBJSHNnYnk1a1pXeGhlU0E5SUdaaGJITmxPeUI5WEc0Z0lHbG1JQ2h2TG1SbGJHRjVJRDA5UFNCMGNuVmxLU0I3SUc4dVpHVnNZWGtnUFNBek1EQTdJSDFjYmx4dUlDQjJZWElnWkhKaGEyVWdQU0JsYldsMGRHVnlLSHRjYmlBZ0lDQmpiMjUwWVdsdVpYSnpPaUJ2TG1OdmJuUmhhVzVsY25Nc1hHNGdJQ0FnWVdSa1EyOXVkR0ZwYm1WeU9pQmhaR1JEYjI1MFlXbHVaWElzWEc0Z0lDQWdjbVZ0YjNabFEyOXVkR0ZwYm1WeU9pQnlaVzF2ZG1WRGIyNTBZV2x1WlhJc1hHNGdJQ0FnYzNSaGNuUTZJSE4wWVhKMExGeHVJQ0FnSUdWdVpEb2daVzVrTEZ4dUlDQWdJR05oYm1ObGJEb2dZMkZ1WTJWc0xGeHVJQ0FnSUhKbGJXOTJaVG9nY21WdGIzWmxMRnh1SUNBZ0lHUmxjM1J5YjNrNklHUmxjM1J5YjNrc1hHNGdJQ0FnWkhKaFoyZHBibWM2SUdaaGJITmxYRzRnSUgwcE8xeHVYRzRnSUdWMlpXNTBjeWdwTzF4dVhHNGdJSEpsZEhWeWJpQmtjbUZyWlR0Y2JseHVJQ0JtZFc1amRHbHZiaUJoWkdSRGIyNTBZV2x1WlhJZ0tHRnNiQ2tnZTF4dUlDQWdJSFpoY2lCamFHRnVaMlZ6SUQwZ1FYSnlZWGt1YVhOQmNuSmhlU2hoYkd3cElEOGdZV3hzSURvZ1cyRnNiRjA3WEc0Z0lDQWdaSEpoYTJVdVkyOXVkR0ZwYm1WeWN5QTlJR1J5WVd0bExtTnZiblJoYVc1bGNuTXVZMjl1WTJGMEtHTm9ZVzVuWlhNcE8xeHVJQ0FnSUdOdmJuTnZiR1V1ZDJGeWJpQW1KaUJqYjI1emIyeGxMbmRoY200b0oyUnlZV3RsTG1Ga1pFTnZiblJoYVc1bGNpQnBjeUJrWlhCeVpXTmhkR1ZrTGlCd2JHVmhjMlVnWVdOalpYTnpJR1J5WVd0bExtTnZiblJoYVc1bGNuTWdaR2x5WldOMGJIa3NJR2x1YzNSbFlXUW5LVHRjYmlBZ2ZWeHVJQ0JtZFc1amRHbHZiaUJ5WlcxdmRtVkRiMjUwWVdsdVpYSWdLR0ZzYkNrZ2UxeHVJQ0FnSUhaaGNpQmphR0Z1WjJWeklEMGdRWEp5WVhrdWFYTkJjbkpoZVNoaGJHd3BJRDhnWVd4c0lEb2dXMkZzYkYwN1hHNGdJQ0FnWkhKaGEyVXVZMjl1ZEdGcGJtVnljeUE5SUdSeVlXdGxMbU52Ym5SaGFXNWxjbk11Wm1sc2RHVnlLR3RsWlhCaFlteGxLVHRjYmlBZ0lDQmpiMjV6YjJ4bExuZGhjbTRnSmlZZ1kyOXVjMjlzWlM1M1lYSnVLQ2RrY21GclpTNXlaVzF2ZG1WRGIyNTBZV2x1WlhJZ2FYTWdaR1Z3Y21WallYUmxaQzRnY0d4bFlYTmxJR0ZqWTJWemN5QmtjbUZyWlM1amIyNTBZV2x1WlhKeklHUnBjbVZqZEd4NUxDQnBibk4wWldGa0p5azdYRzRnSUNBZ1puVnVZM1JwYjI0Z2EyVmxjR0ZpYkdVZ0tHTnZiblJoYVc1bGNpa2dlMXh1SUNBZ0lDQWdjbVYwZFhKdUlHTm9ZVzVuWlhNdWFXNWtaWGhQWmloamIyNTBZV2x1WlhJcElEMDlQU0F0TVR0Y2JpQWdJQ0I5WEc0Z0lIMWNibHh1SUNCbWRXNWpkR2x2YmlCcGMwTnZiblJoYVc1bGNpQW9aV3dwSUh0Y2JpQWdJQ0J5WlhSMWNtNGdaSEpoYTJVdVkyOXVkR0ZwYm1WeWN5NXBibVJsZUU5bUtHVnNLU0FoUFQwZ0xURWdmSHdnYnk1cGMwTnZiblJoYVc1bGNpaGxiQ2s3WEc0Z0lIMWNibHh1SUNCbWRXNWpkR2x2YmlCbGRtVnVkSE1nS0hKbGJXOTJaU2tnZTF4dUlDQWdJSFpoY2lCdmNDQTlJSEpsYlc5MlpTQS9JQ2R5WlcxdmRtVW5JRG9nSjJGa1pDYzdYRzRnSUNBZ2RHOTFZMmg1S0dSdlkzVnRaVzUwUld4bGJXVnVkQ3dnYjNBc0lDZHRiM1Z6WldSdmQyNG5MQ0JuY21GaUtUdGNiaUFnSUNCMGIzVmphSGtvWkc5amRXMWxiblJGYkdWdFpXNTBMQ0J2Y0N3Z0oyMXZkWE5sZFhBbkxDQnlaV3hsWVhObEtUdGNiaUFnZlZ4dVhHNGdJR1oxYm1OMGFXOXVJR1JsYzNSeWIza2dLQ2tnZTF4dUlDQWdJR1YyWlc1MGN5aDBjblZsS1R0Y2JpQWdJQ0J5Wld4bFlYTmxLSHQ5S1R0Y2JpQWdmVnh1WEc0Z0lHWjFibU4wYVc5dUlHZHlZV0lnS0dVcElIdGNiaUFnSUNCMllYSWdhWFJsYlNBOUlHVXVkR0Z5WjJWME8xeHVJQ0FnSUhaaGNpQnBaMjV2Y21VZ1BTQW9aUzUzYUdsamFDQWhQVDBnTUNBbUppQmxMbmRvYVdOb0lDRTlQU0F4S1NCOGZDQmxMbTFsZEdGTFpYa2dmSHdnWlM1amRISnNTMlY1TzF4dUlDQWdJR2xtSUNocFoyNXZjbVVwSUh0Y2JpQWdJQ0FnSUhKbGRIVnlianNnTHk4Z2QyVWdiMjVzZVNCallYSmxJR0ZpYjNWMElHaHZibVZ6ZEMxMGJ5MW5iMlFnYkdWbWRDQmpiR2xqYTNNZ1lXNWtJSFJ2ZFdOb0lHVjJaVzUwYzF4dUlDQWdJSDFjYmlBZ0lDQnBaaUFvYzNSaGNuUW9hWFJsYlNrZ0lUMDlJSFJ5ZFdVcElIdGNiaUFnSUNBZ0lISmxkSFZ5Ymp0Y2JpQWdJQ0I5WEc1Y2JpQWdJQ0IyWVhJZ2IyWm1jMlYwSUQwZ1oyVjBUMlptYzJWMEtGOXBkR1Z0S1R0Y2JpQWdJQ0JmYjJabWMyVjBXQ0E5SUdkbGRFTnZiM0prS0Nkd1lXZGxXQ2NzSUdVcElDMGdiMlptYzJWMExteGxablE3WEc0Z0lDQWdYMjltWm5ObGRGa2dQU0JuWlhSRGIyOXlaQ2duY0dGblpWa25MQ0JsS1NBdElHOW1abk5sZEM1MGIzQTdYRzRnSUNBZ1gyTnNhV1Z1ZEZnZ1BTQm5aWFJEYjI5eVpDZ25ZMnhwWlc1MFdDY3NJR1VwTzF4dUlDQWdJRjlqYkdsbGJuUlpJRDBnWjJWMFEyOXZjbVFvSjJOc2FXVnVkRmtuTENCbEtUdGNibHh1SUNBZ0lHbG1JQ2gwZVhCbGIyWWdieTVrWld4aGVTQTlQVDBnSjI1MWJXSmxjaWNwSUh0Y2JpQWdJQ0FnSUY5eVpXNWtaWEpVYVcxbGNpQTlJSE5sZEZScGJXVnZkWFFvY21WdVpHVnlUV2x5Y205eVFXNWtSSEpoWnl3Z2J5NWtaV3hoZVNrN1hHNGdJQ0FnZlNCbGJITmxJSHRjYmlBZ0lDQWdJSEpsYm1SbGNrMXBjbkp2Y2tGdVpFUnlZV2NvS1R0Y2JpQWdJQ0I5WEc0Z0lDQWdaUzV3Y21WMlpXNTBSR1ZtWVhWc2RDZ3BPMXh1SUNCOVhHNWNiaUFnWm5WdVkzUnBiMjRnY21WdVpHVnlUV2x5Y205eVFXNWtSSEpoWnlBb0tTQjdYRzRnSUNBZ1lXUmtRMnhoYzNNb1gyTnZjSGtnZkh3Z1gybDBaVzBzSUNkbmRTMTBjbUZ1YzJsMEp5azdYRzRnSUNBZ2NtVnVaR1Z5VFdseWNtOXlTVzFoWjJVb0tUdGNiaUFnSUNCa2NtRm5LQ2s3WEc0Z0lIMWNibHh1SUNCbWRXNWpkR2x2YmlCemRHRnlkQ0FvYVhSbGJTa2dlMXh1SUNBZ0lIWmhjaUJvWVc1a2JHVWdQU0JwZEdWdE8xeHVYRzRnSUNBZ2FXWWdLR1J5WVd0bExtUnlZV2RuYVc1bklDWW1JRjl0YVhKeWIzSXBJSHRjYmlBZ0lDQWdJSEpsZEhWeWJqdGNiaUFnSUNCOVhHNWNiaUFnSUNCcFppQW9hWE5EYjI1MFlXbHVaWElvYVhSbGJTa3BJSHRjYmlBZ0lDQWdJSEpsZEhWeWJqc2dMeThnWkc5dUozUWdaSEpoWnlCamIyNTBZV2x1WlhJZ2FYUnpaV3htWEc0Z0lDQWdmVnh1SUNBZ0lIZG9hV3hsSUNocGRHVnRMbkJoY21WdWRFVnNaVzFsYm5RZ0ppWWdhWE5EYjI1MFlXbHVaWElvYVhSbGJTNXdZWEpsYm5SRmJHVnRaVzUwS1NBOVBUMGdabUZzYzJVcElIdGNiaUFnSUNBZ0lHbG1JQ2h2TG1sdWRtRnNhV1FvYVhSbGJTd2dhR0Z1Wkd4bEtTa2dlMXh1SUNBZ0lDQWdJQ0J5WlhSMWNtNDdYRzRnSUNBZ0lDQjlYRzRnSUNBZ0lDQnBkR1Z0SUQwZ2FYUmxiUzV3WVhKbGJuUkZiR1Z0Wlc1ME95QXZMeUJrY21GbklIUmhjbWRsZENCemFHOTFiR1FnWW1VZ1lTQjBiM0FnWld4bGJXVnVkRnh1SUNBZ0lDQWdhV1lnS0NGcGRHVnRLU0I3WEc0Z0lDQWdJQ0FnSUhKbGRIVnlianRjYmlBZ0lDQWdJSDFjYmlBZ0lDQjlYRzRnSUNBZ2RtRnlJR052Ym5SaGFXNWxjaUE5SUdsMFpXMHVjR0Z5Wlc1MFJXeGxiV1Z1ZER0Y2JpQWdJQ0JwWmlBb0lXTnZiblJoYVc1bGNpa2dlMXh1SUNBZ0lDQWdjbVYwZFhKdU8xeHVJQ0FnSUgxY2JpQWdJQ0JwWmlBb2J5NXBiblpoYkdsa0tHbDBaVzBzSUdoaGJtUnNaU2twSUh0Y2JpQWdJQ0FnSUhKbGRIVnlianRjYmlBZ0lDQjlYRzVjYmlBZ0lDQjJZWElnYlc5MllXSnNaU0E5SUc4dWJXOTJaWE1vYVhSbGJTd2dZMjl1ZEdGcGJtVnlMQ0JvWVc1a2JHVXBPMXh1SUNBZ0lHbG1JQ2doYlc5MllXSnNaU2tnZTF4dUlDQWdJQ0FnY21WMGRYSnVPMXh1SUNBZ0lIMWNibHh1SUNBZ0lHVnVaQ2dwTzF4dVhHNGdJQ0FnYVdZZ0tHOHVZMjl3ZVNrZ2UxeHVJQ0FnSUNBZ1gyTnZjSGtnUFNCcGRHVnRMbU5zYjI1bFRtOWtaU2gwY25WbEtUdGNiaUFnSUNBZ0lHUnlZV3RsTG1WdGFYUW9KMk5zYjI1bFpDY3NJRjlqYjNCNUxDQnBkR1Z0S1R0Y2JpQWdJQ0I5WEc1Y2JpQWdJQ0JmYzI5MWNtTmxJRDBnWTI5dWRHRnBibVZ5TzF4dUlDQWdJRjlwZEdWdElEMGdhWFJsYlR0Y2JpQWdJQ0JmYVc1cGRHbGhiRk5wWW14cGJtY2dQU0JmWTNWeWNtVnVkRk5wWW14cGJtY2dQU0J1WlhoMFJXd29hWFJsYlNrN1hHNWNiaUFnSUNCa2NtRnJaUzVrY21GbloybHVaeUE5SUhSeWRXVTdYRzRnSUNBZ1pISmhhMlV1WlcxcGRDZ25aSEpoWnljc0lGOXBkR1Z0TENCZmMyOTFjbU5sS1R0Y2JseHVJQ0FnSUhKbGRIVnliaUIwY25WbE8xeHVJQ0I5WEc1Y2JpQWdablZ1WTNScGIyNGdhVzUyWVd4cFpGUmhjbWRsZENBb1pXd3BJSHRjYmlBZ0lDQnlaWFIxY200Z1pXd3VkR0ZuVG1GdFpTQTlQVDBnSjBFbklIeDhJR1ZzTG5SaFowNWhiV1VnUFQwOUlDZENWVlJVVDA0bk8xeHVJQ0I5WEc1Y2JpQWdablZ1WTNScGIyNGdaVzVrSUNncElIdGNiaUFnSUNCcFppQW9JV1J5WVd0bExtUnlZV2RuYVc1bktTQjdYRzRnSUNBZ0lDQnlaWFIxY200N1hHNGdJQ0FnZlZ4dUlDQWdJSFpoY2lCcGRHVnRJRDBnWDJOdmNIa2dmSHdnWDJsMFpXMDdYRzRnSUNBZ1pISnZjQ2hwZEdWdExDQnBkR1Z0TG5CaGNtVnVkRVZzWlcxbGJuUXBPMXh1SUNCOVhHNWNiaUFnWm5WdVkzUnBiMjRnY21Wc1pXRnpaU0FvWlNrZ2UxeHVJQ0FnSUdsbUlDZ2haSEpoYTJVdVpISmhaMmRwYm1jcElIdGNiaUFnSUNBZ0lISmxkSFZ5Ymp0Y2JpQWdJQ0I5WEc1Y2JpQWdJQ0IyWVhJZ2FYUmxiU0E5SUY5amIzQjVJSHg4SUY5cGRHVnRPMXh1SUNBZ0lIWmhjaUJqYkdsbGJuUllJRDBnWjJWMFEyOXZjbVFvSjJOc2FXVnVkRmduTENCbEtUdGNiaUFnSUNCMllYSWdZMnhwWlc1MFdTQTlJR2RsZEVOdmIzSmtLQ2RqYkdsbGJuUlpKeXdnWlNrN1hHNGdJQ0FnZG1GeUlHVnNaVzFsYm5SQ1pXaHBibVJEZFhKemIzSWdQU0JuWlhSRmJHVnRaVzUwUW1Wb2FXNWtVRzlwYm5Rb1gyMXBjbkp2Y2l3Z1kyeHBaVzUwV0N3Z1kyeHBaVzUwV1NrN1hHNGdJQ0FnZG1GeUlHUnliM0JVWVhKblpYUWdQU0JtYVc1a1JISnZjRlJoY21kbGRDaGxiR1Z0Wlc1MFFtVm9hVzVrUTNWeWMyOXlMQ0JqYkdsbGJuUllMQ0JqYkdsbGJuUlpLVHRjYmlBZ0lDQnBaaUFvWkhKdmNGUmhjbWRsZENBbUppQW9ieTVqYjNCNUlEMDlQU0JtWVd4elpTQjhmQ0JrY205d1ZHRnlaMlYwSUNFOVBTQmZjMjkxY21ObEtTa2dlMXh1SUNBZ0lDQWdaSEp2Y0NocGRHVnRMQ0JrY205d1ZHRnlaMlYwS1R0Y2JpQWdJQ0I5SUdWc2MyVWdhV1lnS0c4dWNtVnRiM1psVDI1VGNHbHNiQ2tnZTF4dUlDQWdJQ0FnY21WdGIzWmxLQ2s3WEc0Z0lDQWdmU0JsYkhObElIdGNiaUFnSUNBZ0lHTmhibU5sYkNncE8xeHVJQ0FnSUgxY2JpQWdmVnh1WEc0Z0lHWjFibU4wYVc5dUlHUnliM0FnS0dsMFpXMHNJSFJoY21kbGRDa2dlMXh1SUNBZ0lHbG1JQ2hwYzBsdWFYUnBZV3hRYkdGalpXMWxiblFvZEdGeVoyVjBLU2tnZTF4dUlDQWdJQ0FnWkhKaGEyVXVaVzFwZENnblkyRnVZMlZzSnl3Z2FYUmxiU3dnWDNOdmRYSmpaU2s3WEc0Z0lDQWdmU0JsYkhObElIdGNiaUFnSUNBZ0lHUnlZV3RsTG1WdGFYUW9KMlJ5YjNBbkxDQnBkR1Z0TENCMFlYSm5aWFFzSUY5emIzVnlZMlVwTzF4dUlDQWdJSDFjYmlBZ0lDQmpiR1ZoYm5Wd0tDazdYRzRnSUgxY2JseHVJQ0JtZFc1amRHbHZiaUJ5WlcxdmRtVWdLQ2tnZTF4dUlDQWdJR2xtSUNnaFpISmhhMlV1WkhKaFoyZHBibWNwSUh0Y2JpQWdJQ0FnSUhKbGRIVnlianRjYmlBZ0lDQjlYRzRnSUNBZ2RtRnlJR2wwWlcwZ1BTQmZZMjl3ZVNCOGZDQmZhWFJsYlR0Y2JpQWdJQ0IyWVhJZ2NHRnlaVzUwSUQwZ2FYUmxiUzV3WVhKbGJuUkZiR1Z0Wlc1ME8xeHVJQ0FnSUdsbUlDaHdZWEpsYm5RcElIdGNiaUFnSUNBZ0lIQmhjbVZ1ZEM1eVpXMXZkbVZEYUdsc1pDaHBkR1Z0S1R0Y2JpQWdJQ0I5WEc0Z0lDQWdaSEpoYTJVdVpXMXBkQ2h2TG1OdmNIa2dQeUFuWTJGdVkyVnNKeUE2SUNkeVpXMXZkbVVuTENCcGRHVnRMQ0J3WVhKbGJuUXBPMXh1SUNBZ0lHTnNaV0Z1ZFhBb0tUdGNiaUFnZlZ4dVhHNGdJR1oxYm1OMGFXOXVJR05oYm1ObGJDQW9jbVYyWlhKMEtTQjdYRzRnSUNBZ2FXWWdLQ0ZrY21GclpTNWtjbUZuWjJsdVp5a2dlMXh1SUNBZ0lDQWdjbVYwZFhKdU8xeHVJQ0FnSUgxY2JpQWdJQ0IyWVhJZ2NtVjJaWEowY3lBOUlHRnlaM1Z0Wlc1MGN5NXNaVzVuZEdnZ1BpQXdJRDhnY21WMlpYSjBJRG9nYnk1eVpYWmxjblJQYmxOd2FXeHNPMXh1SUNBZ0lIWmhjaUJwZEdWdElEMGdYMk52Y0hrZ2ZId2dYMmwwWlcwN1hHNGdJQ0FnZG1GeUlIQmhjbVZ1ZENBOUlHbDBaVzB1Y0dGeVpXNTBSV3hsYldWdWREdGNiaUFnSUNCcFppQW9jR0Z5Wlc1MElEMDlQU0JmYzI5MWNtTmxJQ1ltSUc4dVkyOXdlU2tnZTF4dUlDQWdJQ0FnY0dGeVpXNTBMbkpsYlc5MlpVTm9hV3hrS0Y5amIzQjVLVHRjYmlBZ0lDQjlYRzRnSUNBZ2RtRnlJR2x1YVhScFlXd2dQU0JwYzBsdWFYUnBZV3hRYkdGalpXMWxiblFvY0dGeVpXNTBLVHRjYmlBZ0lDQnBaaUFvYVc1cGRHbGhiQ0E5UFQwZ1ptRnNjMlVnSmlZZ2J5NWpiM0I1SUQwOVBTQm1ZV3h6WlNBbUppQnlaWFpsY25SektTQjdYRzRnSUNBZ0lDQmZjMjkxY21ObExtbHVjMlZ5ZEVKbFptOXlaU2hwZEdWdExDQmZhVzVwZEdsaGJGTnBZbXhwYm1jcE8xeHVJQ0FnSUgxY2JpQWdJQ0JwWmlBb2FXNXBkR2xoYkNCOGZDQnlaWFpsY25SektTQjdYRzRnSUNBZ0lDQmtjbUZyWlM1bGJXbDBLQ2RqWVc1alpXd25MQ0JwZEdWdExDQmZjMjkxY21ObEtUdGNiaUFnSUNCOUlHVnNjMlVnZTF4dUlDQWdJQ0FnWkhKaGEyVXVaVzFwZENnblpISnZjQ2NzSUdsMFpXMHNJSEJoY21WdWRDd2dYM052ZFhKalpTazdYRzRnSUNBZ2ZWeHVJQ0FnSUdOc1pXRnVkWEFvS1R0Y2JpQWdmVnh1WEc0Z0lHWjFibU4wYVc5dUlHTnNaV0Z1ZFhBZ0tDa2dlMXh1SUNBZ0lIWmhjaUJwZEdWdElEMGdYMk52Y0hrZ2ZId2dYMmwwWlcwN1hHNGdJQ0FnY21WdGIzWmxUV2x5Y205eVNXMWhaMlVvS1R0Y2JpQWdJQ0JwWmlBb2FYUmxiU2tnZTF4dUlDQWdJQ0FnY20xRGJHRnpjeWhwZEdWdExDQW5aM1V0ZEhKaGJuTnBkQ2NwTzF4dUlDQWdJSDFjYmlBZ0lDQnBaaUFvWDNKbGJtUmxjbFJwYldWeUtTQjdYRzRnSUNBZ0lDQmpiR1ZoY2xScGJXVnZkWFFvWDNKbGJtUmxjbFJwYldWeUtUdGNiaUFnSUNCOVhHNGdJQ0FnWkhKaGEyVXVaSEpoWjJkcGJtY2dQU0JtWVd4elpUdGNiaUFnSUNCa2NtRnJaUzVsYldsMEtDZGtjbUZuWlc1a0p5d2dhWFJsYlNrN1hHNGdJQ0FnWkhKaGEyVXVaVzFwZENnbmIzVjBKeXdnYVhSbGJTd2dYMnhoYzNSRWNtOXdWR0Z5WjJWMExDQmZjMjkxY21ObEtUdGNiaUFnSUNCZmMyOTFjbU5sSUQwZ1gybDBaVzBnUFNCZlkyOXdlU0E5SUY5cGJtbDBhV0ZzVTJsaWJHbHVaeUE5SUY5amRYSnlaVzUwVTJsaWJHbHVaeUE5SUY5eVpXNWtaWEpVYVcxbGNpQTlJRjlzWVhOMFJISnZjRlJoY21kbGRDQTlJRzUxYkd3N1hHNGdJSDFjYmx4dUlDQm1kVzVqZEdsdmJpQnBjMGx1YVhScFlXeFFiR0ZqWlcxbGJuUWdLSFJoY21kbGRDd2djeWtnZTF4dUlDQWdJSFpoY2lCemFXSnNhVzVuTzF4dUlDQWdJR2xtSUNoeklDRTlQU0IyYjJsa0lEQXBJSHRjYmlBZ0lDQWdJSE5wWW14cGJtY2dQU0J6TzF4dUlDQWdJSDBnWld4elpTQnBaaUFvWDIxcGNuSnZjaWtnZTF4dUlDQWdJQ0FnYzJsaWJHbHVaeUE5SUY5amRYSnlaVzUwVTJsaWJHbHVaenRjYmlBZ0lDQjlJR1ZzYzJVZ2UxeHVJQ0FnSUNBZ2MybGliR2x1WnlBOUlHNWxlSFJGYkNoZmFYUmxiU0I4ZkNCZlkyOXdlU2s3WEc0Z0lDQWdmVnh1SUNBZ0lISmxkSFZ5YmlCMFlYSm5aWFFnUFQwOUlGOXpiM1Z5WTJVZ0ppWWdjMmxpYkdsdVp5QTlQVDBnWDJsdWFYUnBZV3hUYVdKc2FXNW5PMXh1SUNCOVhHNWNiaUFnWm5WdVkzUnBiMjRnWm1sdVpFUnliM0JVWVhKblpYUWdLR1ZzWlcxbGJuUkNaV2hwYm1SRGRYSnpiM0lzSUdOc2FXVnVkRmdzSUdOc2FXVnVkRmtwSUh0Y2JpQWdJQ0IyWVhJZ2RHRnlaMlYwSUQwZ1pXeGxiV1Z1ZEVKbGFHbHVaRU4xY25OdmNqdGNiaUFnSUNCM2FHbHNaU0FvZEdGeVoyVjBJQ1ltSUNGaFkyTmxjSFJsWkNncEtTQjdYRzRnSUNBZ0lDQjBZWEpuWlhRZ1BTQjBZWEpuWlhRdWNHRnlaVzUwUld4bGJXVnVkRHRjYmlBZ0lDQjlYRzRnSUNBZ2NtVjBkWEp1SUhSaGNtZGxkRHRjYmx4dUlDQWdJR1oxYm1OMGFXOXVJR0ZqWTJWd2RHVmtJQ2dwSUh0Y2JpQWdJQ0FnSUhaaGNpQmtjbTl3Y0dGaWJHVWdQU0JwYzBOdmJuUmhhVzVsY2loMFlYSm5aWFFwTzF4dUlDQWdJQ0FnYVdZZ0tHUnliM0J3WVdKc1pTQTlQVDBnWm1Gc2MyVXBJSHRjYmlBZ0lDQWdJQ0FnY21WMGRYSnVJR1poYkhObE8xeHVJQ0FnSUNBZ2ZWeHVYRzRnSUNBZ0lDQjJZWElnYVcxdFpXUnBZWFJsSUQwZ1oyVjBTVzF0WldScFlYUmxRMmhwYkdRb2RHRnlaMlYwTENCbGJHVnRaVzUwUW1Wb2FXNWtRM1Z5YzI5eUtUdGNiaUFnSUNBZ0lIWmhjaUJ5WldabGNtVnVZMlVnUFNCblpYUlNaV1psY21WdVkyVW9kR0Z5WjJWMExDQnBiVzFsWkdsaGRHVXNJR05zYVdWdWRGZ3NJR05zYVdWdWRGa3BPMXh1SUNBZ0lDQWdkbUZ5SUdsdWFYUnBZV3dnUFNCcGMwbHVhWFJwWVd4UWJHRmpaVzFsYm5Rb2RHRnlaMlYwTENCeVpXWmxjbVZ1WTJVcE8xeHVJQ0FnSUNBZ2FXWWdLR2x1YVhScFlXd3BJSHRjYmlBZ0lDQWdJQ0FnY21WMGRYSnVJSFJ5ZFdVN0lDOHZJSE5vYjNWc1pDQmhiSGRoZVhNZ1ltVWdZV0pzWlNCMGJ5QmtjbTl3SUdsMElISnBaMmgwSUdKaFkyc2dkMmhsY21VZ2FYUWdkMkZ6WEc0Z0lDQWdJQ0I5WEc0Z0lDQWdJQ0J5WlhSMWNtNGdieTVoWTJObGNIUnpLRjlwZEdWdExDQjBZWEpuWlhRc0lGOXpiM1Z5WTJVc0lISmxabVZ5Wlc1alpTazdYRzRnSUNBZ2ZWeHVJQ0I5WEc1Y2JpQWdablZ1WTNScGIyNGdaSEpoWnlBb1pTa2dlMXh1SUNBZ0lHbG1JQ2doWDIxcGNuSnZjaWtnZTF4dUlDQWdJQ0FnY21WMGRYSnVPMXh1SUNBZ0lIMWNiaUFnSUNCcFppQW9aU2tnZTF4dUlDQWdJQ0FnWDJOc2FXVnVkRmdnUFNCblpYUkRiMjl5WkNnblkyeHBaVzUwV0Njc0lHVXBPMXh1SUNBZ0lDQWdYMk5zYVdWdWRGa2dQU0JuWlhSRGIyOXlaQ2duWTJ4cFpXNTBXU2NzSUdVcE8xeHVJQ0FnSUgxY2JpQWdJQ0IyWVhJZ2VDQTlJRjlqYkdsbGJuUllJQzBnWDI5bVpuTmxkRmc3WEc0Z0lDQWdkbUZ5SUhrZ1BTQmZZMnhwWlc1MFdTQXRJRjl2Wm1aelpYUlpPMXh1WEc0Z0lDQWdYMjFwY25KdmNpNXpkSGxzWlM1c1pXWjBJRDBnZUNBcklDZHdlQ2M3WEc0Z0lDQWdYMjFwY25KdmNpNXpkSGxzWlM1MGIzQWdJRDBnZVNBcklDZHdlQ2M3WEc1Y2JpQWdJQ0IyWVhJZ2FYUmxiU0E5SUY5amIzQjVJSHg4SUY5cGRHVnRPMXh1SUNBZ0lIWmhjaUJsYkdWdFpXNTBRbVZvYVc1a1EzVnljMjl5SUQwZ1oyVjBSV3hsYldWdWRFSmxhR2x1WkZCdmFXNTBLRjl0YVhKeWIzSXNJRjlqYkdsbGJuUllMQ0JmWTJ4cFpXNTBXU2s3WEc0Z0lDQWdkbUZ5SUdSeWIzQlVZWEpuWlhRZ1BTQm1hVzVrUkhKdmNGUmhjbWRsZENobGJHVnRaVzUwUW1Wb2FXNWtRM1Z5YzI5eUxDQmZZMnhwWlc1MFdDd2dYMk5zYVdWdWRGa3BPMXh1SUNBZ0lIWmhjaUJqYUdGdVoyVmtJRDBnWkhKdmNGUmhjbWRsZENBaFBUMGdiblZzYkNBbUppQmtjbTl3VkdGeVoyVjBJQ0U5UFNCZmJHRnpkRVJ5YjNCVVlYSm5aWFE3WEc0Z0lDQWdhV1lnS0dOb1lXNW5aV1FnZkh3Z1pISnZjRlJoY21kbGRDQTlQVDBnYm5Wc2JDa2dlMXh1SUNBZ0lDQWdiM1YwS0NrN1hHNGdJQ0FnSUNCZmJHRnpkRVJ5YjNCVVlYSm5aWFFnUFNCa2NtOXdWR0Z5WjJWME8xeHVJQ0FnSUNBZ2IzWmxjaWdwTzF4dUlDQWdJSDFjYmlBZ0lDQnBaaUFvWkhKdmNGUmhjbWRsZENBOVBUMGdYM052ZFhKalpTQW1KaUJ2TG1OdmNIa3BJSHRjYmlBZ0lDQWdJR2xtSUNocGRHVnRMbkJoY21WdWRFVnNaVzFsYm5RcElIdGNiaUFnSUNBZ0lDQWdhWFJsYlM1d1lYSmxiblJGYkdWdFpXNTBMbkpsYlc5MlpVTm9hV3hrS0dsMFpXMHBPMXh1SUNBZ0lDQWdmVnh1SUNBZ0lDQWdjbVYwZFhKdU8xeHVJQ0FnSUgxY2JpQWdJQ0IyWVhJZ2NtVm1aWEpsYm1ObE8xeHVJQ0FnSUhaaGNpQnBiVzFsWkdsaGRHVWdQU0JuWlhSSmJXMWxaR2xoZEdWRGFHbHNaQ2hrY205d1ZHRnlaMlYwTENCbGJHVnRaVzUwUW1Wb2FXNWtRM1Z5YzI5eUtUdGNiaUFnSUNCcFppQW9hVzF0WldScFlYUmxJQ0U5UFNCdWRXeHNLU0I3WEc0Z0lDQWdJQ0J5WldabGNtVnVZMlVnUFNCblpYUlNaV1psY21WdVkyVW9aSEp2Y0ZSaGNtZGxkQ3dnYVcxdFpXUnBZWFJsTENCZlkyeHBaVzUwV0N3Z1gyTnNhV1Z1ZEZrcE8xeHVJQ0FnSUgwZ1pXeHpaU0JwWmlBb2J5NXlaWFpsY25SUGJsTndhV3hzSUQwOVBTQjBjblZsSUNZbUlDRnZMbU52Y0hrcElIdGNiaUFnSUNBZ0lISmxabVZ5Wlc1alpTQTlJRjlwYm1sMGFXRnNVMmxpYkdsdVp6dGNiaUFnSUNBZ0lHUnliM0JVWVhKblpYUWdQU0JmYzI5MWNtTmxPMXh1SUNBZ0lIMGdaV3h6WlNCN1hHNGdJQ0FnSUNCcFppQW9LRzh1WTI5d2VTQjhmQ0J2TG5KbGJXOTJaVTl1VTNCcGJHd2dQVDA5SUhSeWRXVXBJQ1ltSUdsMFpXMHVjR0Z5Wlc1MFJXeGxiV1Z1ZENBaFBUMGdiblZzYkNrZ2UxeHVJQ0FnSUNBZ0lDQnBkR1Z0TG5CaGNtVnVkRVZzWlcxbGJuUXVjbVZ0YjNabFEyaHBiR1FvYVhSbGJTazdYRzRnSUNBZ0lDQjlYRzRnSUNBZ0lDQnlaWFIxY200N1hHNGdJQ0FnZlZ4dUlDQWdJR2xtSUNoeVpXWmxjbVZ1WTJVZ1BUMDlJRzUxYkd3Z2ZId2djbVZtWlhKbGJtTmxJQ0U5UFNCcGRHVnRJQ1ltSUhKbFptVnlaVzVqWlNBaFBUMGdibVY0ZEVWc0tHbDBaVzBwS1NCN1hHNGdJQ0FnSUNCZlkzVnljbVZ1ZEZOcFlteHBibWNnUFNCeVpXWmxjbVZ1WTJVN1hHNGdJQ0FnSUNCa2NtOXdWR0Z5WjJWMExtbHVjMlZ5ZEVKbFptOXlaU2hwZEdWdExDQnlaV1psY21WdVkyVXBPMXh1SUNBZ0lDQWdaSEpoYTJVdVpXMXBkQ2duYzJoaFpHOTNKeXdnYVhSbGJTd2daSEp2Y0ZSaGNtZGxkQ2s3WEc0Z0lDQWdmVnh1SUNBZ0lHWjFibU4wYVc5dUlHMXZkbVZrSUNoMGVYQmxLU0I3SUdSeVlXdGxMbVZ0YVhRb2RIbHdaU3dnYVhSbGJTd2dYMnhoYzNSRWNtOXdWR0Z5WjJWMExDQmZjMjkxY21ObEtUc2dmVnh1SUNBZ0lHWjFibU4wYVc5dUlHOTJaWElnS0NrZ2V5QnBaaUFvWTJoaGJtZGxaQ2tnZXlCdGIzWmxaQ2duYjNabGNpY3BPeUI5SUgxY2JpQWdJQ0JtZFc1amRHbHZiaUJ2ZFhRZ0tDa2dleUJwWmlBb1gyeGhjM1JFY205d1ZHRnlaMlYwS1NCN0lHMXZkbVZrS0NkdmRYUW5LVHNnZlNCOVhHNGdJSDFjYmx4dUlDQm1kVzVqZEdsdmJpQnlaVzVrWlhKTmFYSnliM0pKYldGblpTQW9LU0I3WEc0Z0lDQWdhV1lnS0Y5dGFYSnliM0lwSUh0Y2JpQWdJQ0FnSUhKbGRIVnlianRjYmlBZ0lDQjlYRzRnSUNBZ2RtRnlJSEpsWTNRZ1BTQmZhWFJsYlM1blpYUkNiM1Z1WkdsdVowTnNhV1Z1ZEZKbFkzUW9LVHRjYmlBZ0lDQmZiV2x5Y205eUlEMGdYMmwwWlcwdVkyeHZibVZPYjJSbEtIUnlkV1VwTzF4dUlDQWdJRjl0YVhKeWIzSXVjM1I1YkdVdWQybGtkR2dnUFNCblpYUlNaV04wVjJsa2RHZ29jbVZqZENrZ0t5QW5jSGduTzF4dUlDQWdJRjl0YVhKeWIzSXVjM1I1YkdVdWFHVnBaMmgwSUQwZ1oyVjBVbVZqZEVobGFXZG9kQ2h5WldOMEtTQXJJQ2R3ZUNjN1hHNGdJQ0FnY20xRGJHRnpjeWhmYldseWNtOXlMQ0FuWjNVdGRISmhibk5wZENjcE8xeHVJQ0FnSUdGa1pFTnNZWE56S0Y5dGFYSnliM0lzSUNjZ1ozVXRiV2x5Y205eUp5azdYRzRnSUNBZ1ltOWtlUzVoY0hCbGJtUkRhR2xzWkNoZmJXbHljbTl5S1R0Y2JpQWdJQ0IwYjNWamFIa29aRzlqZFcxbGJuUkZiR1Z0Wlc1MExDQW5ZV1JrSnl3Z0oyMXZkWE5sYlc5MlpTY3NJR1J5WVdjcE8xeHVJQ0FnSUdGa1pFTnNZWE56S0dKdlpIa3NJQ2RuZFMxMWJuTmxiR1ZqZEdGaWJHVW5LVHRjYmlBZ0lDQmtjbUZyWlM1bGJXbDBLQ2RqYkc5dVpXUW5MQ0JmYldseWNtOXlMQ0JmYVhSbGJTazdYRzRnSUgxY2JseHVJQ0JtZFc1amRHbHZiaUJ5WlcxdmRtVk5hWEp5YjNKSmJXRm5aU0FvS1NCN1hHNGdJQ0FnYVdZZ0tGOXRhWEp5YjNJcElIdGNiaUFnSUNBZ0lISnRRMnhoYzNNb1ltOWtlU3dnSjJkMUxYVnVjMlZzWldOMFlXSnNaU2NwTzF4dUlDQWdJQ0FnZEc5MVkyaDVLR1J2WTNWdFpXNTBSV3hsYldWdWRDd2dKM0psYlc5MlpTY3NJQ2R0YjNWelpXMXZkbVVuTENCa2NtRm5LVHRjYmlBZ0lDQWdJRjl0YVhKeWIzSXVjR0Z5Wlc1MFJXeGxiV1Z1ZEM1eVpXMXZkbVZEYUdsc1pDaGZiV2x5Y205eUtUdGNiaUFnSUNBZ0lGOXRhWEp5YjNJZ1BTQnVkV3hzTzF4dUlDQWdJSDFjYmlBZ2ZWeHVYRzRnSUdaMWJtTjBhVzl1SUdkbGRFbHRiV1ZrYVdGMFpVTm9hV3hrSUNoa2NtOXdWR0Z5WjJWMExDQjBZWEpuWlhRcElIdGNiaUFnSUNCMllYSWdhVzF0WldScFlYUmxJRDBnZEdGeVoyVjBPMXh1SUNBZ0lIZG9hV3hsSUNocGJXMWxaR2xoZEdVZ0lUMDlJR1J5YjNCVVlYSm5aWFFnSmlZZ2FXMXRaV1JwWVhSbExuQmhjbVZ1ZEVWc1pXMWxiblFnSVQwOUlHUnliM0JVWVhKblpYUXBJSHRjYmlBZ0lDQWdJR2x0YldWa2FXRjBaU0E5SUdsdGJXVmthV0YwWlM1d1lYSmxiblJGYkdWdFpXNTBPMXh1SUNBZ0lIMWNiaUFnSUNCcFppQW9hVzF0WldScFlYUmxJRDA5UFNCa2IyTjFiV1Z1ZEVWc1pXMWxiblFwSUh0Y2JpQWdJQ0FnSUhKbGRIVnliaUJ1ZFd4c08xeHVJQ0FnSUgxY2JpQWdJQ0J5WlhSMWNtNGdhVzF0WldScFlYUmxPMXh1SUNCOVhHNWNiaUFnWm5WdVkzUnBiMjRnWjJWMFVtVm1aWEpsYm1ObElDaGtjbTl3VkdGeVoyVjBMQ0IwWVhKblpYUXNJSGdzSUhrcElIdGNiaUFnSUNCMllYSWdhRzl5YVhwdmJuUmhiQ0E5SUc4dVpHbHlaV04wYVc5dUlEMDlQU0FuYUc5eWFYcHZiblJoYkNjN1hHNGdJQ0FnZG1GeUlISmxabVZ5Wlc1alpTQTlJSFJoY21kbGRDQWhQVDBnWkhKdmNGUmhjbWRsZENBL0lHbHVjMmxrWlNncElEb2diM1YwYzJsa1pTZ3BPMXh1SUNBZ0lISmxkSFZ5YmlCeVpXWmxjbVZ1WTJVN1hHNWNiaUFnSUNCbWRXNWpkR2x2YmlCdmRYUnphV1JsSUNncElIc2dMeThnYzJ4dmQyVnlMQ0JpZFhRZ1lXSnNaU0IwYnlCbWFXZDFjbVVnYjNWMElHRnVlU0J3YjNOcGRHbHZibHh1SUNBZ0lDQWdkbUZ5SUd4bGJpQTlJR1J5YjNCVVlYSm5aWFF1WTJocGJHUnlaVzR1YkdWdVozUm9PMXh1SUNBZ0lDQWdkbUZ5SUdrN1hHNGdJQ0FnSUNCMllYSWdaV3c3WEc0Z0lDQWdJQ0IyWVhJZ2NtVmpkRHRjYmlBZ0lDQWdJR1p2Y2lBb2FTQTlJREE3SUdrZ1BDQnNaVzQ3SUdrckt5a2dlMXh1SUNBZ0lDQWdJQ0JsYkNBOUlHUnliM0JVWVhKblpYUXVZMmhwYkdSeVpXNWJhVjA3WEc0Z0lDQWdJQ0FnSUhKbFkzUWdQU0JsYkM1blpYUkNiM1Z1WkdsdVowTnNhV1Z1ZEZKbFkzUW9LVHRjYmlBZ0lDQWdJQ0FnYVdZZ0tHaHZjbWw2YjI1MFlXd2dKaVlnY21WamRDNXNaV1owSUQ0Z2VDa2dleUJ5WlhSMWNtNGdaV3c3SUgxY2JpQWdJQ0FnSUNBZ2FXWWdLQ0ZvYjNKcGVtOXVkR0ZzSUNZbUlISmxZM1F1ZEc5d0lENGdlU2tnZXlCeVpYUjFjbTRnWld3N0lIMWNiaUFnSUNBZ0lIMWNiaUFnSUNBZ0lISmxkSFZ5YmlCdWRXeHNPMXh1SUNBZ0lIMWNibHh1SUNBZ0lHWjFibU4wYVc5dUlHbHVjMmxrWlNBb0tTQjdJQzh2SUdaaGMzUmxjaXdnWW5WMElHOXViSGtnWVhaaGFXeGhZbXhsSUdsbUlHUnliM0J3WldRZ2FXNXphV1JsSUdFZ1kyaHBiR1FnWld4bGJXVnVkRnh1SUNBZ0lDQWdkbUZ5SUhKbFkzUWdQU0IwWVhKblpYUXVaMlYwUW05MWJtUnBibWREYkdsbGJuUlNaV04wS0NrN1hHNGdJQ0FnSUNCcFppQW9hRzl5YVhwdmJuUmhiQ2tnZTF4dUlDQWdJQ0FnSUNCeVpYUjFjbTRnY21WemIyeDJaU2g0SUQ0Z2NtVmpkQzVzWldaMElDc2daMlYwVW1WamRGZHBaSFJvS0hKbFkzUXBJQzhnTWlrN1hHNGdJQ0FnSUNCOVhHNGdJQ0FnSUNCeVpYUjFjbTRnY21WemIyeDJaU2g1SUQ0Z2NtVmpkQzUwYjNBZ0t5Qm5aWFJTWldOMFNHVnBaMmgwS0hKbFkzUXBJQzhnTWlrN1hHNGdJQ0FnZlZ4dVhHNGdJQ0FnWm5WdVkzUnBiMjRnY21WemIyeDJaU0FvWVdaMFpYSXBJSHRjYmlBZ0lDQWdJSEpsZEhWeWJpQmhablJsY2lBL0lHNWxlSFJGYkNoMFlYSm5aWFFwSURvZ2RHRnlaMlYwTzF4dUlDQWdJSDFjYmlBZ2ZWeHVmVnh1WEc1bWRXNWpkR2x2YmlCMGIzVmphSGtnS0dWc0xDQnZjQ3dnZEhsd1pTd2dabTRwSUh0Y2JpQWdkbUZ5SUhSdmRXTm9JRDBnZTF4dUlDQWdJRzF2ZFhObGRYQTZJQ2QwYjNWamFHVnVaQ2NzWEc0Z0lDQWdiVzkxYzJWa2IzZHVPaUFuZEc5MVkyaHpkR0Z5ZENjc1hHNGdJQ0FnYlc5MWMyVnRiM1psT2lBbmRHOTFZMmh0YjNabEoxeHVJQ0I5TzF4dUlDQjJZWElnYldsamNtOXpiMlowSUQwZ2UxeHVJQ0FnSUcxdmRYTmxkWEE2SUNkTlUxQnZhVzUwWlhKVmNDY3NYRzRnSUNBZ2JXOTFjMlZrYjNkdU9pQW5UVk5RYjJsdWRHVnlSRzkzYmljc1hHNGdJQ0FnYlc5MWMyVnRiM1psT2lBblRWTlFiMmx1ZEdWeVRXOTJaU2RjYmlBZ2ZUdGNiaUFnYVdZZ0tHZHNiMkpoYkM1dVlYWnBaMkYwYjNJdWJYTlFiMmx1ZEdWeVJXNWhZbXhsWkNrZ2UxeHVJQ0FnSUdOeWIzTnpkbVZ1ZEZ0dmNGMG9aV3dzSUcxcFkzSnZjMjltZEZ0MGVYQmxYU3dnWm00cE8xeHVJQ0I5WEc0Z0lHTnliM056ZG1WdWRGdHZjRjBvWld3c0lIUnZkV05vVzNSNWNHVmRMQ0JtYmlrN1hHNGdJR055YjNOemRtVnVkRnR2Y0Ywb1pXd3NJSFI1Y0dVc0lHWnVLVHRjYm4xY2JseHVablZ1WTNScGIyNGdaMlYwVDJabWMyVjBJQ2hsYkNrZ2UxeHVJQ0IyWVhJZ2NtVmpkQ0E5SUdWc0xtZGxkRUp2ZFc1a2FXNW5RMnhwWlc1MFVtVmpkQ2dwTzF4dUlDQnlaWFIxY200Z2UxeHVJQ0FnSUd4bFpuUTZJSEpsWTNRdWJHVm1kQ0FySUdkbGRGTmpjbTlzYkNnbmMyTnliMnhzVEdWbWRDY3NJQ2R3WVdkbFdFOW1abk5sZENjcExGeHVJQ0FnSUhSdmNEb2djbVZqZEM1MGIzQWdLeUJuWlhSVFkzSnZiR3dvSjNOamNtOXNiRlJ2Y0Njc0lDZHdZV2RsV1U5bVpuTmxkQ2NwWEc0Z0lIMDdYRzU5WEc1Y2JtWjFibU4wYVc5dUlHZGxkRk5qY205c2JDQW9jMk55YjJ4c1VISnZjQ3dnYjJabWMyVjBVSEp2Y0NrZ2UxeHVJQ0JwWmlBb2RIbHdaVzltSUdkc2IySmhiRnR2Wm1aelpYUlFjbTl3WFNBaFBUMGdKM1Z1WkdWbWFXNWxaQ2NwSUh0Y2JpQWdJQ0J5WlhSMWNtNGdaMnh2WW1Gc1cyOW1abk5sZEZCeWIzQmRPMXh1SUNCOVhHNGdJSFpoY2lCa2IyTjFiV1Z1ZEVWc1pXMWxiblFnUFNCa2IyTjFiV1Z1ZEM1a2IyTjFiV1Z1ZEVWc1pXMWxiblE3WEc0Z0lHbG1JQ2hrYjJOMWJXVnVkRVZzWlcxbGJuUXVZMnhwWlc1MFNHVnBaMmgwS1NCN1hHNGdJQ0FnY21WMGRYSnVJR1J2WTNWdFpXNTBSV3hsYldWdWRGdHpZM0p2Ykd4UWNtOXdYVHRjYmlBZ2ZWeHVJQ0IyWVhJZ1ltOWtlU0E5SUdSdlkzVnRaVzUwTG1KdlpIazdYRzRnSUhKbGRIVnliaUJpYjJSNVczTmpjbTlzYkZCeWIzQmRPMXh1ZlZ4dVhHNW1kVzVqZEdsdmJpQm5aWFJGYkdWdFpXNTBRbVZvYVc1a1VHOXBiblFnS0hCdmFXNTBMQ0I0TENCNUtTQjdYRzRnSUdsbUlDZ2hlQ0FtSmlBaGVTa2dlMXh1SUNBZ0lISmxkSFZ5YmlCdWRXeHNPMXh1SUNCOVhHNGdJSFpoY2lCd0lEMGdjRzlwYm5RZ2ZId2dlMzA3WEc0Z0lIWmhjaUJ6ZEdGMFpTQTlJSEF1WTJ4aGMzTk9ZVzFsTzF4dUlDQjJZWElnWld3N1hHNGdJSEF1WTJ4aGMzTk9ZVzFsSUNzOUlDY2daM1V0YUdsa1pTYzdYRzRnSUdWc0lEMGdaRzlqZFcxbGJuUXVaV3hsYldWdWRFWnliMjFRYjJsdWRDaDRMQ0I1S1R0Y2JpQWdjQzVqYkdGemMwNWhiV1VnUFNCemRHRjBaVHRjYmlBZ2NtVjBkWEp1SUdWc08xeHVmVnh1WEc1bWRXNWpkR2x2YmlCdVpYWmxjaUFvS1NCN1hHNGdJSEpsZEhWeWJpQm1ZV3h6WlR0Y2JuMWNibHh1Wm5WdVkzUnBiMjRnWVd4M1lYbHpJQ2dwSUh0Y2JpQWdjbVYwZFhKdUlIUnlkV1U3WEc1OVhHNWNibVoxYm1OMGFXOXVJRzVsZUhSRmJDQW9aV3dwSUh0Y2JpQWdjbVYwZFhKdUlHVnNMbTVsZUhSRmJHVnRaVzUwVTJsaWJHbHVaeUI4ZkNCdFlXNTFZV3hzZVNncE8xeHVJQ0JtZFc1amRHbHZiaUJ0WVc1MVlXeHNlU0FvS1NCN1hHNGdJQ0FnZG1GeUlITnBZbXhwYm1jZ1BTQmxiRHRjYmlBZ0lDQmtieUI3WEc0Z0lDQWdJQ0J6YVdKc2FXNW5JRDBnYzJsaWJHbHVaeTV1WlhoMFUybGliR2x1Wnp0Y2JpQWdJQ0I5SUhkb2FXeGxJQ2h6YVdKc2FXNW5JQ1ltSUhOcFlteHBibWN1Ym05a1pWUjVjR1VnSVQwOUlERXBPMXh1SUNBZ0lISmxkSFZ5YmlCemFXSnNhVzVuTzF4dUlDQjlYRzU5WEc1Y2JtWjFibU4wYVc5dUlHRmtaRU5zWVhOeklDaGxiQ3dnWTJ4aGMzTk9ZVzFsS1NCN1hHNGdJR2xtSUNobGJDNWpiR0Z6YzA1aGJXVXVhVzVrWlhoUFppZ25JQ2NnS3lCamJHRnpjMDVoYldVcElEMDlQU0F0TVNrZ2UxeHVJQ0FnSUdWc0xtTnNZWE56VG1GdFpTQXJQU0FuSUNjZ0t5QmpiR0Z6YzA1aGJXVTdYRzRnSUgxY2JuMWNibHh1Wm5WdVkzUnBiMjRnY20xRGJHRnpjeUFvWld3c0lHTnNZWE56VG1GdFpTa2dlMXh1SUNCbGJDNWpiR0Z6YzA1aGJXVWdQU0JsYkM1amJHRnpjMDVoYldVdWNtVndiR0ZqWlNodVpYY2dVbVZuUlhod0tDY2dKeUFySUdOc1lYTnpUbUZ0WlN3Z0oyY25LU3dnSnljcE8xeHVmVnh1WEc1bWRXNWpkR2x2YmlCblpYUkZkbVZ1ZEVodmMzUWdLR1VwSUh0Y2JpQWdMeThnYjI0Z2RHOTFZMmhsYm1RZ1pYWmxiblFzSUhkbElHaGhkbVVnZEc4Z2RYTmxJR0JsTG1Ob1lXNW5aV1JVYjNWamFHVnpZRnh1SUNBdkx5QnpaV1VnYUhSMGNEb3ZMM04wWVdOcmIzWmxjbVpzYjNjdVkyOXRMM0YxWlhOMGFXOXVjeTgzTVRreU5UWXpMM1J2ZFdOb1pXNWtMV1YyWlc1MExYQnliM0JsY25ScFpYTmNiaUFnTHk4Z2MyVmxJR2gwZEhCek9pOHZaMmwwYUhWaUxtTnZiUzlpWlhaaFkzRjFZUzlrY21GbmRXeGhMMmx6YzNWbGN5OHpORnh1SUNCcFppQW9aUzUwWVhKblpYUlViM1ZqYUdWeklDWW1JR1V1ZEdGeVoyVjBWRzkxWTJobGN5NXNaVzVuZEdncElIdGNiaUFnSUNCeVpYUjFjbTRnWlM1MFlYSm5aWFJVYjNWamFHVnpXekJkTzF4dUlDQjlYRzRnSUdsbUlDaGxMbU5vWVc1blpXUlViM1ZqYUdWeklDWW1JR1V1WTJoaGJtZGxaRlJ2ZFdOb1pYTXViR1Z1WjNSb0tTQjdYRzRnSUNBZ2NtVjBkWEp1SUdVdVkyaGhibWRsWkZSdmRXTm9aWE5iTUYwN1hHNGdJSDFjYmlBZ2NtVjBkWEp1SUdVN1hHNTlYRzVjYm1aMWJtTjBhVzl1SUdkbGRFTnZiM0prSUNoamIyOXlaQ3dnWlNrZ2UxeHVJQ0IyWVhJZ2FHOXpkQ0E5SUdkbGRFVjJaVzUwU0c5emRDaGxLVHRjYmlBZ2RtRnlJRzFwYzNOTllYQWdQU0I3WEc0Z0lDQWdjR0ZuWlZnNklDZGpiR2xsYm5SWUp5d2dMeThnU1VVNFhHNGdJQ0FnY0dGblpWazZJQ2RqYkdsbGJuUlpKeUF2THlCSlJUaGNiaUFnZlR0Y2JpQWdhV1lnS0dOdmIzSmtJR2x1SUcxcGMzTk5ZWEFnSmlZZ0lTaGpiMjl5WkNCcGJpQm9iM04wS1NBbUppQnRhWE56VFdGd1cyTnZiM0prWFNCcGJpQm9iM04wS1NCN1hHNGdJQ0FnWTI5dmNtUWdQU0J0YVhOelRXRndXMk52YjNKa1hUdGNiaUFnZlZ4dUlDQnlaWFIxY200Z2FHOXpkRnRqYjI5eVpGMDdYRzU5WEc1Y2JtWjFibU4wYVc5dUlHZGxkRkpsWTNSWGFXUjBhQ0FvY21WamRDa2dlMXh1SUNCeVpYUjFjbTRnY21WamRDNTNhV1IwYUNCOGZDQW9jbVZqZEM1eWFXZG9kQ0F0SUhKbFkzUXViR1ZtZENrN1hHNTlYRzVjYm1aMWJtTjBhVzl1SUdkbGRGSmxZM1JJWldsbmFIUWdLSEpsWTNRcElIdGNiaUFnY21WMGRYSnVJSEpsWTNRdWFHVnBaMmgwSUh4OElDaHlaV04wTG1KdmRIUnZiU0F0SUhKbFkzUXVkRzl3S1R0Y2JuMWNibHh1Ylc5a2RXeGxMbVY0Y0c5eWRITWdQU0JrY21GbmRXeGhPMXh1SWwxOSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHRpY2t5ID0gcmVxdWlyZSgndGlja3knKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWJvdW5jZSAoZm4sIGFyZ3MsIGN0eCkge1xuICBpZiAoIWZuKSB7IHJldHVybjsgfVxuICB0aWNreShmdW5jdGlvbiBydW4gKCkge1xuICAgIGZuLmFwcGx5KGN0eCB8fCBudWxsLCBhcmdzIHx8IFtdKTtcbiAgfSk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXRvYSA9IHJlcXVpcmUoJ2F0b2EnKTtcbnZhciBkZWJvdW5jZSA9IHJlcXVpcmUoJy4vZGVib3VuY2UnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbWl0dGVyICh0aGluZywgb3B0aW9ucykge1xuICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gIHZhciBldnQgPSB7fTtcbiAgaWYgKHRoaW5nID09PSB1bmRlZmluZWQpIHsgdGhpbmcgPSB7fTsgfVxuICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICBldnRbdHlwZV0gPSBbZm5dO1xuICAgIH0gZWxzZSB7XG4gICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcub25jZSA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9O1xuICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICB2YXIgYyA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgaWYgKGMgPT09IDEpIHtcbiAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgfSBlbHNlIGlmIChjID09PSAwKSB7XG4gICAgICBldnQgPSB7fTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGV0ID0gZXZ0W3R5cGVdO1xuICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcuZW1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICByZXR1cm4gdGhpbmcuZW1pdHRlclNuYXBzaG90KGFyZ3Muc2hpZnQoKSkuYXBwbHkodGhpcywgYXJncyk7XG4gIH07XG4gIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdCA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgdmFyIGV0ID0gKGV2dFt0eXBlXSB8fCBbXSkuc2xpY2UoMCk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIGN0eCA9IHRoaXMgfHwgdGhpbmc7XG4gICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0Lmxlbmd0aCkgeyB0aHJvdyBhcmdzLmxlbmd0aCA9PT0gMSA/IGFyZ3NbMF0gOiBhcmdzOyB9XG4gICAgICBldC5mb3JFYWNoKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICBpZiAob3B0cy5hc3luYykgeyBkZWJvdW5jZShsaXN0ZW4sIGFyZ3MsIGN0eCk7IH0gZWxzZSB7IGxpc3Rlbi5hcHBseShjdHgsIGFyZ3MpOyB9XG4gICAgICAgIGlmIChsaXN0ZW4uX29uY2UpIHsgdGhpbmcub2ZmKHR5cGUsIGxpc3Rlbik7IH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gIH07XG4gIHJldHVybiB0aGluZztcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4iLCJ2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuaWYgKHNpKSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbn0gZWxzZSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdGljazsiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG5cbnZhciBOYXRpdmVDdXN0b21FdmVudCA9IGdsb2JhbC5DdXN0b21FdmVudDtcblxuZnVuY3Rpb24gdXNlTmF0aXZlICgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgcCA9IG5ldyBOYXRpdmVDdXN0b21FdmVudCgnY2F0JywgeyBkZXRhaWw6IHsgZm9vOiAnYmFyJyB9IH0pO1xuICAgIHJldHVybiAgJ2NhdCcgPT09IHAudHlwZSAmJiAnYmFyJyA9PT0gcC5kZXRhaWwuZm9vO1xuICB9IGNhdGNoIChlKSB7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIENyb3NzLWJyb3dzZXIgYEN1c3RvbUV2ZW50YCBjb25zdHJ1Y3Rvci5cbiAqXG4gKiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvQ3VzdG9tRXZlbnQuQ3VzdG9tRXZlbnRcbiAqXG4gKiBAcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSB1c2VOYXRpdmUoKSA/IE5hdGl2ZUN1c3RvbUV2ZW50IDpcblxuLy8gSUUgPj0gOVxuJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGRvY3VtZW50LmNyZWF0ZUV2ZW50ID8gZnVuY3Rpb24gQ3VzdG9tRXZlbnQgKHR5cGUsIHBhcmFtcykge1xuICB2YXIgZSA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdDdXN0b21FdmVudCcpO1xuICBpZiAocGFyYW1zKSB7XG4gICAgZS5pbml0Q3VzdG9tRXZlbnQodHlwZSwgcGFyYW1zLmJ1YmJsZXMsIHBhcmFtcy5jYW5jZWxhYmxlLCBwYXJhbXMuZGV0YWlsKTtcbiAgfSBlbHNlIHtcbiAgICBlLmluaXRDdXN0b21FdmVudCh0eXBlLCBmYWxzZSwgZmFsc2UsIHZvaWQgMCk7XG4gIH1cbiAgcmV0dXJuIGU7XG59IDpcblxuLy8gSUUgPD0gOFxuZnVuY3Rpb24gQ3VzdG9tRXZlbnQgKHR5cGUsIHBhcmFtcykge1xuICB2YXIgZSA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50T2JqZWN0KCk7XG4gIGUudHlwZSA9IHR5cGU7XG4gIGlmIChwYXJhbXMpIHtcbiAgICBlLmJ1YmJsZXMgPSBCb29sZWFuKHBhcmFtcy5idWJibGVzKTtcbiAgICBlLmNhbmNlbGFibGUgPSBCb29sZWFuKHBhcmFtcy5jYW5jZWxhYmxlKTtcbiAgICBlLmRldGFpbCA9IHBhcmFtcy5kZXRhaWw7XG4gIH0gZWxzZSB7XG4gICAgZS5idWJibGVzID0gZmFsc2U7XG4gICAgZS5jYW5jZWxhYmxlID0gZmFsc2U7XG4gICAgZS5kZXRhaWwgPSB2b2lkIDA7XG4gIH1cbiAgcmV0dXJuIGU7XG59XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZGF0YTphcHBsaWNhdGlvbi9qc29uO2NoYXJzZXQ6dXRmLTg7YmFzZTY0LGV5SjJaWEp6YVc5dUlqb3pMQ0p6YjNWeVkyVnpJanBiSW01dlpHVmZiVzlrZFd4bGN5OWpjbTl6YzNabGJuUXZibTlrWlY5dGIyUjFiR1Z6TDJOMWMzUnZiUzFsZG1WdWRDOXBibVJsZUM1cWN5SmRMQ0p1WVcxbGN5STZXMTBzSW0xaGNIQnBibWR6SWpvaU8wRkJRVUU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRWlMQ0ptYVd4bElqb2laMlZ1WlhKaGRHVmtMbXB6SWl3aWMyOTFjbU5sVW05dmRDSTZJaUlzSW5OdmRYSmpaWE5EYjI1MFpXNTBJanBiSWx4dWRtRnlJRTVoZEdsMlpVTjFjM1J2YlVWMlpXNTBJRDBnWjJ4dlltRnNMa04xYzNSdmJVVjJaVzUwTzF4dVhHNW1kVzVqZEdsdmJpQjFjMlZPWVhScGRtVWdLQ2tnZTF4dUlDQjBjbmtnZTF4dUlDQWdJSFpoY2lCd0lEMGdibVYzSUU1aGRHbDJaVU4xYzNSdmJVVjJaVzUwS0NkallYUW5MQ0I3SUdSbGRHRnBiRG9nZXlCbWIyODZJQ2RpWVhJbklIMGdmU2s3WEc0Z0lDQWdjbVYwZFhKdUlDQW5ZMkYwSnlBOVBUMGdjQzUwZVhCbElDWW1JQ2RpWVhJbklEMDlQU0J3TG1SbGRHRnBiQzVtYjI4N1hHNGdJSDBnWTJGMFkyZ2dLR1VwSUh0Y2JpQWdmVnh1SUNCeVpYUjFjbTRnWm1Gc2MyVTdYRzU5WEc1Y2JpOHFLbHh1SUNvZ1EzSnZjM010WW5KdmQzTmxjaUJnUTNWemRHOXRSWFpsYm5SZ0lHTnZibk4wY25WamRHOXlMbHh1SUNwY2JpQXFJR2gwZEhCek9pOHZaR1YyWld4dmNHVnlMbTF2ZW1sc2JHRXViM0puTDJWdUxWVlRMMlJ2WTNNdlYyVmlMMEZRU1M5RGRYTjBiMjFGZG1WdWRDNURkWE4wYjIxRmRtVnVkRnh1SUNwY2JpQXFJRUJ3ZFdKc2FXTmNiaUFxTDF4dVhHNXRiMlIxYkdVdVpYaHdiM0owY3lBOUlIVnpaVTVoZEdsMlpTZ3BJRDhnVG1GMGFYWmxRM1Z6ZEc5dFJYWmxiblFnT2x4dVhHNHZMeUJKUlNBK1BTQTVYRzRuWm5WdVkzUnBiMjRuSUQwOVBTQjBlWEJsYjJZZ1pHOWpkVzFsYm5RdVkzSmxZWFJsUlhabGJuUWdQeUJtZFc1amRHbHZiaUJEZFhOMGIyMUZkbVZ1ZENBb2RIbHdaU3dnY0dGeVlXMXpLU0I3WEc0Z0lIWmhjaUJsSUQwZ1pHOWpkVzFsYm5RdVkzSmxZWFJsUlhabGJuUW9KME4xYzNSdmJVVjJaVzUwSnlrN1hHNGdJR2xtSUNod1lYSmhiWE1wSUh0Y2JpQWdJQ0JsTG1sdWFYUkRkWE4wYjIxRmRtVnVkQ2gwZVhCbExDQndZWEpoYlhNdVluVmlZbXhsY3l3Z2NHRnlZVzF6TG1OaGJtTmxiR0ZpYkdVc0lIQmhjbUZ0Y3k1a1pYUmhhV3dwTzF4dUlDQjlJR1ZzYzJVZ2UxeHVJQ0FnSUdVdWFXNXBkRU4xYzNSdmJVVjJaVzUwS0hSNWNHVXNJR1poYkhObExDQm1ZV3h6WlN3Z2RtOXBaQ0F3S1R0Y2JpQWdmVnh1SUNCeVpYUjFjbTRnWlR0Y2JuMGdPbHh1WEc0dkx5QkpSU0E4UFNBNFhHNW1kVzVqZEdsdmJpQkRkWE4wYjIxRmRtVnVkQ0FvZEhsd1pTd2djR0Z5WVcxektTQjdYRzRnSUhaaGNpQmxJRDBnWkc5amRXMWxiblF1WTNKbFlYUmxSWFpsYm5SUFltcGxZM1FvS1R0Y2JpQWdaUzUwZVhCbElEMGdkSGx3WlR0Y2JpQWdhV1lnS0hCaGNtRnRjeWtnZTF4dUlDQWdJR1V1WW5WaVlteGxjeUE5SUVKdmIyeGxZVzRvY0dGeVlXMXpMbUoxWW1Kc1pYTXBPMXh1SUNBZ0lHVXVZMkZ1WTJWc1lXSnNaU0E5SUVKdmIyeGxZVzRvY0dGeVlXMXpMbU5oYm1ObGJHRmliR1VwTzF4dUlDQWdJR1V1WkdWMFlXbHNJRDBnY0dGeVlXMXpMbVJsZEdGcGJEdGNiaUFnZlNCbGJITmxJSHRjYmlBZ0lDQmxMbUoxWW1Kc1pYTWdQU0JtWVd4elpUdGNiaUFnSUNCbExtTmhibU5sYkdGaWJHVWdQU0JtWVd4elpUdGNiaUFnSUNCbExtUmxkR0ZwYkNBOUlIWnZhV1FnTUR0Y2JpQWdmVnh1SUNCeVpYUjFjbTRnWlR0Y2JuMWNiaUpkZlE9PSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGN1c3RvbUV2ZW50ID0gcmVxdWlyZSgnY3VzdG9tLWV2ZW50Jyk7XG52YXIgZXZlbnRtYXAgPSByZXF1aXJlKCcuL2V2ZW50bWFwJyk7XG52YXIgZG9jID0gZG9jdW1lbnQ7XG52YXIgYWRkRXZlbnQgPSBhZGRFdmVudEVhc3k7XG52YXIgcmVtb3ZlRXZlbnQgPSByZW1vdmVFdmVudEVhc3k7XG52YXIgaGFyZENhY2hlID0gW107XG5cbmlmICghZ2xvYmFsLmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgYWRkRXZlbnQgPSBhZGRFdmVudEhhcmQ7XG4gIHJlbW92ZUV2ZW50ID0gcmVtb3ZlRXZlbnRIYXJkO1xufVxuXG5mdW5jdGlvbiBhZGRFdmVudEVhc3kgKGVsLCB0eXBlLCBmbiwgY2FwdHVyaW5nKSB7XG4gIHJldHVybiBlbC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGZuLCBjYXB0dXJpbmcpO1xufVxuXG5mdW5jdGlvbiBhZGRFdmVudEhhcmQgKGVsLCB0eXBlLCBmbikge1xuICByZXR1cm4gZWwuYXR0YWNoRXZlbnQoJ29uJyArIHR5cGUsIHdyYXAoZWwsIHR5cGUsIGZuKSk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUV2ZW50RWFzeSAoZWwsIHR5cGUsIGZuLCBjYXB0dXJpbmcpIHtcbiAgcmV0dXJuIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgZm4sIGNhcHR1cmluZyk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUV2ZW50SGFyZCAoZWwsIHR5cGUsIGZuKSB7XG4gIHJldHVybiBlbC5kZXRhY2hFdmVudCgnb24nICsgdHlwZSwgdW53cmFwKGVsLCB0eXBlLCBmbikpO1xufVxuXG5mdW5jdGlvbiBmYWJyaWNhdGVFdmVudCAoZWwsIHR5cGUsIG1vZGVsKSB7XG4gIHZhciBlID0gZXZlbnRtYXAuaW5kZXhPZih0eXBlKSA9PT0gLTEgPyBtYWtlQ3VzdG9tRXZlbnQoKSA6IG1ha2VDbGFzc2ljRXZlbnQoKTtcbiAgaWYgKGVsLmRpc3BhdGNoRXZlbnQpIHtcbiAgICBlbC5kaXNwYXRjaEV2ZW50KGUpO1xuICB9IGVsc2Uge1xuICAgIGVsLmZpcmVFdmVudCgnb24nICsgdHlwZSwgZSk7XG4gIH1cbiAgZnVuY3Rpb24gbWFrZUNsYXNzaWNFdmVudCAoKSB7XG4gICAgdmFyIGU7XG4gICAgaWYgKGRvYy5jcmVhdGVFdmVudCkge1xuICAgICAgZSA9IGRvYy5jcmVhdGVFdmVudCgnRXZlbnQnKTtcbiAgICAgIGUuaW5pdEV2ZW50KHR5cGUsIHRydWUsIHRydWUpO1xuICAgIH0gZWxzZSBpZiAoZG9jLmNyZWF0ZUV2ZW50T2JqZWN0KSB7XG4gICAgICBlID0gZG9jLmNyZWF0ZUV2ZW50T2JqZWN0KCk7XG4gICAgfVxuICAgIHJldHVybiBlO1xuICB9XG4gIGZ1bmN0aW9uIG1ha2VDdXN0b21FdmVudCAoKSB7XG4gICAgcmV0dXJuIG5ldyBjdXN0b21FdmVudCh0eXBlLCB7IGRldGFpbDogbW9kZWwgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsLCB0eXBlLCBmbikge1xuICByZXR1cm4gZnVuY3Rpb24gd3JhcHBlciAob3JpZ2luYWxFdmVudCkge1xuICAgIHZhciBlID0gb3JpZ2luYWxFdmVudCB8fCBnbG9iYWwuZXZlbnQ7XG4gICAgZS50YXJnZXQgPSBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCA9IGUucHJldmVudERlZmF1bHQgfHwgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKCkgeyBlLnJldHVyblZhbHVlID0gZmFsc2U7IH07XG4gICAgZS5zdG9wUHJvcGFnYXRpb24gPSBlLnN0b3BQcm9wYWdhdGlvbiB8fCBmdW5jdGlvbiBzdG9wUHJvcGFnYXRpb24gKCkgeyBlLmNhbmNlbEJ1YmJsZSA9IHRydWU7IH07XG4gICAgZS53aGljaCA9IGUud2hpY2ggfHwgZS5rZXlDb2RlO1xuICAgIGZuLmNhbGwoZWwsIGUpO1xuICB9O1xufVxuXG5mdW5jdGlvbiB3cmFwIChlbCwgdHlwZSwgZm4pIHtcbiAgdmFyIHdyYXBwZXIgPSB1bndyYXAoZWwsIHR5cGUsIGZuKSB8fCB3cmFwcGVyRmFjdG9yeShlbCwgdHlwZSwgZm4pO1xuICBoYXJkQ2FjaGUucHVzaCh7XG4gICAgd3JhcHBlcjogd3JhcHBlcixcbiAgICBlbGVtZW50OiBlbCxcbiAgICB0eXBlOiB0eXBlLFxuICAgIGZuOiBmblxuICB9KTtcbiAgcmV0dXJuIHdyYXBwZXI7XG59XG5cbmZ1bmN0aW9uIHVud3JhcCAoZWwsIHR5cGUsIGZuKSB7XG4gIHZhciBpID0gZmluZChlbCwgdHlwZSwgZm4pO1xuICBpZiAoaSkge1xuICAgIHZhciB3cmFwcGVyID0gaGFyZENhY2hlW2ldLndyYXBwZXI7XG4gICAgaGFyZENhY2hlLnNwbGljZShpLCAxKTsgLy8gZnJlZSB1cCBhIHRhZCBvZiBtZW1vcnlcbiAgICByZXR1cm4gd3JhcHBlcjtcbiAgfVxufVxuXG5mdW5jdGlvbiBmaW5kIChlbCwgdHlwZSwgZm4pIHtcbiAgdmFyIGksIGl0ZW07XG4gIGZvciAoaSA9IDA7IGkgPCBoYXJkQ2FjaGUubGVuZ3RoOyBpKyspIHtcbiAgICBpdGVtID0gaGFyZENhY2hlW2ldO1xuICAgIGlmIChpdGVtLmVsZW1lbnQgPT09IGVsICYmIGl0ZW0udHlwZSA9PT0gdHlwZSAmJiBpdGVtLmZuID09PSBmbikge1xuICAgICAgcmV0dXJuIGk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZEV2ZW50LFxuICByZW1vdmU6IHJlbW92ZUV2ZW50LFxuICBmYWJyaWNhdGU6IGZhYnJpY2F0ZUV2ZW50XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSlcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRhdGE6YXBwbGljYXRpb24vanNvbjtjaGFyc2V0OnV0Zi04O2Jhc2U2NCxleUoyWlhKemFXOXVJam96TENKemIzVnlZMlZ6SWpwYkltNXZaR1ZmYlc5a2RXeGxjeTlqY205emMzWmxiblF2YzNKakwyTnliM056ZG1WdWRDNXFjeUpkTENKdVlXMWxjeUk2VzEwc0ltMWhjSEJwYm1keklqb2lPMEZCUVVFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJJaXdpWm1sc1pTSTZJbWRsYm1WeVlYUmxaQzVxY3lJc0luTnZkWEpqWlZKdmIzUWlPaUlpTENKemIzVnlZMlZ6UTI5dWRHVnVkQ0k2V3lJbmRYTmxJSE4wY21samRDYzdYRzVjYm5aaGNpQmpkWE4wYjIxRmRtVnVkQ0E5SUhKbGNYVnBjbVVvSjJOMWMzUnZiUzFsZG1WdWRDY3BPMXh1ZG1GeUlHVjJaVzUwYldGd0lEMGdjbVZ4ZFdseVpTZ25MaTlsZG1WdWRHMWhjQ2NwTzF4dWRtRnlJR1J2WXlBOUlHUnZZM1Z0Wlc1ME8xeHVkbUZ5SUdGa1pFVjJaVzUwSUQwZ1lXUmtSWFpsYm5SRllYTjVPMXh1ZG1GeUlISmxiVzkyWlVWMlpXNTBJRDBnY21WdGIzWmxSWFpsYm5SRllYTjVPMXh1ZG1GeUlHaGhjbVJEWVdOb1pTQTlJRnRkTzF4dVhHNXBaaUFvSVdkc2IySmhiQzVoWkdSRmRtVnVkRXhwYzNSbGJtVnlLU0I3WEc0Z0lHRmtaRVYyWlc1MElEMGdZV1JrUlhabGJuUklZWEprTzF4dUlDQnlaVzF2ZG1WRmRtVnVkQ0E5SUhKbGJXOTJaVVYyWlc1MFNHRnlaRHRjYm4xY2JseHVablZ1WTNScGIyNGdZV1JrUlhabGJuUkZZWE41SUNobGJDd2dkSGx3WlN3Z1ptNHNJR05oY0hSMWNtbHVaeWtnZTF4dUlDQnlaWFIxY200Z1pXd3VZV1JrUlhabGJuUk1hWE4wWlc1bGNpaDBlWEJsTENCbWJpd2dZMkZ3ZEhWeWFXNW5LVHRjYm4xY2JseHVablZ1WTNScGIyNGdZV1JrUlhabGJuUklZWEprSUNobGJDd2dkSGx3WlN3Z1ptNHBJSHRjYmlBZ2NtVjBkWEp1SUdWc0xtRjBkR0ZqYUVWMlpXNTBLQ2R2YmljZ0t5QjBlWEJsTENCM2NtRndLR1ZzTENCMGVYQmxMQ0JtYmlrcE8xeHVmVnh1WEc1bWRXNWpkR2x2YmlCeVpXMXZkbVZGZG1WdWRFVmhjM2tnS0dWc0xDQjBlWEJsTENCbWJpd2dZMkZ3ZEhWeWFXNW5LU0I3WEc0Z0lISmxkSFZ5YmlCbGJDNXlaVzF2ZG1WRmRtVnVkRXhwYzNSbGJtVnlLSFI1Y0dVc0lHWnVMQ0JqWVhCMGRYSnBibWNwTzF4dWZWeHVYRzVtZFc1amRHbHZiaUJ5WlcxdmRtVkZkbVZ1ZEVoaGNtUWdLR1ZzTENCMGVYQmxMQ0JtYmlrZ2UxeHVJQ0J5WlhSMWNtNGdaV3d1WkdWMFlXTm9SWFpsYm5Rb0oyOXVKeUFySUhSNWNHVXNJSFZ1ZDNKaGNDaGxiQ3dnZEhsd1pTd2dabTRwS1R0Y2JuMWNibHh1Wm5WdVkzUnBiMjRnWm1GaWNtbGpZWFJsUlhabGJuUWdLR1ZzTENCMGVYQmxMQ0J0YjJSbGJDa2dlMXh1SUNCMllYSWdaU0E5SUdWMlpXNTBiV0Z3TG1sdVpHVjRUMllvZEhsd1pTa2dQVDA5SUMweElEOGdiV0ZyWlVOMWMzUnZiVVYyWlc1MEtDa2dPaUJ0WVd0bFEyeGhjM05wWTBWMlpXNTBLQ2s3WEc0Z0lHbG1JQ2hsYkM1a2FYTndZWFJqYUVWMlpXNTBLU0I3WEc0Z0lDQWdaV3d1WkdsemNHRjBZMmhGZG1WdWRDaGxLVHRjYmlBZ2ZTQmxiSE5sSUh0Y2JpQWdJQ0JsYkM1bWFYSmxSWFpsYm5Rb0oyOXVKeUFySUhSNWNHVXNJR1VwTzF4dUlDQjlYRzRnSUdaMWJtTjBhVzl1SUcxaGEyVkRiR0Z6YzJsalJYWmxiblFnS0NrZ2UxeHVJQ0FnSUhaaGNpQmxPMXh1SUNBZ0lHbG1JQ2hrYjJNdVkzSmxZWFJsUlhabGJuUXBJSHRjYmlBZ0lDQWdJR1VnUFNCa2IyTXVZM0psWVhSbFJYWmxiblFvSjBWMlpXNTBKeWs3WEc0Z0lDQWdJQ0JsTG1sdWFYUkZkbVZ1ZENoMGVYQmxMQ0IwY25WbExDQjBjblZsS1R0Y2JpQWdJQ0I5SUdWc2MyVWdhV1lnS0dSdll5NWpjbVZoZEdWRmRtVnVkRTlpYW1WamRDa2dlMXh1SUNBZ0lDQWdaU0E5SUdSdll5NWpjbVZoZEdWRmRtVnVkRTlpYW1WamRDZ3BPMXh1SUNBZ0lIMWNiaUFnSUNCeVpYUjFjbTRnWlR0Y2JpQWdmVnh1SUNCbWRXNWpkR2x2YmlCdFlXdGxRM1Z6ZEc5dFJYWmxiblFnS0NrZ2UxeHVJQ0FnSUhKbGRIVnliaUJ1WlhjZ1kzVnpkRzl0UlhabGJuUW9kSGx3WlN3Z2V5QmtaWFJoYVd3NklHMXZaR1ZzSUgwcE8xeHVJQ0I5WEc1OVhHNWNibVoxYm1OMGFXOXVJSGR5WVhCd1pYSkdZV04wYjNKNUlDaGxiQ3dnZEhsd1pTd2dabTRwSUh0Y2JpQWdjbVYwZFhKdUlHWjFibU4wYVc5dUlIZHlZWEJ3WlhJZ0tHOXlhV2RwYm1Gc1JYWmxiblFwSUh0Y2JpQWdJQ0IyWVhJZ1pTQTlJRzl5YVdkcGJtRnNSWFpsYm5RZ2ZId2daMnh2WW1Gc0xtVjJaVzUwTzF4dUlDQWdJR1V1ZEdGeVoyVjBJRDBnWlM1MFlYSm5aWFFnZkh3Z1pTNXpjbU5GYkdWdFpXNTBPMXh1SUNBZ0lHVXVjSEpsZG1WdWRFUmxabUYxYkhRZ1BTQmxMbkJ5WlhabGJuUkVaV1poZFd4MElIeDhJR1oxYm1OMGFXOXVJSEJ5WlhabGJuUkVaV1poZFd4MElDZ3BJSHNnWlM1eVpYUjFjbTVXWVd4MVpTQTlJR1poYkhObE95QjlPMXh1SUNBZ0lHVXVjM1J2Y0ZCeWIzQmhaMkYwYVc5dUlEMGdaUzV6ZEc5d1VISnZjR0ZuWVhScGIyNGdmSHdnWm5WdVkzUnBiMjRnYzNSdmNGQnliM0JoWjJGMGFXOXVJQ2dwSUhzZ1pTNWpZVzVqWld4Q2RXSmliR1VnUFNCMGNuVmxPeUI5TzF4dUlDQWdJR1V1ZDJocFkyZ2dQU0JsTG5kb2FXTm9JSHg4SUdVdWEyVjVRMjlrWlR0Y2JpQWdJQ0JtYmk1allXeHNLR1ZzTENCbEtUdGNiaUFnZlR0Y2JuMWNibHh1Wm5WdVkzUnBiMjRnZDNKaGNDQW9aV3dzSUhSNWNHVXNJR1p1S1NCN1hHNGdJSFpoY2lCM2NtRndjR1Z5SUQwZ2RXNTNjbUZ3S0dWc0xDQjBlWEJsTENCbWJpa2dmSHdnZDNKaGNIQmxja1poWTNSdmNua29aV3dzSUhSNWNHVXNJR1p1S1R0Y2JpQWdhR0Z5WkVOaFkyaGxMbkIxYzJnb2UxeHVJQ0FnSUhkeVlYQndaWEk2SUhkeVlYQndaWElzWEc0Z0lDQWdaV3hsYldWdWREb2daV3dzWEc0Z0lDQWdkSGx3WlRvZ2RIbHdaU3hjYmlBZ0lDQm1iam9nWm01Y2JpQWdmU2s3WEc0Z0lISmxkSFZ5YmlCM2NtRndjR1Z5TzF4dWZWeHVYRzVtZFc1amRHbHZiaUIxYm5keVlYQWdLR1ZzTENCMGVYQmxMQ0JtYmlrZ2UxeHVJQ0IyWVhJZ2FTQTlJR1pwYm1Rb1pXd3NJSFI1Y0dVc0lHWnVLVHRjYmlBZ2FXWWdLR2twSUh0Y2JpQWdJQ0IyWVhJZ2QzSmhjSEJsY2lBOUlHaGhjbVJEWVdOb1pWdHBYUzUzY21Gd2NHVnlPMXh1SUNBZ0lHaGhjbVJEWVdOb1pTNXpjR3hwWTJVb2FTd2dNU2s3SUM4dklHWnlaV1VnZFhBZ1lTQjBZV1FnYjJZZ2JXVnRiM0o1WEc0Z0lDQWdjbVYwZFhKdUlIZHlZWEJ3WlhJN1hHNGdJSDFjYm4xY2JseHVablZ1WTNScGIyNGdabWx1WkNBb1pXd3NJSFI1Y0dVc0lHWnVLU0I3WEc0Z0lIWmhjaUJwTENCcGRHVnRPMXh1SUNCbWIzSWdLR2tnUFNBd095QnBJRHdnYUdGeVpFTmhZMmhsTG14bGJtZDBhRHNnYVNzcktTQjdYRzRnSUNBZ2FYUmxiU0E5SUdoaGNtUkRZV05vWlZ0cFhUdGNiaUFnSUNCcFppQW9hWFJsYlM1bGJHVnRaVzUwSUQwOVBTQmxiQ0FtSmlCcGRHVnRMblI1Y0dVZ1BUMDlJSFI1Y0dVZ0ppWWdhWFJsYlM1bWJpQTlQVDBnWm00cElIdGNiaUFnSUNBZ0lISmxkSFZ5YmlCcE8xeHVJQ0FnSUgxY2JpQWdmVnh1ZlZ4dVhHNXRiMlIxYkdVdVpYaHdiM0owY3lBOUlIdGNiaUFnWVdSa09pQmhaR1JGZG1WdWRDeGNiaUFnY21WdGIzWmxPaUJ5WlcxdmRtVkZkbVZ1ZEN4Y2JpQWdabUZpY21sallYUmxPaUJtWVdKeWFXTmhkR1ZGZG1WdWRGeHVmVHRjYmlKZGZRPT0iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBldmVudG1hcCA9IFtdO1xudmFyIGV2ZW50bmFtZSA9ICcnO1xudmFyIHJvbiA9IC9eb24vO1xuXG5mb3IgKGV2ZW50bmFtZSBpbiBnbG9iYWwpIHtcbiAgaWYgKHJvbi50ZXN0KGV2ZW50bmFtZSkpIHtcbiAgICBldmVudG1hcC5wdXNoKGV2ZW50bmFtZS5zbGljZSgyKSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBldmVudG1hcDtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pXG4vLyMgc291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uL2pzb247Y2hhcnNldDp1dGYtODtiYXNlNjQsZXlKMlpYSnphVzl1SWpvekxDSnpiM1Z5WTJWeklqcGJJbTV2WkdWZmJXOWtkV3hsY3k5amNtOXpjM1psYm5RdmMzSmpMMlYyWlc1MGJXRndMbXB6SWwwc0ltNWhiV1Z6SWpwYlhTd2liV0Z3Y0dsdVozTWlPaUk3UVVGQlFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJJaXdpWm1sc1pTSTZJbWRsYm1WeVlYUmxaQzVxY3lJc0luTnZkWEpqWlZKdmIzUWlPaUlpTENKemIzVnlZMlZ6UTI5dWRHVnVkQ0k2V3lJbmRYTmxJSE4wY21samRDYzdYRzVjYm5aaGNpQmxkbVZ1ZEcxaGNDQTlJRnRkTzF4dWRtRnlJR1YyWlc1MGJtRnRaU0E5SUNjbk8xeHVkbUZ5SUhKdmJpQTlJQzllYjI0dk8xeHVYRzVtYjNJZ0tHVjJaVzUwYm1GdFpTQnBiaUJuYkc5aVlXd3BJSHRjYmlBZ2FXWWdLSEp2Ymk1MFpYTjBLR1YyWlc1MGJtRnRaU2twSUh0Y2JpQWdJQ0JsZG1WdWRHMWhjQzV3ZFhOb0tHVjJaVzUwYm1GdFpTNXpiR2xqWlNneUtTazdYRzRnSUgxY2JuMWNibHh1Ylc5a2RXeGxMbVY0Y0c5eWRITWdQU0JsZG1WdWRHMWhjRHRjYmlKZGZRPT0iXX0=
