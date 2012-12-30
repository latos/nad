
//Nad = (function(){

function isString(x) { return typeof x == 'string' || x instanceof String }

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

function Text(str) {
  this.text = str;
}

Text.prototype = new Unit;

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
    content = new Text(content);
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

  var binding = null;
  for (var k in bindings) {
    if (bindings[k] == me) {
      binding = k;
    }
  }

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
        if (rendered instanceof UiObject) {
          // special wrapper object of sorts
          rendered.insertInto(el, prev);
        } else {
          // assume it's just a dom element
          el.insertBefore(renderers[i](model, ui), el.firstChild);
        }
        prev = rendered;
      }

      return el;
    },
    amenders: amenders
  }
}

Text.prototype.compile = function(bindings) {
  var me = this;

  return {
    render: function(model, ui) {
      return document.createTextNode(me.text);
    },

    // currently no amenders.
    // todo: variable interpolation? via bindings or via model? use link function or not?
    //    if done, also create a "literal" text function that doesn't do any interpolation whatsoever.
    amenders: []
  }
}

function UiObject(){}
UiObject.prototype.insertInto = function(parentNode, beforeSibling) {
  throw 'Subclass must implement'
}


// TODO: get rid of Template intermediate object?
function Template(struct, bindings) {
  this.struct = struct;
  this.bindings = bindings;
}

Template.prototype.compile = function() {
  var me = this;

  var compiled = me.struct.compile(me.bindings);
  var amender = combineAmenders(compiled.amenders);

  var render = function(model) {
      var liveBindings = {};
      var root = compiled.render(model, liveBindings);
      if (!liveBindings.root) liveBindings.root = root;

      var liveUi = {
        ui: liveBindings,
        amend: function() {
          amender(model, liveBindings);
        }
      }

      liveUi.amend();

      return liveUi;
    }

  return render;
}


// Returns a function that takes a scope and evaluates the given javascript code in that scope.
// If the scope doesn't have a $this property defined, then $this will point to the scope.
function scopeEval(expr) {
  return eval('(function($this){with($this){return ' + expr + '};})');
}

function compile(tplFunc) {
  var bindings = {};
  var struct = tplFunc(bindings);
  var t = new Template(struct, bindings);
  return t.compile();
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
  T: ctorThunk(Text),
  H: ctorThunk(Html),
  E: ctorThunk(Elem),
  L: ctorThunk(Link),
  X: scopeEval,
  C: compile
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
        console.log(model, ui);
        ui.label.style.color = model.color;
        ui.label.innerText = model.label
      });
  });

var m3 = {color: 'red', label: 'my label model'}
var r3 = w3(m3);
  

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
