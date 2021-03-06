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
        define('esmangle/pass/remove-side-effect-free-expressions', ['module', 'esmangle/common', 'escope'], function(module, common, escope) {
            module.exports = factory(common, escope);
        });
    } else if (typeof module !== 'undefined') {
        module.exports = factory(require('../common'), require('escope'));
    } else {
        namespace('esmangle.pass', global).removeSideEffectFreeExpressions = factory(namespace('esmangle.common', global), namespace('escope', global));
    }
}(function (common, escope) {
    'use strict';

    var Syntax, modified;

    Syntax = common.Syntax;

    function reduce(node, scope, directCall, isResultNeeded) {
        var i, iz, expr, result, ref, prev;

        common.assert(node.expressions.length > 1, 'expressions should be more than one');

        result = [];
        for (i = 0, iz = node.expressions.length; i < iz; ++i) {
            prev = expr;
            expr = node.expressions[i];
            if (((i + 1) !== iz) || !isResultNeeded) {
                if (expr.type === Syntax.Literal) {
                    continue;
                }

                if (expr.type === Syntax.Identifier) {
                    ref = scope.resolve(expr);
                    if (ref && ref.isStatic()) {
                        continue;
                    }
                }

                if (common.SpecialNode.isUndefined(expr) || common.SpecialNode.isNaN(expr) || common.SpecialNode.isNegative(expr)) {
                    continue;
                }
            }
            result.push(expr);
        }

        if (!isResultNeeded && result.length === 0) {
            modified = true;
            return expr;
        }

        common.assert(result.length > 0, 'result should be more than zero');

        // not changed
        do {
            if (iz === result.length) {
                return node;
            }

            if (result.length === 1) {
                // direct call to eval check
                if (directCall) {
                    if (result[0].type === Syntax.Identifier && result[0].name === 'eval') {
                        // This becomes direct call to eval.
                        result.unshift(prev);
                        continue;
                    }
                }
                modified = true;
                return result[0];
            }
            modified = true;
            node.expressions = result;
            return node;
        } while (true);
    }

    function isResultNeeded(parent, scope) {
        if (parent.type === Syntax.ExpressionStatement && scope.type !== 'global') {
            return false;
        }
        return true;
    }

    function removeSideEffectFreeExpressions(tree, options) {
        var result, scope, manager;

        if (options == null) {
            options = { destructive: false };
        }

        result = (options.destructive) ? tree : common.deepCopy(tree);
        modified = false;
        scope = null;
        manager = escope.analyze(result);

        result = common.replace(result, {
            enter: function enter(node, parent) {
                var res, ref, expr;

                res = node;
                scope = manager.acquire(node) || scope;
                if (res.type === Syntax.SequenceExpression) {
                    res = reduce(res, scope, parent.type === Syntax.CallExpression, isResultNeeded(parent, scope));
                }

                // Because eval code should return last evaluated value in
                // ExpressionStatement, we should not remove.
                if (!isResultNeeded(res, scope)) {
                    expr = res.expression;
                    switch (expr.type) {
                    // TODO(Constellation)
                    // After directive problem is solved, we should insert
                    // directive check.
                    case Syntax.Literal:
                        if (typeof expr.value !== 'string') {
                            modified = true;
                            return common.moveLocation(res, {
                                type: Syntax.EmptyStatement
                            });
                        }
                        break;

                    case Syntax.Identifier:
                        ref = scope.resolve(expr);
                        if (ref && ref.isStatic()) {
                            modified = true;
                            return common.moveLocation(res, {
                                type: Syntax.EmptyStatement
                            });
                        }
                        break;
                    default:
                        if (common.SpecialNode.isUndefined(expr) || common.SpecialNode.isNaN(expr) || common.SpecialNode.isNegative(expr)) {
                            modified = true;
                            return common.moveLocation(res, {
                                type: Syntax.EmptyStatement
                            });
                        }
                    }
                }
                return res;
            },
            leave: function leave(node) {
                scope = manager.release(node) || scope;
            }
        });

        return {
            result: result,
            modified: modified
        };
    }

    removeSideEffectFreeExpressions.passName = 'remove-side-effect-free-expressions';
    return removeSideEffectFreeExpressions;
}, this));
/* vim: set sw=4 ts=4 et tw=80 : */
