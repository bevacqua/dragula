'use strict';
var browserProps = {};

function eachVendor(prop, fn) {
  var prefixes = ['Webkit', 'Moz', 'ms', 'O'];
  var i = 0;
  var l = prefixes.length;
  fn(prop);
  for (; i < l; i++) {
    fn(prefixes[i] + prop.charAt(0).toUpperCase() + prop.slice(1));
  }
}

function check(property, testValue) {
  var sandbox = document.createElement('iframe');
  var el = document.createElement('p');
  var support;

  document.body.appendChild(sandbox);
  sandbox.contentDocument.body.appendChild(el);
  support = set(el, property, testValue);
  sandbox.remove();

  return support;
}

function checkComputed(el, prop) {
  var computed = window.getComputedStyle(el).getPropertyValue(prop);
  return ((computed !== void 0) && computed.length > 0 && computed !== 'none');
}

function set(el, prop, value) {
  var match = false;
  if (browserProps[prop] === void 0) {
    eachVendor(prop, function(vendorProp) {
      if (el.style[vendorProp] !== void 0 && match === false) {
        el.style[vendorProp] = value;
        if (checkComputed(el, vendorProp)) {
          match = true;
          browserProps[prop] = vendorProp;
        }
      }
    });
  } else {
    el.style[browserProps[prop]] = value;
    return true;
  }
  return match;
}

module.exports = {
  check: check,
  set: set
};
