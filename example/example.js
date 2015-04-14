'use strict';

dragula([left1, right1]);
dragula([left2, right2], { copy: true });
dragula([left3, right3]).on('drag', function (el) {
  el.className = el.className.replace(' ex-moved', '');
}).on('drop', function (el) {
  setTimeout(function () {
    el.className += ' ex-moved';
  }, 0);
});
dragula([left4, right4], { revertOnSpill: true });
dragula([single1], { removeOnSpill: true });
