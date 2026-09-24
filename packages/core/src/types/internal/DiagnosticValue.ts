export type DiagnosticValue =
  | string
  | number
  | boolean
  | null
  | DiagnosticValue[]
  | { [key: string]: DiagnosticValue };
