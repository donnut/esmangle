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
        define('esmangle/pass/tree-based-constant-folding', ['module', 'esmangle/common'], function(module, common) {
            module.exports = factory(common);
        });
    } else if (typeof module !== 'undefined') {
        module.exports = factory(require('../common'));
    } else {
        namespace('esmangle.pass', global).foldConstants = factory(namespace('esmangle.common', global));
    }
}(function (common) {
    'use strict';

    var Syntax, modified;

    Syntax = common.Syntax;

    function isConstant(node, allowRegExp) {
        if (node.type === Syntax.Literal) {
            if (typeof node.value === 'object' && node.value !== null) {
                // This is RegExp
                return allowRegExp;
            }
            return true;
        }
        if (node.type === Syntax.UnaryExpression) {
            if (node.operator === 'void' || node.operator === 'delete' || node.operator === '!' || node.operator === 'typeof') {
                return isConstant(node.argument, true);
            }
            return isConstant(node.argument, false);
        }
        if (node.type === Syntax.BinaryExpression) {
            if (node.operator === 'in' || node.operator === 'instanceof') {
                return false;
            }
            return isConstant(node.left, false) && isConstant(node.right, false);
        }
        if (node.type === Syntax.LogicalExpression) {
            return isConstant(node.left, true) && isConstant(node.right, true);
        }
        return false;
    }

    function isModifiedConstant(node) {
        // consider
        //   (undefined) `void 0`
        //   (negative value) `-1`,
        //   (NaN) `0/0`
        //   (Infinity) `1/0`
        //   (-Infinity) `-1/0`
        if (common.SpecialNode.isUndefined(node)) {
            return false;
        }
        if (common.SpecialNode.isNegative(node)) {
            return false;
        }
        if (common.SpecialNode.isNaN(node)) {
            return false;
        }
        return isConstant(node, false);
    }

    function getConstant(node) {
        if (node.type === Syntax.Literal) {
            return node.value;
        }
        if (node.type === Syntax.UnaryExpression) {
            return doUnary(node);
        }
        if (node.type === Syntax.BinaryExpression) {
            return doBinary(node);
        }
        if (node.type === Syntax.LogicalExpression) {
            return doLogical(node);
        }
        common.unreachable();
    }

    function doLogical(node) {
        var left, right;
        left = getConstant(node.left);
        right = getConstant(node.right);
        if (node.operator === '||') {
            return left || right;
        }
        return left && right;
    }

    function doUnary(node) {
        var argument;
        argument = getConstant(node.argument);
        switch (node.operator) {
        case '+':
            return +argument;
        case '-':
            return -argument;
        case '~':
            return ~argument;
        case '!':
            return !argument;
        case 'delete':
            // do delete on constant value (not considering identifier in this tree based constant folding)
            return true;
        case 'void':
            return undefined;
        case 'typeof':
            return typeof argument;
        }
    }

    function doBinary(node) {
        var left, right;
        left = getConstant(node.left);
        right = getConstant(node.right);
        switch (node.operator) {
        case '|':
            return left | right;
        case '^':
            return left ^ right;
        case '&':
            return left & right;
        case '==':
            return left == right;
        case '!=':
            return left != right;
        case '===':
            return left === right;
        case '!==':
            return left !== right;
        case '<':
            return left < right;
        case '>':
            return left > right;
        case '<=':
            return left <= right;
        case '>=':
            return left >= right;
        // case 'in':
        //    return left in right;
        // case 'instanceof':
        //    return left instanceof right;
        case '<<':
            return left << right;
        case '>>':
            return left >> right;
        case '>>>':
            return left >>> right;
        case '+':
            return left + right;
        case '-':
            return left - right;
        case '*':
            return left * right;
        case '/':
            return left / right;
        case '%':
            return left % right;
        }
        common.unreachable();
    }

    function wrapNode(value) {
        if (typeof value === 'number') {
            if (isNaN(value)) {
                return common.SpecialNode.generateNaN();
            }
            if (common.isNegative(value)) {
                return common.SpecialNode.generateNegative(value);
            }
        }
        if (value === undefined) {
            return common.SpecialNode.generateUndefined();
        }
        return {
            type: Syntax.Literal,
            value: value
        };
    }

    function treeBasedConstantFolding(tree, options) {
        var result;

        if (options == null) {
            options = { destructive: false };
        }

        result = (options.destructive) ? tree : common.deepCopy(tree);
        modified = false;

        result = common.replace(result, {
            leave: function leave(node, parent) {
                switch (node.type) {
                case Syntax.BinaryExpression:
                case Syntax.LogicalExpression:
                case Syntax.UnaryExpression:
                    if (isModifiedConstant(node)) {
                        modified = true;
                        return common.moveLocation(node, wrapNode(getConstant(node)));
                    }
                    break;
                }
            }
        });

        return {
            result: result,
            modified: modified
        }
    }

    treeBasedConstantFolding.passName = 'treeBasedConstantFolding';
    return treeBasedConstantFolding;
}, this));
/* vim: set sw=4 ts=4 et tw=80 : */
