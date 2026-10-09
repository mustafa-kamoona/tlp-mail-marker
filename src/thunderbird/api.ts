/** The small public MailExtension API surface used by this build. */
export interface ComposeDetails {
  subject?: string;
  body?: string;
  plainTextBody?: string;
  isPlainText?: boolean;
  type?: string;
  relatedMessageId?: number;
  [key: string]: unknown;
}
export interface MailTab { id: number; windowId?: number; type?: string }
export interface Store {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface MailPart { contentType?: string; body?: string; parts?: MailPart[] }
export interface ThunderbirdApi {
  compose: {
    getComposeDetails(id: number): Promise<ComposeDetails>;
    setComposeDetails(id: number, details: ComposeDetails): Promise<void>;
    listAttachments(id: number): Promise<Array<{ id: number; name: string; size: number }>>;
    onBeforeSend: { addListener(fn: (tab: MailTab, details: ComposeDetails) => Promise<{ cancel: boolean }>): void };
  };
  composeAction: {
    setBadgeText(details: { tabId: number; text: string }): Promise<void>;
    setTitle(details: { tabId: number; title: string }): Promise<void>;
  };
  storage: { local: Store; session: Store };
  permissions: {
    contains(details: { permissions: string[] }): Promise<boolean>;
    request(details: { permissions: string[] }): Promise<boolean>;
    remove(details: { permissions: string[] }): Promise<boolean>;
  };
  messages: {
    get(id: number): Promise<{ subject: string }>;
    getFull(id: number): Promise<MailPart>;
  };
  tabs: {
    query(details: Record<string, unknown>): Promise<MailTab[]>;
    get(id: number): Promise<MailTab>;
    onCreated: { addListener(fn: (tab: MailTab) => void): void };
    onRemoved: { addListener(fn: (id: number) => void): void };
  };
  windows: {
    getCurrent(): Promise<{ id: number }>;
    create(details: { url: string; type: string; width: number; height: number }): Promise<{ id: number }>;
    remove(id: number): Promise<void>;
    onRemoved: { addListener(fn: (id: number) => void): void };
  };
  runtime: {
    id: string;
    getURL(path: string): string;
    openOptionsPage(): Promise<void>;
    sendMessage(message: unknown): Promise<any>;
    onMessage: { addListener(fn: (message: any, sender: { id?: string; url?: string }) => unknown): void };
  };
}
export function mailApi(): ThunderbirdApi {
  return (globalThis as unknown as { messenger: ThunderbirdApi }).messenger;
}
