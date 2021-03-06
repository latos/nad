
//Nad = (function(){

function isString(x) { return typeof x == 'string' || x instanceof String }

function implies(a, b) {
  return a ? b : true;
}

function pushArray(into, newItems) {
  into.push.apply(into, newItems);
};

function shallowCopyArray(a) {
  var copy = [];
  var l = a.length;
  for (var i = 0; i < l; i++) {
    copy.push(a[i]);
  }
  return copy;
}

// Deep copies objects that are just vanilla objects
// i.e. whose constructor is Object (e.g. created as object literals)
// does not check input object, so a shallow copy is always performed
// return value is always a vanilla object.
// does NOT detect loops.
// in summary, don't give it complicated object graphs, though it will
// try to stop recursing if it reaches a "non trivial" object based on the
// above heuristic.
// if optional copyInto arg is provided, will copy into that object, overwriting.
// and for convenience still returns that copyInto object.
function deepCopyVanillaObjects(fromObj, copyInto) {
  function isVanillaObject(v) {
    return typeof v == 'object' && v.constructor == Object;
  }

  var copy = copyInto || {};
  for (var k in fromObj) {
    var v = fromObj[k];
    if (isVanillaObject(v)) {
      var vInto = copyInto.hasOwnProperty(k) && isVanillaObject(copyInto[k]) ? copyInto[k] : {};
      v = deepCopyVanillaObjects(v, vInto)
    }
    copy[k] = v;
  }

  return copyInto;
}

function assert(expr, msg /* ... */) {
  if (!expr) {
    var str = 'ASSERTION ' + (msg || '');
    for (var i = 2; i < arguments.length; i++) {
      var a = arguments[i];
      str += ' ' + (typeof a == 'object' ? JSON.stringify(a) : a);
    }
    throw str;
  }
}

function Unit() {}
Unit.prototype.compile = function(bindings) { throw 'Subclass must implement' }
Unit.prototype.findBinding = function(bindings) {
  for (var k in bindings) {
    if (bindings[k] == this) {
      return k;
    }
  }
  return null;
}

function TextBlob(str) {
  this.text = str;
}

TextBlob.prototype = new Unit;


function Html(str) {
  throw 'unimplemented';
  // probably best not to do any interpolation/substitution here, unsafe.
  this.html = str;
}
Html.prototype = new Unit;

// Apply any necessary transformations to content
function fixContent(content) {

  // If it's just plain text, wrap it in a text object
  if (isString(content)) {
    content = new TextBlob(content);
  }

  // ... nothing else for now


  assert(content instanceof Unit);
  
  return content;
}

// todo: builder methods for attrs, props, content, etc. instead of args here?
function Elem(tag, props, content) {
  props = props || {};
  content = content || [];
  if (content instanceof Array) {
    // we're going to modify it, so make a defensive copy
    content = shallowCopyArray(content);
  } else {
    content = [content];
  }
  for (var i = 0; i < content.length; i++) {
    content[i] = fixContent(content[i]);
  }

  this.tag = tag;
  this.props = props;
  this.content = content;
}

Elem.prototype = new Unit;

Elem.prototype.link = function(amender) {
  return new Link(this, amender);
}


function Link(content, amender) {
  this.linked = fixContent(content);
  this.amender = amender;
}

Link.prototype = new Unit;

function combineAmenders(list) {
  return function(model, ui) {
    var l = list.length;
    for (var i = 0; i < l; i++) {
      list[i](model, ui);
    }
  }
}

Link.prototype.compile = function(bindings) {
  var me = this;
  
  var binding = me.findBinding(bindings);
  if (binding) {
    // re-write binding to the actual ui we want, not
    // the function linking wrapper.
    bindings[binding] = me.linked;
  }

  var inner = me.linked.compile(bindings);
  var recurse = combineAmenders(inner.amenders);

  return {
    render: inner.render,
    amenders: [function(model, ui) {
      me.amender(recurse, model, ui);
    }]
  };
}


// TODO: multimethod compile functions (select on unit type AND render environment)
// TODO: what if child object is already compiled or is a template or something?


Elem.prototype.compile = function(bindings) {
  var me = this;

  var amenders = [];
  var renderers = [];
  for (var i = 0; i < me.content.length; i++) {
    var child = me.content[i].compile(bindings);

    pushArray(amenders, child.amenders);
    renderers.push(child.render);
  }

  var binding = me.findBinding(bindings);

  return {
    render: function(model, ui) {
      // TODO: (maybe faster) string building implementation instead of dom manipulations
      var el = document.createElement(me.tag);
      deepCopyVanillaObjects(me.props, el);
      if (binding) {
        ui[binding] = el;
      }

      // Insert backwards, so UiObjects can be given their next sibling in the structure
      // right here.
      var prev = null;
      for (var i = renderers.length - 1; i >= 0; i--) {
        var rendered = renderers[i](model, ui);
        insertInto(el, rendered, prev);

        //if (rendered instanceof UiObject) {
        //  // special wrapper object of sorts
        //  rendered.insertInto(el, prev);
        //} else {
        //  // assume it's just a dom element
        //  el.insertBefore(rendered, el.firstChild);
        //}
        prev = rendered;
      }

      return el;
    },
    amenders: amenders
  }
}

TextBlob.prototype.compile = function(bindings) {
  var me = this;

  return {
    render: function(model, ui) {
      return document.createTextNode(me.text);
    },

    // currently no amenders.
    // todo: variable interpolation using LiveText?
    //    if done, also create a "literal" text function that doesn't do any interpolation whatsoever.
    amenders: []
  }
}

// all args: can be either dom nodes or ui objects.
function insertInto(parentUi, childUi, beforeUi) {
  if (childUi instanceof UiObject) {
    childUi.insertInto(parentUi, beforeUi);
  } else {
    var beforeNode = UiObject.getNodeOrNext(beforeUi);
    if (parentUi instanceof UiObject) {
      parentUi.insertDom(childUi, beforeNode);
    } else {
      var beforeNode = UiObject.getNodeOrNext(beforeUi);
      parentUi.insertBefore(childUi, beforeNode);
    }
  }
}

function remove(childUi) {
  if (childUi instanceof UiObject) {
    childUi.remove();
  } else {
    domRemove(childUi);
  }
}

function UiObject(){}
UiObject.asNode = function(obj) {
  if (obj instanceof UiObject) {
    return obj.currentNode();
  }

  return obj;
}
UiObject.prototype.insertInto = function(parentUi, beforeSibling) {
  this.parentUi = parentUi;
  this.nextUi = beforeSibling;
}
// NOTE: remove is not the opposite of insertInto
// insertInto does the logical insert of UI objects, the physical
// dom insert is up to their logic
// but remove is the physical detach as well as the logical detach.
// TODO; clean up this inconsistency?
UiObject.prototype.remove = function() {
  this.detachDom();
  //assert(node == null || node.parentNode == null, 'amend not called or did not physically detach the dom');

  this.parentUi = null;
  this.nextUi = null;
}

UiObject.prototype.detachDom = function() {
  var node = this.currentNode();
  if (node) {
    domRemove(node);
  }
}

UiObject.prototype.insertDom = function(node, beforeNode) {
  if (beforeNode != null) {
    assert(this.getContainingNode() == beforeNode.parentNode, 'invalid structure');
    beforeNode.parentNode.insertBefore(node, beforeNode);
  } else {
    insertInto(this.parentUi, node, this.getNextNode());
  }
}

UiObject.prototype.getNodeOrNext = function() {
  return this.currentNode() || this.getNextNode();
}

UiObject.getNodeOrNext = function(nextUi) {
  var next = (nextUi instanceof UiObject 
      ? nextUi.getNodeOrNext()
      : nextUi);

  return next;
}

UiObject.prototype.getContainingNode = function() {
  if (this.parentUi instanceof UiObject) {
    return this.parentUi.getContainingNode();
  }
  return this.parentUi;
}

UiObject.prototype.getNextNode = function() {
  var next = UiObject.getNodeOrNext(this.nextUi);
  assert(next == null || next.parentNode == this.getContainingNode(), 'invalid dom structure');
  return next;
}

// Should return the current, left-most dom node of the UI
// object iff that node exists and is in-place in the dom.
// Otherwise, should return null.
UiObject.prototype.currentNode = function() {
  throw 'Subclass must implement';
}

function asScopeFunc(val) {
  if (isString(val)) {
    return scopeEval(val);
  }

  assert(val.constructor == Function);

  return val;
}

function inheritObject(fromObj) {
  function F(){};
  F.prototype = fromObj;
  return new F;
}

// TODO: try to get rid of needing this.
function newBindingId(debug) {
  return '$_' + (newBindingId.next++) + '_' + (debug || '');
}
newBindingId.next = 1;

function When(predicate, struct) {
  this.predicate = asScopeFunc(predicate);
  this.struct = struct;
}

When.prototype = new Unit;
When.prototype.compile = function(bindings) {
  var me = this;
  var inner = me.struct.compile(bindings);
  var recurse = combineAmenders(inner.amenders);
  var id = newBindingId('when');
  return {
    render: function(model, ui) {
      return ui[id] = new WhenUi(me.predicate, model, inner.render, recurse, ui);
    },
    amenders: [function(model, ui) {
      ui[id].amend();
    }]
  };
}

function WhenUi(predicate, model, renderInner, amendInner, outerUi) {
  this.predicate = predicate;
  this.model = model;
  this.renderInner = renderInner;
  this.amendInner = amendInner;

  this.outerUi = outerUi;

  // Invariant: this.shouldAppear implies this.inner != null
  // The converse is arbitrary (currently, node is only
  // created when first needed, but is then not subsequently destroyed).
  this.shouldAppear = false;
  this.inner = null;
}
WhenUi.prototype = new UiObject;

WhenUi.prototype.currentNode = function() {
  assert(implies(this.shouldAppear, this.inner != null), 'WhenUi invariant failed');

  return this.shouldAppear ? UiObject.asNode(this.inner) : null;
}

WhenUi.prototype.amend = function() {
  this.shouldAppear = this.predicate(this.model);


  assert( (this.ui?true:false) == (this.inner?true:false) );
  
  if (this.shouldAppear && !this.inner) {
    console.log('creating');
    // create new ui at this level as inner objects may or
    // may not exist at various times, so they should not
    // be accessible to outer level(s).
    this.ui = inheritObject(this.outerUi);
    this.inner = this.renderInner(this.model, this.ui);
  }

  if (this.shouldAppear) {
    console.log('showing');
    insertInto(this, this.inner, null);
    this.amendInner(this.model, this.ui);
  } else {
    console.log('removing');
    if (this.inner) {
      remove(this.inner);

      // options are to set it to null for garbage collection,
      // or to keep a reference to speed up showing it again later.

      // currently, keeping the reference. uncommenting the next line
      // should not affect behaviour, just have different performance trade offs.
      //// this.inner = null
    }
  }
}

function Repeat(projection, struct) {
  this.projection = asScopeFunc(projection);
  this.struct = struct;
}

Repeat.prototype = new Unit;
Repeat.prototype.compile = function(bindings) {
  var me = this;
  var inner = me.struct.compile(bindings);
  var recurse = combineAmenders(inner.amenders);
  var id = newBindingId('repeat');
  return {
    render: function(model, ui) {
      return ui[id] = new RepeatUi(me.projection, model, inner.render, recurse, ui);
    },
    amenders: [function(model, ui) {
      ui[id].amend();
    }]
  };
}

function RepeatUi(projection, model, renderInner, amendInner, outerUi) {
  this.projection = projection;
  this.model = model;
  this.renderInner = renderInner;
  this.amendInner = amendInner;

  this.outerUi = outerUi;

  this.children = [];

  this.renderedModel = [];
}
RepeatUi.prototype = new UiObject;

RepeatUi.prototype.currentNode = function() {
  return this.children.length ? UiObject.asNode(this.children[0]) : null;
}

RepeatUi.prototype.amend = function() {

  var newModel = this.projection(this.model);

  // TODO: use proper list diff.
  // for now, remove everything & re-add everything.
  for (var i = 0; i < this.children.length; i++) {
    remove(this.children[i]);
  }
  this.children = []
  var prevChild = null;
  for (var i = newModel.length - 1; i >= 0; i--) {
    // create new ui and model for each child
    var m = newModel[i];
    var ui = inheritObject(this.outerUi);
    var child = this.renderInner(m, ui);
    this.children.unshift(child);

    insertInto(this, child, prevChild);
    this.amendInner(m, ui);

    prevChild = child;
  }

  this.renderedModel = newModel;
}

function LiveText(expr) {
  this.expr = asScopeFunc(expr);
}
LiveText.prototype = new Unit;

LiveText.prototype.compile = function(bindings) {
  var me = this;
  var id = newBindingId('text');
  return {
    render: function(model, ui) {
      return ui[id] = new LiveTextUi(me.expr, model);
    },

    amenders: [function(model, ui) {
      ui[id].amend();
    }]
  }
}

function toString(something) {
  return typeof something == 'string' ? something : something + '';
}

function LiveTextUi(expr, model) {
  this.expr = expr;
  this.model = model;
  this.node = null;
}
LiveTextUi.prototype = new UiObject;
LiveTextUi.prototype.amend = function() {
  var text = toString(this.expr(this.model));
  if (this.node) {
    this.node.data = text;
  } else {
    this.node = document.createTextNode(text);
    insertInto(this.parentUi, this.node, this.getNextNode());
  }
}
LiveTextUi.prototype.currentNode = function() {
  return this.node;
}


function domRemove(node) {
  if (node.parentNode) node.parentNode.removeChild(node);
}


// Returns a function that takes a scope and evaluates the given javascript code in that scope.
// If the scope doesn't have a $this property defined, then $this will point to the scope.
function scopeEval(expr) {
  return eval('(function($this){with($this){return ' + expr + '};})');
}

function compile(tplFunc) {
  var bindings = {};
  var struct = tplFunc(bindings);

  var compiled = struct.compile(bindings);
  var amender = combineAmenders(compiled.amenders);

  var render = function(model) {
      var ui = {};
      var root = compiled.render(model, ui);
      if (!ui.root) ui.root = root;

      var liveUi = {
        ui: ui,
        amend: function() {
          amender(model, ui);
        }
      }

      liveUi.amend();

      return liveUi;
    }

  return render;
}

// Equivalent of func.apply(), but by calling "new" on the function, instead
// of calling the function directly (javascript doesn't seem to have a built-in
// way of doing it, but this works, and produces an object that looks the same
// and passes instanceof and constructor tests).  function construct(constructor, args) {
function construct(constructor, args) {
  function F() {
    return constructor.apply(this, args);
  }
  F.prototype = constructor.prototype;
  return new F();
}

// Given a constructor, returns a function that will call "new" on it with
// the arguments to that function.
function ctorThunk(constructor) {
  return function(/* args */) {
    // convert arguments to an array
    var args = Array.prototype.slice.call(arguments);
    return construct(constructor, args);
  }
}

var tpl = {
  T: ctorThunk(TextBlob),
  H: ctorThunk(Html),
  E: ctorThunk(Elem),
  L: ctorThunk(Link),
  X: scopeEval,
  C: compile,

  when: ctorThunk(When),
  repeat: ctorThunk(Repeat),
  text: ctorThunk(LiveText)
}


with (tpl) {

var w1 = C(function(bindings) {
    return E('div', {}, [
        'Some text',
      ])
  });

var w2 = C(function(bindings) {
    return E('div', {}, [
        'Some text 2',
      ]).link(function(recurse, model, ui) {
        ui.root.style.color = model.color;
      });
  });

var m2 = {color: 'red'}
var r2 = w2(m2);

var w3 = C(function(bindings) {
    return E('div', {}, [
        'Some text ',
        bindings.label = E('span'),
        'Some more text'
      ]).link(function(recurse, model, ui) {
        ui.label.style.color = model.color;
        ui.label.innerText = model.label
      });
  });

var m3 = {color: 'red', label: 'my label model'}
var r3 = w3(m3);
  

function label(text) {
  return tpl.E('span', {}, text);
}

var w4 = C(function(bindings) {
    return E('div', {}, [
        'Some text ',
        when('show1', label('ONE ')),
        when('show2', label('TWO ')),
        when('show1 || show2', label('EITHEREXPR ')),
        when('show1', when('show2', label('BOTHNESTED '))),
        ' Some more text'
      ]);
  });

var m4 = {show1:true, show2:false}
var r4 = w4(m4);
  
var w5 = C(function(bindings) {
    return E('div', {}, [
        'Some text ',
        repeat(X('list'), when('isString($this)',
          //bindings.item = E('span').link(function(r, m, ui){ ui.item.innerText = m; }))),
          bindings.item = E('span', {}, text('$this + $this.length + " "')))),
        when('show1', label(text('lbltext'))),
        ' yay'
      ]);
  });

var m5 = {list:[1,'2',3, '44'], show1:false, lbltext:'blahblah'}
var r5 = w5(m5);
  

// future possible examples mucking around
//var widget = C(function(bindings) {
//    bindings.root = E('div', {}, [
//        'Some text',
//        //repeat('someList', E('div', {height:function(model){return model.height}}))
//        repeat('someList', E('div', {height:X('height')}))
//        bindings.footer = E('div', {}, 'footer')
//      ]).link(function(recurse, model, ui) {
//        doSomeOtherStuffTo(ui.root);
//        recurse(model, ui); // can control the model & ui passed down, if desired.
//      })
//  });
//
//
//}
//
//
//
//  var widget = L( E('div', {}, ''),
//     function(model, elem) {
//       elem.style.height = model.height;
//     });
//
//    'fag.bar.blah'
//    //function(model) { return model.someList },
//
//  E('div', {}, repeat('someList', widget));
//
//  E('div', {}, repeat(model.someList, function(item) { widget(item) }));
//
//
//    L(  E('div', {}, ''),
//        function(itemModel, elem) {
//          elem.style.height = itemModel.height;
//        })))
//
//
//  function createWidget(model)
//    return L( E('div', {}, ''),
//              function(el) { el.style.height = model.height });
//  }
//
//  function createWidget(model) {
//    return E('div', {}, 
//      repeat(model.someList, function(item) {
//          L( E('div', {}, ''),
//             function(el) { el.style.height = model.height })
//      }));
//  }
//

}










//})();
