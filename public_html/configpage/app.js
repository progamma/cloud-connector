/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

"use strict";

/**
 * Everything the page is working on: the driver schemas as published by the connector, the texts
 * of the chosen language, the configuration being edited, and the name each datamodel and plugin
 * had on disk, kept by position so that one renamed here still finds the secrets stored under its
 * old name.
 */
let state = {
  schema: null,
  config: null,
  language: null,
  languages: [],
  strings: {},
  originalDatamodelNames: [],
  originalPluginNames: [],
  refreshTimer: null,
  //
  // Which cards are open, held by the object each card draws rather than by its position, so that
  // adding or removing one does not shuffle what is open. Reading the configuration again builds
  // new objects, and everything closes: that is the wanted start.
  expanded: new WeakSet(),
  //
  // The entry just added, named by the list it belongs to and its place in it, so that whoever
  // draws it can hand back the element to scroll to. Arrays keep their identity across a redraw,
  // which is what makes this work for a list of plain strings too.
  reveal: null,
  revealElement: null,
  //
  // The blocks of free JSON that do not parse right now, by the object each one writes into. What
  // is on screen there has not reached the configuration, so saving has to wait for them.
  brokenJson: new Map()
};

/** Where the language chosen by hand is remembered, so that it survives a reload */
const languageKey = "cloudConnector.language";

/** Shown in an empty key field, to say what one looks like without suggesting this one */
const sampleGuid = "550e8400-e29b-41d4-a716-446655440000";

/**
 * The IDE's icons, taken from its sprites.svg: the strokes, and the grid they were drawn on.
 * They are the ones the IDE itself uses for the same jobs, icon-delete-small to throw something
 * away and icon-tree-closed and icon-tree-opened to open and close a node.
 */
const icons = {
  trash: {
    box: 20,
    paths: [
      "M3.389 5.278h.944m12.278 0h-.945m-11.333 0V16.5a2 2 0 0 0 2 2h7.333a2 2 0 0 0 2-2V5.278m-11.333 0h11.333",
      "M6.223 5.278 6.672 4.2a3.606 3.606 0 0 1 1.631-1.795v0a3.606 3.606 0 0 1 3.394 0v0A3.606 3.606 0 0 1 13.33 4.2" +
              "l.45 1.078M8.111 8.111v7.556m3.778-7.556v7.556"
    ]
  },
  treeClosed: {
    box: 24,
    paths: ["m7 21.5 9.476-8.38c.699-.619.699-1.621 0-2.24L7 2.5"]
  },
  treeOpened: {
    box: 24,
    paths: ["m2 7 8.822 9.476c.65.699 1.706.699 2.357 0L22 7"]
  },
  tick: {
    box: 20,
    filled: true,
    paths: ["M8.07 11.197l-4.246-4.31L1 9.76l5.654 5.747 1.416 1.436 10.9-11.07L16.14 3 8.07 11.197"]
  },
  caret: {
    box: 24,
    paths: ["m1 6 9.704 11.37c.716.84 1.876.84 2.592 0L23 6"]
  }
};


/**
 * Translates a text. The English text is the key, so a language that has not translated it yet
 * shows it in English rather than showing a key nobody can read.
 * @param {String} text - English text, which is also its key
 * @param {Object} [params] - Values for the {name} placeholders inside the text
 * @returns {String} The translated text
 */
function t(text, params)
{
  let translated = state.strings[text] || text;
  if (!params)
    return translated;
  //
  return translated.replace(/\{(\w+)\}/g, (match, name) => name in params ? params[name] : match);
}


/**
 * Calls one of the connector endpoints.
 * @param {String} method - HTTP method
 * @param {String} route - Route to call
 * @param {Object} [body] - Value to send as JSON
 * @returns {Promise<Object>} Parsed response
 * @throws {Error} With the message the connector sent, when the call did not succeed
 */
async function api(method, route, body)
{
  let options = {method, headers: {}};
  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  //
  let response = await fetch(route, options);
  let result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `${method} ${route} failed with ${response.status}`);
  //
  return result;
}


/**
 * Builds an element.
 * @param {String} tag - Tag name
 * @param {Object} [props] - Properties to assign, with className and textContent among them
 * @param {Array} [children] - Elements to append
 * @returns {Object} The element
 */
function el(tag, props, children)
{
  let node = document.createElement(tag);
  Object.assign(node, props);
  children?.forEach(child => node.append(child));
  return node;
}


/**
 * Reads the value at a dotted path inside an object.
 * @param {Object} obj - Object to read from
 * @param {String} fieldPath - Path such as "pool.max"
 * @returns {*} The value, or undefined when any step of the path is missing
 */
function getPath(obj, fieldPath)
{
  return fieldPath.split(".").reduce((o, k) => o?.[k], obj);
}


/**
 * Writes a value at a dotted path, creating the intermediate objects. An undefined value removes
 * the entry, so that an empty field leaves the driver free to apply its own default.
 * @param {Object} obj - Object to write into
 * @param {String} fieldPath - Path such as "pool.max"
 * @param {*} value - Value to write, or undefined to remove the entry
 */
function setPath(obj, fieldPath, value)
{
  let keys = fieldPath.split(".");
  let last = keys.pop();
  let target = keys.reduce((o, k) => o[k] ??= {}, obj);
  //
  if (value === undefined)
    delete target[last];
  else
    target[last] = value;
}


/**
 * Removes the value at a dotted path, and behind it every object it leaves with nothing in it.
 * @param {Object} obj - Object to remove from
 * @param {String} fieldPath - Path such as "pool.min"
 */
function removePath(obj, fieldPath)
{
  let keys = fieldPath.split(".");
  let last = keys.pop();
  let holders = [];
  let target = obj;
  //
  for (let key of keys) {
    holders.push([target, key]);
    target = target?.[key];
    if (!target)
      return;
  }
  //
  delete target[last];
  //
  while (holders.length) {
    let [holder, key] = holders.pop();
    if (Object.keys(holder[key]).length)
      return;
    //
    delete holder[key];
  }
}


/**
 * Finds the values a driver's schema says nothing about: what somebody wrote into the configuration
 * by hand and this page has no form for. Paths, not keys, so that a tuned pool.min shows up even
 * though pool.max beside it is one the driver does declare.
 * @param {Object} options - Connection options as they are
 * @param {Array<Object>} schema - What the driver declares
 * @returns {Array<String>} The paths nobody declared, deepest name last
 */
function unknownOptions(options, schema)
{
  let declared = new Set(schema.map(entry => entry.name));
  let found = [];
  //
  let walk = (obj, prefix) => {
    for (let [key, value] of Object.entries(obj || {})) {
      let fieldPath = prefix ? `${prefix}.${key}` : key;
      if (declared.has(fieldPath))
        continue;
      //
      if (value && typeof value === "object" && !Array.isArray(value))
        walk(value, fieldPath);
      else
        found.push(fieldPath);
    }
  };
  //
  walk(options, "");
  return found;
}


/**
 * Shows a message in the footer.
 * @param {String} text - What to say, already translated
 * @param {String} [kind] - "ok", "ko" or "warn"
 */
function say(text, kind)
{
  let node = document.getElementById("message");
  node.textContent = text;
  node.className = `message ${kind || ""}`;
}


/**
 * Builds the input for one entry of a driver schema and keeps the configuration in step with it.
 * @param {Object} entry - Schema entry, with name, label, type and the optional default and help
 * @param {Object} target - Object the value lives in
 * @returns {Object} The field element
 */
function schemaField(entry, target)
{
  let value = getPath(target, entry.name);
  //
  if (entry.type === "boolean") {
    let ticked = value === undefined ? Boolean(entry.default) : Boolean(value);
    let label = el("label", {className: "checkbox-line"},
            [checkbox(ticked, on => setPath(target, entry.name, on)), t(entry.label)]);
    //
    let field = el("div", {className: "field"}, [label]);
    if (entry.help)
      field.append(el("p", {className: "help", textContent: t(entry.help)}));
    //
    return field;
  }
  //
  let type = entry.type === "number" ? "number" : (entry.type === "password" ? "password" : "text");
  //
  // An empty field shows what the driver would use when left alone, and where there is no such
  // value, an example of the shape it wants
  let input = el("input", {
    type,
    value: value === undefined ? "" : value,
    placeholder: entry.default === undefined ? (entry.placeholder || "") : String(entry.default)
  });
  input.addEventListener("input", () => {
    let typed = input.value.trim();
    if (!typed)
      setPath(target, entry.name, undefined);
    else
      setPath(target, entry.name, entry.type === "number" ? Number(typed) : input.value);
  });
  //
  // A field with something long to say takes the whole row: squeezed into a column, that line
  // would be broken into a stack of short ones. The box itself stays the width it deserves.
  let help = entry.help ? t(entry.help) : "";
  let field = el("div", {className: help.length > 48 ? "field wide" : "field"}, [
    el("label", {textContent: t(entry.label) + (entry.required ? " *" : "")}),
    input
  ]);
  //
  if (help)
    field.append(el("p", {className: "help", textContent: help}));
  //
  return field;
}


/**
 * Builds a text field whose value is written straight into an object.
 * @param {String} label - Label of the field, in English
 * @param {Object} target - Object the value lives in
 * @param {String} key - Key of the value
 * @param {Object} [options] - With help, placeholder, required, and generate to add a key
 *                             generator button
 * @returns {Object} The field element
 */
function textField(label, target, key, options = {})
{
  let input = el("input", {type: "text", value: target[key] === undefined ? "" : target[key],
    placeholder: options.placeholder || ""});
  input.addEventListener("input", () => target[key] = input.value);
  //
  let field = el("div", {className: "field"},
          [el("label", {textContent: t(label) + (options.required ? " *" : "")})]);
  //
  let write = value => {
    input.value = value;
    target[key] = value;
  };
  //
  if (options.generate) {
    let button = el("button", {type: "button", textContent: t("Generate")});
    button.addEventListener("click", () =>
      api("GET", "/api/uid").then(result => write(result.uid), e => say(e.message, "ko")));
    field.append(el("div", {className: "with-button"}, [input, button]));
  }
  else if (options.browse) {
    let button = el("button", {type: "button", textContent: t("Browse")});
    button.addEventListener("click", () => browseFolder(input.value, write));
    field.append(el("div", {className: "with-button"}, [input, button]));
  }
  else
    field.append(input);
  //
  if (options.help)
    field.append(el("p", {className: "help", textContent: t(options.help)}));
  //
  return field;
}


/**
 * Hands back the element drawn for the entry that is waiting to be brought into view.
 * @param {Array} list - List the entry belongs to
 * @param {Number} index - Its place in the list
 * @param {Object} element - The element just drawn for it
 */
function markReveal(list, index, element)
{
  if (state.reveal && state.reveal.list === list && state.reveal.index === index)
    state.revealElement = element;
}


/**
 * Brings the entry just added into view and puts the cursor in it: the button that adds one sits
 * at the top of the list, so what it adds can well be below the fold.
 */
function revealAdded()
{
  let element = state.revealElement;
  state.reveal = null;
  state.revealElement = null;
  //
  if (!element)
    return;
  //
  element.scrollIntoView({block: "nearest"});
  element.querySelector("input, select")?.focus({preventScroll: true});
}


/**
 * Adds an entry to a list, draws the list again, and takes the page to what was added. A card is
 * opened as well, because a card just added is one about to be filled in.
 * @param {Array} list - List to add to
 * @param {*} entry - The entry being added
 * @param {Function} redraw - Draws the list again
 */
function addEntry(list, entry, redraw)
{
  list.push(entry);
  if (entry && typeof entry === "object")
    state.expanded.add(entry);
  //
  state.reveal = {list, index: list.length - 1};
  redraw();
  revealAdded();
}


/**
 * Opens a walk through the folders of the machine the connector runs on, and hands back the one
 * that was picked. The browser cannot look at that machine by itself: the connector answers.
 * @param {String} startAt - Folder to open on, empty to start from the drives
 * @param {Function} onChoose - Called with the folder that was picked
 */
function browseFolder(startAt, onChoose)
{
  let where = el("input", {type: "text", className: "browse-path", spellcheck: false});
  let list = el("div", {className: "browse-list"});
  let failed = el("p", {className: "help ko"});
  let above = "";
  //
  let up = el("button", {type: "button", textContent: t("Up")});
  let choose = el("button", {type: "button", className: "primary", textContent: t("Choose this folder")});
  let cancel = el("button", {type: "button", textContent: t("Cancel")});
  //
  let show = async target => {
    let result = await api("GET", `/api/dirs${target ? `?path=${encodeURIComponent(target)}` : ""}`);
    above = result.parent;
    where.value = result.path;
    failed.textContent = result.ok ? "" : result.error;
    up.disabled = !result.path;
    choose.disabled = !result.path;
    //
    if (!result.entries.length) {
      return list.replaceChildren(el("p", {className: "empty",
        textContent: result.ok ? t("This folder has no folders in it.") : ""}));
    }
    //
    list.replaceChildren(...result.entries.map(entry => {
      let item = el("button", {type: "button", className: "browse-item", textContent: entry.name});
      item.addEventListener("click", () => walk(entry.path));
      return item;
    }));
    list.scrollTop = 0;
  };
  //
  let walk = target => show(target).catch(e => failed.textContent = e.message);
  //
  where.placeholder = t("This computer");
  where.addEventListener("input", () => choose.disabled = !where.value.trim());
  where.addEventListener("keydown", e => {
    if (e.key !== "Enter")
      return;
    //
    e.preventDefault();
    walk(where.value.trim());
  });
  //
  let dialog = el("div", {className: "overlay"}, [el("div", {className: "dialog"}, [
    el("h2", {textContent: t("Choose a folder")}),
    el("div", {className: "browse-head"}, [up, where]),
    el("p", {className: "help", textContent: t("A path can be typed or pasted here: press Enter to go there.")}),
    list,
    failed,
    el("div", {className: "actions"}, [cancel, choose])
  ])]);
  //
  let close = () => {
    dialog.remove();
    document.removeEventListener("keydown", onKey);
  };
  //
  let onKey = e => {
    if (e.key === "Escape")
      close();
  };
  //
  up.addEventListener("click", () => walk(above));
  cancel.addEventListener("click", close);
  //
  // What is taken is what the field shows, which is what was walked to or what was typed over it
  choose.addEventListener("click", () => {
    let picked = where.value.trim();
    if (!picked)
      return;
    //
    onChoose(picked);
    close();
  });
  //
  // Only the backdrop closes the dialog, never a click that landed inside it
  dialog.addEventListener("click", e => {
    if (e.target === dialog)
      close();
  });
  document.addEventListener("keydown", onKey);
  //
  document.body.append(dialog);
  walk(startAt);
}


/**
 * An example directory written the way the machine the connector runs on writes them, so that a
 * Windows user is not shown a path with slashes and the other way round.
 * @returns {String} The example path
 */
function samplePath()
{
  return state.schema.platform === "win32" ? "C:\\Data\\Documents" : "/srv/documents";
}


/**
 * Marks a field that does not hold an http address, so that a typo shows before the save rather
 * than as a connection that never comes up.
 * @param {Object} input - Field to mark
 */
function markAddress(input)
{
  let value = input.value.trim();
  input.classList.toggle("invalid", Boolean(value) && !/^https?:\/\/[^\s@]+$/i.test(value));
}


/**
 * Wraps a dropdown so that the IDE's chevron can lie over it, drawn into the page rather than
 * painted on as a background: it then takes its colour from the text and there is nothing left to
 * compose wrongly. The browser draws none of its own, because the stylesheet takes that away.
 * @param {Object} select - The select element
 * @returns {Object} The element to put in the page
 */
function dropdown(select)
{
  return el("span", {className: "select"}, [select, drawIcon(icons.caret, 12)]);
}


/**
 * Builds what a tab shows when it holds nothing: the plain fact, and under it a line saying what
 * would go there. An empty tab is exactly the place where that is not obvious yet.
 * @param {String} title - What is missing, in English
 * @param {String} hint - What the missing thing is for, in English
 * @returns {Object} The element
 */
function emptyState(title, hint)
{
  return el("div", {className: "empty-state"}, [el("strong", {textContent: t(title)}), t(hint)]);
}


/**
 * Builds a checkbox that looks like the IDE's: the control itself is the box, redrawn by the
 * stylesheet, and the IDE's tick lies over it as a real drawing that the checked state uncovers.
 * A drawing rather than a background image, so that it takes its colour from the text around it
 * and there is nothing left to go wrong between the two.
 * @param {Boolean} checked - Whether it starts ticked
 * @param {Function} onChange - Called with the new state whenever it is switched
 * @returns {Object} The box, to be put inside a label of class checkbox-line
 */
function checkbox(checked, onChange)
{
  let input = el("input", {type: "checkbox", checked});
  input.addEventListener("change", () => onChange(input.checked));
  //
  return el("span", {className: "checkbox"}, [input, drawIcon(icons.tick, 14)]);
}


/**
 * Draws one of the IDE's icons inline, because the page may fetch nothing from anywhere else.
 * It takes its colour from the text around it, and keeps the stroke the IDE gave it whatever size
 * it is drawn at, which is what the IDE's own vector-effect does.
 * @param {Object} icon - One of the entries of icons, with its grid and its strokes
 * @param {Number} size - How many pixels wide and tall to draw it
 * @returns {Object} The svg element
 */
function drawIcon(icon, size)
{
  const svgns = "http://www.w3.org/2000/svg";
  let svg = document.createElementNS(svgns, "svg");
  //
  let shape = icon.filled ?
          {fill: "currentColor", "fill-rule": "evenodd"} :
          {fill: "none", stroke: "currentColor", "stroke-width": "1.67", "stroke-linecap": "round"};
  //
  for (let [name, value] of Object.entries({viewBox: `0 0 ${icon.box} ${icon.box}`, width: size, height: size,
    "aria-hidden": "true", ...shape}))
    svg.setAttribute(name, value);
  //
  for (let stroke of icon.paths) {
    let path = document.createElementNS(svgns, "path");
    path.setAttribute("d", stroke);
    if (!icon.filled)
      path.setAttribute("vector-effect", "non-scaling-stroke");
    //
    svg.append(path);
  }
  //
  return svg;
}


/**
 * Puts a dialog over the page. Escape and a click on the backdrop close it; a click that landed
 * inside it never does.
 * @param {Array} children - What goes inside the dialog
 * @returns {Function} Closes it
 */
function openDialog(children)
{
  let dialog = el("div", {className: "overlay"}, [el("div", {className: "dialog"}, children)]);
  //
  let close = () => {
    dialog.remove();
    document.removeEventListener("keydown", onKey);
  };
  //
  let onKey = e => {
    if (e.key === "Escape")
      close();
  };
  //
  dialog.addEventListener("click", e => {
    if (e.target === dialog)
      close();
  });
  document.addEventListener("keydown", onKey);
  document.body.append(dialog);
  //
  return close;
}


/**
 * Asks before taking something out, naming what kind of thing it is and where it is going from.
 * The kind arrives with its article already on it, because which article a word wants is something
 * only the language it is written in knows.
 * @param {String} kind - What sort of thing it is, as in "the datamodel"
 * @param {String} what - Its name, empty when it has none yet
 * @param {Function} onYes - What to do once it is agreed to
 */
function confirmRemoval(kind, what, onYes)
{
  let remove = el("button", {type: "button", className: "destructive", textContent: t("Remove")});
  let cancel = el("button", {type: "button", textContent: t("Cancel")});
  //
  let question = what ?
          t("Remove {kind} '{what}' from the configuration?", {kind: t(kind), what}) :
          t("Remove {kind} from the configuration?", {kind: t(kind)});
  //
  let close = openDialog([
    el("h2", {textContent: question}),
    el("p", {className: "help", textContent: t("Nothing is written until you save.")}),
    el("div", {className: "actions"}, [cancel, remove])
  ]);
  //
  cancel.addEventListener("click", close);
  remove.addEventListener("click", () => {
    close();
    onYes();
  });
  remove.focus();
}


/**
 * Builds the button that removes something, with the IDE's trash icon. It asks before it acts.
 * @param {String} kind - What sort of thing it removes, as in "the datamodel"
 * @param {String} what - Its name, shown in the question
 * @param {Function} onRemove - What to do once it is agreed to
 * @returns {Object} The button element
 */
function removeButton(kind, what, onRemove)
{
  let svg = drawIcon(icons.trash, 18);
  //
  let button = el("button", {type: "button", className: "icon danger", title: t("Remove")}, [svg]);
  button.setAttribute("aria-label", t("Remove"));
  button.addEventListener("click", () => confirmRemoval(kind, what, onRemove));
  return button;
}


/**
 * Wraps the remove button of a row in a field of its own, under a label with nothing written in it.
 * That empty label is what lines the button up with the fields beside it, whatever else the row
 * carries underneath, instead of a measurement that would go stale.
 * @param {Function} onRemove - What to do when it is pressed
 * @returns {Object} The field element
 */
function removeCell(kind, what, onRemove)
{
  return el("div", {className: "field remove"}, [el("label", {}), removeButton(kind, what, onRemove)]);
}


/**
 * Builds the rows of a list of addresses: one row per address, with the shape to type shown in the
 * field itself, and a way to drop one or add another.
 * @param {Array<String>} list - The addresses, changed in place
 * @param {Object} options - With placeholder, addLabel, empty and redraw
 * @returns {Object} The element holding the rows
 */
function addressList(list, options)
{
  let box = el("div", {});
  if (!list.length)
    box.append(el("p", {className: "empty", textContent: t(options.empty)}));
  //
  list.forEach((address, index) => {
    let input = el("input", {type: "text", value: address, placeholder: options.placeholder});
    input.addEventListener("input", () => {
      list[index] = input.value.trim();
      markAddress(input);
    });
    markAddress(input);
    //
    let row = el("div", {className: "row"}, [
      el("div", {className: "row-body"}, [el("div", {className: "columns"}, [
        el("div", {className: "field"}, [el("label", {textContent: t("Address")}), input])
      ])]),
      removeCell("the allowed address", address, () => {
        list.splice(index, 1);
        options.redraw();
      })
    ]);
    markReveal(list, index, row);
    box.append(row);
  });
  //
  let add = el("button", {type: "button", className: "add", textContent: t(options.addLabel)});
  add.addEventListener("click", () => addEntry(list, "", options.redraw));
  box.append(add);
  //
  return box;
}


/**
 * Draws the remote servers, one row per address.
 */
function drawRemoteServers()
{
  state.config.remoteServers ??= [];
  document.getElementById("remoteServers").replaceChildren(addressList(state.config.remoteServers, {
    placeholder: "https://myapp.example.com",
    addLabel: "Add remote server",
    empty: "No remote server is configured.",
    redraw: drawRemoteServers
  }));
}


/**
 * Splits a remoteUserNames entry the way the connector splits it: an entry that starts with an
 * address carries the IDE to talk to, everything else is a user the Instant Developer Cloud
 * console is asked about.
 * @param {String} entry - Entry as written in the configuration
 * @returns {Object} Its address, empty for the cloud, and its user
 */
function splitIdeUser(entry)
{
  if (!/^https?:\/\//i.test(entry))
    return {address: "", user: entry || ""};
  //
  let [address, user] = entry.split("@");
  return {address, user: user || ""};
}


/**
 * Writes back an entry in the shape the connector reads.
 * @param {Object} parts - Address and user of the entry
 * @returns {String} The entry
 */
function joinIdeUser(parts)
{
  return parts.address ? `${parts.address}@${parts.user}` : parts.user;
}


/**
 * Draws the IDE users, one row each, asking where the IDE is instead of asking for a shape to type.
 */
function drawIdeUsers()
{
  state.config.remoteUserNames ??= [];
  let users = state.config.remoteUserNames;
  //
  let box = el("div", {});
  if (!users.length)
    box.append(el("p", {className: "empty", textContent: t("No IDE user is configured.")}));
  //
  box.append(...users.map((entry, index) => {
    let parts = splitIdeUser(entry);
    let write = () => state.config.remoteUserNames[index] = joinIdeUser(parts);
    //
    let where = el("select", {}, [
      el("option", {value: "cloud", textContent: t("Instant Developer Cloud"), selected: !parts.address}),
      el("option", {value: "own", textContent: t("An IDE of its own"), selected: Boolean(parts.address)})
    ]);
    where.addEventListener("change", () => {
      parts.address = where.value === "own" ? "https://" : "";
      write();
      drawIdeUsers();
    });
    //
    let user = el("input", {type: "text", value: parts.user,
      placeholder: parts.address ? "username" : "organization/username"});
    user.addEventListener("input", () => {
      parts.user = user.value.trim();
      write();
    });
    //
    let userField = el("div", {className: "field"}, [el("label", {textContent: t("User")})]);
    let told = el("p", {className: "help"});
    //
    if (parts.address)
      userField.append(user);
    else {
      // Without an address the connector asks the console where this user is: the same question,
      // asked here, says before saving whether the entry will find anybody
      let find = el("button", {type: "button", textContent: t("Find the server")});
      find.addEventListener("click", () => findIdeServer(parts.user, find, told));
      userField.append(el("div", {className: "with-button"}, [user, find]));
    }
    //
    let fields = [
      el("div", {className: "field"}, [el("label", {textContent: t("Where its IDE is")}), dropdown(where)]),
      userField
    ];
    //
    if (parts.address) {
      let address = el("input", {type: "text", value: parts.address, placeholder: "https://ide.example.com"});
      address.addEventListener("input", () => {
        parts.address = address.value.trim();
        markAddress(address);
        write();
      });
      markAddress(address);
      fields.splice(1, 0, el("div", {className: "field"},
              [el("label", {textContent: t("IDE address")}), address]));
    }
    //
    let body = el("div", {className: "row-body"}, [el("div", {className: "columns"}, fields)]);
    if (!parts.address) {
      told.textContent = t("The console at instantdevelopercloud.com is asked which server hosts this user.");
      body.append(told);
    }
    //
    let row = el("div", {className: "row"}, [body, removeCell("the IDE user", parts.user, () => {
      users.splice(index, 1);
      drawIdeUsers();
    })]);
    //
    markReveal(users, index, row);
    return row;
  }));
  //
  let add = el("button", {type: "button", className: "add", textContent: t("Add IDE user")});
  add.addEventListener("click", () => addEntry(users, "", drawIdeUsers));
  box.append(add);
  //
  document.getElementById("remoteUserNames").replaceChildren(box);
}


/**
 * Asks the connector which server hosts an IDE user, and says so in the row itself.
 * @param {String} user - Username to look up
 * @param {Object} button - Button that started the search, disabled while it runs
 * @param {Object} told - Paragraph under the row, where the answer goes
 */
function findIdeServer(user, button, told)
{
  if (!user)
    return;
  //
  button.disabled = true;
  told.className = "help";
  told.textContent = t("Looking for the server of '{user}'...", {user});
  //
  api("GET", `/api/ideserver?user=${encodeURIComponent(user)}`).then(result => {
    told.className = result.ok ? "help ok" : "help ko";
    told.textContent = result.ok ?
            t("'{user}' is hosted on {url}", {user, url: result.url}) :
            t("'{user}' was not found: {error}", {user, error: result.error});
  }, e => {
    told.className = "help ko";
    told.textContent = e.message;
  }).finally(() => button.disabled = false);
}


/**
 * Draws the Connector tab.
 */
function drawGeneral()
{
  document.getElementById("generalFields").replaceChildren(
          textField("Connector name", state.config, "name",
                  {required: true, placeholder: "my-connector",
                    help: "The name this connector is known by in the IDE and in the applications"}),
          textField("Password key", state.config, "passwordPrivateKey",
                  {placeholder: "%CC_KEY%",
                    help: "Best left as %CC_KEY%, so that the key lives in the environment and not beside the " +
                            "passwords it protects. Whatever it points at has to be 64 hexadecimal characters. " +
                            "Changing it makes the stored passwords unreadable: type them all again in the same save."}),
          textField("Remote configuration key", state.config, "remoteConfigurationKey",
                  {generate: true, placeholder: sampleGuid,
                    help: "Lets the IDE change this configuration from afar. Leave it at the zero " +
                            "GUID to allow nothing."}));
  //
  drawRemoteServers();
  drawIdeUsers();
  //
  state.config.localConfiguration ??= {};
  document.getElementById("localFields").replaceChildren(
          schemaField({name: "enabled", label: "Serve this page", type: "boolean", default: true},
                  state.config.localConfiguration),
          schemaField({name: "port", label: "Port", type: "number", default: 8099},
                  state.config.localConfiguration));
}


/**
 * Builds the head of one card, with its title and the buttons that act on it. Where the card can
 * be closed, the title opens and closes it and carries a line saying what is inside, so that a long
 * list stays readable while it is closed.
 * @param {String} title - Title of the card, already translated
 * @param {Array} buttons - Buttons to show on the right
 * @param {Object} [fold] - With open, summary and toggle, when the card can be closed
 * @returns {Object} The head element
 */
function cardHead(title, buttons, fold)
{
  let heading;
  if (!fold)
    heading = el("h2", {textContent: title});
  else {
    heading = el("h2", {className: "disclosure", tabIndex: 0}, [
      el("span", {className: "chevron"}, [drawIcon(fold.open ? icons.treeOpened : icons.treeClosed, 12)]),
      title
    ]);
    heading.setAttribute("role", "button");
    heading.setAttribute("aria-expanded", String(fold.open));
    //
    if (!fold.open && fold.summary)
      heading.append(el("span", {className: "card-summary", textContent: fold.summary}));
    //
    heading.addEventListener("click", fold.toggle);
    heading.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ")
        return;
      //
      e.preventDefault();
      fold.toggle();
    });
  }
  //
  return el("div", {className: fold && !fold.open ? "card-head closed" : "card-head"}, [
    heading,
    el("div", {className: "actions"}, buttons)
  ]);
}


/**
 * Builds what a card says about itself while it is closed, so that a long list can be read
 * without opening anything.
 * @param {String} kind - "datamodel", "fileSystem" or "plugin"
 * @param {Object} item - The item being described
 * @returns {String} A line naming what matters, empty when there is nothing to say yet
 */
function cardSummary(kind, item)
{
  if (kind === "fileSystem")
    return [item.path, t(item.permissions === "rw" ? "read and write" : "read only")].filter(Boolean).join(" · ");
  //
  if (kind === "plugin")
    return item.class || "";
  //
  let options = item.connectionOptions || {};
  let detail = [options.host || options.server || options.connectString, options.database].filter(Boolean).join("/");
  return detail ? `${item.class} · ${detail}` : (item.class || "");
}


/**
 * Renames an open card while its name is being typed, keeping the chevron in place.
 * @param {Object} card - The card element
 * @param {String} title - New title
 */
function setCardTitle(card, title)
{
  let heading = card.querySelector("h2");
  let chevron = heading.querySelector(".chevron");
  heading.replaceChildren(...(chevron ? [chevron, title] : [title]));
}


/**
 * Opens or closes the card of an item, and draws the tab again.
 * @param {Object} item - Datamodel, file system or plugin the card draws
 * @param {Function} redraw - Draws the tab the card lives in
 */
function toggleCard(item, redraw)
{
  if (state.expanded.has(item))
    state.expanded.delete(item);
  else
    state.expanded.add(item);
  //
  redraw();
}


/**
 * Draws the card of one datamodel, with the options its driver class declares.
 * @param {Object} datamodel - Datamodel being edited
 * @param {Number} index - Its position in the configuration
 * @returns {Object} The card element
 */
function drawDatamodel(datamodel, index)
{
  let open = state.expanded.has(datamodel);
  let driver = state.schema.drivers[datamodel.class];
  //
  let test = el("button", {type: "button", textContent: t("Test connection")});
  test.addEventListener("click", () => testDatamodel(datamodel, index, test));
  //
  let remove = removeButton("the datamodel", datamodel.name, () => {
    state.config.datamodels.splice(index, 1);
    state.originalDatamodelNames.splice(index, 1);
    drawDatamodels();
  });
  //
  let card = el("div", {className: "card"}, [
    cardHead(datamodel.name || t("New datamodel"), [test, remove],
            {open, summary: cardSummary("datamodel", datamodel), toggle: () => toggleCard(datamodel, drawDatamodels)})
  ]);
  //
  if (!open)
    return card;
  //
  let name = el("input", {type: "text", value: datamodel.name || "", placeholder: "warehouse"});
  name.addEventListener("input", () => {
    datamodel.name = name.value;
    setCardTitle(card, name.value || t("New datamodel"));
  });
  //
  let classes = el("select", {}, Object.keys(state.schema.drivers).map(c =>
    el("option", {value: c, textContent: c, selected: c === datamodel.class})));
  classes.addEventListener("change", () => {
    datamodel.class = classes.value;
    datamodel.connectionOptions = keepKnownOptions(datamodel.connectionOptions, classes.value);
    drawDatamodels();
  });
  //
  card.append(el("div", {className: "columns"}, [
    el("div", {className: "field"}, [el("label", {textContent: `${t("Name")} *`}), name]),
    el("div", {className: "field"}, [el("label", {textContent: t("Driver")}), dropdown(classes)])
  ]));
  card.append(textField("API key", datamodel, "APIKey", {generate: true, placeholder: sampleGuid,
    help: "The applications present this key to reach this datamodel"}));
  //
  // What a driver asks for outside the connection, under a heading of its own: on its own between
  // the API key and the connection it looked like it belonged to neither
  // Full width rather than in a column: the box is kept narrow by the field itself, and what is
  // written under it gets the whole line instead of being wrapped into a stack of short ones
  let extras = driver?.datamodel || [];
  if (extras.length) {
    card.append(el("h2", {textContent: t("Driver options")}));
    extras.forEach(entry => card.append(schemaField(entry, datamodel)));
  }
  //
  if (driver) {
    datamodel.connectionOptions ??= {};
    card.append(el("h2", {textContent: t("Connection")}));
    //
    // A grid of its own per group, so that what belongs together stays together: the user and the
    // password would otherwise land at the two ends of a wrap
    let options = driver.connectionOptions;
    for (let group of optionGroups(options.filter(entry => entry.type !== "boolean"))) {
      card.append(el("div", {className: "columns aligned"},
              group.map(entry => schemaField(entry, datamodel.connectionOptions))));
    }
    //
    // The switches go last and together: in the grid of the boxes to fill in they have no label
    // above them, so they sit higher than everything beside them
    let switches = options.filter(entry => entry.type === "boolean");
    if (switches.length) {
      card.append(el("div", {className: "switches"},
              switches.map(entry => schemaField(entry, datamodel.connectionOptions))));
    }
    //
    // What somebody wrote into the configuration that this driver declares nothing about. It is
    // kept whatever happens; showing it is what keeps it from being kept unseen.
    card.append(el("h2", {textContent: t("Other options")}));
    card.append(el("p", {className: "help",
      textContent: t("Options this page has no form for. They are handed to the driver as they are.")}));
    card.append(jsonBlock(datamodel.connectionOptions, options));
  }
  //
  return card;
}


/**
 * Builds the box that edits, as JSON, the part of a block nobody has a form for. It is written as
 * JSON because that is what it is: a form would have to guess types, and would have nothing to say
 * about a value nested inside another or about a list. What is typed reaches the configuration only
 * once it parses, and until then saving is held back rather than quietly writing the last good one.
 * @param {Object} target - Object the values live in, changed in place
 * @param {Array<Object>} schema - What is declared elsewhere and therefore left out of the box
 * @returns {Object} The element holding the box and what it has to say about it
 */
function jsonBlock(target, schema)
{
  let shown = {};
  unknownOptions(target, schema).forEach(fieldPath => setPath(shown, fieldPath, getPath(target, fieldPath)));
  //
  let area = el("textarea", {rows: 6, spellcheck: false, value: JSON.stringify(shown, null, 2)});
  let told = el("p", {className: "help"});
  //
  let refuse = why => {
    state.brokenJson.set(target, why);
    told.className = "help ko";
    told.textContent = why;
  };
  //
  let apply = () => {
    let parsed;
    try {
      parsed = JSON.parse(area.value.trim() || "{}");
    }
    catch (e) {
      return refuse(e.message);
    }
    //
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return refuse(t("What goes here is a block between braces."));
    //
    state.brokenJson.delete(target);
    told.className = "help";
    told.textContent = "";
    //
    // Out with what was there, in with what is written now, one value at a time: writing the block
    // whole would take with it the values declared elsewhere that live in the same object
    unknownOptions(target, schema).forEach(fieldPath => removePath(target, fieldPath));
    //
    let write = (obj, prefix) => {
      for (let [key, value] of Object.entries(obj)) {
        let fieldPath = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value))
          write(value, fieldPath);
        else
          setPath(target, fieldPath, value);
      }
    };
    write(parsed, "");
  };
  //
  area.addEventListener("input", apply);
  return el("div", {}, [area, told]);
}


/**
 * The blocks of free JSON that do not parse and still belong to something in the configuration:
 * one left behind by a datamodel since removed has nothing left to hold up.
 * @returns {Array<String>} What is wrong with each of them
 */
function brokenBlocks()
{
  let alive = new Set();
  (state.config.datamodels || []).forEach(dm => alive.add(dm.connectionOptions));
  (state.config.plugins || []).forEach(plugin => alive.add(plugin.config));
  //
  return [...state.brokenJson].filter(([target]) => alive.has(target)).map(([target, why]) => why);
}


/**
 * Splits the options of a driver into the runs it declared. The driver lists them in order, so a
 * run is simply a stretch of entries carrying the same group: nothing here has to know what the
 * groups of any driver are called.
 * @param {Array<Object>} entries - Options of a driver, in the order it lists them
 * @returns {Array<Array<Object>>} The runs, in that same order
 */
function optionGroups(entries)
{
  let groups = [];
  let previous;
  //
  for (let entry of entries) {
    if (!groups.length || entry.group !== previous)
      groups.push([]);
    //
    groups[groups.length - 1].push(entry);
    previous = entry.group;
  }
  //
  return groups;
}


/**
 * Drops from the connection options everything the new driver class does not know about, so that
 * a change of driver does not carry over an option the new one would refuse.
 * @param {Object} options - Connection options as they are
 * @param {String} className - Driver class they have to fit
 * @returns {Object} Options the new class understands
 */
function keepKnownOptions(options, className)
{
  let kept = {};
  state.schema.drivers[className]?.connectionOptions.forEach(entry => {
    let value = getPath(options, entry.name);
    if (value !== undefined)
      setPath(kept, entry.name, value);
  });
  //
  return kept;
}


/**
 * Draws the Datamodels tab.
 */
function drawDatamodels()
{
  state.config.datamodels ??= [];
  let list = document.getElementById("datamodelList");
  //
  if (!state.config.datamodels.length)
    return list.replaceChildren(emptyState("No datamodel is configured.",
            "A datamodel is a database this connector opens to the applications that ask for it."));
  //
  list.replaceChildren(...state.config.datamodels.map((dm, index) => {
    let card = drawDatamodel(dm, index);
    markReveal(state.config.datamodels, index, card);
    return card;
  }));
}


/**
 * Draws the File systems tab.
 */
function drawFileSystems()
{
  state.config.fileSystems ??= [];
  let list = document.getElementById("fileSystemList");
  //
  if (!state.config.fileSystems.length)
    return list.replaceChildren(emptyState("No file system is shared.",
            "A file system is a folder of this machine the applications may read, and write to if you let them."));
  //
  let cards = state.config.fileSystems.map((share, index) => {
    let remove = removeButton("the file system", share.name, () => {
      state.config.fileSystems.splice(index, 1);
      drawFileSystems();
    });
    //
    let open = state.expanded.has(share);
    let card = el("div", {className: "card"}, [
      cardHead(share.name || t("New file system"), [remove],
              {open, summary: cardSummary("fileSystem", share), toggle: () => toggleCard(share, drawFileSystems)})
    ]);
    //
    if (!open)
      return card;
    //
    let name = el("input", {type: "text", value: share.name || "", placeholder: "documents"});
    name.addEventListener("input", () => {
      share.name = name.value;
      setCardTitle(card, name.value || t("New file system"));
    });
    //
    let permissions = el("select", {}, [
      el("option", {value: "r", textContent: t("Read only"), selected: share.permissions !== "rw"}),
      el("option", {value: "rw", textContent: t("Read and write"), selected: share.permissions === "rw"})
    ]);
    permissions.addEventListener("change", () => share.permissions = permissions.value);
    //
    card.append(el("div", {className: "columns"}, [
      el("div", {className: "field"}, [el("label", {textContent: `${t("Name")} *`}), name]),
      el("div", {className: "field"}, [el("label", {textContent: t("Permissions")}), dropdown(permissions)])
    ]));
    card.append(textField("Path", share, "path", {required: true, browse: true, placeholder: samplePath(),
      help: "The directory shared with the applications"}));
    card.append(textField("API key", share, "APIKey", {generate: true, placeholder: sampleGuid}));
    //
    share.whiteListedOrigins ??= [];
    card.append(el("h2", {textContent: t("Allowed origins")}));
    card.append(el("p", {className: "help",
      textContent: t("The addresses this share may reach over HTTP. With none, it reaches none.")}));
    card.append(addressList(share.whiteListedOrigins, {
      placeholder: "https://trusted-domain.com",
      addLabel: "Add allowed origin",
      empty: "No address is allowed.",
      redraw: drawFileSystems
    }));
    //
    return card;
  });
  //
  cards.forEach((card, index) => markReveal(state.config.fileSystems, index, card));
  list.replaceChildren(...cards);
}


/**
 * Draws the Plugins tab.
 */
function drawPlugins()
{
  state.config.plugins ??= [];
  let list = document.getElementById("pluginList");
  //
  if (!state.config.plugins.length)
    return list.replaceChildren(emptyState("No plugin is loaded.",
            "A plugin adds to the connector something the databases do not do, such as signing in against Active Directory."));
  //
  let cards = state.config.plugins.map((plugin, index) => {
    let remove = removeButton("the plugin", plugin.name, () => {
      state.config.plugins.splice(index, 1);
      state.originalPluginNames.splice(index, 1);
      drawPlugins();
    });
    //
    let open = state.expanded.has(plugin);
    let card = el("div", {className: "card"}, [
      cardHead(plugin.name || t("New plugin"), [remove],
              {open, summary: cardSummary("plugin", plugin), toggle: () => toggleCard(plugin, drawPlugins)})
    ]);
    //
    if (!open)
      return card;
    //
    let name = el("input", {type: "text", value: plugin.name || "", placeholder: "myAD"});
    name.addEventListener("input", () => {
      plugin.name = name.value;
      setCardTitle(card, name.value || t("New plugin"));
    });
    //
    card.append(el("div", {className: "field"}, [el("label", {textContent: `${t("Name")} *`}), name]));
    card.append(textField("Class", plugin, "class", {required: true, placeholder: "ActiveDirectory",
      help: "The directory of the plugin under plugins/, as in ActiveDirectory"}));
    card.append(textField("API key", plugin, "APIKey", {generate: true, placeholder: sampleGuid}));
    //
    plugin.config ??= {};
    card.append(el("h2", {textContent: t("Settings")}));
    card.append(el("p", {className: "help",
      textContent: t("What this plugin asks for. Every plugin has its own, so they are shown as they are written.")}));
    card.append(jsonBlock(plugin.config, []));
    //
    return card;
  });
  //
  cards.forEach((card, index) => markReveal(state.config.plugins, index, card));
  list.replaceChildren(...cards);
}


/**
 * Asks the connector to open and close a connection with the options shown for a datamodel.
 * @param {Object} datamodel - Datamodel to try
 * @param {Number} index - Its position in the configuration
 * @param {Object} button - Button that started the attempt, disabled while it runs
 */
function testDatamodel(datamodel, index, button)
{
  button.disabled = true;
  say(t("Connecting to '{name}'...", {name: datamodel.name}));
  //
  api("POST", "/api/test", {datamodel, originalName: state.originalDatamodelNames[index]}).then(result => {
    if (result.ok) {
      say(t("'{name}' answered in {elapsed} ms through {driver}",
              {name: datamodel.name, elapsed: result.elapsed, driver: result.driver}), "ok");
    }
    else
      say(t("'{name}' did not answer: {error}", {name: datamodel.name, error: result.error}), "ko");
  }, e => say(e.message, "ko")).finally(() => button.disabled = false);
}


/**
 * Draws the Status tab from what the connector reports.
 */
async function drawStatus()
{
  let status = await api("GET", "/api/status");
  //
  document.getElementById("connectorName").textContent = status.name || t("unnamed");
  document.getElementById("connectionSummary").textContent = t("{connected} of {total} remote servers connected",
          {connected: status.servers.filter(s => s.connected).length, total: status.servers.length});
  //
  let info = [
    ["Version", status.version],
    ["Node.js", status.nodeVersion],
    ["Host", status.hostname],
    ["Platform", status.platform],
    ["Running for", t("{minutes} min", {minutes: Math.floor(status.uptime / 60)})],
    ["Instance", status.id]
  ];
  document.getElementById("statusInfo").replaceChildren(...info.flatMap(([label, value]) =>
    [el("dt", {textContent: t(label)}), el("dd", {textContent: value})]));
  //
  document.getElementById("statusServers").replaceChildren(status.servers.length ?
          table(["Server", "IDE user"], status.servers.map(s => [
            el("span", {}, [el("span", {className: `dot ${s.connected ? "on" : "off"}`}), s.url || ""]),
            s.ideUserName || ""
          ])) :
          el("p", {className: "empty", textContent: t("No remote server is configured.")}));
  //
  let resources = [
    ...status.datamodels.map(d => [t("Datamodel"), d.name, `${d.class} (${d.driver})`,
      d.poolOpen ? t("{count} connections", {count: d.connections}) : t("pool closed")]),
    ...status.fileSystems.map(f => [t("File system"), f.name, f.path,
      t(f.permissions === "rw" ? "read and write" : "read only")]),
    ...status.plugins.map(p => [t("Plugin"), p.name, p.class, ""])
  ];
  document.getElementById("statusResources").replaceChildren(resources.length ?
          table(["Kind", "Name", "Detail", "State"], resources) :
          el("p", {className: "empty", textContent: t("No resource is loaded.")}));
}


/**
 * Builds a table.
 * @param {Array<String>} headers - Column headers, in English
 * @param {Array<Array>} rows - Cells, either text or elements
 * @returns {Object} The table element
 */
function table(headers, rows)
{
  let head = el("tr", {}, headers.map(h => el("th", {textContent: t(h)})));
  let body = rows.map(row => el("tr", {}, row.map(cell => el("td", {}, [cell]))));
  //
  return el("table", {}, [el("thead", {}, [head]), el("tbody", {}, body)]);
}


/**
 * Draws the tail of the log. The lines are what the connector wrote, so they stay in its own words.
 */
async function drawLog()
{
  let entries = await api("GET", "/api/log?count=300");
  let view = document.getElementById("log");
  let atBottom = view.scrollTop + view.clientHeight >= view.scrollHeight - 4;
  //
  view.replaceChildren(...entries.map(entry => el("div", {className: entry.level}, [
    el("time", {textContent: entry.date.substring(11, 19)}),
    entry.message
  ])));
  //
  if (atBottom)
    view.scrollTop = view.scrollHeight;
}


/**
 * Puts the texts of the chosen language into everything the page draws only once.
 */
function applyStrings()
{
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach(node => node.textContent = t(node.dataset.i18n));
  //
  let select = document.getElementById("language");
  select.replaceChildren(...state.languages.map(language =>
    el("option", {value: language.code, textContent: language.name, selected: language.code === state.language})));
}


/**
 * Reads the texts of a language and redraws everything with them.
 * @param {String} [code] - Language asked for; without it the connector picks from the browser
 */
async function loadLanguage(code)
{
  let result = await api("GET", `/api/strings${code ? `?lang=${encodeURIComponent(code)}` : ""}`);
  state.language = result.code;
  state.languages = result.languages;
  state.strings = result.strings;
  //
  applyStrings();
  if (state.config)
    drawAll();
}


/**
 * Draws every tab from the configuration being edited.
 */
function drawAll()
{
  drawGeneral();
  drawDatamodels();
  drawFileSystems();
  drawPlugins();
}


/**
 * Reads the configuration and the driver schemas from the connector and draws every tab.
 */
async function load()
{
  state.schema ??= await api("GET", "/api/schema");
  state.config = await api("GET", "/api/config");
  state.originalDatamodelNames = (state.config.datamodels || []).map(dm => dm.name);
  state.originalPluginNames = (state.config.plugins || []).map(plugin => plugin.name);
  state.brokenJson.clear();
  //
  drawAll();
  //
  // Taken after the drawing, not before: drawing fills in the blocks a configuration may not carry
  // at all, and those are not changes anybody made
  state.savedConfig = JSON.stringify(state.config);
  showDirty();
}


/**
 * Whether what is on screen differs from what was read from the connector.
 * @returns {Boolean} True while there is something to save
 */
function isDirty()
{
  return Boolean(state.config) && JSON.stringify(state.config) !== state.savedConfig;
}


/**
 * Says in the footer whether there is something to save.
 */
function showDirty()
{
  document.getElementById("unsaved").hidden = !isDirty();
}


/**
 * Sends the configuration to the connector, which writes it and reloads it.
 */
async function save()
{
  // What is written in a block that does not parse never reached the configuration: saving now
  // would put back the last version that did, without saying so
  let broken = brokenBlocks();
  if (broken.length)
    return say(t("A block of options is not valid JSON: {why}", {why: broken[0]}), "ko");
  //
  let button = document.getElementById("save");
  button.disabled = true;
  say(t("Saving..."));
  //
  try {
    let result = await api("POST", "/api/config", {
      config: state.config,
      originalNames: {datamodels: state.originalDatamodelNames, plugins: state.originalPluginNames}
    });
    //
    // Read back what was stored: the passwords come back masked and the page starts from the file again
    await load();
    //
    if (result.restartNeeded)
      say(t("Configuration saved and reloaded. The new port of this page takes effect at the next restart."), "warn");
    else
      say(t("Configuration saved and reloaded."), "ok");
  }
  catch (e) {
    say(e.message, "ko");
  }
  finally {
    button.disabled = false;
  }
}


/**
 * Shows one tab and keeps the status refreshing only while that tab is the one in view.
 * @param {String} name - Identifier of the panel to show
 */
function selectTab(name)
{
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("selected", tab.dataset.panel === name));
  document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("selected", panel.id === name));
  //
  clearInterval(state.refreshTimer);
  state.refreshTimer = null;
  if (name !== "status")
    return;
  //
  refreshStatus();
  state.refreshTimer = setInterval(refreshStatus, 5000);
}


/**
 * Refreshes what the Status tab shows, the log included when it is set to keep up.
 */
function refreshStatus()
{
  let work = [drawStatus()];
  if (logAuto.querySelector("input").checked || !document.getElementById("log").childElementCount)
    work.push(drawLog());
  //
  Promise.all(work).catch(e => say(e.message, "ko"));
}


document.getElementById("tabs").addEventListener("click", e => {
  if (e.target.dataset.panel)
    selectTab(e.target.dataset.panel);
});

document.getElementById("language").addEventListener("change", e => {
  localStorage.setItem(languageKey, e.target.value);
  loadLanguage(e.target.value).then(() => drawStatus(), error => say(error.message, "ko"));
});

document.getElementById("save").addEventListener("click", save);

document.getElementById("reload").addEventListener("click", () => {
  load().then(() => say(t("Changes discarded.")), e => say(e.message, "ko"));
});

document.querySelector("[data-add='datamodel']").addEventListener("click", () => {
  state.config.datamodels ??= [];
  state.originalDatamodelNames.push(null);
  addEntry(state.config.datamodels,
          {name: "", class: Object.keys(state.schema.drivers)[0], APIKey: "", connectionOptions: {}}, drawDatamodels);
});

document.querySelector("[data-add='fileSystem']").addEventListener("click", () => {
  state.config.fileSystems ??= [];
  addEntry(state.config.fileSystems,
          {name: "", path: "", permissions: "r", whiteListedOrigins: [], APIKey: ""}, drawFileSystems);
});

document.querySelector("[data-add='plugin']").addEventListener("click", () => {
  state.config.plugins ??= [];
  state.originalPluginNames.push(null);
  addEntry(state.config.plugins, {name: "", class: "", APIKey: "", config: {}}, drawPlugins);
});

// Nothing can slip past a comparison made on a timer, and the configuration is a few kilobytes
window.addEventListener("beforeunload", e => {
  if (!isDirty())
    return;
  //
  e.preventDefault();
  e.returnValue = "";
});

setInterval(showDirty, 500);

// Built here rather than written in the page, so that every checkbox is built the same way
let logAuto = checkbox(false, () => refreshStatus());
document.getElementById("logAutoLabel").prepend(logAuto);

// The chevron of the language picker, for the same reason: it is drawn, not painted on
document.getElementById("language").after(drawIcon(icons.caret, 12));

loadLanguage(localStorage.getItem(languageKey))
        .then(() => load())
        .then(() => {
          selectTab("general");
          return drawStatus();
        })
        .catch(e => say(e.message, "ko"));
