'use strict';

var test = require('tape');
var dragula = require('..');

test('drake can be instantiated without throwing', function (t) {
  t.doesNotThrow(function () {
    dragula();
  }, 'calling dragula() without arguments does not throw');
  t.end();
});
