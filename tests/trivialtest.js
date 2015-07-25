'use strict';

var test = require('tape');
var dragula = require('../dragula');


test('test that dragula is a function', function (t) {
  t.equal(typeof dragula, 'function');
  t.end();
});
