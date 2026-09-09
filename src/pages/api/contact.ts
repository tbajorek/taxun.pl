export const prerender = false;

import type { MailRow } from '../../lib/mail';
import { createFormRoute, isEmail, trimField } from '../../lib/mailer';

/**
 * Uproszczony formularz kontaktowy z /kontakt.
 *
 * Cała mechanika wysyłki (zgody, reCAPTCHA, filtr botów, stopka, obsługa
 * błędów) siedzi w `createFormRoute` - tutaj opisujemy wyłącznie treść maila.
 */
export const POST = createFormRoute({
  action: 'contact',
  formLabel: 'Kontakt ogólny',
  logName: 'contact',
  build: ({ body }) => {
    const firstName = trimField(body.firstName, 60);
    const lastName = trimField(body.lastName, 60);
    const email = trimField(body.email, 120);
    const phone = trimField(body.phone, 24);
    const company = trimField(body.company, 160);
    const message = trimField(body.message, 4000);

    if (!firstName || !email || !message) {
      return { ok: false, error: 'Missing required fields' };
    }
    if (!isEmail(email)) {
      return { ok: false, error: 'Invalid email', fields: { email: 'Podaj poprawny adres e-mail.' } };
    }

    const personName = `${firstName} ${lastName}`.trim();
    const meta: MailRow[] = [];
    if (typeof body.source === 'string' && body.source) {
      meta.push({ label: 'Adres formularza', value: body.source.slice(0, 300) });
    }

    return {
      ok: true,
      doc: {
        subject: `Nowa wiadomość z formularza kontaktowego - ${personName}`,
        preheader: message.slice(0, 140),
        badge: 'Formularz kontaktowy',
        title: `Wiadomość od: ${personName}`,
        personName,
        email,
        phone: phone || undefined,
        company: company || undefined,
        sections: [],
        message: { title: 'Treść wiadomości', body: message },
        meta,
      },
    };
  },
});
