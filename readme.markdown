# Dragula

> Drag and drop so simple it hurts

Browser support includes every sane browser and **IE7+**.

# Demo

[![demo.png][1]][2]

# Inspiration

Have you ever wanted a drag and drop library that just works? That doesn't just depend on bloated frameworks, that has great support? That actually understands where to place the elements when they are dropped? That doesn't need you to do a zillion things to get it to work? Well, so did I!

# Features

- Super easy to set up
- No bloated dependencies
- **Figures out sort order** on its own

# Install

You can get it on npm.

```shell
npm install dragula --save
```

Or bower, too. <sub>_(note that it's called `dragula.js` in bower)_</sub>

```shell
bower install dragula.js --save
```

# Usage

Dragula provides the easiest possible API to make drag and drop a breeze in your applications.

## `dragula(containers, options?)`

By default, `dragula` will allow the user to drag an element in any of the `containers` and drop it in any other container in the list. If the element is dropped anywhere that's not one of the `containers`, it'll be sent back to the container it was originally taken from.

Note that dragging is only triggered on left clicks, and only if no meta keys are pressed. Clicks on buttons and anchor tags are ignored, too.

The example below allows the user to drag elements from `left` into `right`, and from `right` into `left`.

```js
dragula([left, right]);
```

You can also provide an `options` object. The options are detailed below.

#### `options.accepts`

You can set `accepts` to a method with the following signature: `(el, target, source)`. It'll be called to make sure that an element `el`, that came from container `source`, can be dropped on container `target`. Note that if `options.copy` is set to `true` the copied element will be provided as `el`, instead of the original.

#### `options.copy`

If `copy` is set to `true`, items will be copied rather than moved. This implies the following differences:

Event    | Move                                     | Copy
---------|------------------------------------------|---------------------------------------------
`drag`   | Element will be concealed from `source`  | Nothing happens
`drop`   | Element will be moved into `target`      | Element will be cloned into `target`
`cancel` | Element will stay at `source`            | Nothing happens

#### `options.direction`

When an element is dropped onto a container, it'll be placed near the point where the mouse was released. If the `direction` is `'vertical'`, the default value, the Y axis will be considered. Otherwise, if the `direction` is `'horizontal'`, the X axis will be considered.

## API

The `dragula` method returns a tiny object with a concise API. We'll refer to the API returned by `dragula` as `drake`.

#### `drake.destroy`

Removes all drag and drop events used by `dragula` to manage drag and drop between the `containers`. If `.destroy` is called while an element is being dragged, the drag will be effectively cancelled.

#### `drake.on` _(Events)_

The `drake` is an event emitter. The following events can be tracked using `drake.on(type, listener)`:

Event Name | Listener Arguments | Event Description
-----------|--------------------|-------------------------------------------------------------------------------------
`drag`     | `el, container`    | `el` was lifted from `container`
`drop`     | `el, container`    | `el` was dropped into `container`
`cancel`   | `el, container`    | `el` was being dragged but it got nowhere and went back into `container`

# License

MIT

[1]: https://github.com/bevacqua/dragula/blob/master/resources/demo.png
[2]: http://bevacqua.github.io/dragula/
