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

  var flags = [];
  var defineFlag = flags.push.bind(flags);

  defineFlag({
    short: '-p',
    long: '--prefix',
    usage: 'The prefix before the generated code',
    defaultValue: '(function (__GLOBAL) {',
    target: 'prefix',
    parser: function (arg) {
      return arg;
    }
  });

  defineFlag({
    short: '-s',
    long: '--suffix',
    usage: 'The suffix after the generated code. "{{ REQUIRE }}" will be replaced by the\n'
      + '\t\t\trequired module, "{{ MODULE }}" by the module name.',
    defaultValue: '__GLOBAL["{{ MODULE }}"] = {{ REQUIRE }};\n}(this));',
    target: 'suffix',
    parser: function (arg) {
      return arg;
    }
  });

  defineFlag({
    short: '-P',
    long: '--paths',
    usage: 'Specify paths to be searched for modules. Separate with colons.',
    target: 'paths',
    defaultValue: '.:./lib:./node_modules',
    parser: function (arg) {
      return arg.split(':');
    },
  });

  defineFlag({
    short: '-b',
    long: '--beautify',
    usage: 'If specified, will not minify the output JS, and will indent to the value\n'
      + '\t\tgiven.',
    target: 'beautify',
    defaultValue: false,
    parser: function (arg) {
      return parseInt(arg, 10);
    },
  });

  function createDefaults () {
    return flags.reduce(function (opts, f) {
      if ( f.defaultValue ) {
        opts[f.target] = f.defaultValue;
      }
      return opts;
    }, {});
  }

  function usage () {
    console.log('usage: kahn [options] <module>');
    console.log('options:');
    console.log(flags.map(function (f) {
      return '\t' + f.short + ', ' + f.long + '\t' + f.usage
        + (f.defaultValue
           ? '\n\n\t\t\tDefaults to "' + f.defaultValue.replace(/\n/, '\\n') + '"\n'
           : '\n');
    }).join('\n'));
    process.exit(1);
  }

  function parse (argv) {
    var opts = createDefaults();
    opts.require = argv.pop();

    if ( opts.require === '--help' ) {
      usage();
    }

    var flag;
    for ( var i = 0; i < argv.length; i++ ) {
      flag = null;
      for ( var j = 0; j < flags.length; j++ ) {
        if ( argv[i] === flags[j].short || argv[i] === flags[j].long ) {
          flag = flags[j];
          break;
        }
      }
      if ( ! flag ) {
        usage();
      } else {
        opts[flag.target] = flag.parser(argv[++i]);
      }
    }

    return opts;
  }

  exports.parse = parse;

});
