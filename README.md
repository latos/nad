A declartive javascript library

Example usages:



Current code design:

- Templates are a tree of 'Unit's (todo: rename this)
- e.g. E(), a piece of text, when(), repeat(), etc are all Units.
- Units are compiled into a render function.
- The render() function takes a model object, and produces a new instance of the rendered UI each time, bound to the model object passed in.
- The return value of render() is the UI and an amend function, which is called to incrementally update the UI based on changes to the bound model.
- UI is composed of actual DOM nodes, and "UiObject" objects that track live state.
- E.g. E() renders to simple dom (though it can contain both DOM and UiObjects as children). 'When' renders to a 'WhenUi' UiObject. In that case, the render() function for 'When' just returns the UiObject with no dom inside - the amend function will then actually render and/or amend the dom (or child UiObjects), conditionally.
- At the moment, DOM elements do not know about UiObject siblings/children, UiObjects keep track of their location in the DOM themselves, and are referenced by the amend functions that were produced at the time of rendering.
- Most of the magic happens in the amend() functions. The render function only builds the 'fixed' structural of the UI - i.e. DOM defined in a hard coded manner with E(), and UiObjects (potentially with no initial dom). The dynamically added/removed/updated parts of the DOM are done in the amend() functions.
- amend functions can call render on children - even though 'render' is kind of an initialiser, it is not just called once when the widget is first rendered - it can be called again for sub-parts of the widget as they are added/removed/re-added, etc (for example, see 'when' and 'repeat').


- 
