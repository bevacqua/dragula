!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.dragula=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');
var crossvent = require('crossvent');
var body = document.body;
var documentElement = document.documentElement;

function dragula (containers, options) {
  var _dragging; // are we dragging something?
  var _mirror; // mirror image
  var _source; // source container
  var _item; // item being dragged
  var _offsetX; // reference x
  var _offsetY; // reference y
  var _initialSibling; // reference sibling when grabbed
  var _currentSibling; // reference sibling now
  var _copy; // item used for copying

  var o = options || {};
  if (o.moves === void 0) { o.moves = always; }
  if (o.accepts === void 0) { o.accepts = always; }
  if (o.copy === void 0) { o.copy = false; }
  if (o.revertOnSpill === void 0) { o.revertOnSpill = false; }
  if (o.removeOnSpill === void 0) { o.removeOnSpill = false; }
  if (o.direction === void 0) { o.direction = 'vertical'; }

  var api = emitter({
    cancel: cancel,
    remove: remove,
    destroy: destroy
  });

  events();

  return api;

  function events (remove) {
    var op = remove ? 'remove' : 'add';
    crossvent[op](documentElement, 'mouseup', release);
    crossvent[op](documentElement, 'touchend', release);
    containers.forEach(track);

    function track (container) {
      crossvent[op](container, 'mousedown', grab);
      crossvent[op](container, 'touchstart', grab);
    }
  }

  function destroy () {
    events(true);
    release({});
  }

  function grab (e) {
    if ((e.which !== 0 && e.which !== 1) || e.metaKey || e.ctrlKey) {
      return; // we only care about honest-to-god left clicks and touch events
    }
    if (_dragging) {
      return;
    }

    var item = e.target;
    if (containers.indexOf(item) !== -1) {
      return; // don't drag container itself
    }
    while (containers.indexOf(item.parentElement) === -1) {
      if (invalidTarget(item)) {
        return;
      }
      item = item.parentElement; // drag target should be a top element
    }
    if (invalidTarget(item)) {
      return;
    }

    var container = item.parentElement;
    var movable = o.moves(item, container);
    if (!movable) {
      return;
    }

    var offset = getOffset(item);

    e.preventDefault();

    if (o.copy) {
      _copy = item.cloneNode(true);
      addClass(_copy, 'gu-transit');
    } else {
      addClass(item, 'gu-transit');
    }

    _source = container;
    _item = item;
    _initialSibling = _currentSibling = nextEl(item);
    _offsetX = getCoord('pageX', e) - offset.left;
    _offsetY = getCoord('pageY', e) - offset.top;

    api.emit('drag', _item, _source);
    renderMirrorImage();
    drag(e);
  }

  function invalidTarget (el) {
    return el.tagName === 'A' || el.tagName === 'BUTTON';
  }

  function release (e) {
    if (!_dragging) {
      return;
    }

    var item = _copy || _item;
    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    if (dropTarget && (o.copy === false || dropTarget !== _source)) {
      drop();
    } else if (o.removeOnSpill) {
      remove();
    } else {
      cancel();
    }

    function drop () {
      if (isInitialPlacement(dropTarget)) {
        api.emit('cancel', item, _source);
      } else {
        api.emit('drop', item, dropTarget, _source);
      }
      cleanup();
    }
  }

  function remove () {
    if (!_dragging) {
      return;
    }
    var item = _copy || _item;
    var parent = item.parentElement;
    if (parent) {
      parent.removeChild(item);
    }
    api.emit(o.copy ? 'cancel' : 'remove', item, parent);
    cleanup();
  }

  function cancel (revert) {
    if (!_dragging) {
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
      api.emit('cancel', item, _source);
    } else {
      api.emit('drop', item, parent, _source);
    }
    cleanup();
  }

  function cleanup () {
    var item = _copy || _item;
    removeMirrorImage();
    rmClass(item, 'gu-transit');
    _source = _item = _copy = _initialSibling = _currentSibling = null;
  }

  function isInitialPlacement (target, s) {
    var sibling = s !== void 0 ? s : _currentSibling;
    return target === _source && sibling === _initialSibling;
  }

  function findDropTarget (elementBehindCursor, clientX, clientY) {
    var target = elementBehindCursor;
    while (target && !accepted()) {
      target = target.parentElement;
    }
    return target;

    function accepted () {
      var droppable = containers.indexOf(target) !== -1;
      if (droppable === false) {
        return false;
      }

      var immediate = getImmediateChild(target, elementBehindCursor);
      var reference = getReference(target, immediate, clientX, clientY);
      var initial = isInitialPlacement(target, reference);
      if (initial) {
        return true; // should always be able to drop it right back where it was
      }
      return o.accepts(_item, target, _source);
    }
  }

  function drag (e) {
    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var x = clientX - _offsetX;
    var y = clientY - _offsetY;

    _mirror.style.left = x + 'px';
    _mirror.style.top  = y + 'px';

    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    if (dropTarget === _source && o.copy) {
      return;
    }
    var item = _copy || _item;
    var immediate = getImmediateChild(dropTarget, elementBehindCursor);
    if (immediate === null) {
      return;
    }
    var reference = getReference(dropTarget, immediate, clientX, clientY);
    if (reference === null || reference !== item && reference !== nextEl(item)) {
      _currentSibling = reference;
      dropTarget.insertBefore(item, reference);
      api.emit('shadow', item, dropTarget);
    }
  }

  function renderMirrorImage () {
    var rect = _item.getBoundingClientRect();
    _dragging = true;
    _mirror = _item.cloneNode(true);
    _mirror.style.width = rect.width + 'px';
    _mirror.style.height = rect.height + 'px';
    rmClass(_mirror, 'gu-transit');
    addClass(_mirror, ' gu-mirror');
    body.appendChild(_mirror);
    crossvent.add(documentElement, 'mousemove', drag);
    crossvent.add(documentElement, 'touchmove', drag);
    addClass(body, 'gu-unselectable');
  }

  function removeMirrorImage () {
    if (_mirror) {
      rmClass(body, 'gu-unselectable');
      crossvent.remove(documentElement, 'mousemove', drag);
      crossvent.remove(documentElement, 'touchmove', drag);
      _mirror.parentElement.removeChild(_mirror);
      _mirror = null;
      _dragging = false;
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
        return resolve(x > rect.left + rect.width / 2);
      }
      return resolve(y > rect.top + rect.height / 2);
    }

    function resolve (after) {
      return after ? nextEl(target) : target;
    }
  }
}

function getOffset (el) {
  var rect = el.getBoundingClientRect();
  return {
    left: rect.left + body.scrollLeft,
    top: rect.top + body.scrollTop
  };
}

function getElementBehindPoint (behind, x, y) {
  if (!x && !y) {
    return null;
  }
  var state = behind.className;
  behind.className += ' gu-hide';
  var el = document.elementFromPoint(x, y);
  behind.className = state;
  return el;
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

function getCoord (coord, e) {
  if (typeof e.targetTouches === 'undefined') {
    return e[coord];
  }
  return e.targetTouches && e.targetTouches.length && e.targetTouches[0][coord] || 0;
}

module.exports = dragula;

},{"contra.emitter":3,"crossvent":5}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;

function drainQueue() {
    if (draining) {
        return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        var i = -1;
        while (++i < len) {
            currentQueue[i]();
        }
        len = queue.length;
    }
    draining = false;
}
process.nextTick = function (fun) {
    queue.push(fun);
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],3:[function(require,module,exports){
module.exports = require('./src/contra.emitter.js');

},{"./src/contra.emitter.js":4}],4:[function(require,module,exports){
(function (process){
(function (root, undefined) {
  'use strict';

  var undef = '' + undefined;
  function atoa (a, n) { return Array.prototype.slice.call(a, n); }
  function debounce (fn, args, ctx) { if (!fn) { return; } tick(function run () { fn.apply(ctx || null, args || []); }); }

  // cross-platform ticker
  var si = typeof setImmediate === 'function', tick;
  if (si) {
    tick = function (fn) { setImmediate(fn); };
  } else if (typeof process !== undef && process.nextTick) {
    tick = process.nextTick;
  } else {
    tick = function (fn) { setTimeout(fn, 0); };
  }

  function _emitter (thing, options) {
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
        evt[type] = et.filter(function emitter (listen) {
          if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
          return !listen._once;
        });
        return thing;
      };
    }
    return thing;
  }

  // cross-platform export
  if (typeof module !== undef && module.exports) {
    module.exports = _emitter;
  } else {
    root.contra = root.contra || {};
    root.contra.emitter = _emitter;
  }
})(this);

}).call(this,require('_process'))

},{"_process":2}],5:[function(require,module,exports){
(function (global){
'use strict';

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

function fabricateEvent (el, type) {
  var e;
  if (doc.createEvent) {
    e = doc.createEvent('Event');
    e.initEvent(type, true, true);
    el.dispatchEvent(e);
  } else if (doc.createEventObject) {
    e = doc.createEventObject();
    el.fireEvent('on' + type, e);
  }
}

function wrapperFactory (el, type, fn) {
  return function wrapper (originalEvent) {
    var e = originalEvent || global.event;
    e.target = e.target || e.srcElement;
    e.preventDefault  = e.preventDefault  || function preventDefault () { e.returnValue = false; };
    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
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

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkcmFndWxhLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEuZW1pdHRlci9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEuZW1pdHRlci9zcmMvY29udHJhLmVtaXR0ZXIuanMiLCJub2RlX21vZHVsZXMvY3Jvc3N2ZW50L3NyYy9jcm9zc3ZlbnQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaldBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQzNFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEuZW1pdHRlcicpO1xudmFyIGNyb3NzdmVudCA9IHJlcXVpcmUoJ2Nyb3NzdmVudCcpO1xudmFyIGJvZHkgPSBkb2N1bWVudC5ib2R5O1xudmFyIGRvY3VtZW50RWxlbWVudCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcblxuZnVuY3Rpb24gZHJhZ3VsYSAoY29udGFpbmVycywgb3B0aW9ucykge1xuICB2YXIgX2RyYWdnaW5nOyAvLyBhcmUgd2UgZHJhZ2dpbmcgc29tZXRoaW5nP1xuICB2YXIgX21pcnJvcjsgLy8gbWlycm9yIGltYWdlXG4gIHZhciBfc291cmNlOyAvLyBzb3VyY2UgY29udGFpbmVyXG4gIHZhciBfaXRlbTsgLy8gaXRlbSBiZWluZyBkcmFnZ2VkXG4gIHZhciBfb2Zmc2V0WDsgLy8gcmVmZXJlbmNlIHhcbiAgdmFyIF9vZmZzZXRZOyAvLyByZWZlcmVuY2UgeVxuICB2YXIgX2luaXRpYWxTaWJsaW5nOyAvLyByZWZlcmVuY2Ugc2libGluZyB3aGVuIGdyYWJiZWRcbiAgdmFyIF9jdXJyZW50U2libGluZzsgLy8gcmVmZXJlbmNlIHNpYmxpbmcgbm93XG4gIHZhciBfY29weTsgLy8gaXRlbSB1c2VkIGZvciBjb3B5aW5nXG5cbiAgdmFyIG8gPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoby5tb3ZlcyA9PT0gdm9pZCAwKSB7IG8ubW92ZXMgPSBhbHdheXM7IH1cbiAgaWYgKG8uYWNjZXB0cyA9PT0gdm9pZCAwKSB7IG8uYWNjZXB0cyA9IGFsd2F5czsgfVxuICBpZiAoby5jb3B5ID09PSB2b2lkIDApIHsgby5jb3B5ID0gZmFsc2U7IH1cbiAgaWYgKG8ucmV2ZXJ0T25TcGlsbCA9PT0gdm9pZCAwKSB7IG8ucmV2ZXJ0T25TcGlsbCA9IGZhbHNlOyB9XG4gIGlmIChvLnJlbW92ZU9uU3BpbGwgPT09IHZvaWQgMCkgeyBvLnJlbW92ZU9uU3BpbGwgPSBmYWxzZTsgfVxuICBpZiAoby5kaXJlY3Rpb24gPT09IHZvaWQgMCkgeyBvLmRpcmVjdGlvbiA9ICd2ZXJ0aWNhbCc7IH1cblxuICB2YXIgYXBpID0gZW1pdHRlcih7XG4gICAgY2FuY2VsOiBjYW5jZWwsXG4gICAgcmVtb3ZlOiByZW1vdmUsXG4gICAgZGVzdHJveTogZGVzdHJveVxuICB9KTtcblxuICBldmVudHMoKTtcblxuICByZXR1cm4gYXBpO1xuXG4gIGZ1bmN0aW9uIGV2ZW50cyAocmVtb3ZlKSB7XG4gICAgdmFyIG9wID0gcmVtb3ZlID8gJ3JlbW92ZScgOiAnYWRkJztcbiAgICBjcm9zc3ZlbnRbb3BdKGRvY3VtZW50RWxlbWVudCwgJ21vdXNldXAnLCByZWxlYXNlKTtcbiAgICBjcm9zc3ZlbnRbb3BdKGRvY3VtZW50RWxlbWVudCwgJ3RvdWNoZW5kJywgcmVsZWFzZSk7XG4gICAgY29udGFpbmVycy5mb3JFYWNoKHRyYWNrKTtcblxuICAgIGZ1bmN0aW9uIHRyYWNrIChjb250YWluZXIpIHtcbiAgICAgIGNyb3NzdmVudFtvcF0oY29udGFpbmVyLCAnbW91c2Vkb3duJywgZ3JhYik7XG4gICAgICBjcm9zc3ZlbnRbb3BdKGNvbnRhaW5lciwgJ3RvdWNoc3RhcnQnLCBncmFiKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICBldmVudHModHJ1ZSk7XG4gICAgcmVsZWFzZSh7fSk7XG4gIH1cblxuICBmdW5jdGlvbiBncmFiIChlKSB7XG4gICAgaWYgKChlLndoaWNoICE9PSAwICYmIGUud2hpY2ggIT09IDEpIHx8IGUubWV0YUtleSB8fCBlLmN0cmxLZXkpIHtcbiAgICAgIHJldHVybjsgLy8gd2Ugb25seSBjYXJlIGFib3V0IGhvbmVzdC10by1nb2QgbGVmdCBjbGlja3MgYW5kIHRvdWNoIGV2ZW50c1xuICAgIH1cbiAgICBpZiAoX2RyYWdnaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGl0ZW0gPSBlLnRhcmdldDtcbiAgICBpZiAoY29udGFpbmVycy5pbmRleE9mKGl0ZW0pICE9PSAtMSkge1xuICAgICAgcmV0dXJuOyAvLyBkb24ndCBkcmFnIGNvbnRhaW5lciBpdHNlbGZcbiAgICB9XG4gICAgd2hpbGUgKGNvbnRhaW5lcnMuaW5kZXhPZihpdGVtLnBhcmVudEVsZW1lbnQpID09PSAtMSkge1xuICAgICAgaWYgKGludmFsaWRUYXJnZXQoaXRlbSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaXRlbSA9IGl0ZW0ucGFyZW50RWxlbWVudDsgLy8gZHJhZyB0YXJnZXQgc2hvdWxkIGJlIGEgdG9wIGVsZW1lbnRcbiAgICB9XG4gICAgaWYgKGludmFsaWRUYXJnZXQoaXRlbSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgY29udGFpbmVyID0gaXRlbS5wYXJlbnRFbGVtZW50O1xuICAgIHZhciBtb3ZhYmxlID0gby5tb3ZlcyhpdGVtLCBjb250YWluZXIpO1xuICAgIGlmICghbW92YWJsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBvZmZzZXQgPSBnZXRPZmZzZXQoaXRlbSk7XG5cbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICBpZiAoby5jb3B5KSB7XG4gICAgICBfY29weSA9IGl0ZW0uY2xvbmVOb2RlKHRydWUpO1xuICAgICAgYWRkQ2xhc3MoX2NvcHksICdndS10cmFuc2l0Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFkZENsYXNzKGl0ZW0sICdndS10cmFuc2l0Jyk7XG4gICAgfVxuXG4gICAgX3NvdXJjZSA9IGNvbnRhaW5lcjtcbiAgICBfaXRlbSA9IGl0ZW07XG4gICAgX2luaXRpYWxTaWJsaW5nID0gX2N1cnJlbnRTaWJsaW5nID0gbmV4dEVsKGl0ZW0pO1xuICAgIF9vZmZzZXRYID0gZ2V0Q29vcmQoJ3BhZ2VYJywgZSkgLSBvZmZzZXQubGVmdDtcbiAgICBfb2Zmc2V0WSA9IGdldENvb3JkKCdwYWdlWScsIGUpIC0gb2Zmc2V0LnRvcDtcblxuICAgIGFwaS5lbWl0KCdkcmFnJywgX2l0ZW0sIF9zb3VyY2UpO1xuICAgIHJlbmRlck1pcnJvckltYWdlKCk7XG4gICAgZHJhZyhlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGludmFsaWRUYXJnZXQgKGVsKSB7XG4gICAgcmV0dXJuIGVsLnRhZ05hbWUgPT09ICdBJyB8fCBlbC50YWdOYW1lID09PSAnQlVUVE9OJztcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbGVhc2UgKGUpIHtcbiAgICBpZiAoIV9kcmFnZ2luZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgdmFyIGNsaWVudFggPSBnZXRDb29yZCgnY2xpZW50WCcsIGUpO1xuICAgIHZhciBjbGllbnRZID0gZ2V0Q29vcmQoJ2NsaWVudFknLCBlKTtcbiAgICB2YXIgZWxlbWVudEJlaGluZEN1cnNvciA9IGdldEVsZW1lbnRCZWhpbmRQb2ludChfbWlycm9yLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICB2YXIgZHJvcFRhcmdldCA9IGZpbmREcm9wVGFyZ2V0KGVsZW1lbnRCZWhpbmRDdXJzb3IsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgIGlmIChkcm9wVGFyZ2V0ICYmIChvLmNvcHkgPT09IGZhbHNlIHx8IGRyb3BUYXJnZXQgIT09IF9zb3VyY2UpKSB7XG4gICAgICBkcm9wKCk7XG4gICAgfSBlbHNlIGlmIChvLnJlbW92ZU9uU3BpbGwpIHtcbiAgICAgIHJlbW92ZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYW5jZWwoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkcm9wICgpIHtcbiAgICAgIGlmIChpc0luaXRpYWxQbGFjZW1lbnQoZHJvcFRhcmdldCkpIHtcbiAgICAgICAgYXBpLmVtaXQoJ2NhbmNlbCcsIGl0ZW0sIF9zb3VyY2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXBpLmVtaXQoJ2Ryb3AnLCBpdGVtLCBkcm9wVGFyZ2V0LCBfc291cmNlKTtcbiAgICAgIH1cbiAgICAgIGNsZWFudXAoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmUgKCkge1xuICAgIGlmICghX2RyYWdnaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgdmFyIHBhcmVudCA9IGl0ZW0ucGFyZW50RWxlbWVudDtcbiAgICBpZiAocGFyZW50KSB7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQoaXRlbSk7XG4gICAgfVxuICAgIGFwaS5lbWl0KG8uY29weSA/ICdjYW5jZWwnIDogJ3JlbW92ZScsIGl0ZW0sIHBhcmVudCk7XG4gICAgY2xlYW51cCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2FuY2VsIChyZXZlcnQpIHtcbiAgICBpZiAoIV9kcmFnZ2luZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgcmV2ZXJ0cyA9IGFyZ3VtZW50cy5sZW5ndGggPiAwID8gcmV2ZXJ0IDogby5yZXZlcnRPblNwaWxsO1xuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgdmFyIHBhcmVudCA9IGl0ZW0ucGFyZW50RWxlbWVudDtcbiAgICBpZiAocGFyZW50ID09PSBfc291cmNlICYmIG8uY29weSkge1xuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKF9jb3B5KTtcbiAgICB9XG4gICAgdmFyIGluaXRpYWwgPSBpc0luaXRpYWxQbGFjZW1lbnQocGFyZW50KTtcbiAgICBpZiAoaW5pdGlhbCA9PT0gZmFsc2UgJiYgby5jb3B5ID09PSBmYWxzZSAmJiByZXZlcnRzKSB7XG4gICAgICBfc291cmNlLmluc2VydEJlZm9yZShpdGVtLCBfaW5pdGlhbFNpYmxpbmcpO1xuICAgIH1cbiAgICBpZiAoaW5pdGlhbCB8fCByZXZlcnRzKSB7XG4gICAgICBhcGkuZW1pdCgnY2FuY2VsJywgaXRlbSwgX3NvdXJjZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFwaS5lbWl0KCdkcm9wJywgaXRlbSwgcGFyZW50LCBfc291cmNlKTtcbiAgICB9XG4gICAgY2xlYW51cCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2xlYW51cCAoKSB7XG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcbiAgICByZW1vdmVNaXJyb3JJbWFnZSgpO1xuICAgIHJtQ2xhc3MoaXRlbSwgJ2d1LXRyYW5zaXQnKTtcbiAgICBfc291cmNlID0gX2l0ZW0gPSBfY29weSA9IF9pbml0aWFsU2libGluZyA9IF9jdXJyZW50U2libGluZyA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBpc0luaXRpYWxQbGFjZW1lbnQgKHRhcmdldCwgcykge1xuICAgIHZhciBzaWJsaW5nID0gcyAhPT0gdm9pZCAwID8gcyA6IF9jdXJyZW50U2libGluZztcbiAgICByZXR1cm4gdGFyZ2V0ID09PSBfc291cmNlICYmIHNpYmxpbmcgPT09IF9pbml0aWFsU2libGluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmREcm9wVGFyZ2V0IChlbGVtZW50QmVoaW5kQ3Vyc29yLCBjbGllbnRYLCBjbGllbnRZKSB7XG4gICAgdmFyIHRhcmdldCA9IGVsZW1lbnRCZWhpbmRDdXJzb3I7XG4gICAgd2hpbGUgKHRhcmdldCAmJiAhYWNjZXB0ZWQoKSkge1xuICAgICAgdGFyZ2V0ID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQ7XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQ7XG5cbiAgICBmdW5jdGlvbiBhY2NlcHRlZCAoKSB7XG4gICAgICB2YXIgZHJvcHBhYmxlID0gY29udGFpbmVycy5pbmRleE9mKHRhcmdldCkgIT09IC0xO1xuICAgICAgaWYgKGRyb3BwYWJsZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICB2YXIgaW1tZWRpYXRlID0gZ2V0SW1tZWRpYXRlQ2hpbGQodGFyZ2V0LCBlbGVtZW50QmVoaW5kQ3Vyc29yKTtcbiAgICAgIHZhciByZWZlcmVuY2UgPSBnZXRSZWZlcmVuY2UodGFyZ2V0LCBpbW1lZGlhdGUsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgICAgdmFyIGluaXRpYWwgPSBpc0luaXRpYWxQbGFjZW1lbnQodGFyZ2V0LCByZWZlcmVuY2UpO1xuICAgICAgaWYgKGluaXRpYWwpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7IC8vIHNob3VsZCBhbHdheXMgYmUgYWJsZSB0byBkcm9wIGl0IHJpZ2h0IGJhY2sgd2hlcmUgaXQgd2FzXG4gICAgICB9XG4gICAgICByZXR1cm4gby5hY2NlcHRzKF9pdGVtLCB0YXJnZXQsIF9zb3VyY2UpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYWcgKGUpIHtcbiAgICB2YXIgY2xpZW50WCA9IGdldENvb3JkKCdjbGllbnRYJywgZSk7XG4gICAgdmFyIGNsaWVudFkgPSBnZXRDb29yZCgnY2xpZW50WScsIGUpO1xuICAgIHZhciB4ID0gY2xpZW50WCAtIF9vZmZzZXRYO1xuICAgIHZhciB5ID0gY2xpZW50WSAtIF9vZmZzZXRZO1xuXG4gICAgX21pcnJvci5zdHlsZS5sZWZ0ID0geCArICdweCc7XG4gICAgX21pcnJvci5zdHlsZS50b3AgID0geSArICdweCc7XG5cbiAgICB2YXIgZWxlbWVudEJlaGluZEN1cnNvciA9IGdldEVsZW1lbnRCZWhpbmRQb2ludChfbWlycm9yLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICB2YXIgZHJvcFRhcmdldCA9IGZpbmREcm9wVGFyZ2V0KGVsZW1lbnRCZWhpbmRDdXJzb3IsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgIGlmIChkcm9wVGFyZ2V0ID09PSBfc291cmNlICYmIG8uY29weSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xuICAgIHZhciBpbW1lZGlhdGUgPSBnZXRJbW1lZGlhdGVDaGlsZChkcm9wVGFyZ2V0LCBlbGVtZW50QmVoaW5kQ3Vyc29yKTtcbiAgICBpZiAoaW1tZWRpYXRlID09PSBudWxsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciByZWZlcmVuY2UgPSBnZXRSZWZlcmVuY2UoZHJvcFRhcmdldCwgaW1tZWRpYXRlLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICBpZiAocmVmZXJlbmNlID09PSBudWxsIHx8IHJlZmVyZW5jZSAhPT0gaXRlbSAmJiByZWZlcmVuY2UgIT09IG5leHRFbChpdGVtKSkge1xuICAgICAgX2N1cnJlbnRTaWJsaW5nID0gcmVmZXJlbmNlO1xuICAgICAgZHJvcFRhcmdldC5pbnNlcnRCZWZvcmUoaXRlbSwgcmVmZXJlbmNlKTtcbiAgICAgIGFwaS5lbWl0KCdzaGFkb3cnLCBpdGVtLCBkcm9wVGFyZ2V0KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZW5kZXJNaXJyb3JJbWFnZSAoKSB7XG4gICAgdmFyIHJlY3QgPSBfaXRlbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBfZHJhZ2dpbmcgPSB0cnVlO1xuICAgIF9taXJyb3IgPSBfaXRlbS5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgX21pcnJvci5zdHlsZS53aWR0aCA9IHJlY3Qud2lkdGggKyAncHgnO1xuICAgIF9taXJyb3Iuc3R5bGUuaGVpZ2h0ID0gcmVjdC5oZWlnaHQgKyAncHgnO1xuICAgIHJtQ2xhc3MoX21pcnJvciwgJ2d1LXRyYW5zaXQnKTtcbiAgICBhZGRDbGFzcyhfbWlycm9yLCAnIGd1LW1pcnJvcicpO1xuICAgIGJvZHkuYXBwZW5kQ2hpbGQoX21pcnJvcik7XG4gICAgY3Jvc3N2ZW50LmFkZChkb2N1bWVudEVsZW1lbnQsICdtb3VzZW1vdmUnLCBkcmFnKTtcbiAgICBjcm9zc3ZlbnQuYWRkKGRvY3VtZW50RWxlbWVudCwgJ3RvdWNobW92ZScsIGRyYWcpO1xuICAgIGFkZENsYXNzKGJvZHksICdndS11bnNlbGVjdGFibGUnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbW92ZU1pcnJvckltYWdlICgpIHtcbiAgICBpZiAoX21pcnJvcikge1xuICAgICAgcm1DbGFzcyhib2R5LCAnZ3UtdW5zZWxlY3RhYmxlJyk7XG4gICAgICBjcm9zc3ZlbnQucmVtb3ZlKGRvY3VtZW50RWxlbWVudCwgJ21vdXNlbW92ZScsIGRyYWcpO1xuICAgICAgY3Jvc3N2ZW50LnJlbW92ZShkb2N1bWVudEVsZW1lbnQsICd0b3VjaG1vdmUnLCBkcmFnKTtcbiAgICAgIF9taXJyb3IucGFyZW50RWxlbWVudC5yZW1vdmVDaGlsZChfbWlycm9yKTtcbiAgICAgIF9taXJyb3IgPSBudWxsO1xuICAgICAgX2RyYWdnaW5nID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZ2V0SW1tZWRpYXRlQ2hpbGQgKGRyb3BUYXJnZXQsIHRhcmdldCkge1xuICAgIHZhciBpbW1lZGlhdGUgPSB0YXJnZXQ7XG4gICAgd2hpbGUgKGltbWVkaWF0ZSAhPT0gZHJvcFRhcmdldCAmJiBpbW1lZGlhdGUucGFyZW50RWxlbWVudCAhPT0gZHJvcFRhcmdldCkge1xuICAgICAgaW1tZWRpYXRlID0gaW1tZWRpYXRlLnBhcmVudEVsZW1lbnQ7XG4gICAgfVxuICAgIGlmIChpbW1lZGlhdGUgPT09IGRvY3VtZW50RWxlbWVudCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBpbW1lZGlhdGU7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRSZWZlcmVuY2UgKGRyb3BUYXJnZXQsIHRhcmdldCwgeCwgeSkge1xuICAgIHZhciBob3Jpem9udGFsID0gby5kaXJlY3Rpb24gPT09ICdob3Jpem9udGFsJztcbiAgICB2YXIgcmVmZXJlbmNlID0gdGFyZ2V0ICE9PSBkcm9wVGFyZ2V0ID8gaW5zaWRlKCkgOiBvdXRzaWRlKCk7XG4gICAgcmV0dXJuIHJlZmVyZW5jZTtcblxuICAgIGZ1bmN0aW9uIG91dHNpZGUgKCkgeyAvLyBzbG93ZXIsIGJ1dCBhYmxlIHRvIGZpZ3VyZSBvdXQgYW55IHBvc2l0aW9uXG4gICAgICB2YXIgbGVuID0gZHJvcFRhcmdldC5jaGlsZHJlbi5sZW5ndGg7XG4gICAgICB2YXIgaTtcbiAgICAgIHZhciBlbDtcbiAgICAgIHZhciByZWN0O1xuICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGVsID0gZHJvcFRhcmdldC5jaGlsZHJlbltpXTtcbiAgICAgICAgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICBpZiAoaG9yaXpvbnRhbCAmJiByZWN0LmxlZnQgPiB4KSB7IHJldHVybiBlbDsgfVxuICAgICAgICBpZiAoIWhvcml6b250YWwgJiYgcmVjdC50b3AgPiB5KSB7IHJldHVybiBlbDsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5zaWRlICgpIHsgLy8gZmFzdGVyLCBidXQgb25seSBhdmFpbGFibGUgaWYgZHJvcHBlZCBpbnNpZGUgYSBjaGlsZCBlbGVtZW50XG4gICAgICB2YXIgcmVjdCA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGlmIChob3Jpem9udGFsKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHggPiByZWN0LmxlZnQgKyByZWN0LndpZHRoIC8gMik7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZSh5ID4gcmVjdC50b3AgKyByZWN0LmhlaWdodCAvIDIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc29sdmUgKGFmdGVyKSB7XG4gICAgICByZXR1cm4gYWZ0ZXIgPyBuZXh0RWwodGFyZ2V0KSA6IHRhcmdldDtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0T2Zmc2V0IChlbCkge1xuICB2YXIgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICByZXR1cm4ge1xuICAgIGxlZnQ6IHJlY3QubGVmdCArIGJvZHkuc2Nyb2xsTGVmdCxcbiAgICB0b3A6IHJlY3QudG9wICsgYm9keS5zY3JvbGxUb3BcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudEJlaGluZFBvaW50IChiZWhpbmQsIHgsIHkpIHtcbiAgaWYgKCF4ICYmICF5KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgdmFyIHN0YXRlID0gYmVoaW5kLmNsYXNzTmFtZTtcbiAgYmVoaW5kLmNsYXNzTmFtZSArPSAnIGd1LWhpZGUnO1xuICB2YXIgZWwgPSBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KHgsIHkpO1xuICBiZWhpbmQuY2xhc3NOYW1lID0gc3RhdGU7XG4gIHJldHVybiBlbDtcbn1cblxuZnVuY3Rpb24gYWx3YXlzICgpIHtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG5leHRFbCAoZWwpIHtcbiAgcmV0dXJuIGVsLm5leHRFbGVtZW50U2libGluZyB8fCBtYW51YWxseSgpO1xuICBmdW5jdGlvbiBtYW51YWxseSAoKSB7XG4gICAgdmFyIHNpYmxpbmcgPSBlbDtcbiAgICBkbyB7XG4gICAgICBzaWJsaW5nID0gc2libGluZy5uZXh0U2libGluZztcbiAgICB9IHdoaWxlIChzaWJsaW5nICYmIHNpYmxpbmcubm9kZVR5cGUgIT09IDEpO1xuICAgIHJldHVybiBzaWJsaW5nO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFkZENsYXNzIChlbCwgY2xhc3NOYW1lKSB7XG4gIGlmIChlbC5jbGFzc05hbWUuaW5kZXhPZignICcgKyBjbGFzc05hbWUpID09PSAtMSkge1xuICAgIGVsLmNsYXNzTmFtZSArPSAnICcgKyBjbGFzc05hbWU7XG4gIH1cbn1cblxuZnVuY3Rpb24gcm1DbGFzcyAoZWwsIGNsYXNzTmFtZSkge1xuICBlbC5jbGFzc05hbWUgPSBlbC5jbGFzc05hbWUucmVwbGFjZShuZXcgUmVnRXhwKCcgJyArIGNsYXNzTmFtZSwgJ2cnKSwgJycpO1xufVxuXG5mdW5jdGlvbiBnZXRDb29yZCAoY29vcmQsIGUpIHtcbiAgaWYgKHR5cGVvZiBlLnRhcmdldFRvdWNoZXMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGVbY29vcmRdO1xuICB9XG4gIHJldHVybiBlLnRhcmdldFRvdWNoZXMgJiYgZS50YXJnZXRUb3VjaGVzLmxlbmd0aCAmJiBlLnRhcmdldFRvdWNoZXNbMF1bY29vcmRdIHx8IDA7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZHJhZ3VsYTtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gdHJ1ZTtcbiAgICB2YXIgY3VycmVudFF1ZXVlO1xuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB2YXIgaSA9IC0xO1xuICAgICAgICB3aGlsZSAoKytpIDwgbGVuKSB7XG4gICAgICAgICAgICBjdXJyZW50UXVldWVbaV0oKTtcbiAgICAgICAgfVxuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG59XG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHF1ZXVlLnB1c2goZnVuKTtcbiAgICBpZiAoIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vc3JjL2NvbnRyYS5lbWl0dGVyLmpzJyk7XG4iLCIoZnVuY3Rpb24gKHJvb3QsIHVuZGVmaW5lZCkge1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHVuZGVmID0gJycgKyB1bmRlZmluZWQ7XG4gIGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4gIGZ1bmN0aW9uIGRlYm91bmNlIChmbiwgYXJncywgY3R4KSB7IGlmICghZm4pIHsgcmV0dXJuOyB9IHRpY2soZnVuY3Rpb24gcnVuICgpIHsgZm4uYXBwbHkoY3R4IHx8IG51bGwsIGFyZ3MgfHwgW10pOyB9KTsgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIHRpY2tlclxuICB2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuICBpZiAoc2kpIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldEltbWVkaWF0ZShmbik7IH07XG4gIH0gZWxzZSBpZiAodHlwZW9mIHByb2Nlc3MgIT09IHVuZGVmICYmIHByb2Nlc3MubmV4dFRpY2spIHtcbiAgICB0aWNrID0gcHJvY2Vzcy5uZXh0VGljaztcbiAgfSBlbHNlIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldFRpbWVvdXQoZm4sIDApOyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gX2VtaXR0ZXIgKHRoaW5nLCBvcHRpb25zKSB7XG4gICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBldnQgPSB7fTtcbiAgICBpZiAodGhpbmcgPT09IHVuZGVmaW5lZCkgeyB0aGluZyA9IHt9OyB9XG4gICAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICAgIGV2dFt0eXBlXSA9IFtmbl07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vbmNlID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgIGlmIChjID09PSAxKSB7XG4gICAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgICB9IGVsc2UgaWYgKGMgPT09IDApIHtcbiAgICAgICAgZXZ0ID0ge307XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gdGhpbmcuZW1pdHRlclNuYXBzaG90KGFyZ3Muc2hpZnQoKSkuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0dGVyU25hcHNob3QgPSBmdW5jdGlvbiAodHlwZSkge1xuICAgICAgdmFyIGV0ID0gKGV2dFt0eXBlXSB8fCBbXSkuc2xpY2UoMCk7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGN0eCA9IHRoaXMgfHwgdGhpbmc7XG4gICAgICAgIGlmICh0eXBlID09PSAnZXJyb3InICYmIG9wdHMudGhyb3dzICE9PSBmYWxzZSAmJiAhZXQubGVuZ3RoKSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgICAgZXZ0W3R5cGVdID0gZXQuZmlsdGVyKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgICByZXR1cm4gIWxpc3Rlbi5fb25jZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGluZztcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIGV4cG9ydFxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gdW5kZWYgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IF9lbWl0dGVyO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuY29udHJhID0gcm9vdC5jb250cmEgfHwge307XG4gICAgcm9vdC5jb250cmEuZW1pdHRlciA9IF9lbWl0dGVyO1xuICB9XG59KSh0aGlzKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGRvYyA9IGRvY3VtZW50O1xudmFyIGFkZEV2ZW50ID0gYWRkRXZlbnRFYXN5O1xudmFyIHJlbW92ZUV2ZW50ID0gcmVtb3ZlRXZlbnRFYXN5O1xudmFyIGhhcmRDYWNoZSA9IFtdO1xuXG5pZiAoIWdsb2JhbC5hZGRFdmVudExpc3RlbmVyKSB7XG4gIGFkZEV2ZW50ID0gYWRkRXZlbnRIYXJkO1xuICByZW1vdmVFdmVudCA9IHJlbW92ZUV2ZW50SGFyZDtcbn1cblxuZnVuY3Rpb24gYWRkRXZlbnRFYXN5IChlbCwgdHlwZSwgZm4sIGNhcHR1cmluZykge1xuICByZXR1cm4gZWwuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBmbiwgY2FwdHVyaW5nKTtcbn1cblxuZnVuY3Rpb24gYWRkRXZlbnRIYXJkIChlbCwgdHlwZSwgZm4pIHtcbiAgcmV0dXJuIGVsLmF0dGFjaEV2ZW50KCdvbicgKyB0eXBlLCB3cmFwKGVsLCB0eXBlLCBmbikpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEVhc3kgKGVsLCB0eXBlLCBmbiwgY2FwdHVyaW5nKSB7XG4gIHJldHVybiBlbC5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGZuLCBjYXB0dXJpbmcpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEhhcmQgKGVsLCB0eXBlLCBmbikge1xuICByZXR1cm4gZWwuZGV0YWNoRXZlbnQoJ29uJyArIHR5cGUsIHVud3JhcChlbCwgdHlwZSwgZm4pKTtcbn1cblxuZnVuY3Rpb24gZmFicmljYXRlRXZlbnQgKGVsLCB0eXBlKSB7XG4gIHZhciBlO1xuICBpZiAoZG9jLmNyZWF0ZUV2ZW50KSB7XG4gICAgZSA9IGRvYy5jcmVhdGVFdmVudCgnRXZlbnQnKTtcbiAgICBlLmluaXRFdmVudCh0eXBlLCB0cnVlLCB0cnVlKTtcbiAgICBlbC5kaXNwYXRjaEV2ZW50KGUpO1xuICB9IGVsc2UgaWYgKGRvYy5jcmVhdGVFdmVudE9iamVjdCkge1xuICAgIGUgPSBkb2MuY3JlYXRlRXZlbnRPYmplY3QoKTtcbiAgICBlbC5maXJlRXZlbnQoJ29uJyArIHR5cGUsIGUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBwZXJGYWN0b3J5IChlbCwgdHlwZSwgZm4pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHdyYXBwZXIgKG9yaWdpbmFsRXZlbnQpIHtcbiAgICB2YXIgZSA9IG9yaWdpbmFsRXZlbnQgfHwgZ2xvYmFsLmV2ZW50O1xuICAgIGUudGFyZ2V0ID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIGUucHJldmVudERlZmF1bHQgID0gZS5wcmV2ZW50RGVmYXVsdCAgfHwgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKCkgeyBlLnJldHVyblZhbHVlID0gZmFsc2U7IH07XG4gICAgZS5zdG9wUHJvcGFnYXRpb24gPSBlLnN0b3BQcm9wYWdhdGlvbiB8fCBmdW5jdGlvbiBzdG9wUHJvcGFnYXRpb24gKCkgeyBlLmNhbmNlbEJ1YmJsZSA9IHRydWU7IH07XG4gICAgZm4uY2FsbChlbCwgZSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHdyYXAgKGVsLCB0eXBlLCBmbikge1xuICB2YXIgd3JhcHBlciA9IHVud3JhcChlbCwgdHlwZSwgZm4pIHx8IHdyYXBwZXJGYWN0b3J5KGVsLCB0eXBlLCBmbik7XG4gIGhhcmRDYWNoZS5wdXNoKHtcbiAgICB3cmFwcGVyOiB3cmFwcGVyLFxuICAgIGVsZW1lbnQ6IGVsLFxuICAgIHR5cGU6IHR5cGUsXG4gICAgZm46IGZuXG4gIH0pO1xuICByZXR1cm4gd3JhcHBlcjtcbn1cblxuZnVuY3Rpb24gdW53cmFwIChlbCwgdHlwZSwgZm4pIHtcbiAgdmFyIGkgPSBmaW5kKGVsLCB0eXBlLCBmbik7XG4gIGlmIChpKSB7XG4gICAgdmFyIHdyYXBwZXIgPSBoYXJkQ2FjaGVbaV0ud3JhcHBlcjtcbiAgICBoYXJkQ2FjaGUuc3BsaWNlKGksIDEpOyAvLyBmcmVlIHVwIGEgdGFkIG9mIG1lbW9yeVxuICAgIHJldHVybiB3cmFwcGVyO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZpbmQgKGVsLCB0eXBlLCBmbikge1xuICB2YXIgaSwgaXRlbTtcbiAgZm9yIChpID0gMDsgaSA8IGhhcmRDYWNoZS5sZW5ndGg7IGkrKykge1xuICAgIGl0ZW0gPSBoYXJkQ2FjaGVbaV07XG4gICAgaWYgKGl0ZW0uZWxlbWVudCA9PT0gZWwgJiYgaXRlbS50eXBlID09PSB0eXBlICYmIGl0ZW0uZm4gPT09IGZuKSB7XG4gICAgICByZXR1cm4gaTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkRXZlbnQsXG4gIHJlbW92ZTogcmVtb3ZlRXZlbnQsXG4gIGZhYnJpY2F0ZTogZmFicmljYXRlRXZlbnRcbn07XG4iXX0=
