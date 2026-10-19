/* Globale Namen für die Typprüfung (tsc --checkJs, siehe tsconfig.json) */
declare const __APP_VERSION__: string;
declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): unknown };
interface Window { STUDYOS_ENV?: any; StudyExtras?: any; __studyosFakeCloud?: (...args: any[]) => Promise<any> }
interface Navigator { standalone?: boolean }
