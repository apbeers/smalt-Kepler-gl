// Types for what Vite loads that TypeScript can't read: CSS and Vue files.
declare module '*.css'
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
