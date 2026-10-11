// The PACS corner annotations drawn over one image. Every .ann text can be switched off together, the short credit never is.
import { h } from '../core/dom.js';

const put = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};
const SIDES = ['top', 'bottom', 'left', 'right'];

export function createCorners() {
  const ann = name => h('span', { class: `ann ${name}` });
  const t = Object.fromEntries(['name', 'plane', 'image', 'location', 'spacing', 'window', 'zoom', 'scaleText'].map(n => [n, ann(n)]));
  const value = ann('value');
  const scaleBar = h('span', { class: 'ann scale-bar' });
  const credit = h('p', { class: 'credit-short', hidden: true });
  const letters = Object.fromEntries(SIDES.map(side => [side, h('span', { class: `ann letter ${side}` })]));
  const nodes = [
    h('div', { class: 'corner tl' }, t.name, t.plane),
    h('div', { class: 'corner tr' }, t.image, t.location, t.spacing),
    h('div', { class: 'corner bl' }, t.window, credit),
    h('div', { class: 'corner br' }, t.zoom, value, t.scaleText, scaleBar),
    ...Object.values(letters),
  ];
  return {
    nodes,
    // text: name, plane, image, location, spacing, window, zoom, scaleText (strings), scalePx, credit (a string or null), letters ({ top, bottom, left, right }).
    set(text) {
      for (const key of Object.keys(t)) put(t[key], text[key] ?? '');
      scaleBar.style.width = `${Math.round(text.scalePx ?? 0)}px`;
      scaleBar.hidden = !text.scalePx;
      credit.hidden = !text.credit;
      put(credit, text.credit ?? '');
      for (const side of SIDES) put(letters[side], text.letters?.[side] ?? '');
    },
    // The hover readout changes far more often than the rest, so it has its own setter.
    setValue: text => put(value, text),
  };
}
