import { api } from './http.js';
import { ENDPOINTS } from '../config/constants.js';

export const LetterApi = {
  send({ content, delayMs }) {
    return api.request(ENDPOINTS.SEND_LETTER, {
      method: 'POST',
      body: JSON.stringify({ content, delayMs })
    });
  },
  status(id) {
    return api.request(ENDPOINTS.LETTER_STATUS(id));
  },
  cancel(id) {
    return api.request(ENDPOINTS.CANCEL_LETTER(id), { method: 'POST' });
  },
  reply({ id, content }) {
    return api.request(ENDPOINTS.REPLY_LETTER(id), {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },
  skip(id) {
    return api.request(ENDPOINTS.SKIP_LETTER(id), { method: 'POST' });
  },
  toggleFavorite(id) {
    return api.request(ENDPOINTS.FAVORITE_LETTER(id), { method: 'POST' });
  },
  thread(id) {
    return api.request(ENDPOINTS.THREAD(id));
  },
  inbox() {
    return api.request(ENDPOINTS.INBOX);
  }
};
