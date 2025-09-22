declare global {
  interface Window {
    browser: typeof chrome;
  }

  var browser: typeof chrome;
  var chrome: {
    runtime: {
      openOptionsPage(): void;
      sendMessage(message: any): Promise<any>;
    };
    tabs: {
      query(queryInfo: any): Promise<any[]>;
      create(createProperties: any): Promise<any>;
    };
    storage: {
      local: {
        get(keys?: string | string[] | null): Promise<any>;
        set(items: any): Promise<void>;
        remove(keys: string | string[]): Promise<void>;
        clear(): Promise<void>;
      };
      sync: {
        get(keys?: string | string[] | null): Promise<any>;
        set(items: any): Promise<void>;
        remove(keys: string | string[]): Promise<void>;
        clear(): Promise<void>;
      };
    };
  };
}

export { };