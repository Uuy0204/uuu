(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
}
