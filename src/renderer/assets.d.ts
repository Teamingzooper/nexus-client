// Tell tsc how to resolve static asset imports that Vite handles at build
// time. Without this, `import foo from './foo.png'` fails typecheck even
// though the bundled build works fine.
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}
