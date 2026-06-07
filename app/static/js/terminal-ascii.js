// ── Rugram Terminal — ASCII Art from Image (Canvas) ──
(function(T) {
  'use strict';

  T.asciiCache = {};
  T.asciiSymbols = '@%#*+=-:. ';
  T.DEFAULT_AVATAR_URL = '/static/default-profile.png';

  // ── Pre-cache default avatar in advance ──
  (function preloadDefaultAvatar() {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var maxWidth = 22;
      var ratio = Math.min(maxWidth / img.width, 1);
      canvas.width = Math.floor(img.width * ratio);
      canvas.height = Math.floor(img.height * ratio * 0.55);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var data = imgData.data;
      var result = '<pre class="tp-ascii-img">';
      for (var y = 0; y < canvas.height; y++) {
        for (var x = 0; x < canvas.width; x++) {
          var i = (y * canvas.width + x) * 4;
          var ri = data[i], gi = data[i+1], bi = data[i+2];
          var gray = (ri + gi + bi) / 3;
          var symIdx = Math.floor(gray / 255 * (T.asciiSymbols.length - 1));
          var ch = T.asciiSymbols[symIdx];
          if (ch === ' ') ch = '&nbsp;';
          result += '<span style="color:rgb(' + ri + ',' + gi + ',' + bi + ')">' + ch + '</span>';
        }
        result += '\n';
      }
      result += '</pre>';
      T.asciiCache[T.DEFAULT_AVATAR_URL] = result;
    };
    img.src = T.DEFAULT_AVATAR_URL;
  })();

  // ── Image to ASCII ──
  T.imageToAscii = function(imgSrc, maxWidth, callback) {
    if (T.asciiCache[imgSrc]) {
      callback(T.asciiCache[imgSrc]);
      return;
    }

    var img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function() {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');

      var w = img.width;
      var h = img.height;
      var ratio = Math.min(maxWidth / w, 1);
      canvas.width = Math.floor(w * ratio);
      canvas.height = Math.floor(h * ratio * 0.55);

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var data = imgData.data;

      var result = '<pre class="tp-ascii-img">';
      for (var y = 0; y < canvas.height; y++) {
        for (var x = 0; x < canvas.width; x++) {
          var i = (y * canvas.width + x) * 4;
          var ri = data[i], gi = data[i+1], bi = data[i+2];
          var gray = (ri + gi + bi) / 3;
          var symIdx = Math.floor(gray / 255 * (T.asciiSymbols.length - 1));
          var ch = T.asciiSymbols[symIdx];
          if (ch === ' ') ch = '&nbsp;';
          result += '<span style="color:rgb(' + ri + ',' + gi + ',' + bi + ')">' + ch + '</span>';
        }
        result += '\n';
      }
      result += '</pre>';

      T.asciiCache[imgSrc] = result;
      callback(result);
    };

    img.onerror = function() {
      callback('<span class="tp-muted">[image load error]</span>');
    };

    img.src = imgSrc;
  };

})(window.__RT);
