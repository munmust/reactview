/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactNodeList} from 'shared/ReactTypes';

import isArray from 'shared/isArray';
import {
  getIteratorFn,
  REACT_ELEMENT_TYPE,
  REACT_PORTAL_TYPE,
} from 'shared/ReactSymbols';
import {checkKeyStringCoercion} from 'shared/CheckStringCoercion';

import {isValidElement, cloneAndReplaceKey} from './ReactElement';

const SEPARATOR = '.';// 用于命名节点 key 的分隔符
const SUBSEPARATOR = ':'; // 用于命名节点 key 的子分隔符

/**
 * Escape and wrap key so it is safe to use as a reactid
 * 将key转换成一个安全的reactid来使用 
 * 传入的key中所有的'='替换成'=0',':'替换成 '=2',并在key之前加上'$'
 * @param {string} key to be escaped.
 * @return {string} the escaped key.
 */
function escape(key: string): string {
  const escapeRegex = /[=:]/g;
  const escaperLookup = {
    '=': '=0',
    ':': '=2',
  };
  const escapedString = key.replace(escapeRegex, function(match) {
    return escaperLookup[match];
  });

  return '$' + escapedString;
}

/**
 * TODO: Test that a single child and an array with one item have the same key
 * pattern.
 */

let didWarnAboutMaps = false;

const userProvidedKeyEscapeRegex = /\/+/g;
// 对存在/的多加一个/
function escapeUserProvidedKey(text：string):string {
  return text.replace(userProvidedKeyEscapeRegex, '$&/');
}

// console.log(escapeUserProvidedKey('aa/a/'))  aa//a//
// console.log(escapeUserProvidedKey('$&/a/a&a$a')) $&//a//a&a$a

/**
 * Generate a key string that identifies a element within a set.
 * 生成key
 * 
 * @param {*} element A element that could contain a manual key. 元素
 * @param {number} index Index that is used if a manual key is not provided. key
 * @return {string}
 */
function getElementKey(element: any, index: number): string {
  // Do some typechecking here since we call this blindly. We want to ensure
  // that we don't block potential future ES APIs.
  if (typeof element === 'object' && element !== null && element.key != null) {
    // Explicit key
    if (__DEV__) {
      checkKeyStringCoercion(element.key);
    }
    // 元素存在key，生成安全的reactKey 
    return escape('' + element.key);
  }
  // Implicit key determined by the index in the set
  // 使用index生成 key
  return index.toString(36);
}
// mapIntoArray.png
function mapIntoArray(
  children: ?ReactNodeList, // 元素数组
  array: Array<React$Node>, // 初始的数组
  escapedPrefix: string,
  nameSoFar: string,
  callback: (?React$Node) => ?ReactNodeList, //  给当前遍历节点调用的函数
): number { //返回值是 map 得到的数组的元素数
  // children 的类型
  const type = typeof children;

  // children 类型为undefined和boolean时表明children为空
  if (type === 'undefined' || type === 'boolean') {
    // All of the above are perceived as null.
    children = null;
  }

  // 是否调用调用函数
  let invokeCallback = false;
  // children为null、string、number、Object（$$typeof为REACT_ELEMENT_TYPE或REACT_PORTAL_TYPE）
  // 时调用调用函数（React 可渲染的节点）
  if (children === null) {
    invokeCallback = true;
  } else {
    switch (type) {
      case 'string':
      case 'number':
        invokeCallback = true;
        break;
      case 'object':
        switch ((children: any).$$typeof) {
          case REACT_ELEMENT_TYPE:
          case REACT_PORTAL_TYPE:
            invokeCallback = true;
        }
    }
  }
  // 执行调用函数
  if (invokeCallback) {
    const child = children;
    // 得到调用执行之后的children
    let mappedChild = callback(child);
    // If it's the only child, treat the name as if it was wrapped in an array
    // so that it's consistent if the number of children grows:
    // 即便只有一个子节点，也会被当做包裹进一个数组中去命名。因为如果后续子节点的数量增加了，也能前后保持一致
    // 深度遍历，第一次执行时，nameSoFar为空，SEPARATOR作为一部分传入。第一次生成 key为 `.0`
    const childKey =
      nameSoFar === '' ? SEPARATOR + getElementKey(child, 0) : nameSoFar;
      // 调用结果为数组
    if (isArray(mappedChild)) {
      // 生成child 的 escapedPrefix， 第一次生成 `.0/`
      let escapedChildKey = '';
      if (childKey != null) {
        // 得到安全的children的Key xxxx//xx/
        escapedChildKey = escapeUserProvidedKey(childKey) + '/';
      }
      // mappedChild 是数组的情况下，会递归地调用 mapIntoArray() 自身，返回自己
      mapIntoArray(mappedChild, array, escapedChildKey, '', c => c);
      // 不是数组的情况且不为null
    } else if (mappedChild != null) {
      // 如果调用 map 函数得到的子节点不是数组，验证该节点是否是 ReactElement：
      //   A.对于 ReactElement，clone 它并附上新的 key，然后 push 进结果数组
      //   B.对于非 ReactElement，直接 push 进结果数组
      if (isValidElement(mappedChild)) {
        if (__DEV__) {
          // The `if` statement here prevents auto-disabling of the safe
          // coercion ESLint rule, so we must manually disable it below.
          // $FlowFixMe Flow incorrectly thinks React.Portal doesn't have a key
          if (mappedChild.key && (!child || child.key !== mappedChild.key)) {
            checkKeyStringCoercion(mappedChild.key);
          }
        }
        // 得到一个新的key的children结果
        mappedChild = cloneAndReplaceKey(
          mappedChild,
          // Keep both the (mapped) and old keys if they differ, just as
          // traverseAllChildren used to do for objects as children
          escapedPrefix +
            // $FlowFixMe Flow incorrectly thinks React.Portal doesn't have a key
            (mappedChild.key && (!child || child.key !== mappedChild.key)
              ? // $FlowFixMe Flow incorrectly thinks existing element's key can be a number
                // eslint-disable-next-line react-internal/safe-string-coercion
                escapeUserProvidedKey('' + mappedChild.key) + '/'
              : '') +
            childKey,
        );
      }
      // 将结果放入array中
      array.push(mappedChild);
    }
    // 仅遍历了一个节点，所以 return 1
    return 1;
  }
  //即便有再多的节点，最终还是要变成处理单节点，从而整个大递归就完成了闭环
  let child; // 当前遍历的子节点
  let nextName;
  let subtreeCount = 0; // Count of children found in the current subtree. 在当前子树中找到的子级计数
  // 下一个名字的前缀
  const nextNamePrefix =
    nameSoFar === '' ? SEPARATOR : nameSoFar + SUBSEPARATOR;

  if (isArray(children)) {
      // 如果 children 是数组，遍历这个数组，并用子节点递归地调用 mapIntoArray()
      // 如果 children 是数组，那么递归地调用 mapIntoArray() 直到 children 是单节点
    for (let i = 0; i < children.length; i++) {
      child = children[i];
      // 下一个的名字
      nextName = nextNamePrefix + getElementKey(child, i);
      //  subtreeCount 累加了 mapIntoArray() 的返回值，从而实现了对整个子节点树进行遍历计数
      subtreeCount += mapIntoArray(
        child,
        array,
        escapedPrefix,
        nextName,
        callback,
      );
    }
  } else {
    // 判断是否可迭代对象
    // 可遍历，那数据一定是个数组，也有可能是个部署了 Iterator 接口的对象
    const iteratorFn = getIteratorFn(children);
    if (typeof iteratorFn === 'function') {
      const iterableChildren: Iterable<React$Node> & {
        entries: any,
      } = (children: any);

      if (__DEV__) {
        // Warn about using Maps as children
        if (iteratorFn === iterableChildren.entries) {
          if (!didWarnAboutMaps) {
            console.warn(
              'Using Maps as children is not supported. ' +
                'Use an array of keyed ReactElements instead.',
            );
          }
          didWarnAboutMaps = true;
        }
      }

      const iterator = iteratorFn.call(iterableChildren);
      let step;
      let ii = 0;
      // 迭代 children，用子节点递归地调用 mapIntoArray()，直到迭代完毕（也就是 step.done 为 true）
      while (!(step = iterator.next()).done) {
        child = step.value;
        nextName = nextNamePrefix + getElementKey(child, ii++);
        // 执行
        subtreeCount += mapIntoArray(
          child,
          array,
          escapedPrefix,
          nextName,
          callback,
        );
      }
    } else if (type === 'object') {
      // 如果 children 不是单个节点，也不是数组或可迭代对象，那么获取它的类型信息并抛错
      // eslint-disable-next-line react-internal/safe-string-coercion
      const childrenString = String((children: any));

      throw new Error(
        `Objects are not valid as a React child (found: ${
          childrenString === '[object Object]'
            ? 'object with keys {' +
              Object.keys((children: any)).join(', ') +
              '}'
            : childrenString
        }). ` +
          'If you meant to render a collection of children, use an array ' +
          'instead.',
      );
    }
  }
  // 返回计数
  return subtreeCount;
}

type MapFunc = (child: ?React$Node) => ?ReactNodeList;

/**
 * Maps children that are typically specified as `props.children`.
 * 将子节点树“铺平”  [c, [c, c]] 将展开成 [c, c, c]
 * See https://reactjs.org/docs/react-api.html#reactchildrenmap
 *
 * The provided mapFunction(child, index) will be called for each
 * leaf child.
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} func The map function.
 * @param {*} context Context for mapFunction.
 * @return {object} Object containing the ordered map of results.
 */
function mapChildren(
  children: ?ReactNodeList, // 子节点树
  func: MapFunc, // map遍历函数
  context: mixed, // 上下文
): ?Array<React$Node> {
  // 子节点为null直接抛出
  if (children == null) {
    return children;
  }
  const result = []; // 结果
  let count = 0; // 节点计数
  mapIntoArray(children, result, '', '', function(child) {
    // 用指定上下文（没传就是 undefined）调用传入的 func（就是 map 遍历函数）并计数
    return func.call(context, child, count++);
  });
  // 返回平铺结果
  return result;
}

/**
 * Count the number of children that are typically specified as
 * `props.children`.
 *  统计节点数
 * See https://reactjs.org/docs/react-api.html#reactchildrencount
 *
 * @param {?*} children Children tree container.
 * @return {number} The number of children.
 */
function countChildren(children: ?ReactNodeList): number {
  let n = 0;
  mapChildren(children, () => {
    // 调用方法只记录数量
    n++;
    // Don't return anything
  });
  return n;
}

type ForEachFunc = (child: ?React$Node) => void;

/**
 * Iterates through children that are typically specified as `props.children`.
 * forEach方法
 * See https://reactjs.org/docs/react-api.html#reactchildrenforeach
 *
 * The provided forEachFunc(child, index) will be called for each
 * leaf child.
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} forEachFunc
 * @param {*} forEachContext Context for forEachContext.
 */
function forEachChildren(
  children: ?ReactNodeList,
  forEachFunc: ForEachFunc,
  forEachContext: mixed,
): void {
  mapChildren(
    children,
    // 更改调用的函数实现forEach中对各项的处理
    function() {
      forEachFunc.apply(this, arguments);
      // Don't return anything.
    },
    forEachContext,
  );
}

/**
 * Flatten a children object (typically specified as `props.children`) and
 * return an array with appropriately re-keyed children.
 * 铺平子对象，并生成新的key
 * See https://reactjs.org/docs/react-api.html#reactchildrentoarray
 */
function toArray(children: ?ReactNodeList): Array<React$Node> {
  return mapChildren(children, child => child) || [];
}

/**
 * Returns the first child in a collection of children and verifies that there
 * is only one child in the collection.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrenonly
 *
 * The current implementation of this function assumes that a single child gets
 * passed without a wrapper, but the purpose of this helper function is to
 * abstract away the particular structure of children.
 *
 * @param {?object} children Child collection structure.
 * @return {ReactElement} The first and only `ReactElement` contained in the
 * structure.
 */
function onlyChild<T>(children: T): T {
  if (!isValidElement(children)) {
    throw new Error(
      'React.Children.only expected to receive a single React element child.',
    );
  }

  return children;
}

export {
  forEachChildren as forEach,
  mapChildren as map,
  countChildren as count,
  onlyChild as only,
  toArray,
};
