import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './keyboard';

describe('shortcut typing-target guard', () => {
  it('blocks inputs, textareas, selects and contenteditable descendants', () => {
    const host = document.createElement('div');
    host.innerHTML = '<input /><textarea></textarea><select></select>' +
      '<div contenteditable="true"><span id="nested">Text</span></div>' +
      '<div contenteditable="plaintext-only"><span id="plain">Plain</span></div>';
    const elements = [
      host.querySelector('input'), host.querySelector('textarea'),
      host.querySelector('select'), host.querySelector('#nested'),
      host.querySelector('#plain'),
    ];
    for (const element of elements) {
      expect(isTypingTarget(element)).toBe(true);
    }
  });
  it('allows keyboard shortcuts on non-typing targets', () => {
    const div = document.createElement('div');
    div.innerHTML = '<button>Click me</button><span contenteditable="false">no</span>';
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(div.querySelector('button'))).toBe(false);
    expect(isTypingTarget(div.querySelector('span'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
