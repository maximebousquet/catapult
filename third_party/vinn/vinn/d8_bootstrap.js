// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Boostrap for loading javascript/html files using d8_runner.
 */
(function(global, v8arguments) {

  global.isVinn = true;

  // Save the argv in a predictable and stable location.
  global.sys = {
    argv: []
  };
  for (var i = 0; i < v8arguments.length; i++)
    sys.argv.push(v8arguments[i]);

  /* There are four ways a program can finish running in D8:
   * - a) Intentioned exit triggered via quit(0)
   * - b) Intentioned exit triggered via quit(n)
   * - c) Running to end of the script
   * - d) An uncaught exception
   *
   * The exit code of d8 for case a is 0.
   * The exit code of d8 for case b is unsigned(n) & 0xFF
   * The exit code of d8 for case c is 0.
   * The exit code of d8 for case d is 1.
   *
   * D8 runner needs to distinguish between these cases:
   * - a) _ExecuteFileWithD8 should return 0
   * - b) _ExecuteFileWithD8 should return n
   * - c) _ExecuteFileWithD8 should return 0
   * - d) _ExecuteFileWithD8 should raise an Exception
   *
   * The hard one here is d and b with n=1, because they fight for the same
   * return code.
   *
   * Our solution is to monkeypatch quit() s.t. quit(1) becomes exitcode=2.
   * This makes quit(255) disallowed, but it ensures that D8 runner is able
   * to handle the other cases correctly.
   */
  var realQuit = global.quit;
  global.quit = function(exitCode) {
    // Normalize the exit code.
    if (exitCode < 0) {
      exitCode = (exitCode % 256) + 256;
    } else {
      exitCode = exitCode % 256;
    }

    // 255 is reserved due to reasons noted above.
    if (exitCode == 255)
      throw new Error('exitCodes 255 is reserved, sorry.');
    if (exitCode === 0)
      realQuit(0);
    realQuit(exitCode + 1);
  }

  /**
   * Polyfills console's methods.
   */
  var _timeStamps = new Map();
  global.console = {
    log: function() {
      var args = Array.prototype.slice.call(arguments);
      print(args.join(' '));
    },

    info: function() {
      var args = Array.prototype.slice.call(arguments);
      print('Info:', args.join(' '));
    },

    error: function() {
      var args = Array.prototype.slice.call(arguments);
      print('Error:', args.join(' '));
    },

    warn: function() {
      var args = Array.prototype.slice.call(arguments);
      print('Warning:', args.join(' '));
    },

    time: function(timerName) {
      _timeStamps.set(timerName, performance.now());
    },

    timeEnd: function(timerName) {
      var t = _timeStamps.get(timerName);
      _timeStamps.delete(timerName);
      if (!t)
        throw new Error('No such timer name: ' + timerName);
      var duration = performance.now() - t;
      print(timerName + ':', duration + 'ms');
    }
  };

  if (os.chdir) {
    os.chdir = function() {
      throw new Error('Dont do this');
    }
  }

  /* This is a Base64 Polyfill adapted from
   * https://github.com/davidchambers/Base64.js/blob/0.3.0/,
   * which has a "do whatever you want" license,
   * https://github.com/davidchambers/Base64.js/blob/0.3.0/LICENSE.
   */
  (function() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
        '0123456789+/=';

    function InvalidCharacterError(message) {
      this.message = message;
    }
    InvalidCharacterError.prototype = new Error;
    InvalidCharacterError.prototype.name = 'InvalidCharacterError';


    // encoder
    // [https://gist.github.com/999166] by [https://github.com/nignag]
    global.btoa = function(input) {
      var str = String(input);
      for (
          // Initialize result and counter.
          var block, charCode, idx = 0, map = chars, output = '';
          // If the next str index does not exist:
          //   change the mapping table to "="
          //   check if d has no fractional digits
          str.charAt(idx | 0) || (map = '=', idx % 1);
          // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8.
          output += map.charAt(63 & block >> 8 - idx % 1 * 8)) {
        charCode = str.charCodeAt(idx += 3 / 4);
        if (charCode > 0xFF) {
          throw new InvalidCharacterError(
              '\'btoa\' failed: The string to be encoded contains characters ' +
              'outside of the Latin1 range.');
        }
        block = block << 8 | charCode;
      }
      return output;
    };

    // decoder
    // [https://gist.github.com/1020396] by [https://github.com/atk]
    global.atob = function(input) {
      var str = String(input).replace(/=+$/, '');
      if (str.length % 4 == 1) {
        throw new InvalidCharacterError(
            '\'atob\' failed: The string to be decoded is not ' +
            'correctly encoded.');
      }
      for (
          // Initialize result and counters.
          var bc = 0, bs, buffer, idx = 0, output = '';
          // Get next character.
          buffer = str.charAt(idx++);
          // Character found in table? initialize bit storage and add its
          // ascii value;
          ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
              // And if not first of each 4 characters,
              // convert the first 8 bits to one ascii character.
              bc++ % 4) ? output += String.fromCharCode(
                    255 & bs >> (-2 * bc & 6)) : 0) {
        // Try to find character in table (0-63, not found => -1).
        buffer = chars.indexOf(buffer);
      }
      return output;
    };

  })();


  // We deliberately call eval() on content of parse5.js instead of using load()
  // because load() does not hoist the |global| variable in this method to
  // parse5.js (which export its modules to |global|).
  //
  // This is because d8's load('xyz.js') does not hoist non global varibles in
  // the caller's environment to xyz.js, no matter where load() is called.
  global.path_to_js_parser = '<%js_parser_path%>';
  eval(read(global.path_to_js_parser));

  // Bring in html_to_js_generator.
  global.path_to_js_parser = '<%js_parser_path%>';
  load('<%html_to_js_generator_js_path%>');

  // Bring in html imports loader.
  load('<%html_imports_loader_js_path%>');
  global.HTMLImportsLoader.addArrayToSourcePath(JSON.parse('<%source_paths%>'));

  // Bring in path utils.
  load('<%path_utils_js_path%>');
  var pathUtils = new PathUtils(
      {
        currentWorkingDirectory: '<%current_working_directory%>',
        exists: function(fileName) {
          try {
            // Try a dummy read to check whether file_path exists.
            // TODO(nednguyen): find a more efficient way to check whether
            // some file path exists in d8.
            read(fileName);
            return true;
          } catch (err) {
            return false;
          }
        }
      });
  global.HTMLImportsLoader.setPathUtils(pathUtils);

})(this, arguments);
