'use strict';

dragula([$('left1'), $('right1')]);
dragula([$('left2'), $('right2')], { copy: true });
dragula([$('left3'), $('right3')])
  .on('drag', function (el) {
    el.className = el.className.replace('ex-moved', '');
  }).on('drop', function (el) {
    el.className += ' ex-moved';
  }).on('over', function (el, container) {
    container.className += ' ex-over';
  }).on('out', function (el, container) {
    container.className = container.className.replace('ex-over', '');
  });
dragula([$('left4'), $('right4')], { revertOnSpill: true });
dragula([$('left5'), $('right5')], {
  moves: function (el, container, handle) {
    return handle.className === 'handle';
  }
});

var single2 = $('single2');

dragula([$('single1')], { removeOnSpill: true });
dragula({ containers: [single2], delay: 200 });

if (single2.addEventListener) {
  single2.addEventListener('click', clickHandler, false);
} else {
  single2.attachEvent('onclick', clickHandler);
}

function clickHandler (e) {
  if (e.target === this) {
    return;
  }
  var target = e.target || e.srcElement;

  target.innerHTML += ' [click!]';

  setTimeout(function () {
    target.innerHTML = target.innerHTML.replace(/ \[click!\]/g, '');
  }, 500);
}

function $ (id) {
  return document.getElementById(id);
}
