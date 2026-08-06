// Integração do formulário editorial com o Google Apps Script.
(() => {
  const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbz5gOy4fxhf-_FEfZAo7OMms_fE6ZGs1OmGEdB5bPAWCZCZY29rvmqHeYL0cn2U29uR/exec';

  window.EDITORIAL_FORM_CONFIG = Object.freeze({
    appsScriptUrl,
    maxFileSizeMb: 10,
    acceptedExtensions: ['pdf', 'doc', 'docx', 'odt', 'rtf']
  });

  // O Google Apps Script processa o POST e responde redirecionando para
  // script.googleusercontent.com. Alguns navegadores móveis tratam esse
  // redirecionamento como erro de CORS. Esta camada interrompe apenas a
  // navegação da resposta; o conteúdo continua sendo recebido pelo doPost.
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const target = typeof input === 'string' ? input : String(input?.url || '');
    const isEditorialPost = target === appsScriptUrl
      && String(init.method || 'GET').toUpperCase() === 'POST';

    if (!isEditorialPost) return nativeFetch(input, init);

    const body = typeof init.body === 'string'
      ? new Blob([init.body], { type: 'text/plain;charset=UTF-8' })
      : init.body;

    const correctedInit = {
      ...init,
      body,
      headers: undefined,
      mode: 'no-cors',
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    };

    return nativeFetch(input, correctedInit);
  };
})();
