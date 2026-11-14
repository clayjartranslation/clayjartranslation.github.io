/* Shows the devotional subscribe form only when js/devotional-email-config.js
   has a form address and a list id. The form posts to Brevo’s hosted
   double opt-in form. This file does not load Brevo, Google, or any other
   outside script. While the config is empty, the form stays hidden. */
(function (factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.mount();
})(function () {
  'use strict';

  function ready(cfg) {
    var c = cfg || {};
    var action = String(c.formAction || '').trim();
    var listId = String(c.listId == null ? '' : c.listId).trim();
    if (!action || !listId) return null;
    if (!/^https:\/\//i.test(action)) return null;
    if (!/^[1-9]\d*$/.test(listId)) return null;
    return { formAction: action, listId: listId };
  }


  function detectTimeZone() {
    try {
      return (Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim();
    } catch (e) {
      return '';
    }
  }

  function fillTimeZone(root, timeZone) {
    var tz = timeZone == null ? detectTimeZone() : String(timeZone || '');
    var scope = root || document;
    var forms = scope.querySelectorAll('form[data-devotional-email-form]');
    Array.prototype.forEach.call(forms, function (form) {
      var input = form.querySelector('input[name="TIMEZONE"]');
      if (!input) {
        input = scope.createElement ? scope.createElement('input') : document.createElement('input');
        input.type = 'hidden';
        input.name = 'TIMEZONE';
        form.appendChild(input);
      }
      input.value = tz;
    });
    return tz;
  }

  function apply(root, cfg) {
    var scope = root || document;
    var on = ready(cfg);
    var blocks = scope.querySelectorAll('[data-devotional-email]');
    Array.prototype.forEach.call(blocks, function (block) {
      var form = block.querySelector('form');
      if (!on) {
        block.hidden = true;
        if (form) form.setAttribute('action', '');
        return;
      }
      if (form) form.setAttribute('action', on.formAction);
      fillTimeZone(block);
      block.hidden = false;
    });
    return blocks.length;
  }

  function mount() {
    function paint() {
      apply(document, window.CJT_DEVOTIONAL_EMAIL || {});
    }
    paint();
    var prev = window.CJT_AFTER_ROUTE;
    window.CJT_AFTER_ROUTE = function () {
      if (typeof prev === 'function') {
        try { prev(); } catch (e) {}
      }
      paint();
    };
  }

  return { ready: ready, apply: apply, mount: mount, detectTimeZone: detectTimeZone, fillTimeZone: fillTimeZone };
});
