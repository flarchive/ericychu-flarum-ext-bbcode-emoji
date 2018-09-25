import { extend } from 'flarum/extend';
import ComposerBody from 'flarum/components/ComposerBody';
import emojiMap from 'flarum/emoji/helpers/emojiMap';
import KeyboardNavigatable from 'flarum/utils/KeyboardNavigatable';

import AutocompleteDropdown from 'flarum/emoji/components/AutocompleteDropdown';

export default function addComposerAutocomplete() {

  const emojiKeys = Object.keys(emojiMap);

  extend(ComposerBody.prototype, 'config', function(original, isInitialized) {
    if (isInitialized) return;

    const composer = this;
    const $editorContainer = $('.sceditor-container');
    const iframe = $editorContainer.find('iframe')[0];
    const $iframe = $(iframe);
    const $container = $('<div class="ComposerBody-emojiDropdownContainer"></div>');
    const dropdown = new AutocompleteDropdown({items: []});
    const $textarea = $(iframe.contentDocument.body);
    let emojiStart;
    let typed;
    let node;

    $(composer.element).append($container);

    const getCaretCharacterOffsetWithin = function getCaretCharacterOffsetWithin(element) {
      var caretOffset = 0;
      var doc = element.ownerDocument || element.document;
      var win = doc.defaultView || doc.parentWindow;
      var sel;
      if (typeof win.getSelection !== 'undefined') {
        sel = win.getSelection();
        if (sel.rangeCount > 0) {
          var range = sel.getRangeAt(0);
          var preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(element);
          preCaretRange.setEnd(range.endContainer, range.endOffset);
          caretOffset = preCaretRange.toString().length;
        }
      } else if ( (sel = doc.selection) && sel.type != 'Control') {
        var textRange = sel.createRange();
        var preCaretTextRange = doc.body.createTextRange();
        preCaretTextRange.moveToElementText(element);
        preCaretTextRange.setEndPoint('EndToEnd', textRange);
        caretOffset = preCaretTextRange.text.length;
      }
      return caretOffset;
    };

    const setCaretCharacterOffsetWithin = function setCaretCharacterOffsetWithin(element, pos) {
      composer.editor.editor.focus();
      var doc = element.ownerDocument || element.document;
      var win = doc.defaultView || doc.parentWindow;
      var sel;
      if (typeof win.getSelection !== 'undefined') {
        sel = win.getSelection();
        if (sel.rangeCount > 0) {
          var range = sel.getRangeAt(0);
          range.collapse(true);
          range.setStart(element, pos);
          sel.removeAllRanges();
          sel.addRange(range);
        } else if ( (sel = doc.selection) && sel.type != 'Control') {
          var textRange = sel.createRange();
          var preCaretTextRange = doc.body.createTextRange();
          preCaretTextRange.moveToElementText(element);
          preCaretTextRange.setEndPoint('StartToStart', textRange);
        }
      }
    };

    const applySuggestion = function(replacement) {
      const insert = replacement + ' ';

      node.nodeValue = node.nodeValue.substring(0, emojiStart - 1) + insert + node.nodeValue.substr(getCaretCharacterOffsetWithin(node));

      var index = emojiStart - 1 + insert.length;
      setCaretCharacterOffsetWithin(node, index);

      dropdown.hide();
    };

    // const applySuggestion = function(replacement) {
    //   const insert = replacement + ' ';
    //
    //   const content = composer.content();
    //   composer.editor.setValue(content.substring(0, emojiStart - 1) + insert + content.substr($textarea[0].selectionStart));
    //
    //   const index = emojiStart - 1 + insert.length;
    //   composer.editor.setSelectionRange(index, index);
    //
    //   dropdown.hide();
    // };

    this.navigator = new KeyboardNavigatable();
    this.navigator
      .when(() => dropdown.active)
      .onUp(() => dropdown.navigate(-1))
      .onDown(() => dropdown.navigate(1))
      .onSelect(dropdown.complete.bind(dropdown))
      .onCancel(dropdown.hide.bind(dropdown))
      .bindTo($textarea);

    composer.editor.editor
      .bind('keyup', function (e) {
        // Up, down, enter, tab, escape, left, right.
        if ([9, 13, 27, 40, 38, 37, 39].indexOf(e.which) !== -1) return;

        node = composer.editor.editor.currentNode();
        const cursor = getCaretCharacterOffsetWithin(node);

        // Search backwards from the cursor for an ':' symbol. If we find
        // one and followed by a whitespace, we will want to show the
        // autocomplete dropdown!
        const value = node.nodeValue;
        if (value === null) return;
        emojiStart = 0;
        for (let i = cursor - 1; i >= 0; i--) {
          const character = value.substr(i, 1);
          // check what user typed, emoji names only contains alphanumeric,
          // underline, '+' and '-'
          if (!/[a-z0-9]|\+|\-|_|\:/.test(character)) break;
          // make sure ':' followed by a whitespace or newline
          if (character === ':' && (i == 0 || /\s/.test(value.substr(i - 1, 1)))) {
            emojiStart = i + 1;
            break;
          }
        }

        dropdown.hide();
        dropdown.active = false;

        if (emojiStart) {
          typed = value.substring(emojiStart, cursor).toLowerCase();

          const makeSuggestion = function(key) {
            const code = ':' + key + ':';
            const imageName = emojiMap[key];
            return (
              <button
                key={key}
                onclick={() => applySuggestion(code)}
                onmouseenter={function() {
                  dropdown.setIndex($(this).parent().index());
                }}>
                  <img alt={code} class="emoji" draggable="false" src={'//cdn.jsdelivr.net/emojione/assets/png/' + imageName + '.png'}/>
                  {key}
              </button>
            );
          };

          const buildSuggestions = () => {
            const suggestions = [];
            let similarEmoji = [];

            // Build a regular expression to do a fuzzy match of the given input string
            const fuzzyRegexp = function(str) {
              const reEscape = new RegExp('\\(([' + ('+.*?[]{}()^$|\\'.replace(/(.)/g, '\\$1')) + '])\\)', 'g');
              return new RegExp('(.*)' + (str.toLowerCase().replace(/(.)/g, '($1)(.*?)')).replace(reEscape, '(\\$1)') + '$', 'i');
            };
            const regTyped = fuzzyRegexp(typed);

            let maxSuggestions = 7;

            const findMatchingEmojis = matcher => {
              for (let i = 0; i < emojiKeys.length && maxSuggestions > 0; i++) {
                const curEmoji = emojiKeys[i];
                if (matcher(curEmoji) && similarEmoji.indexOf(curEmoji) === -1) {
                  --maxSuggestions;
                  similarEmoji.push(emojiKeys[i]);
                }
              }
            };

            // First, try to find all emojis starting with the given string
            findMatchingEmojis(emoji => emoji.indexOf(typed) === 0);

            // If there are still suggestions left, try for some fuzzy matches
            findMatchingEmojis(emoji => regTyped.test(emoji));

            similarEmoji = similarEmoji.sort((a, b) => {
              return a.length - b.length
            });

            for (let key of similarEmoji) {
              suggestions.push(makeSuggestion(key));
            }

            if (suggestions.length) {
              dropdown.props.items = suggestions;
              m.render($container[0], dropdown.render());

              dropdown.show();

              const coordinates = $textarea.caret('offset', {iframe: iframe});
              const offset1 = $editorContainer.position();
              const offset2 = $iframe.position();
              coordinates.left += offset1.left + offset2.left;
              coordinates.top += offset1.top + offset2.top;

              const width = dropdown.$().outerWidth();
              const height = dropdown.$().outerHeight();
              const parent = dropdown.$().offsetParent();
              let left = coordinates.left;
              let top = coordinates.top + 15;
              if (top + height > parent.height()) {
                top = coordinates.top - height - 15;
              }
              if (left + width > parent.width()) {
                left = parent.width() - width;
              }
              dropdown.show(left, top);
            }
          };

          buildSuggestions();

          dropdown.setIndex(0);
          dropdown.$().scrollTop(0);
          dropdown.active = true;
        }
      });
  });
}
