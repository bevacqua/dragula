'use strict';

var test = require('tape');
var events = require('./lib/events');
var dragula = require('..');

test('with normal DOM', function(t) {
  domTests(t, document.body);
  t.end();
});

test('with nested shadow DOM', function(t) {
  var div = document.createElement('div');
  var div2 = document.createElement('div');
  div.createShadowRoot();
  div2.createShadowRoot();
  div.shadowRoot.appendChild(div2);
  document.body.appendChild(div);

  domTests(t, div2.shadowRoot);
  t.end();
});

test('remove does not throw when not dragging', function (t) {
  t.test('a single time', function once (st) {
    var drake = dragula();
    st.doesNotThrow(function () {
      drake.remove();
    }, 'dragula ignores a single call to drake.remove');
    st.end();
  });
  t.test('multiple times', function once (st) {
    var drake = dragula();
    st.doesNotThrow(function () {
      drake.remove();
      drake.remove();
      drake.remove();
      drake.remove();
    }, 'dragula ignores multiple calls to drake.remove');
    st.end();
  });
  t.end();
});

function domTests(t, root) {

  t.test('when dragging and remove gets called, element is removed', function (t) {
    var div = document.createElement('div');
    var item = document.createElement('div');
    var drake = dragula([div]);
    div.appendChild(item);
    root.appendChild(div);
    drake.start(item);
    drake.remove();
    t.equal(div.children.length, 0, 'item got removed from container');
    t.equal(drake.dragging, false, 'drake has stopped dragging');
    t.end();
  });

  t.test('when dragging and remove gets called, remove event is emitted', function (t) {
    var div = document.createElement('div');
    var item = document.createElement('div');
    var drake = dragula([div]);
    div.appendChild(item);
    root.appendChild(div);
    drake.start(item);
    drake.on('remove', remove);
    drake.on('dragend', dragend);
    drake.remove();
    t.plan(3);
    t.end();
    function dragend () {
      t.pass('dragend got called');
    }
    function remove (target, container) {
      t.equal(target, item, 'remove was invoked with item');
      t.equal(container, div, 'remove was invoked with container');
    }
  });

  t.test('when dragging a copy and remove gets called, cancel event is emitted', function (t) {
    var div = document.createElement('div');
    var item = document.createElement('div');
    var drake = dragula([div], { copy: true });
    div.appendChild(item);
    root.appendChild(div);
    events.raise(item, 'mousedown', { which: 1 });
    events.raise(item, 'mousemove', { which: 1 });
    drake.on('cancel', cancel);
    drake.on('dragend', dragend);
    drake.remove();
    t.plan(4);
    t.end();
    function dragend () {
      t.pass('dragend got called');
    }
    function cancel (target, container) {
      t.equal(target.className, 'gu-transit', 'cancel was invoked with item');
      t.notEqual(target, item, 'item is a copy and not the original');
      t.equal(container, undefined, 'cancel was invoked with container');
    }
  });
}
