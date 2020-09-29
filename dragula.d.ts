// Type definitions for Dragula 
// Project: https://bevacqua.github.io/dragula/
// Definitions by: Ron Newcomb <https://github.com/RonNewcomb>
// TypeScript Version: 2.3

declare function dragula(containers?: Element[], options?: dragula.Options): dragula.Drake;
declare function dragula(options?: dragula.Options): dragula.Drake;

declare namespace dragula {
  interface Drake {
    containers: Element[];
    dragging: boolean;
    start(item: Element);
    end();
    cancel(revert: boolean);
    remove();
    canMove(item: Element);
    destroy();
    on(event: 'drag', listener: (el: Element, source: Element) => void);
    on(event: 'dragend', listener: (el: Element) => void);
    on(event: 'drop', listener: (el: Element, target: Element, source: Element, sibling: Element) => void);
    on(event: 'cancel', listener: (el: Element, container: Element, source: Element) => void);
    on(event: 'remove', listener: (el: Element, container: Element, source: Element) => void);
    on(event: 'shadow', listener: (el: Element, container: Element, source: Element) => void);
    on(event: 'over', listener: (el: Element, container: Element, source: Element) => void);
    on(event: 'out', listener: (el: Element, container: Element, source: Element) => void);
    on(event: 'cloned', listener: (clone: Element, original: Element, type: 'mirror' | 'copy') => void);
  }

  interface Options {
    isContainer?: (el: Element) => boolean;// false = only elements in drake.containers will be taken into account
    moves?: (el: Element, source: Element, handle: Element, sibling: Element) => boolean; // true = elements are always draggable by default
    accepts?: (el: Element, target: Element, source: Element, sibling: Element) => boolean; // true = elements can be dropped in any of the `containers` by default
    invalid?: (el: Element, handle: Element) => boolean;  // false = don't prevent any drags from initiating by default
    direction?: 'vertical' | 'horizontal'; // 'vertical' = Y axis is considered when determining where an element would be dropped
    copy?: boolean; // false = elements are moved by default, not copied
    copySortSource?: boolean; // false = elements in copy-source containers can be reordered
    revertOnSpill?: boolean; // false = spilling will put the element back where it was dragged from, if this is true
    removeOnSpill?: boolean; // false = spilling will `.remove` the element, if this is true
    mirrorContainer?: Element; // document.body = set the element that gets mirror elements appended
    ignoreInputTextSelection?: boolean; // true = allows users to select input text, see details below
    containers?: Element[];
  }

}

export = dragula;
