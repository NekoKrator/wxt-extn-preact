import type { BaseMessage } from "../types/browser";

export function sendMessage<T = any>(type: string, data?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const message: BaseMessage = {
      type,
      data,
      timestamp: Date.now()
    };

    browser.runtime.sendMessage(message, (response) => {
      if (browser.runtime.lastError) {
        reject(new Error(browser.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export function createMessageHandler(handlers: Record<string, (message: BaseMessage, sender: chrome.runtime.MessageSender) => Promise<any> | any>) {
  return (
    message: BaseMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => {
    const handler = handlers[message.type];

    if (!handler) {
      console.warn(`Unknown message type: ${message.type}`);
      sendResponse({ error: `Unknown message type: ${message.type}` });
      return false;
    }

    try {
      const result = handler(message, sender);

      if (result && typeof result.then === 'function') {
        result
          .then(response => sendResponse({ success: true, data: response }))
          .catch(error => {
            console.error(`Error handling message ${message.type}:`, error);
            sendResponse({ success: false, error: error.message });
          });

        return true;
      } else {
        sendResponse({ success: true, data: result });
        return false;
      }
    } catch (error) {
      console.error(`Error handling message ${message.type}:`, error);
      sendResponse({ success: false, error: (error as Error).message });
      return false;
    }
  };
}

export function createContentMessageHandler(handlers: Record<string, (message: BaseMessage) => any>) {
  return (message: BaseMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    const handler = handlers[message.type];

    if (handler) {
      try {
        const result = handler(message);
        sendResponse({ success: true, data: result });
      } catch (error) {
        console.error(`Error handling content message ${message.type}:`, error);
        sendResponse({ success: false, error: (error as Error).message });
      }
    }
  };
}