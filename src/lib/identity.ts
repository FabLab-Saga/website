// Locked identity: editors choose categories, never arbitrary shapes or colours.
export const categoryOrder = ['laser', 'fraesi', 'prent', 'rafeinda', 'skurdur', 'formmotun', 'textill', 'hitapressur', 'skanni'] as const;
export const categoryStyle: Record<string, { shape: string; colour: string }> = {
  laser: { shape: 'r-tl', colour: 'pink' }, fraesi: { shape: 'sq', colour: 'orange' },
  prent: { shape: 'half-up', colour: 'red' }, rafeinda: { shape: 'circle', colour: 'red' },
  skurdur: { shape: 'r-tr', colour: 'yellow' }, formmotun: { shape: 'half', colour: 'blue' },
  textill: { shape: 'r-bl', colour: 'pink' }, hitapressur: { shape: 'arch', colour: 'green' },
  skanni: { shape: 'r-br', colour: 'blue' },
};
export const footerBand = [['r-tr','blue'],['half','orange'],['r-tl','green'],['sq','pink'],['r-tr','yellow'],['half','blue'],['r-tl','red'],['circle','orange'],['r-tr','green'],['sq','yellow']];
