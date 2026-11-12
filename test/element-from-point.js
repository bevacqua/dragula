'use strict';

var test = require('tape');
var events = require('./lib/events');
var dragula = require('..');

test('mousemove does not throw when elementFromPoint returns null', function (t) {
  var div = document.createElement('div');
  var item = document.createElement('div');
  div.appendChild(item);
  document.body.appendChild(div);
  var drake = dragula([div]);
  var original = document.elementFromPoint;
  document.elementFromPoint = function () { return null; };
  t.doesNotThrow(function () {
    events.raise(item, 'mousedown', { which: 1, clientX: 0, clientY: 0 });
    events.raise(item, 'mousemove', { which: 1, clientX: 50, clientY: 50 });
  }, 'ignoreInputTextSelection path should tolerate a null elementFromPoint result');
  t.doesNotThrow(function () {
    events.raise(item, 'mousemove', { which: 1, clientX: -1, clientY: -1 });
  }, 'drag path should tolerate a null elementFromPoint result');
  document.elementFromPoint = original;
  drake.destroy();
  document.body.removeChild(div);
  t.end();
});
