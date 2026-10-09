import escape from 'lodash/escape';
import unescape from 'lodash/unescape';

export function getDropClass ({ type, key }) {
  let dropClass = '';

  if (type) {
    switch (type) {
      case 'Egg':
        dropClass = `Pet_Egg_${key}`;
        break;
      case 'HatchingPotion':
        dropClass = `Pet_HatchingPotion_${key}`;
        break;
      case 'Food':
      case 'food':
        dropClass = `Pet_Food_${key}`;
        break;
      case 'armor':
      case 'back':
      case 'body':
      case 'eyewear':
      case 'head':
      case 'headAccessory':
      case 'shield':
      case 'weapon':
      case 'gear':
        dropClass = `shop_${key}`;
        break;
      default:
        dropClass = 'glyphicon glyphicon-gift';
    }
  }

  return dropClass;
}

export function getSign (number) {
  let sign = '+';

  if (number && number < 0) {
    sign = '-';
  }

  return sign;
}

export function round (number, nDigits) {
  return Math.abs(number.toFixed(nDigits || 0));
}

export function getXPMessage (val) {
  return `${getSign(val)} ${round(val)}`;
}

// Group task notification messages are built on the server from HTML templates and
// rendered with v-html. Newer messages have the task text escaped, older ones do not:
// normalize to the unescaped text, escape everything and only restore the plain
// <span class="notification-..."> wrappers used by the templates.
export function sanitizeTaskMessage (message) {
  if (typeof message !== 'string') return '';

  return escape(unescape(message))
    .replace(/&lt;span class=&quot;(notification-[a-z-]+)&quot;&gt;/g, '<span class="$1">')
    .replace(/&lt;\/span&gt;/g, '</span>');
}
