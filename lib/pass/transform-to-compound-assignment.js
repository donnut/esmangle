/*
  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/*jslint bitwise:true */
/*global esmangle:true, module:true, define:true, require:true*/
(function (factory, global) {
    'use strict';

    var ex;

    function namespace(str, obj) {
        var i, iz, names, name;
        names = str.split('.');
        for (i = 0, iz = names.length; i < iz; ++i) {
            name = names[i];
            if (obj.hasOwnProperty(name)) {
                obj = obj[name];
            } else {
                obj = (obj[name] = {});
            }
        }
        return obj;
    }

    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
    // and plain browser loading,
    if (typeof define === 'function' && define.amd) {
        define('esmangle/pass/transform-to-compound-assignment', ['module', 'esmangle/common', 'escope'], function(module, common, escope) {
            module.exports = factory(common, escope);
        });
    } else if (typeof module !== 'undefined') {
        module.exports = factory(require('../common'), require('escope'));
    } else {
        namespace('esmangle.pass', global).transformToCompoundAssignment = factory(namespace('esmangle.common', global), namespace('escope', global));
    }
}(function (common, escope) {
    'use strict';

    var Syntax, scope, modified;

    Syntax = common.Syntax;

    function equals(lhs, rhs) {
        if (lhs.type !== rhs.type) {
            return false;
        }
        if (lhs.type === Syntax.Identifier) {
            return lhs.name === rhs.name;
        }
        return false;
    }

    function compound(operator) {
        switch (operator) {
            case '*':
            case '/':
            case '%':
            case '+':
            case '-':
            case '<<':
            case '>>':
            case '>>>':
            case '&':
            case '^':
            case '|':
                return operator + '=';
        }
        return null;
    }

    function observableCompound(operator) {
        switch (operator) {
            case '*=':
            case '/=':
            case '%=':
            case '+=':
            case '-=':
            case '<<=':
            case '>>=':
            case '>>>=':
            case '&=':
            case '^=':
            case '|=':
                return operator;
        }
        return null;
    }

    function transformToCompoundAssignment(tree, options) {
        var result, scope, manager;

        if (options == null) {
            options = { destructive: false };
        }

        result = (options.destructive) ? tree : common.deepCopy(tree);
        modified = false;
        scope = null;

        manager = escope.analyze(result);
        manager.attach();

        common.traverse(result, {
            enter: function enter(node) {
                var left, right, operator, ref;
                scope = manager.acquire(node) || scope;
                if (node.type === Syntax.AssignmentExpression && node.operator === '=') {
                    left = node.left;
                    right = node.right;
                    if (right.type === Syntax.BinaryExpression && equals(right.left, left)) {
                        operator = compound(right.operator);
                        if (operator) {
                            modified = true;
                            node.operator = operator;
                            node.right = right.right;
                        }
                    } else if (right.type === Syntax.AssignmentExpression && equals(right.left, left)) {
                        if (observableCompound(right.operator)) {
                            ref = scope.resolve(node.left);
                            if (ref.isStatic()) {
                                modified = true;
                                node.operator = right.operator;
                                node.right = right.right;
                            }
                        }
                    }
                }
            },
            leave: function leave(node) {
                scope = manager.release(node) || scope;
            }
        });

        manager.detach();

        return {
            result: result,
            modified: modified
        };
    }

    transformToCompoundAssignment.passName = 'transform-to-compound-assignment';
    return transformToCompoundAssignment;
}, this));
/* vim: set sw=4 ts=4 et tw=80 : */
