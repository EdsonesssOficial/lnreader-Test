// Script marks: lets the user paint passages of the chapter with a character
// (which voice reads it) and/or an ambient sound (what plays while it is read).
// The two kinds are independent layers, so a passage can have both.
window.ttsCharacters = new (function () {
  const CLASS = 'tts-char';
  // {block, start, end, text, char, layer?}. `block` is the index of the
  // readable element and `start`/`end` are offsets inside its textContent.
  // `layer` is 'ambient' for ambient sounds; absent means a character.
  let marks = [];
  let pending = null;
  let pickerElement = null;
  let confirmClear = false;

  const ttsSettings = () => reader.readerSettings.val.tts || {};
  const roster = layer =>
    (layer === 'ambient' ? ttsSettings().ambients : ttsSettings().characters) ||
    [];
  const visibility = () => ({
    characters: true,
    ambients: true,
    blend: true,
    ...(ttsSettings().marksVisibility || {}),
  });
  const layerOf = mark => (mark.layer === 'ambient' ? 'ambient' : 'character');
  const blocks = () => tts.getAllReadableElements(reader.chapterElement);

  // --- Colors ------------------------------------------------------------

  const ALPHA = 0.35;
  const parseColor = hex => {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return match ? match.slice(1).map(part => parseInt(part, 16)) : null;
  };
  const rgba = (rgb, alpha) =>
    `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  const blend = (a, b) => a.map((value, i) => Math.round((value + b[i]) / 2));

  const colorOf = (layer, id) => {
    const item = roster(layer).find(entry => entry.id === id);
    return parseColor(item?.color);
  };

  // --- DOM ---------------------------------------------------------------

  const unwrap = root => {
    root.querySelectorAll('span.' + CLASS).forEach(span => {
      const parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
    root.normalize();
  };

  const wrap = (block, start, end, charId, ambientId) => {
    const nodes = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    let position = 0;
    for (const textNode of nodes) {
      const length = textNode.nodeValue.length;
      const from = Math.max(start, position) - position;
      const to = Math.min(end, position + length) - position;
      position += length;
      if (to <= from) continue;

      let target = textNode;
      if (from > 0) target = textNode.splitText(from);
      if (to - from < target.nodeValue.length) target.splitText(to - from);

      const span = document.createElement('span');
      span.className = CLASS;
      if (charId) span.dataset.char = charId;
      if (ambientId) span.dataset.amb = ambientId;
      target.parentNode.insertBefore(span, target);
      span.appendChild(target);
    }
  };

  // Colors depend on the characters, the ambient sounds and the visibility
  // switches, so they are applied separately from the wrapping.
  const paint = () => {
    const show = visibility();
    document.querySelectorAll('span.' + CLASS).forEach(span => {
      const character = show.characters
        ? colorOf('character', span.dataset.char)
        : null;
      const ambient = show.ambients
        ? colorOf('ambient', span.dataset.amb)
        : null;

      let background = 'transparent';
      let underline = 'none';
      if (character && ambient) {
        if (show.blend) {
          background = rgba(blend(character, ambient), ALPHA);
        } else {
          background = rgba(character, ALPHA);
          underline = `inset 0 -3px 0 ${rgba(ambient, 0.9)}`;
        }
      } else if (character || ambient) {
        background = rgba(character || ambient, ALPHA);
      }
      span.style.backgroundColor = background;
      span.style.boxShadow = underline;
    });
  };

  // Splits every block at each mark boundary so that each piece has at most
  // one character and one ambient sound, then wraps the pieces.
  const renderAll = () => {
    const list = blocks();
    list.forEach(unwrap);
    list.forEach((element, index) => {
      const own = marks.filter(mark => mark.block === index);
      if (own.length === 0) return;
      const cuts = new Set();
      own.forEach(mark => {
        cuts.add(mark.start);
        cuts.add(mark.end);
      });
      const points = Array.from(cuts).sort((a, b) => a - b);
      for (let i = 0; i < points.length - 1; i++) {
        const from = points[i];
        const to = points[i + 1];
        const covers = layer =>
          own.find(
            mark =>
              layerOf(mark) === layer && mark.start <= from && mark.end >= to,
          );
        const character = covers('character');
        const ambient = covers('ambient');
        if (character || ambient) {
          wrap(element, from, to, character?.char, ambient?.char);
        }
      }
    });
    paint();
  };

  const save = () => {
    reader.post({ type: 'tts-marks', data: { marks } });
  };

  // --- Marks -------------------------------------------------------------

  this.load = saved => {
    const list = blocks();
    marks = [];
    (Array.isArray(saved) ? saved : []).forEach(mark => {
      const element = list[mark.block];
      if (!element) return;
      const text = element.textContent;
      let start = mark.start;
      if (text.slice(mark.start, mark.end) !== mark.text) {
        // The text moved (or was edited): try to find the passage again.
        start = text.indexOf(mark.text);
        if (start < 0) return;
      }
      const loaded = {
        block: mark.block,
        start,
        end: start + mark.text.length,
        text: mark.text,
        char: mark.char,
      };
      if (mark.layer === 'ambient') loaded.layer = 'ambient';
      marks.push(loaded);
    });
    renderAll();
  };

  // The chapter markup is rebuilt by some reader options; paint it again.
  this.reapply = () => {
    if (marks.length) renderAll();
  };

  this.clearAll = () => {
    marks = [];
    renderAll();
    save();
  };

  this.hasMarks = () => marks.length > 0;

  const piece = (element, mark, start, end) => {
    const kept = {
      block: mark.block,
      start,
      end,
      text: element.textContent.slice(start, end),
      char: mark.char,
    };
    if (mark.layer === 'ambient') kept.layer = 'ambient';
    return kept;
  };

  // Assigns `refId` (a character or ambient id; null clears) to the parts,
  // replacing only what is already assigned in the same layer.
  const assign = (parts, layer, refId) => {
    const list = blocks();
    parts.forEach(part => {
      const element = list[part.block];
      if (!element) return;
      const kept = [];
      marks.forEach(mark => {
        if (
          layerOf(mark) !== layer ||
          mark.block !== part.block ||
          mark.end <= part.start ||
          mark.start >= part.end
        ) {
          kept.push(mark);
          return;
        }
        // Keep the parts of an older mark that the new one does not cover.
        if (mark.start < part.start) {
          kept.push(piece(element, mark, mark.start, part.start));
        }
        if (mark.end > part.end) {
          kept.push(piece(element, mark, part.end, mark.end));
        }
      });
      marks = kept;
      if (refId) {
        const added = {
          block: part.block,
          start: part.start,
          end: part.end,
          text: element.textContent.slice(part.start, part.end),
          char: refId,
        };
        if (layer === 'ambient') added.layer = 'ambient';
        marks.push(added);
      }
    });
    renderAll();
    save();
  };

  // --- Selection ---------------------------------------------------------

  const offsetIn = (element, node, offset) => {
    const range = document.createRange();
    range.setStart(element, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  };

  const captureSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return [];
    }
    const range = selection.getRangeAt(0);
    const parts = [];
    blocks().forEach((element, index) => {
      if (!range.intersectsNode(element)) return;
      const text = element.textContent;
      let start = 0;
      let end = text.length;
      if (element.contains(range.startContainer)) {
        start = offsetIn(element, range.startContainer, range.startOffset);
      }
      if (element.contains(range.endContainer)) {
        end = offsetIn(element, range.endContainer, range.endOffset);
      }
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      if (end > start) parts.push({ block: index, start, end });
    });
    return parts;
  };

  // --- Picker ------------------------------------------------------------

  const closePicker = () => {
    pickerElement?.remove();
    pickerElement = null;
    pending = null;
    confirmClear = false;
  };

  const choose = (layer, refId) => {
    const parts = pending;
    closePicker();
    window.getSelection()?.removeAllRanges();
    if (parts) assign(parts, layer, refId);
  };

  const stop = e => e.stopPropagation();

  const showPicker = layer => {
    pickerElement?.remove();
    const { div, button, span } = van.tags;
    const entries = roster(layer);
    const isAmbient = layer === 'ambient';

    const option = (label, color, onclick) =>
      button(
        { type: 'button', class: 'tts-char-option', onclick },
        span({
          class: color ? 'tts-char-dot' : 'tts-char-dot tts-char-dot-empty',
          style: color ? `background-color: ${color}` : '',
        }),
        label,
      );

    const options = entries.map(entry =>
      option(entry.name, entry.color, () => choose(layer, entry.id)),
    );
    options.push(
      option(
        isAmbient
          ? reader.strings.noAmbientLabel || 'No ambient sound'
          : reader.strings.narratorLabel || 'Narrator',
        null,
        () => choose(layer, null),
      ),
    );

    const emptyTitle = isAmbient
      ? reader.strings.noAmbients ||
        'Create ambient sounds in TTS settings > Ambient'
      : reader.strings.noCharacters ||
        'Create characters in TTS settings > Characters';
    const title = isAmbient
      ? reader.strings.scriptAmbient || 'Ambient sound'
      : reader.strings.scriptCharacter || 'Script character';

    const clearButton = button(
      {
        type: 'button',
        class: 'tts-char-clear',
        onclick: e => {
          const target = e.currentTarget;
          if (!confirmClear) {
            confirmClear = true;
            target.textContent =
              reader.strings.confirmClearMarks || 'Tap again to confirm';
            return;
          }
          closePicker();
          window.getSelection()?.removeAllRanges();
          window.ttsCharacters.clearAll();
        },
      },
      reader.strings.clearMarks || 'Clear all marks in this chapter',
    );

    pickerElement = div(
      {
        id: 'tts-character-picker',
        onclick: closePicker,
        ontouchstart: stop,
        ontouchend: stop,
      },
      div(
        { class: 'tts-char-sheet', onclick: stop },
        div({ class: 'tts-char-title' }, entries.length ? title : emptyTitle),
        div({ class: 'tts-char-options' }, ...options),
        marks.length ? clearButton : '',
      ),
    );
    document.body.appendChild(pickerElement);
  };

  this.openPicker = layer => {
    const parts = captureSelection();
    if (parts.length === 0) return;
    pending = parts;
    confirmClear = false;
    showPicker(layer === 'ambient' ? 'ambient' : 'character');
  };

  // --- TTS queue ---------------------------------------------------------

  /**
   * Splits a readable element into consecutive passages that share the same
   * character and ambient sound, so each can be spoken with its own voice.
   * Every passage carries its offsets in the element's text, which the reader
   * uses to highlight just the passage being read. Returns null when the
   * element has nothing assigned (it is then read as one paragraph).
   */
  this.segmentsFor = element => {
    if (!element.querySelector('.' + CLASS)) return null;
    const pieces = [];
    let position = 0;
    const push = (text, context, from, to) => {
      const last = pieces[pieces.length - 1];
      if (last && last.char === context.char && last.amb === context.amb) {
        last.text += text;
        last.end = to;
      } else {
        pieces.push({
          text,
          char: context.char,
          amb: context.amb,
          start: from,
          end: to,
        });
      }
    };
    const walk = (node, context) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const from = position;
        position += node.nodeValue.length;
        push(node.nodeValue, context, from, position);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.nodeName === 'BR') {
          push(' ', context, position, position);
          return;
        }
        const next = node.classList.contains(CLASS)
          ? {
              char: node.dataset.char || null,
              amb: node.dataset.amb || null,
            }
          : context;
        node.childNodes.forEach(child => walk(child, next));
      }
    };
    element.childNodes.forEach(child =>
      walk(child, { char: null, amb: null }),
    );
    return pieces;
  };

  // Repaint when characters, ambient sounds or visibility change.
  van.derive(() => {
    reader.readerSettings.val;
    paint();
  });

  const initial = window.initialReaderConfig?.ttsMarks;
  const start = () => this.load(initial);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0));
  } else {
    setTimeout(start, 0);
  }
})();
