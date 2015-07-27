'use strict';

var test = require('tape');
var dragula = require('..');

test('drake has sensible default options', function (t) {
  var options = {};
  dragula(options);
  t.equal(typeof options.moves, 'function', 'options.moves defaults to a method');
  t.equal(typeof options.accepts, 'function', 'options.accepts defaults to a method');
  t.equal(typeof options.invalid, 'function', 'options.invalid defaults to a method');
  t.equal(typeof options.isContainer, 'function', 'options.isContainer defaults to a method');
  t.equal(options.copy, false, 'options.copy defaults to false');
  t.equal(options.revertOnSpill, false, 'options.revertOnSpill defaults to false');
  t.equal(options.removeOnSpill, false, 'options.removeOnSpill defaults to false');
  t.equal(options.delay, false, 'options.delay defaults to false');
  t.equal(options.direction, 'vertical', 'options.direction defaults to \'vertical\'');
  t.end();
});

test('delay: true means 300ms', function (t) {
  var options = { delay: true };
  dragula(options);
  t.equal(options.delay, 300, 'options.delay=true gets casted to 300');
  t.end();
});
