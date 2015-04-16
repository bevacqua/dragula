# 1.3.0 Terror

Introduced an `.end` instance API method that gracefully ends the drag event using the last known valid drop target.

# 1.2.4 Brother in Arms

- The `accepts` option now takes a fourth argument, `sibling`, giving us a hint of the precise position the item would be dropped in

# 1.2.3 Breeding Pool

- Fixed a bug in cross browser behavior that caused the hover effect to ignore scrolling
- Fixed a bug where touch events weren't working in obscure versions of IE

# 1.2.2 Originality Accepted

- Improved `accepts` mechanism so that it always accepts the original starting point

# 1.2.1 Firehose

- Fixed a bug introduced in `1.2.0`
- Fixed a bug where cancelling with `revert` enabled wouldn't respect sort order

# 1.2.0 Firefly

- Introduced `moves` option, used to determine if an item is draggable
- Added a `source` parameter for the `drop` event
- Cancelling a drag event when `revertOnSpill` is `true` will now move the element to its original position in the source element instead of appending it
- Fixed a bug where _"cancellations"_ that ended up leaving the dragged element in the source container but changed sort order would trigger a `cancel` event instead of `drop`
- Fixed a bug where _"drops"_ that ended up leaving the element in the exact same place it was dragged from would end up triggering a `drop` event instead of `cancel`
- Added touch event support

# 1.1.4 Fog Creek

- Added `'shadow'` event to enable easy updates to shadow element as it's moved

# 1.1.3 Drag Queen

- Fixed a bug where `dragula` wouldn't make a copy if the element was dropped outside of a target container
- If a dragged element gets removed for an instance that has `copy` set to `true`, a `cancel` event is raised instead

# 1.1.2 Eavesdropping

- Fixed a bug where _"cancellations"_ that ended up leaving the dragged element somewhere other than the source container wouldn't trigger a `drop` event

# 1.1.1 Slipping Jimmy

- Fixed a bug where the movable shadow wouldn't update properly if the element was hovered over the last position of a container

# 1.1.0 Age of Shadows

- Added a movable shadow that gives visual feedback as to where a dragged item would be dropped
- Added an option to remove dragged elements when they are dropped outside of sanctioned containers
- Added an option to revert dragged elements back to their source container when they are dropped outside of sanctioned containers

# 1.0.1 Consuelo

- Removed `console.log` statement

# 1.0.0 IPO

- Initial Public Release
