// Email is the only notification channel in the prototype. The console mailer prints
// messages to the API log; a real SMTP/API mailer would implement the same interface.
export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

class ConsoleMailer implements Mailer {
  async send(to: string, subject: string, text: string): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    console.log(`[mail] to=${to} subject="${subject}"\n${text}`);
  }
}

export const mailer: Mailer = new ConsoleMailer();
