/* -*- Mode: js; js-indent-level: 2; -*- */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Source Map.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nick Fitzgerald <nfitzgerald@mozilla.com> (original author)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */
define(function (require, exports, module) {

  var options = require('./options');
  var fs = require('fs');
  var path = require('path');
  var ujs = require('uglify-js');

  function isFile(fullPath) {
    try {
      return fs.statSync(fullPath).isFile();
    }
    catch (ex) {
      return false;
    }
  }

  /**
   * Return the filename to be used for a require of `module` within `paths`.
   */
  function resolve (module, paths) {
    for ( var i = 0; i < paths.length; i++ ) {
      // TODO: text! requires
      if ( isFile(path.join(paths[i], module + '.js')) ) {
        return path.join(paths[i], module + '.js');
      }
    }
    return false;
  }

  /**
   * Build the dependency graph.
   */
  function buildDependencyGraph (module, paths, deps, cache) {
    deps = deps || {};

    var file = resolve(module, paths);
    if ( ! file ) {
      console.error('Couldn\'t find ' + module);
      process.exit(1);
    }

    try {
      var data = cache[module] = cache[module] || fs.readFileSync(file, 'utf8');
    } catch (e) {
      console.error('Could not open ' + file);
      console.error(e.stack)
      process.exit(1);
    }

    try {
      var ast = ujs.parser.parse(data);
    } catch (e) {
      console.error('Syntax error in ' + file);
    }

    deps[module] = [];
    var walkers = {
      call: function (expr, args) {
        if (expr[1] === 'require') {
          var arg0 = args[0];
          if (args[0][0] === 'string') {
            deps[module].push(args[0][1]);
          }
          else {
            console.error('Non-literal require inside ' + file);
            process.exit(1);
          }
        }
      }
    };

    var w = ujs.uglify.ast_walker();
    w.with_walkers(walkers, w.walk.bind(w, ast));

    deps[module].forEach(function (d) {
      if ( ! (d in deps) ) {
        if ( /^\./.test(d) ) {
          d = path.join(module.replace(path.basename(module), ''), d);
        }
        buildDependencyGraph(d, paths, deps, cache);
      }
    });

    return deps;
  }

  var topologicalSort = (function () {

    function modulesDependingOn(target, deps) {
      return Object.keys(deps).filter(function (m) {
        return deps[m].indexOf(target) >= 0;
      });
    }

    function hasNoDeps (m, deps) {
      return deps[m].length === 0;
    }

    return function (deps) {
      var sorted = [];
      var modulesWithNoDeps = Object.keys(deps).filter(function (m) {
        return hasNoDeps(m, deps);
      });

      var n;
      while ( modulesWithNoDeps.length > 0 ) {
        n = modulesWithNoDeps.pop();
        sorted.push(n);
        modulesDependingOn(n, deps).forEach(function (m) {
          deps[m] = deps[m].filter(function (o) {
            return o !== n;
          });
          if ( hasNoDeps(m, deps) ) {
            modulesWithNoDeps.push(m);
          }
        });
      }

      if ( ! Object.keys(deps).every(function (m) { return hasNoDeps(m, deps); }) ) {
        console.error('Circular dependencies detected');
        console.error(deps);
        process.exit(1);
      }

      return sorted;
    };

  }());

  function transform (modules, fileCache, opts) {
    var w = ujs.uglify.ast_walker();
    var walk = w.walk;

    return modules.map(function (m) {
      var ast = ujs.parser.parse(fileCache[m]);

      var walkers = {
        call: function (expr, args) {
          if (expr[0] === 'name' && expr[1] === 'define') {
            if (!(args.length === 1
                  && args[0][0] === 'function'
                  && args[0][2].length === 3
                  && args[0][2][0] === 'require'
                  && args[0][2][1] === 'exports'
                  && args[0][2][2] === 'module')) {
              throw new TypeError('Only support define(function (require, exports, module) {...});');
            }
            return ['assign', true,
                    ['dot', ['sub', ['name', '__MODULES'], ['string', m]], 'exports'],
                     ['binary', '||',
                      ['call', walk(args[0]),
                       [['name', 'null'],
                        ['dot',
                         ['sub', ['name', '__MODULES'], ['string', m]],
                         'exports'],
                        ['sub', ['name', '__MODULES'], ['string', m]]]],
                      ['dot', ['sub', ['name', '__MODULES'], ['string', m]], 'exports']]];
          } else if (expr[0] === 'name' && expr[1] === 'require') {
            if (args[0] && args[0][0] === "string") {
              return ['dot', ['sub', ['name', '__MODULES'], ['string', args[0][1]]], 'exports'];
            } else {
              throw new TypeError('Can only require string literals');
            }
          } else {
            return ['call', expr, args];
          }
        }
      };

      return '__MODULES["' + m + '"] = { exports: {} };\n'
        + ujs.uglify.gen_code(
          ujs.uglify.ast_mangle(
            ujs.uglify.ast_squeeze(
              w.with_walkers(walkers, walk.bind(w,ast))
            )
          ), {
            beautify: !!opts.beautify,
            indent_level: opts.beautify
          }
        );
    });
  }

  function run (cwd, argv) {
    var opts = options.parse(argv);
    var fileCache = {};
    var deps = buildDependencyGraph(opts.require, opts.paths, {}, fileCache);
    var sorted = topologicalSort(deps);
    var processed = transform(sorted, fileCache, opts);
    process.stdout.write(opts.prefix);
    process.stdout.write('\nvar __MODULES = {};\n');
    process.stdout.write(processed.join('\n') + '\n');
    process.stdout.write(opts.suffix
                           .replace(/\{\{ REQUIRE \}\}/g,
                                    '__MODULES["' + opts.require + '"].exports')
                           .replace(/\{\{ MODULE \}\}/,
                                    opts.require));
  };
  exports.run = run;

});
