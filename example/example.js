'use strict';

var crossvent = require('crossvent');

dragula([$('left1'), $('right1')]);
dragula([$('left2'), $('right2')], { copy: true });
dragula([$('left3'), $('right3')])
  .on('drag', function (el) {
    el.className = el.className.replace('ex-moved', '');
  })
  .on('drop', function (el) {
    el.className += ' ex-moved';
  })
  .on('over', function (el, container) {
    container.className += ' ex-over';
  })
  .on('out', function (el, container) {
    container.className = container.className.replace('ex-over', '');
  });
dragula([$('left4'), $('right4')], { revertOnSpill: true });
dragula([$('left5'), $('right5')], {
  moves: function (el, container, handle) {
    return handle.className === 'handle';
  }
});

dragula([$('left6'), $('right6')], { removeOnSpill: true });

var single1 = $('single1');

dragula([single1]);

crossvent.add(single1, 'click', clickHandler);

function clickHandler (e) {
  var target = e.target;
  if (target === single1) {
    return;
  }
  target.innerHTML += ' [click!]';

  setTimeout(function () {
    target.innerHTML = target.innerHTML.replace(/ \[click!\]/g, '');
  }, 500);
}

function $ (id) {
  return document.getElementById(id);
}
